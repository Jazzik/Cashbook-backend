pipeline {
  agent any
  stages {
    stage('build') {
      steps {
        echo 'built imitation'
        tool 'NodeJS'
        sh 'npm install'
        sh 'npm run build'
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
  }
}