pipeline {
  agent any
  stages {
    stage('build') {
      steps {
        echo 'Building Docker image'
        sh '''
if [ $(docker ps -a -q -f name=$CONTAINER_NAME) ]; then
  docker stop $CONTAINER_NAME || true
  docker rm $CONTAINER_NAME || true
fi

docker build -t $IMAGE_NAME .
docker images
'''
      }
    }

    stage('Deploy Container') {
      steps {
        sh '''
docker run --name cashbook_backend_container --network cashbook-network -d -p %PORT:$PORT -v /root/cashbook_vesna:/app -e PORT=$PORT -e GOOGLE_SERVICE_ACCOUNT_KEY=/app/credentials/service-account.json -e SPREADSHEET_ID=$SPREADSHEET_ID cashbook_backend
'''
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
    CONTAINER_NAME = 'cashbook_backend_container'
    SPREADSHEET_ID = '1WyGBW5V7HrvP1K5-wfr5PhmElv4cnhekV_xfL29ni38'
    GOOGLE_SERVICE_ACCOUNT_KEY = '/app/credentials/service-account.json'
    PORT = '5000'
  }
}