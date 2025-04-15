# 🚀 CashBook Backend

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-green?logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Docker-ready-blue?logo=docker" alt="Docker" />
  <img src="https://img.shields.io/badge/CI-Jenkins-red?logo=jenkins" alt="Jenkins" />
</p>

> **A modern Node.js/TypeScript backend for shift financial data, storing results in Google Sheets.**

---

## 📚 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Directory Structure](#-directory-structure)
- [Setup Instructions](#️-setup-instructions)
  - [Prerequisites](#prerequisites)
  - [Clone the Repository](#1-clone-the-repository)
  - [Install Dependencies](#2-install-dependencies)
  - [Configure Environment Variables](#3-configure-environment-variables)
  - [Build and Run Locally](#4-build-and-run-locally)
- [Docker Usage](#-docker-usage)
- [Jenkins CI/CD Pipeline](#-jenkins-cicd-pipeline)
- [API Endpoints](#-api-endpoints)
- [Google Sheets Integration](#-google-sheets-integration)
- [Error Handling](#️-error-handling)
- [TypeScript Configuration](#-typescript-configuration)
- [Troubleshooting](#-troubleshooting)
- [License](#-license)

---

## 📝 Overview

This is a **Node.js/TypeScript backend service** for CashBook, designed to collect, process, and store shift financial data in Google Sheets. It exposes a REST API for submitting shift data and includes robust error handling, Docker support, and a Jenkins-based CI/CD pipeline.

## ✨ Features

- ⚡ REST API for submitting shift data
- 📊 Integration with Google Sheets API
- 🛡️ Error logging to file
- ⚙️ Environment-based configuration
- 🐳 Dockerized for easy deployment
- 🤖 Jenkins pipeline for CI/CD
- 🔒 TypeScript for type safety

## 📁 Directory Structure

```text
├── src/
│   └── server.ts         # Main application logic
├── dist/                 # Compiled JavaScript output
├── .env.example          # Example environment variables
├── Dockerfile            # Docker build instructions
├── Jenkinsfile           # Jenkins CI/CD pipeline
├── package.json          # Project metadata and scripts
├── tsconfig.json         # TypeScript configuration
```

## 🛠️ Setup Instructions

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [npm](https://www.npmjs.com/)
- Google Cloud service account with Sheets API access
- [Docker](https://www.docker.com/) (optional, for containerized deployment)

### 1. Clone the Repository

```sh
git clone <repo-url>
cd Cashbook-backend
```

### 2. Install Dependencies

```sh
npm ci
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```env
PORT=5000
GOOGLE_SERVICE_ACCOUNT_KEY=backend/service-account.json
SPREADSHEET_ID=your_google_sheet_id
```

- `PORT`: Port for the server
- `GOOGLE_SERVICE_ACCOUNT_KEY`: Path to your Google service account JSON key
- `SPREADSHEET_ID`: ID of your target Google Sheet

### 4. Build and Run Locally

```sh
npm run build
npm start
```

Or for development with hot-reload:

```sh
npm run dev
```

## 🐳 Docker Usage

Build and run the service in a container:

```sh
docker build -t cashbook_backend .
docker run --env-file .env -p 5000:5000 cashbook_backend
```

## 🤖 Jenkins CI/CD Pipeline

- Builds Docker image
- Deploys containers for each shop (branch-based)
- Injects environment variables and credentials
- Runs health checks on deployed containers

See [`Jenkinsfile`](./Jenkinsfile) for details.

## 📡 API Endpoints

### POST `/api/shift-data`

Submits shift data to Google Sheets.

- **Body:** JSON with fields: `date`, `initialBalance`, `terminal`, `terminalReturns`, `terminalTransfer`, `cashInRegister`, `expenses`, `cashReturns`, `cashDeposits`, `cashWithdrawal`, `finalBalance`
- **Response:** `{ success: boolean, message: string }`

### GET `/api/health`

Health check endpoint. Returns server status.

## 📈 Google Sheets Integration

- Uses Google Service Account for authentication
- Appends shift data as a new row (below header) in the specified sheet
- **Sheet columns:**
  - Date
  - Initial Balance
  - Terminal
  - Terminal Returns
  - Terminal Transfer
  - Cash in Register
  - Expenses
  - Cash Returns
  - Cash Deposits
  - Cash Withdrawal
  - Final Balance
  - Cash Revenue

## 🛡️ Error Handling

- Uncaught exceptions and unhandled promise rejections are logged to `server_crash.log`
- Server errors are logged and returned as JSON

## 🧑‍💻 TypeScript Configuration

- Source code in `src/`
- Compiled output in `dist/`
- Strict type checking enabled

## 🆘 Troubleshooting

- Ensure all environment variables are set
- Check `server_crash.log` for error details
- Verify Google service account permissions and key path
- For Docker, ensure volume mounts and environment variables are correct

## 📄 License

ISC
