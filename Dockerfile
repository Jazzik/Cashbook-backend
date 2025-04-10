FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY ./dist ./build

RUN npm install --only=production

RUN mkdir -p /app/credentials

EXPOSE 4000

CMD ["node", "build/index.js"]