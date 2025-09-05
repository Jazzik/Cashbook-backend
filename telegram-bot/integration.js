const { sendLatestImage } = require("./bot");

/**
 * Интеграция телеграм бота с основным приложением
 * Этот модуль предоставляет простые функции для вызова бота из других частей приложения
 */

/**
 * Отправляет последнее изображение в телеграм
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function sendReportToTelegram() {
  try {
    await sendLatestImage();
    return {
      success: true,
      message: "Отчет успешно отправлен в Telegram",
    };
  } catch (error) {
    console.error("Ошибка отправки в Telegram:", error);
    return {
      success: false,
      message: `Ошибка отправки в Telegram: ${error.message}`,
    };
  }
}

/**
 * Проверяет наличие изображений в папке uploads
 * @returns {Promise<{hasImages: boolean, count: number}>}
 */
async function checkForImages() {
  try {
    const fs = require("fs");
    const path = require("path");
    const uploadsPath = path.join(__dirname, "../uploads");

    if (!fs.existsSync(uploadsPath)) {
      return { hasImages: false, count: 0 };
    }

    const files = fs.readdirSync(uploadsPath);
    const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"];
    const imageFiles = files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });

    return {
      hasImages: imageFiles.length > 0,
      count: imageFiles.length,
    };
  } catch (error) {
    console.error("Ошибка проверки изображений:", error);
    return { hasImages: false, count: 0 };
  }
}

module.exports = {
  sendReportToTelegram,
  checkForImages,
};
