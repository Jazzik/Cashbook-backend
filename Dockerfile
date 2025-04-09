# 1. Базовый образ
FROM node:20-alpine

# 2. Рабочая директория внутри контейнера
WORKDIR /app

# 3. Копируем только нужные файлы
COPY package*.json ./
COPY ./build /build

# 4. Устанавливаем только продакшен-зависимости
RUN npm install --only=production

# 5. Открываем порт (если нужно)
EXPOSE 4000

# 6. Команда для запуска приложения
CMD ["node", "build/index.js"]
