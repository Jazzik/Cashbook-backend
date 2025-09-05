
// Helper function to wait for container readiness
def waitForContainer(containerName, maxWaitSeconds = 30) {
    def startTime = System.currentTimeMillis()
    def maxWaitMs = maxWaitSeconds * 1000

    while (System.currentTimeMillis() - startTime < maxWaitMs) {
        try {
            def containerStatus = bat(
                script: "docker ps -f name=${containerName} --format \"{{.Status}}\"",
                returnStdout: true
            ).trim()

            if (containerStatus && !containerStatus.contains('Exit')) {
                echo "Container ${containerName} is ready: ${containerStatus}"
                return true
            }

            bat 'timeout /t 2 /nobreak > nul'
        } catch (Exception e) {
            echo "Waiting for container ${containerName} to be ready..."
            bat 'timeout /t 2 /nobreak > nul'
        }
    }

    error "Container ${containerName} failed to become ready within ${maxWaitSeconds} seconds"
}

pipeline {
    agent none

    environment {
        IMAGE_NAME = 'cashbook_backend'
        DOCKER_REGISTRY = credentials('DOCKER_REGISTRY')
        DOCKER_PASSWORD = credentials('DOCKER_PASSWORD')
        DOCKER_IMAGE_TAG = 'latest'
    }

    stages {
        stage('Checkout') {
            agent { label 'build-node' }
            steps {
                checkout scm
                stash name: 'source-code', includes: '**/*'
            }
        }

        stage('Configure') {
            agent { label 'build-node' }
            steps {
                script {
                    try {
                        env.COMMIT_HASH = env.GIT_COMMIT
                        echo "Building for commit: ${env.COMMIT_HASH}"

                        if (env.BRANCH_NAME == 'test') {
                            env.SHOPS = 'testing'
                            env.TESTING_PORT = '3999'
                        } else if (env.BRANCH_NAME == 'main') {
                            env.SHOPS = 'makarov,yuz1'
                            env.MAKAROV_PORT = '5000'
                            env.YUZ1_PORT = '5001'
                        } else {
                            echo "Branch ${env.BRANCH_NAME} not configured for deployment"
                            env.SHOPS = ''
                            error "Branch ${env.BRANCH_NAME} not configured for deployment"
                        }

                        def envVars = "SHOPS='${env.SHOPS}'\n"
                        if (env.BRANCH_NAME == 'test') {
                            envVars += "TESTING_PORT='${env.TESTING_PORT}'\n"
                        } else if (env.BRANCH_NAME == 'main') {
                            envVars += """
                                MAKAROV_PORT='${env.MAKAROV_PORT}'
                                YUZ1_PORT='${env.YUZ1_PORT}'
                            """
                        }

                        writeFile file: 'jenkins_env.groovy', text: envVars
                        stash name: 'jenkins-env', includes: 'jenkins_env.groovy'
                    } catch (Exception e) {
                        echo "Error in Configure stage: ${e.getMessage()}"
                        currentBuild.result = 'FAILURE'
                        throw e
                    }

                }
            }

        }

        stage('Build and Test') {
            agent { label 'build-node' }
            when { branch 'test' }
            steps {
                script {
                    try {
                        echo 'Building Docker image'
                        bat """
                            docker build --build-arg NODE_OPTIONS="--max-old-space-size=4096" ^
                                -t %DOCKER_REGISTRY%/%IMAGE_NAME%:%COMMIT_HASH% ^
                                -t %DOCKER_REGISTRY%/%IMAGE_NAME%:%DOCKER_IMAGE_TAG% .
                        """
                        bat 'docker images | findstr %IMAGE_NAME%'
                        echo 'Docker image built successfully'

                        unstash 'jenkins-env'
                        def shopsList = env.SHOPS.split(',')

                        shopsList.each { shop ->
                            def shopPort = env."${shop.toUpperCase()}_PORT"
                            echo "Deploying ${shop} for testing on port ${shopPort}"

                            withCredentials([
                                string(credentialsId: "${shop}-spreadsheet-id", variable: 'SHOP_SPREADSHEET_ID'),
                                file(credentialsId: 'service-account', variable: 'GOOGLE_SERVICE_ACCOUNT_FILE'),
                                string(credentialsId: 'telegram-bot-token', variable: 'TELEGRAM_BOT_TOKEN'),
                                string(credentialsId: "${shop}-telegram-chat-id", variable: 'TELEGRAM_CHAT_ID')
                            ]) {
                                // Копируем service-account в workspace
                                bat 'copy "%GOOGLE_SERVICE_ACCOUNT_FILE%" service-account.json'

                                // Проверка файла
                                bat """
                                    if not exist "service-account.json" (
                                        echo Service account file not found!
                                        exit /b 1
                                    )
                                    for %%F in ("service-account.json") do if %%~zF==0 (
                                        echo Service account file is empty!
                                        exit /b 1
                                    )
                                """

                                bat """
                                    docker network inspect cashbook-network || docker network create cashbook-network
                                """
                                bat "docker rm -f ${shop}_backend_container || exit /b 0"
                                bat """
                                    docker run --name ${shop}_backend_container ^
                                        --network cashbook-network ^
                                        -d -p 127.0.0.1:${shopPort}:${shopPort} ^
                                        -v "%CD%\\service-account.json:/app/credentials/service-account.json" ^
                                        -e PORT=${shopPort} ^
                                        -e GOOGLE_SERVICE_ACCOUNT_KEY=/app/credentials/service-account.json ^
                                        -e SPREADSHEET_ID=%SHOP_SPREADSHEET_ID% ^
                                        -e TELEGRAM_BOT_TOKEN=%TELEGRAM_BOT_TOKEN% ^
                                        -e TELEGRAM_CHAT_ID=%TELEGRAM_CHAT_ID% ^
                                        %DOCKER_REGISTRY%/%IMAGE_NAME%:%DOCKER_IMAGE_TAG%
                                """
                            }
                        }

                        // Ждем и проверяем контейнеры
                        echo 'Waiting for containers to initialize...'
                        shopsList.each { shop -> waitForContainer("${shop}_backend_container", 30) }

                        // Health check с retry
                        shopsList.each { shop ->
                            def shopPort = env."${shop.toUpperCase()}_PORT"
                            echo "Checking health for ${shop} on port ${shopPort}"
                            def healthCheckPassed = false
                            def maxRetries = 3
                            def retryCount = 0

                            while (!healthCheckPassed && retryCount < maxRetries) {
                                try {
                                    bat "curl -f -m 15 http://127.0.0.1:${shopPort}/api/health"
                                    healthCheckPassed = true
                                    echo "Health check passed for ${shop}"
                                } catch (Exception e) {
                                    retryCount++
                                    echo "Health check failed for ${shop}, attempt ${retryCount}/${maxRetries}: ${e.getMessage()}"
                                    if (retryCount < maxRetries) bat 'timeout /t 10 /nobreak > nul'
                                    else throw new Exception("Health check failed for ${shop} after ${maxRetries} attempts")
                                }
                            }
                        }

                        // Cleanup test containers
                        shopsList.each { shop ->
                            bat "docker rm -f ${shop}_backend_container || exit /b 0"
                            echo "Cleaned up test container for ${shop}"
                        }

                    } catch (Exception e) {
                        echo "Error in Build and Test stage: ${e.getMessage()}"
                        currentBuild.result = 'FAILURE'
                        throw e
                    }
                }
            }

        }

        stage('Push to Registry') {
            agent { label 'build-node' }
            when { branch 'test' }
            steps {
                script {
                    try {
                        echo 'Pushing Docker image to Docker Hub'
                        bat """
                            docker login -u %DOCKER_REGISTRY% -p %DOCKER_PASSWORD%
                            docker push %DOCKER_REGISTRY%/%IMAGE_NAME%:%COMMIT_HASH%
                            docker push %DOCKER_REGISTRY%/%IMAGE_NAME%:%DOCKER_IMAGE_TAG%
                        """
                        echo 'Docker images pushed successfully'
                    } catch (Exception e) {
                        echo "Error pushing Docker images: ${e.getMessage()}"
                        currentBuild.result = 'FAILURE'
                        throw e
                    }
                }
            }
        }


        stage('Deploy and Verify') {
            agent { label 'build-node' }
            when { branch 'main' }
            steps {
                unstash 'source-code'
                unstash 'jenkins-env'
                script {
                    try {
                        bat "docker pull %DOCKER_REGISTRY%/%IMAGE_NAME%:%DOCKER_IMAGE_TAG%"

                        def shopsList = env.SHOPS.split(',')
                        shopsList.each { shop ->
                            def shopPort = env."${shop.toUpperCase()}_PORT"
                            echo "Deploying ${shop} on port ${shopPort}"

                            withCredentials([
                                string(credentialsId: "${shop}-spreadsheet-id", variable: 'SHOP_SPREADSHEET_ID'),
                                file(credentialsId: 'service-account', variable: 'GOOGLE_SERVICE_ACCOUNT_FILE'),
                                string(credentialsId: 'telegram-bot-token', variable: 'TELEGRAM_BOT_TOKEN'),
                                string(credentialsId: "${shop}-telegram-chat-id", variable: 'TELEGRAM_CHAT_ID')
                            ]) {
                                bat 'copy "%GOOGLE_SERVICE_ACCOUNT_FILE%" service-account.json'

                                bat """
                                    if not exist "service-account.json" (
                                        echo Service account file not found!
                                        exit /b 1
                                    )
                                    for %%F in ("service-account.json") do if %%~zF==0 (
                                        echo Service account file is empty!
                                        exit /b 1
                                    )
                                """

                                bat "docker network inspect cashbook-network || docker network create cashbook-network"
                                bat "docker rm -f ${shop}_backend_container || exit /b 0"

                                bat """
                                    docker run --name ${shop}_backend_container ^
                                        --network cashbook-network ^
                                        -d -p 127.0.0.1:${shopPort}:${shopPort} ^
                                        -v "%CD%\\service-account.json:/app/credentials/service-account.json" ^
                                        -e PORT=${shopPort} ^
                                        -e GOOGLE_SERVICE_ACCOUNT_KEY=/app/credentials/service-account.json ^
                                        -e SPREADSHEET_ID=%SHOP_SPREADSHEET_ID% ^
                                        -e TELEGRAM_BOT_TOKEN=%TELEGRAM_BOT_TOKEN% ^
                                        -e TELEGRAM_CHAT_ID=%TELEGRAM_CHAT_ID% ^
                                        %DOCKER_REGISTRY%/%IMAGE_NAME%:%DOCKER_IMAGE_TAG%
                                """
                            }
                        }

                        echo 'Waiting for containers to initialize...'
                        shopsList.each { shop -> waitForContainer("${shop}_backend_container", 30) }

                        // Health check
                        shopsList.each { shop ->
                            def shopPort = env."${shop.toUpperCase()}_PORT"
                            def healthCheckPassed = false
                            def maxRetries = 3
                            def retryCount = 0

                            while (!healthCheckPassed && retryCount < maxRetries) {
                                try {
                                    bat "curl -f -m 15 http://127.0.0.1:${shopPort}/api/health"
                                    healthCheckPassed = true
                                    echo "Health check passed for ${shop}"
                                } catch (Exception e) {
                                    retryCount++
                                    echo "Health check failed for ${shop}, attempt ${retryCount}/${maxRetries}: ${e.getMessage()}"
                                    if (retryCount < maxRetries) bat 'timeout /t 10 /nobreak > nul'
                                    else throw new Exception("Health check failed for ${shop} after ${maxRetries} attempts")
                                }
                            }
                        }

                        echo 'Production containers deployed and verified successfully'

                    } catch (Exception e) {
                        echo "Error in Deploy and Verify stage: ${e.getMessage()}"
                        currentBuild.result = 'FAILURE'
                        throw e
                    }
                }
            }

        }
    }


    post {
        always {
            node('build-node') {
                script {
                    try {
                        bat "docker rm -f testing_backend_container || exit /b 0"
                        echo 'Cleanup completed'
                    } catch (Exception e) {
                        echo "Error during cleanup: ${e.getMessage()}"
                    }

                }
            }

        }
        failure { echo 'Pipeline failed!' }
        success { echo 'Pipeline succeeded!' }

    }
}
