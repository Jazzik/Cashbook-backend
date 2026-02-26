// Helper function to wait for container readiness
def waitForContainer(containerName, maxWaitSeconds = 30) {
    def startTime = System.currentTimeMillis()
    def maxWaitMs = maxWaitSeconds * 1000

    while (System.currentTimeMillis() - startTime < maxWaitMs) {
        try {
            def containerStatus = sh(
                script: "docker ps -f name=${containerName} --format '{{.Status}}'",
                returnStdout: true
            ).trim()

            if (containerStatus && !containerStatus.contains('Exit')) {
                echo "Container ${containerName} is ready: ${containerStatus}"
                return true
            }

            sh 'sleep 2'
        } catch (Exception e) {
            echo "Waiting for container ${containerName} to be ready..."
            sh 'sleep 2'
        }
    }

    error "Container ${containerName} failed to become ready within ${maxWaitSeconds} seconds"
}

// Helper function to deploy shops on the current node
def deployShops(shopsList, imageTag) {
    sh """
        # Ensure Docker network exists
        docker network inspect cashbook-network || docker network create cashbook-network
        # Pull the image
        docker pull \$DOCKER_REGISTRY/\$IMAGE_NAME:${imageTag}
    """

    shopsList.each { shop ->
        def shopPort = env."${shop.toUpperCase()}_PORT"
        echo "Deploying ${shop} on port ${shopPort}"

        withCredentials([
            string(credentialsId: "${shop}-spreadsheet-id", variable: 'SHOP_SPREADSHEET_ID'),
            file(credentialsId: 'service-account', variable: 'GOOGLE_SERVICE_ACCOUNT_FILE'),
            string(credentialsId: "${shop}-token-yougile", variable: 'TOKEN_YOUGILE'),
            string(credentialsId: "${shop}-yougile-chat-id", variable: 'YOUGILE_CHAT_ID'),
        // string(credentialsId: 'telegram-bot-token', variable: 'TELEGRAM_BOT_TOKEN'),
        // string(credentialsId: "${shop}-telegram-chat-id", variable: 'TELEGRAM_CHAT_ID')
        ]) {
            // Опциональный thread ID - если credential не существует, переменная будет пустой
            def threadIdCredential = ''
            try {
                withCredentials([string(credentialsId: "${shop}-telegram-thread-id", variable: 'TELEGRAM_THREAD_ID')]) {
                    threadIdCredential = env.TELEGRAM_THREAD_ID
                }
            } catch (Exception e) {
                echo "Thread ID credential not found for ${shop}, using main chat"
                threadIdCredential = ''
            }

            // Копируем service-account в workspace
            sh 'chmod -f 644 "$WORKSPACE/service-account.json" || true'
            writeFile file: 'service-account.json', text: readFile(env.GOOGLE_SERVICE_ACCOUNT_FILE)

            // Проверка файла
            sh '''
                if [ ! -f "service-account.json" ]; then
                    echo "Service account file not found!"
                    exit 1
                fi
                if [ ! -s "service-account.json" ]; then
                    echo "Service account file is empty!"
                    exit 1
                fi
            '''

            sh """
                docker rm -f ${shop}_backend_container || true
                docker run --name ${shop}_backend_container \\
                    --network cashbook-network \\
                    --restart unless-stopped \\
                    -d -p 0.0.0.0:${shopPort}:${shopPort} \\
                    -v "\$(pwd)/service-account.json:/app/credentials/service-account.json" \\
                    -e PORT=${shopPort} \\
                    -e GOOGLE_SERVICE_ACCOUNT_KEY=/app/credentials/service-account.json \\
                    -e SPREADSHEET_ID=\$SHOP_SPREADSHEET_ID \\
                    -e TOKEN_YOUGILE=\$TOKEN_YOUGILE \\
                    -e YOUGILE_CHAT_ID=\$YOUGILE_CHAT_ID \\
                    \$DOCKER_REGISTRY/\$IMAGE_NAME:${imageTag}
            """
        }
    }

    // Ждем и проверяем контейнеры
    shopsList.each { shop ->
        waitForContainer("${shop}_backend_container", 30)
    }

    // Health check с retry
    shopsList.each { shop ->
        def shopPort = env."${shop.toUpperCase()}_PORT"
        echo "Health check for ${shop} on port ${shopPort}"

        def healthCheckPassed = false
        def maxRetries = 3
        def retryCount = 0

        while (!healthCheckPassed && retryCount < maxRetries) {
            try {
                sh "curl -f -m 15 http://127.0.0.1:${shopPort}/api/health"
                healthCheckPassed = true
                echo "Health check passed for ${shop}"
            } catch (Exception e) {
                retryCount++
                echo "Health check failed for ${shop}, attempt ${retryCount}/${maxRetries}: ${e.getMessage()}"
                if (retryCount < maxRetries) {
                    sh 'sleep 10'
                } else {
                    throw new Exception("Health check failed for ${shop} after ${maxRetries} attempts")
                }
            }
        }
    }
}

