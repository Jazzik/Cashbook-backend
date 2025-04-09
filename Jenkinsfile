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
}