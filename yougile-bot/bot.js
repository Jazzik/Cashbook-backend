const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Конфигурация бота
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const threadId = process.env.TELEGRAM_THREAD_ID; // Опциональный thread ID
const uploadsPath = path.join(__dirname, "../uploads");

// ВАЖНО:
// Этот файл используется как:
// 1) отдельный CLI-скрипт (node bot.js / node listen-messages.js)
// 2) модуль, который подключается из backend через telegram-bot/integration.js
//
// Нам НЕЛЬЗЯ завершать весь процесс (process.exit), когда файл подключается как модуль,
// иначе при отсутствии TELEGRAM_* переменных "падает" весь backend.
//
// Поэтому:
// - если файл запущен напрямую (require.main === module) — ведём себя как раньше и выходим с ошибкой
// - если файл подключён как модуль — кидаем исключение, которое будет поймано в server.ts,
//   и Telegram-интеграция просто будет отключена, а основная логика (Google Sheets) продолжит работать
if (!token || !chatId) {
  const message =
    "Ошибка: Необходимо установить TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в переменных окружения";

  console.error(message);

  if (require.main === module) {
    // CLI-режим: завершаем процесс, чтобы явно показать проблему настройки
    process.exit(1);
  } else {
    // Рабочий backend: даём подняться приложению, а Telegram просто будет отключён
    throw new Error(message);
  }
}

// Создание экземпляра бота
const bot = new TelegramBot(token, { polling: false });

/**
 * Функция для вывода сообщений с их thread ID в консоль
 * Запускает бота в режиме polling для прослушивания сообщений
 */
function startMessageListener() {
  console.log("🔍 Запуск прослушивания сообщений для получения thread ID...");
  console.log(
    "📝 Отправьте любое сообщение в чат, чтобы увидеть его thread ID"
  );
  console.log("⏹️  Для остановки нажмите Ctrl+C");

  // Создаем новый экземпляр бота с polling
  const listenerBot = new TelegramBot(token, { polling: true });

  // Обработчик всех входящих сообщений
  listenerBot.on("message", (msg) => {
    const messageInfo = {
      messageId: msg.message_id,
      chatId: msg.chat.id,
      threadId: msg.message_thread_id || "Нет thread ID (обычное сообщение)",
      from: msg.from
        ? `${msg.from.first_name} ${msg.from.last_name || ""}`.trim()
        : "Неизвестно",
      username: msg.from ? msg.from.username : "Нет username",
      text: msg.text || "Нет текста",
      date: new Date(msg.date * 1000).toLocaleString("ru-RU"),
      chatType: msg.chat.type,
    };

    console.log("\n📨 === НОВОЕ СООБЩЕНИЕ ===");
    console.log(`🆔 Message ID: ${messageInfo.messageId}`);
    console.log(`💬 Chat ID: ${messageInfo.chatId}`);
    console.log(`🧵 Thread ID: ${messageInfo.threadId}`);
    console.log(`👤 От: ${messageInfo.from} (@${messageInfo.username})`);
    console.log(`📝 Текст: ${messageInfo.text}`);
    console.log(`📅 Дата: ${messageInfo.date}`);
    console.log(`🏷️  Тип чата: ${messageInfo.chatType}`);
    console.log("========================\n");
  });

  // Обработчик ошибок
  listenerBot.on("error", (error) => {
    console.error("❌ Ошибка бота:", error);
  });

  // Обработчик остановки
  process.on("SIGINT", () => {
    console.log("\n🛑 Остановка прослушивания сообщений...");
    listenerBot.stopPolling();
    process.exit(0);
  });

  return listenerBot;
}

/**
 * Получает последнее изображение из папки uploads
 * @returns {string|null} Путь к последнему изображению или null
 */
function getLatestImage() {
  try {
    if (!fs.existsSync(uploadsPath)) {
      console.log("Папка uploads не существует");
      return null;
    }

    const files = fs.readdirSync(uploadsPath);

    // Фильтруем только изображения
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];
    const imageFiles = files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });

    if (imageFiles.length === 0) {
      console.log("В папке uploads нет изображений");
      return null;
    }

    // Получаем информацию о файлах с временными метками
    const filesWithStats = imageFiles.map((file) => {
      const filePath = path.join(uploadsPath, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        path: filePath,
        mtime: stats.mtime,
      };
    });

    // Сортируем по времени модификации (последний измененный файл)
    filesWithStats.sort((a, b) => b.mtime - a.mtime);

    return filesWithStats[0].path;
  } catch (error) {
    console.error("Ошибка при получении последнего изображения:", error);
    return null;
  }
}

/**
 * Отправляет изображение в телеграм и удаляет его после успешной отправки
 */
async function sendLatestImage() {
  try {
    const imagePath = getLatestImage();

    if (!imagePath) {
      console.log("Нет изображений для отправки");
      return;
    }

    console.log(`Отправка изображения: ${path.basename(imagePath)}`);

    // Подготавливаем опции для отправки
    const sendOptions = {
      caption: `📊 Отчет за ${new Date().toLocaleDateString("ru-RU")}`,
    };

    // Если задан thread ID, добавляем его в опции
    if (threadId) {
      sendOptions.message_thread_id = parseInt(threadId);
      console.log(`Отправка в thread ID: ${threadId}`);
    } else {
      console.log("Отправка в основной чат (без thread ID)");
    }

    // Отправляем изображение
    const sentMessage = await bot.sendPhoto(chatId, imagePath, sendOptions);

    // Детализируем успешный ответ Telegram API
    if (sentMessage && sentMessage.message_id) {
      console.log(
        `Изображение успешно отправлено, message_id=${
          sentMessage.message_id
        }, chat_id=${sentMessage.chat?.id}, thread_id=${
          sentMessage.message_thread_id ||
          sendOptions.message_thread_id ||
          "n/a"
        }`
      );
    } else {
      console.log("Изображение успешно отправлено (без деталей ответа)");
    }

    // Удаляем файл после успешной отправки
    fs.unlinkSync(imagePath);
    console.log(`Файл ${path.basename(imagePath)} удален`);
  } catch (error) {
    console.error("Ошибка при отправке изображения:", error);

    // Если ошибка связана с отправкой, не удаляем файл
    if (
      (error && error.code === "ETELEGRAM") ||
      (error &&
        typeof error.message === "string" &&
        error.message.includes("chat not found"))
    ) {
      console.error("Ошибка Telegram API. Файл не удален.");
    }

    // Пробрасываем ошибку выше, чтобы вызывающая сторона могла корректно отреагировать
    throw error;
  }
}

/**
 * Основная функция для запуска бота
 */
async function runBot() {
  console.log("🤖 Запуск телеграм бота...");
  console.log(`📁 Папка uploads: ${uploadsPath}`);
  console.log(`💬 Chat ID: ${chatId}`);
  if (threadId) {
    console.log(`🧵 Thread ID: ${threadId}`);
  } else {
    console.log("🧵 Thread ID: не задан (отправка в основной чат)");
  }

  try {
    await sendLatestImage();
    console.log("✅ Бот завершил работу");
  } catch (error) {
    console.error("❌ Критическая ошибка:", error);

    if (require.main === module) {
      // Только в CLI-режиме считаем это фатальной ошибкой
      process.exit(1);
    }
    // В режиме модуля просто пробрасываем ошибку наверх — её обработает вызывающая сторона
    throw error;
  }
}

// Запуск бота, если файл вызван напрямую
if (require.main === module) {
  runBot();
}

module.exports = {
  sendLatestImage,
  getLatestImage,
  runBot,
  startMessageListener,
};
