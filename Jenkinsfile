pipeline {
  agent any

  stages {
    stage('Configure') {
      steps {
        script {
          // Set shop list based on branch
          if (env.BRANCH_NAME == 'test') {
            env.SHOPS = 'testing'
            echo "Configured for test environment: ${env.SHOPS}"
          } else if (env.BRANCH_NAME == 'main') {
            env.SHOPS = 'makarov,yuz1'
            echo "Configured for production environments: ${env.SHOPS}"
          } else {
            echo "Branch ${env.BRANCH_NAME} not configured for deployment"
            env.SHOPS = ''
          }
        }
      }
    }

    stage('build') {
      steps {
        echo 'Building Docker image'
        sh '''
# Build with enough memory allocation
docker build --build-arg NODE_OPTIONS="--max-old-space-size=4096" -t $IMAGE_NAME .
docker images
'''
      }
    }

    stage('Deploy Containers') {
      when {
        expression { return env.SHOPS != '' }
      }
      steps {
        script {
          def shopsList = env.SHOPS.split(',')

          shopsList.each { shop ->
            withCredentials([
              string(credentialsId: "${shop}-spreadsheet-id", variable: 'SHOP_SPREADSHEET_ID'),
              string(credentialsId: "${shop}-port", variable: 'SHOP_PORT')
            ]) {
              sh """
              # Stop and remove if container exists
              if [ \$(docker ps -a -q -f name=${shop}_backend_container) ]; then
                docker stop ${shop}_backend_container || true
                docker rm ${shop}_backend_container || true
              fi

              # Run container with shop-specific parameters
              docker run --name ${shop}_backend_container \
                --network cashbook-network \
                -d -p 127.0.0.1:\${SHOP_PORT}:\${SHOP_PORT} \
                -v /root/cashbook_vesna:/app/credentials \
                -e PORT=\${SHOP_PORT} \
                -e GOOGLE_SERVICE_ACCOUNT_KEY=/app/credentials/${shop}-service-account.json \
                -e SPREADSHEET_ID=\${SHOP_SPREADSHEET_ID} \
                $IMAGE_NAME
              """
            }
          }
        }
      }
    }

    stage('Test') {
      when {
        expression { return env.SHOPS != '' }
      }
      steps {
        script {
          // Add a short delay to allow containers to start up properly
          sleep 10

          def shopsList = env.SHOPS.split(',')

          shopsList.each { shop ->
            withCredentials([
              string(credentialsId: "${shop}-port", variable: 'SHOP_PORT')
            ]) {
              echo "Checking health for ${shop} on port ${SHOP_PORT}"
              sh """
                # Health check with curl - will fail the build if health check fails
                curl -f http://127.0.0.1:\${SHOP_PORT}/api/health
              """
            }
          }
        }
      }
    }

  }
  tools {
    nodejs 'NodeJS'
  }
  environment {
    NODE_OPTIONS = '--max_old_space_size=4096'
    IMAGE_NAME = 'cashbook_backend'
  }
}