pipeline {
    agent none

    environment {
        IMAGE_NAME = 'cashbook_backend'
        DOCKER_REGISTRY = credentials('DOCKER_REGISTRY')
        DOCKER_PASSWORD = credentials('DOCKER_PASSWORD')
        DOCKER_IMAGE_TAG = 'latest'

        // Перечисли все Linux-ноды через запятую — имена нод в Jenkins
        // Например: DEPLOY_NODES = 'linux-node-1,linux-node-2'
        DEPLOY_NODES = 'yuz1-linux'
    }

    stages {
        stage('Checkout') {
            agent { label 'linux' }
            steps {
                checkout scm
                stash name: 'source-code', includes: '**/*'
            }
        }

        stage('Configure') {
            agent { label 'linux' }
            steps {
                script {
                    try {
                        env.COMMIT_HASH = env.GIT_COMMIT
                        echo "Building for commit: ${env.COMMIT_HASH}"

                        if (env.BRANCH_NAME == 'test') {
                            env.SHOPS = 'testing'
                            env.TESTING_PORT = '3999'
                        } else if (env.BRANCH_NAME == 'main') {
                            env.SHOPS = 'makarov,makarov2,yuz1'
                            env.MAKAROV_PORT = '5000'
                            env.MAKAROV2_PORT = '5001'
                            env.YUZ1_PORT = '5002'
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
                                MAKAROV2_PORT='${env.MAKAROV2_PORT}'
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

        stage('Build, Test and Push') {
            // Single agent — image must be built and pushed on the same node
            agent { label 'linux' }
            when { branch 'test' }
            steps {
                script {
                    try {
                        echo 'Building Docker image'
                        sh '''
                            docker build --build-arg NODE_OPTIONS="--max-old-space-size=4096" \
                                -t $DOCKER_REGISTRY/$IMAGE_NAME:$COMMIT_HASH \
                                -t $DOCKER_REGISTRY/$IMAGE_NAME:$DOCKER_IMAGE_TAG .
                        '''
                        sh 'docker images | grep $IMAGE_NAME'
                        echo 'Docker image built successfully'

                        unstash 'jenkins-env'
                        def shopsList = env.SHOPS.split(',')

                        sh '''
                            docker network inspect cashbook-network || docker network create cashbook-network
                        '''

                        shopsList.each { shop ->
                            def shopPort = env."${shop.toUpperCase()}_PORT"
                            echo "Deploying ${shop} for testing on port ${shopPort}"

                            withCredentials([
                                string(credentialsId: "${shop}-spreadsheet-id", variable: 'SHOP_SPREADSHEET_ID'),
                                file(credentialsId: 'service-account', variable: 'GOOGLE_SERVICE_ACCOUNT_FILE'),
                                string(credentialsId: "${shop}-token-yougile", variable: 'TOKEN_YOUGILE'),
                                string(credentialsId: "${shop}-yougile-chat-id", variable: 'YOUGILE_CHAT_ID'),
                            // string(credentialsId: 'telegram-bot-token', variable: 'TELEGRAM_BOT_TOKEN'),
                            // string(credentialsId: "${shop}-telegram-chat-id", variable: 'TELEGRAM_CHAT_ID')
                            ]) {
                                def threadIdCredential = ''
                                try {
                                    withCredentials([string(credentialsId: "${shop}-telegram-thread-id", variable: 'TELEGRAM_THREAD_ID')]) {
                                        threadIdCredential = env.TELEGRAM_THREAD_ID
                                    }
                                } catch (Exception e) {
                                    echo "Thread ID credential not found for ${shop}, using main chat"
                                    threadIdCredential = ''
                                }

                                sh 'chmod -f 644 "$WORKSPACE/service-account.json" || true'
                                writeFile file: 'service-account.json', text: readFile(env.GOOGLE_SERVICE_ACCOUNT_FILE)

                                sh '''
                                    if [ ! -f "service-account.json" ]; then
                                        echo "Service account file not found!"
                                        exit 1
                                    fi
                                    if [ ! -s "service-account.json" ]; then
                                        echo "Service account file is empty!"
                                        exit 1
                                    fi
                                '''

                                sh """
                                    docker rm -f ${shop}_backend_container || true
                                    docker run --name ${shop}_backend_container \\
                                        --network cashbook-network \\
                                        -d -p 0.0.0.0:${shopPort}:${shopPort} \\
                                        -v "\$(pwd)/service-account.json:/app/credentials/service-account.json" \\
                                        -e PORT=${shopPort} \\
                                        -e GOOGLE_SERVICE_ACCOUNT_KEY=/app/credentials/service-account.json \\
                                        -e SPREADSHEET_ID=\$SHOP_SPREADSHEET_ID \\
                                        -e TOKEN_YOUGILE=\$TOKEN_YOUGILE \\
                                        -e YOUGILE_CHAT_ID=\$YOUGILE_CHAT_ID \\
                                        \$DOCKER_REGISTRY/\$IMAGE_NAME:\$DOCKER_IMAGE_TAG
                                """
                            }
                        }

                        echo 'Waiting for containers to initialize...'
                        shopsList.each { shop -> waitForContainer("${shop}_backend_container", 30) }

                        shopsList.each { shop ->
                            def shopPort = env."${shop.toUpperCase()}_PORT"
                            echo "Checking health for ${shop} on port ${shopPort}"
                            def healthCheckPassed = false
                            def maxRetries = 3
                            def retryCount = 0

                            while (!healthCheckPassed && retryCount < maxRetries) {
                                try {
                                    sh "curl -f -m 15 http://127.0.0.1:${shopPort}/api/health"
                                    healthCheckPassed = true
                                    echo "Health check passed for ${shop}"
                                } catch (Exception e) {
                                    retryCount++
                                    echo "Health check failed for ${shop}, attempt ${retryCount}/${maxRetries}: ${e.getMessage()}"
                                    if (retryCount < maxRetries) {
                                        sh 'sleep 10'
                                    } else {
                                        throw new Exception("Health check failed for ${shop} after ${maxRetries} attempts")
                                    }
                                }
                            }
                        }

                        // Cleanup test containers
                        shopsList.each { shop ->
                            sh "docker rm -f ${shop}_backend_container || true"
                            echo "Cleaned up test container for ${shop}"
                        }

                        // Push on the same node where image was built
                        echo 'Pushing Docker image to Docker Hub'
                        sh '''
                            docker login -u $DOCKER_REGISTRY -p $DOCKER_PASSWORD
                            docker push $DOCKER_REGISTRY/$IMAGE_NAME:$COMMIT_HASH
                            docker push $DOCKER_REGISTRY/$IMAGE_NAME:$DOCKER_IMAGE_TAG
                        '''
                        echo 'Docker images pushed successfully'
                    } catch (Exception e) {
                        echo "Error in Build, Test and Push stage: ${e.getMessage()}"
                        currentBuild.result = 'FAILURE'
                        throw e
                    }
                }
            }
        }

        stage('Deploy and Verify') {
            agent none
            when { branch 'main' }
            steps {
                script {
                    try {
                        def shopsList = env.SHOPS.split(',')
                        def buildNodes = env.DEPLOY_NODES.split(',')
                        echo "Deploying on nodes: ${buildNodes}"

                        def deployTasks = buildNodes.collectEntries { nodeName ->
                            ["Deploy on ${nodeName.trim()}": {
                                node(nodeName.trim()) {
                                    unstash 'source-code'
                                    deployShops(shopsList, env.DOCKER_IMAGE_TAG)
                                }
                            }]
                        }

                        parallel deployTasks

                        echo 'Production containers deployed and verified successfully on all nodes'
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
            script {
                def buildNodes = env.DEPLOY_NODES.split(',')
                def cleanupTasks = buildNodes.collectEntries { nodeName ->
                    ["Cleanup on ${nodeName.trim()}": {
                        node(nodeName.trim()) {
                            try {
                                sh 'docker rm -f testing_backend_container || true'
                                echo "Cleanup completed on ${nodeName.trim()}"
                            } catch (Exception e) {
                                echo "Error during cleanup on ${nodeName.trim()}: ${e.getMessage()}"
                            }
                        }
                    }]
                }
                parallel cleanupTasks
            }
        }
        failure { echo 'Pipeline failed!' }
        success { echo 'Pipeline succeeded!' }
    }
}
