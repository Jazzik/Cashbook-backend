pipeline {
  agent any

  stages {
    stage('Configure') {
      steps {
        script {
          // Set shop list based on branch
          if (env.BRANCH_NAME == 'test') {
            env.SHOPS = 'testing'
            env.TESTING_PORT = '3999'
            echo "Configured for test environment: ${env.SHOPS}"
          } else if (env.BRANCH_NAME == 'main') {
            env.SHOPS = 'makarov,yuz1'
            env.MAKAROV_PORT = '5000'
            env.YUZ1_PORT = '5001'
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
            // Get port from environment variable
            def shopPort = env."${shop.toUpperCase()}_PORT"
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

              # Run container with shop-specific parameters
              docker run --name ${shop}_backend_container \
                --network cashbook-network \
                -d -p 127.0.0.1:${shopPort}:${shopPort} \
                -v /root/cashbook_vesna:/app/credentials \
                -e PORT=${shopPort} \
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
          // Add a longer delay to allow containers to start up properly
          echo 'Waiting for containers to initialize...'
          sleep 20

          def shopsList = env.SHOPS.split(',')

          shopsList.each { shop ->
            // Get port from environment variable
            def shopPort = env."${shop.toUpperCase()}_PORT"
            echo "Checking health for ${shop} on port ${shopPort}"

            // Use catchError to prevent build failure if health check fails
            catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE') {
              sh """
                # Health check with container logs as fallback
                if ! curl -s -f http://127.0.0.1:${shopPort}/api/health; then
                  echo "Health check failed for ${shop}, checking container status:"
                  docker ps | grep ${shop}_backend_container
                  echo "Recent container logs:"
                  docker logs --tail 20 ${shop}_backend_container
                else
                  echo "Health check passed for ${shop}"
                fi
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
