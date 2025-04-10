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
        docker run -d --name $CONTAINER_NAME -p 5001:5001 $IMAGE_NAME'''
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
  }
}