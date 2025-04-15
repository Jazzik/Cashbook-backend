pipeline {
  agent none  // Pipeline starts on any available node

  environment {
    IMAGE_NAME = 'cashbook_backend'
    DOCKER_REGISTRY = credentials('DOCKER_REGISTRY') //jenkins credentials
    DOCKER_PASSWORD = credentials('DOCKER_PASSWORD') //jenkins credentials
    COMMIT_HASH = "${GIT_COMMIT}"  // Use commit hash for tagging
    DOCKER_IMAGE_TAG = 'latest'   // Also push as 'latest'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        stash name: 'source-code', includes: '**/*'
      }
    }
    stage('Configure') {
      agent { label 'build-node' }
      steps {
        script {
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
          // Write dynamic env vars to file and stash for later stages
          writeFile file: 'jenkins_env.groovy', text: envVars
          stash name: 'jenkins-env', includes: 'jenkins_env.groovy'
        }
      }
    }

    stage('Build Docker Image') {
      agent { label 'build-node' }
      when {
        branch 'test'
      }
      steps {
        echo 'Building Docker image'
        sh """
          docker build --build-arg NODE_OPTIONS="--max-old-space-size=4096" -t $DOCKER_REGISTRY/$IMAGE_NAME:$COMMIT_HASH -t $DOCKER_REGISTRY/$IMAGE_NAME:$DOCKER_IMAGE_TAG .
          docker images
        """
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
          def envVars = readFile('jenkins_env.groovy')
          evaluate(envVars)
          def shopsList = SHOPS.split(',')
          // Deploy containers
          shopsList.each { shop ->
            def shopPort = this."${shop.toUpperCase()}_PORT"
            echo "Deploying ${shop} on port ${shopPort}"
            withCredentials([
              string(credentialsId: "${shop}-spreadsheet-id", variable: 'SHOP_SPREADSHEET_ID')
            ]) {
              sh """
                docker run --name ${shop}_backend_container \
                  --network cashbook-network \
                  -d -p 127.0.0.1:${shopPort}:${shopPort} \
                  -v /root/cashbook_vesna:/app/credentials \
                  -e PORT=${shopPort} \
                  -e GOOGLE_SERVICE_ACCOUNT_KEY=/app/credentials/service-account.json \
                  -e SPREADSHEET_ID=\${SHOP_SPREADSHEET_ID} \
                  $DOCKER_REGISTRY/$IMAGE_NAME:$DOCKER_IMAGE_TAG
              """
            }
          }
        }
        script {
          echo 'Waiting for containers to initialize...'
          sleep 10
          def envVars = readFile('jenkins_env.groovy')
          evaluate(envVars)
          def shopsList = SHOPS.split(',')
          shopsList.each { shop ->
            def shopPort = this."${shop.toUpperCase()}_PORT"
            echo "Checking health for ${shop} on port ${shopPort}"
            sh """
              curl -f -m 10 http://127.0.0.1:${shopPort}/api/health
            """
            sh """
              # Stop and remove if container exists
              if [ \$(docker ps -a -q -f name=${shop}_backend_container) ]; then
                docker stop ${shop}_backend_container || true
                docker rm ${shop}_backend_container || true
              fi
            """
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
        echo 'Pushing Docker image to Docker Hub'
        sh """
          docker login -u $DOCKER_REGISTRY -p $DOCKER_PASSWORD
          docker push $DOCKER_REGISTRY/$IMAGE_NAME:$COMMIT_HASH
          docker push $DOCKER_REGISTRY/$IMAGE_NAME:$DOCKER_IMAGE_TAG
        """
      }
    }

    stage('Deploy Containers') {
      agent { label 'deploy-node' }
      when {
        branch 'main'
      }
      steps {
        unstash 'source-code'
        unstash 'jenkins-env'
        script {
          // Load dynamic env vars
          def envVars = readFile('jenkins_env.groovy')
          evaluate(envVars)

          // Pull the image using the latest tag
          sh """
            # Pull the image using the latest tag
            docker pull $DOCKER_REGISTRY/$IMAGE_NAME:$DOCKER_IMAGE_TAG
            """
          // Deploy containers
          def shopsList = SHOPS.split(',')
          shopsList.each { shop ->
            def shopPort = this."${shop.toUpperCase()}_PORT"
            echo "Deploying ${shop} on port ${shopPort}"
            withCredentials([
              string(credentialsId: "${shop}-spreadsheet-id", variable: 'SHOP_SPREADSHEET_ID')
            ]) {
              sh """
              # Stop and remove if container exists
              if [ \$(docker ps -a -q -f name=${shop}_backend_container) ]; then
                docker stop ${shop}_backend_container || true
                docker rm ${shop}_backend_container || true
              fi
              """

              sh """
                docker run --name ${shop}_backend_container \
                  --network cashbook-network \
                  -d -p 127.0.0.1:${shopPort}:${shopPort} \
                  -v /root/cashbook_vesna:/app/credentials \
                  -e PORT=${shopPort} \
                  -e GOOGLE_SERVICE_ACCOUNT_KEY=/app/credentials/service-account.json \
                  -e SPREADSHEET_ID=\${SHOP_SPREADSHEET_ID} \
                  $DOCKER_REGISTRY/$IMAGE_NAME:$DOCKER_IMAGE_TAG
              """
            }
          }
        }
      }
    }

    stage('Test container in production environment') {
      agent { label 'deploy-node' }
      when {
        branch 'main'
      }
      steps {
        unstash 'jenkins-env'
        script {
          echo 'Waiting for containers to initialize...'
          sleep 10
          def envVars = readFile('jenkins_env.groovy')
          evaluate(envVars)
          def shopsList = SHOPS.split(',')
          shopsList.each { shop ->
            def shopPort = this."${shop.toUpperCase()}_PORT"
            echo "Checking health for ${shop} on port ${shopPort}"
            sh """
              docker exec ${shop}_frontend_container curl -f -m 10 \
              http://${shop}_backend_container:${shopPort}/api/health
            """
          }
        }
      }
    }
  }

  tools {
    nodejs 'NodeJS'
  }
}
