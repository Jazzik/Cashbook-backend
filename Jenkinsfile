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
        sh '''docker build -t $IMAGE_NAME .
        docker stop $CONTAINER_NAME || true
        docker rm $CONTAINER_NAME || true
        docker run -d --name $CONTAINER_NAME -p 5000:5000 $IMAGE_NAME'''
      }
    }

    stage('Test') {
      steps {
        echo 'test imitation'
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
    GOOGLE_SERVICE_ACCOUNT_KEY = 'service-account.json'
    PORT = '5000'
  }
}