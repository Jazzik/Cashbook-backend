# Настройка Telegram Bot в Jenkins

## Обзор

Jenkinsfile обновлен для поддержки переменных окружения телеграм бота. Теперь каждый магазин может иметь свои собственные настройки телеграм бота.

## Необходимые Credentials в Jenkins

Для каждого магазина нужно создать следующие credentials:

### 1. Telegram Bot Token

- **ID**: `{shop}-telegram-bot-token`
- **Тип**: Secret text
- **Описание**: Telegram bot token for {shop}
- **Значение**: Токен бота, полученный от @BotFather

### 2. Telegram Chat ID

- **ID**: `{shop}-telegram-chat-id`
- **Тип**: Secret text
- **Описание**: Telegram chat ID for {shop}
- **Значение**: ID чата для отправки сообщений

## Примеры для каждого магазина

### Магазин "makarov"

```
makarov-telegram-bot-token: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
makarov-telegram-chat-id: -1001234567890
```

### Магазин "yuz1"

```
yuz1-telegram-bot-token: 9876543210:ZYXwvuTSRqpoNMLkjihGFEdcba
yuz1-telegram-chat-id: -1009876543210
```

### Тестовый магазин "testing"

```
testing-telegram-bot-token: 5555555555:TestBotTokenForTestingPurposes
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
   - ID: [имя credential, например "makarov-telegram-bot-token"]
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

Для тестирования можно использовать тестовые credentials:

- Создайте тестового бота через @BotFather
- Добавьте бота в тестовый чат
- Настройте credentials с префиксом "testing-"
- Запустите pipeline на ветке "test"
