#!/usr/bin/env node

/**
 * Скрипт для прослушивания сообщений Telegram и получения thread ID
 *
 * Использование:
 * node listen-messages.js
 *
 * Или из корневой папки telegram-bot:
 * npm run listen
 */

const { startMessageListener } = require("./bot");

console.log("🚀 Запуск прослушивания сообщений Telegram...");
console.log("📋 Этот скрипт поможет вам получить thread ID для топиков");
console.log("");

// Запускаем прослушивание
startMessageListener();
