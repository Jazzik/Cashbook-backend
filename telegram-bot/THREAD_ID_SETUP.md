# Настройка Thread ID для Telegram бота

## Обзор

Добавлена поддержка отправки изображений в определенный thread в Telegram чате. Если `TELEGRAM_THREAD_ID` не задан, бот отправляет сообщения в основной чат.

## Настройка

### 1. Получение Thread ID

Для получения thread ID используйте встроенную функцию:

```bash
cd telegram-bot
node -e "require('./bot').startMessageListener()"
```

Отправьте любое сообщение в нужный thread, и в консоли появится информация с thread ID.

### 2. Настройка переменных окружения

Добавьте в ваш `.env` файл:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
TELEGRAM_THREAD_ID=your_thread_id_here  # Опционально
```

### 3. Настройка Jenkins

В Jenkins можно создать credentials для каждого магазина (опционально):

- `{shop}-telegram-thread-id` - Thread ID для конкретного магазина

Например:

- `makarov-telegram-thread-id`
- `yuz1-telegram-thread-id`
- `testing-telegram-thread-id`

**Важно**: Если credential для thread ID не создан для конкретного магазина, бот автоматически будет отправлять сообщения в основной чат без ошибок.

## Поведение

- **С thread ID**: Изображения отправляются в указанный thread
- **Без thread ID**: Изображения отправляются в основной чат
- **Отсутствующий credential в Jenkins**: Pipeline продолжает работу, бот отправляет в основной чат
- **Ошибка thread ID**: Бот попытается отправить в основной чат

## Обработка ошибок

### В Jenkins Pipeline

Если credential `{shop}-telegram-thread-id` не существует:

1. Pipeline выводит сообщение: `"Thread ID credential not found for {shop}, using main chat"`
2. Переменная `TELEGRAM_THREAD_ID` устанавливается в пустую строку
3. Деплой продолжается без ошибок
4. Бот отправляет сообщения в основной чат

## Логирование

Бот выводит информацию о том, куда отправляется сообщение:

```
🧵 Thread ID: 12345
Отправка в thread ID: 12345
```

или

```
🧵 Thread ID: не задан (отправка в основной чат)
Отправка в основной чат (без thread ID)
```
