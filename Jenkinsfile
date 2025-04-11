pipeline {
  agent any
  stages {
    stage('build') {
      steps {
        echo 'built imitation'
        sh 'npm install'
        sh 'npm run build'
      }
    }

    stage('Replace Current Docker Container') {
      steps {
        sh '''
if [ $(docker ps -a -q -f name=$CONTAINER_NAME) ]; then
  docker stop $CONTAINER_NAME || true
  docker rm $CONTAINER_NAME || true
fi

docker build -t $IMAGE_NAME .
docker images
docker run --name cashbook_backend_container -d -p 5000:5000 -v /root/cashbook_vesna/service-account.json:/app/credentials/service-account.json -e PORT=5000 -e GOOGLE_SERVICE_ACCOUNT_KEY=/app/credentials/service-account.json -e SPREADSHEET_ID=1WyGBW5V7HrvP1K5-wfr5PhmElv4cnhekV_xfL29ni38 cashbook_backend

'''
      }
    }

    stage('Test') {
      steps {
        echo 'baba'
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