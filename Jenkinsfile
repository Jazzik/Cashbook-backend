pipeline {
  agent any

  stages {
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
      steps {
        script {
          def shops = ['testing', 'makarov', 'yuz1' ]

          shops.each { shop ->
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
      steps {
        echo '123'
      }
    }

    stage('Deploy') {
      steps {
        echo 'deploying...'
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
