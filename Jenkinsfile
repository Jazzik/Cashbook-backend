pipeline {
  agent none  // Pipeline starts on any available node

  environment {
    IMAGE_NAME = 'cashbook_backend'
    DOCKER_REGISTRY = credentials('DOCKER_REGISTRY') //jenkins credentials
    DOCKER_PASSWORD = credentials('DOCKER_PASSWORD') //jenkins credentials
    DOCKER_IMAGE_TAG = 'latest'   // Also push as 'latest'
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
            // Set COMMIT_HASH after checkout
            env.COMMIT_HASH = env.GIT_COMMIT
            echo "Building for commit: ${env.COMMIT_HASH}"

            // Set shop list and ports based on branch
            def envVars = ''
            if (env.BRANCH_NAME == 'test') {
              env.SHOPS = 'testing'
              env.TESTING_PORT = '3999'
              echo "Configured for test environment: ${env.SHOPS}"
              envVars = """
              SHOPS='${env.SHOPS}'
              TESTING_PORT='${env.TESTING_PORT}'
              """
            } else if (env.BRANCH_NAME == 'main') {
              env.SHOPS = 'makarov,yuz1'
              env.MAKAROV_PORT = '5000'
              env.YUZ1_PORT = '5001'
              echo "Configured for production environments: ${env.SHOPS}"
              envVars = """
              SHOPS='${env.SHOPS}'
              MAKAROV_PORT='${env.MAKAROV_PORT}'
              YUZ1_PORT='${env.YUZ1_PORT}'
              """
            } else {
              echo "Branch ${env.BRANCH_NAME} not configured for deployment"
              env.SHOPS = ''
              envVars = "SHOPS=''\n"
            }

            // Validate required environment variables
            if (!env.SHOPS) {
              error "No shops configured for branch: ${env.BRANCH_NAME}"
            }

            // Write dynamic env vars to file and stash for later stages
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

    stage('Build Docker Image') {
      agent { label 'build-node' }
      when {
        branch 'test'
      }
      steps {
        script {
          try {
            echo 'Building Docker image'
            bat '''
              docker build --build-arg NODE_OPTIONS="--max-old-space-size=4096" ^
                -t %DOCKER_REGISTRY%/%IMAGE_NAME%:%COMMIT_HASH% ^
                -t %DOCKER_REGISTRY%/%IMAGE_NAME%:%DOCKER_IMAGE_TAG% .
            '''
            bat 'docker images | findstr %IMAGE_NAME%'
            echo 'Docker image built successfully'
          } catch (Exception e) {
            echo "Error building Docker image: ${e.getMessage()}"
            currentBuild.result = 'FAILURE'
            throw e
          }
        }
      }
    }

    stage('Test container in test environment') {
      agent { label 'build-node' }
      when {
        branch 'test'
      }
      steps {
        unstash 'jenkins-env'
        script {
          try {
            def shopsList = env.SHOPS.split(',')

            // Deploy containers
            shopsList.each { shop ->
              def shopPort = env."${shop.toUpperCase()}_PORT"
              echo "Deploying ${shop} on port ${shopPort}"

              withCredentials([
                string(credentialsId: "${shop}-spreadsheet-id", variable: 'SHOP_SPREADSHEET_ID'),
                file(credentialsId: 'service-account', variable: 'GOOGLE_SERVICE_ACCOUNT_FILE')
              ]) {
                bat '''
                  REM Ensure Docker network exists
                  docker network inspect cashbook-network || docker network create cashbook-network
                '''
                bat """
                  REM Stop and remove if container exists
                  docker rm -f ${shop}_backend_container || exit /b 0
                """
                bat """
                  docker run --name ${shop}_backend_container ^
                    --network cashbook-network ^
                    -d -p 127.0.0.1:${shopPort}:${shopPort} ^
                    -v "%GOOGLE_SERVICE_ACCOUNT_FILE%:/app/credentials/service-account.json" ^
                    -e PORT=${shopPort} ^
                    -e GOOGLE_SERVICE_ACCOUNT_KEY=/app/credentials/service-account.json ^
                    -e SPREADSHEET_ID=%SHOP_SPREADSHEET_ID% ^
                    %DOCKER_REGISTRY%/%IMAGE_NAME%:%DOCKER_IMAGE_TAG%
                """
              }
            }

            echo 'Waiting for containers to initialize...'
            bat 'ping 127.0.0.1 -n 11 > nul'

            // Health check with retry logic
            shopsList.each { shop ->
              def shopPort = env."${shop.toUpperCase()}_PORT"
              echo "Checking health for ${shop} on port ${shopPort}"

              def healthCheckPassed = false
              def maxRetries = 3
              def retryCount = 0

              while (!healthCheckPassed && retryCount < maxRetries) {
                try {
                  bat """
                    curl -f -m 10 http://127.0.0.1:${shopPort}/api/health
                  """
                  healthCheckPassed = true
                  echo "Health check passed for ${shop}"
                } catch (Exception e) {
                  retryCount++
                  echo "Health check failed for ${shop}, attempt ${retryCount}/${maxRetries}: ${e.getMessage()}"
                  if (retryCount < maxRetries) {
                    bat 'ping 127.0.0.1 -n 6 > nul'
                  } else {
                    throw new Exception("Health check failed for ${shop} after ${maxRetries} attempts")
                  }
                }
              }
            }
          } catch (Exception e) {
            echo "Error in test environment: ${e.getMessage()}"
            currentBuild.result = 'FAILURE'
            throw e
          } finally {
            // Cleanup containers
            try {
              def shopsList = env.SHOPS.split(',')
              shopsList.each { shop ->
                bat """
                  REM Stop and remove container
                  docker rm -f ${shop}_backend_container || exit /b 0
                """
                echo "Cleaned up container for ${shop}"
              }
            } catch (Exception cleanupError) {
              echo "Error during cleanup: ${cleanupError.getMessage()}"
            }
          }
        }
      }
    }

    stage('Push to Docker Hub') {
      when {
        branch 'test'
      }
      agent { label 'build-node' }
      steps {
        script {
          try {
            echo 'Pushing Docker image to Docker Hub'
            bat '''
              docker login -u %DOCKER_REGISTRY% -p %DOCKER_PASSWORD%
              docker push %DOCKER_REGISTRY%/%IMAGE_NAME%:%COMMIT_HASH%
              docker push %DOCKER_REGISTRY%/%IMAGE_NAME%:%DOCKER_IMAGE_TAG%
            '''
            echo 'Docker images pushed successfully'
          } catch (Exception e) {
            echo "Error pushing Docker images: ${e.getMessage()}"
            currentBuild.result = 'FAILURE'
            throw e
          }
        }
      }
    }

    stage('Deploy to Production') {
      when {
        branch 'test'
      }
      agent { label 'build-node' }
      steps {
        input message: 'Deploy to Production?', ok: 'Deploy', parameters: [
          choice(name: 'DEPLOY_ACTION', choices: ['Deploy', 'Skip'], description: 'Choose deployment action')
        ]
        script {
          if (params.DEPLOY_ACTION == 'Skip') {
            echo 'Production deployment skipped by user'
            return
          }
          
          try {
            echo 'Deploying tested version to production'
            
            // Pull the tested image
            bat '''
              docker pull %DOCKER_REGISTRY%/%IMAGE_NAME%:%DOCKER_IMAGE_TAG%
            '''
            
            // Load environment variables for production
            unstash 'jenkins-env'
            // Set production environment variables
            env.SHOPS = 'makarov,yuz1'
            env.MAKAROV_PORT = '5000'
            env.YUZ1_PORT = '5001'
            
            // Deploy to production
            def shopsList = env.SHOPS.split(',')
            shopsList.each { shop ->
              def shopPort = env."${shop.toUpperCase()}_PORT"
              echo "Deploying ${shop} to production on port ${shopPort}"

              withCredentials([
                string(credentialsId: "${shop}-spreadsheet-id", variable: 'SHOP_SPREADSHEET_ID')
              ]) {
                bat '''
                REM Ensure Docker network exists
                docker network inspect cashbook-network || docker network create cashbook-network
                '''
                bat """
                REM Stop and remove if container exists
                docker rm -f ${shop}_backend_container || exit /b 0
                """

                bat """
                  docker run --name ${shop}_backend_container ^
                    --network cashbook-network ^
                    -d -p 127.0.0.1:${shopPort}:${shopPort} ^
                    -v C:\\cashbook_vesna:/app/credentials ^
                    -e PORT=${shopPort} ^
                    -e GOOGLE_SERVICE_ACCOUNT_KEY=/app/credentials/service-account.json ^
                    -e SPREADSHEET_ID=%SHOP_SPREADSHEET_ID% ^
                    %DOCKER_REGISTRY%/%IMAGE_NAME%:%DOCKER_IMAGE_TAG%
                """
              }
            }
            
            echo 'Production deployment completed successfully'
          } catch (Exception e) {
            echo "Error in production deployment: ${e.getMessage()}"
            currentBuild.result = 'FAILURE'
            throw e
          }
        }
      }
    }

    stage('Test Production Deployment') {
      when {
        branch 'test'
      }
      agent { label 'build-node' }
      steps {
        script {
          try {
            echo 'Testing production deployment'
            bat 'ping 127.0.0.1 -n 11 > nul' // Give containers time to start
            
            // Test production deployment
            def shopsList = env.SHOPS.split(',')
            shopsList.each { shop ->
              def shopPort = env."${shop.toUpperCase()}_PORT"
              echo "Testing production deployment for ${shop} on port ${shopPort}"
              
              def healthCheckPassed = false
              def maxRetries = 3
              def retryCount = 0

              while (!healthCheckPassed && retryCount < maxRetries) {
                try {
                  bat """
                    curl -f -m 10 http://127.0.0.1:${shopPort}/api/health
                  """
                  healthCheckPassed = true
                  echo "Production health check passed for ${shop}"
                } catch (Exception e) {
                  retryCount++
                  echo "Production health check failed for ${shop}, attempt ${retryCount}/${maxRetries}: ${e.getMessage()}"
                  if (retryCount < maxRetries) {
                    bat 'ping 127.0.0.1 -n 6 > nul'
                  } else {
                    throw new Exception("Production health check failed for ${shop} after ${maxRetries} attempts")
                  }
                }
              }
            }
            
            echo 'Production deployment test completed successfully'
          } catch (Exception e) {
            echo "Error in production deployment test: ${e.getMessage()}"
            currentBuild.result = 'FAILURE'
            throw e
          }
        }
      }
    }

    stage('Deploy Containers') {
      agent { label 'build-node' }
      when {
        branch 'main'
      }
      steps {
        unstash 'source-code'
        unstash 'jenkins-env'
        script {
          try {
            // Pull the image using the latest tag
            bat '''
              REM Pull the image using the latest tag
              docker pull %DOCKER_REGISTRY%/%IMAGE_NAME%:%DOCKER_IMAGE_TAG%
            '''

            // Deploy containers
            def shopsList = env.SHOPS.split(',')
            shopsList.each { shop ->
              def shopPort = env."${shop.toUpperCase()}_PORT"
              echo "Deploying ${shop} on port ${shopPort}"

              withCredentials([
                string(credentialsId: "${shop}-spreadsheet-id", variable: 'SHOP_SPREADSHEET_ID')
              ]) {
                bat '''
                REM Ensure Docker network exists
                docker network inspect cashbook-network || docker network create cashbook-network
                '''
                bat """
                REM Stop and remove if container exists
                docker rm -f ${shop}_backend_container || exit /b 0
                """

                bat """
                  docker run --name ${shop}_backend_container ^
                    --network cashbook-network ^
                    -d -p 127.0.0.1:${shopPort}:${shopPort} ^
                    -v C:\\cashbook_vesna:/app/credentials ^
                    -e PORT=${shopPort} ^
                    -e GOOGLE_SERVICE_ACCOUNT_KEY=/app/credentials/service-account.json ^
                    -e SPREADSHEET_ID=%SHOP_SPREADSHEET_ID% ^
                    %DOCKER_REGISTRY%/%IMAGE_NAME%:%DOCKER_IMAGE_TAG%
                """
              }
            }
          } catch (Exception e) {
            echo "Error in Deploy Containers stage: ${e.getMessage()}"
            currentBuild.result = 'FAILURE'
            throw e
          }
        }
      }
    }

    stage('Test container in production environment') {
      agent { label 'build-node' }
      when {
        branch 'main'
      }
      steps {
        unstash 'jenkins-env'
        script {
          try {
            echo 'Waiting for containers to initialize...'
            bat 'ping 127.0.0.1 -n 11 > nul'

            def shopsList = env.SHOPS.split(',')

            shopsList.each { shop ->
              def shopPort = env."${shop.toUpperCase()}_PORT"
              echo "Checking health for ${shop} on port ${shopPort}"

              def healthCheckPassed = false
              def maxRetries = 3
              def retryCount = 0

              while (!healthCheckPassed && retryCount < maxRetries) {
                try {
                  bat """
                    docker exec ${shop}_frontend_container curl -f -m 10 ^
                    http://${shop}_backend_container:${shopPort}/api/health
                  """
                  healthCheckPassed = true
                  echo "Health check passed for ${shop}"
                } catch (Exception e) {
                  retryCount++
                  echo "Health check failed for ${shop}, attempt ${retryCount}/${maxRetries}: ${e.getMessage()}"
                  if (retryCount < maxRetries) {
                    bat 'ping 127.0.0.1 -n 6 > nul'
                  } else {
                    throw new Exception("Health check failed for ${shop} after ${maxRetries} attempts")
                  }
                }
              }
            }
          } catch (Exception e) {
            echo "Error in production health check: ${e.getMessage()}"
            currentBuild.result = 'FAILURE'
            throw e
          }
        }
      }
    }
  }

  tools {
    nodejs 'NodeJS'
  }

  post {
    always {
      node('build-node') {
        script {
          // Cleanup any remaining containers
          try {
            // Cleanup test containers
            bat '''
              REM Cleanup test containers
              docker rm -f testing_backend_container || exit /b 0
            '''
            echo "Cleanup completed"
          } catch (Exception e) {
            echo "Error during cleanup: ${e.getMessage()}"
          }
        }
      }
    }
    failure {
      echo 'Pipeline failed!'
      // Add notification here if needed
    }
    success {
      echo 'Pipeline succeeded!'
      // Add notification here if needed
    }
  }
}
