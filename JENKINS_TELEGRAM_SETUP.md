# Настройка Telegram Bot в Jenkins

## Обзор

Jenkinsfile обновлен для поддержки переменных окружения телеграм бота. Используется один общий токен бота для всех магазинов, но разные chat ID для каждого магазина.

## Необходимые Credentials в Jenkins

### 1. Telegram Bot Token (общий для всех магазинов)

- **ID**: `telegram-bot-token`
- **Тип**: Secret text
- **Описание**: Telegram bot token for all shops
- **Значение**: Токен бота, полученный от @BotFather

### 2. Telegram Chat ID (для каждого магазина)

- **ID**: `{shop}-telegram-chat-id`
- **Тип**: Secret text
- **Описание**: Telegram chat ID for {shop}
- **Значение**: ID чата для отправки сообщений

## Примеры credentials

### Общий токен бота (для всех магазинов)

```
telegram-bot-token: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

### Chat ID для каждого магазина

```
makarov-telegram-chat-id: -1001234567890
yuz1-telegram-chat-id: -1009876543210
testing-telegram-chat-id: -1005555555555
```

## Как создать Credentials в Jenkins

1. **Перейдите в Jenkins** → Manage Jenkins → Manage Credentials
2. **Выберите домен** (обычно "Global")
3. **Нажмите "Add Credentials"**
4. **Заполните форму**:
   - Kind: Secret text
   - Scope: Global
   - Secret: [ваш токен/ID]
   - ID: [имя credential, например "telegram-bot-token" или "makarov-telegram-chat-id"]
   - Description: [описание]

## Переменные окружения в контейнерах

После настройки credentials, Jenkins автоматически передаст следующие переменные в контейнеры:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

## Проверка работы

После деплоя проверьте логи контейнера:

```bash
docker logs {shop}_backend_container
```

Должны появиться сообщения:

```
Environment variables:
- TELEGRAM_BOT_TOKEN: Set
- TELEGRAM_CHAT_ID: Set
```

## Безопасность

- Все токены и ID хранятся как секреты в Jenkins
- Переменные передаются только в контейнеры во время запуска
- Логи не показывают реальные значения токенов

## Отладка

Если телеграм бот не работает:

1. **Проверьте credentials** в Jenkins
2. **Проверьте логи контейнера** на наличие ошибок
3. **Убедитесь**, что токен бота действителен
4. **Проверьте**, что chat ID правильный
5. **Убедитесь**, что бот добавлен в чат (если это групповой чат)

## Тестирование

Для тестирования:

- Используйте тот же токен бота (`telegram-bot-token`)
- Создайте отдельный тестовый чат
- Настройте credential `testing-telegram-chat-id` с ID тестового чата
- Запустите pipeline на ветке "test"
