# Multi-stage build for Node.js backend application
# Build stage
FROM node:20-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy the source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy environment variables example file
COPY .env.example .env

# Create directory for credentials
RUN mkdir -p /app/credentials


# Copy compiled code from build stage
COPY --from=build /app/dist ./dist

# Environment variables
ENV PORT=$PORT
ENV NODE_ENV=production

# Expose the port the app runs on
EXPOSE $PORT

# Start the application
CMD ["node", "dist/server.js"]

# For overriding build when a new version comes:
# Use Docker volumes to mount the dist directory
# Example: docker run -v /path/to/new/dist:/app/dist [image-name]
