import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
// @ts-ignore - JavaScript module without types
// let sendReportToYougile: any = null;
// try {
//     const telegramIntegration = require('../yougile-bot/integration');
//     sendReportToYougile = telegramIntegration.sendReportToTelegram;
// } catch (error: any) {
//     console.warn('Telegram integration not available:', error.message);
//     sendReportToYougile = async () => ({ success: false, message: 'Telegram integration not available' });
// }

// Process error handling
process.on('uncaughtException', (error) => {
    fs.appendFileSync('server_crash.log', `Uncaught Exception: ${error.message}\n${error.stack}\n`);
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    fs.appendFileSync('server_crash.log', `Unhandled Rejection at: ${promise}, reason: ${reason}\n`);
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = parseInt(process.env.PORT || '5001', 10);

// Middleware
app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
        'http://localhost:2999',
        'http://127.0.0.1:2999'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
    optionsSuccessStatus: 204
}));
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Generate unique filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `shift-report-${timestamp}-${file.originalname}`;
        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept only image files
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// Google Sheets API setup
const auth = new google.auth.GoogleAuth({
    credentials: process.env.GOOGLE_SERVICE_ACCOUNT_JSON 
        ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) 
        : undefined,
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON 
        ? undefined 
        : (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || ''),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// ── YouGile chat polling relay ───────────────────────────────────────────────

interface YouGileMessage {
    id: string | number;
    text?: string;
    textHtml?: string;
    fromUserId?: string;
    deleted?: boolean;
}

interface YouGileMessagesResponse {
    content?: YouGileMessage[];
}

const POLL_STATE_FILE = path.join(__dirname, '../data/yougile_poll_state.json');

function loadLastSeenId(): number | null {
    try {
        const raw = fs.readFileSync(POLL_STATE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return typeof parsed.lastSeenMessageId === 'number' ? parsed.lastSeenMessageId : null;
    } catch {
        return null;
    }
}

function saveLastSeenId(id: number): void {
    try {
        fs.mkdirSync(path.dirname(POLL_STATE_FILE), { recursive: true });
        fs.writeFileSync(POLL_STATE_FILE, JSON.stringify({ lastSeenMessageId: id }), 'utf8');
    } catch (err: any) {
        console.error('❌ Не удалось сохранить состояние polling:', err.message);
    }
}

let lastSeenMessageId: number | null = loadLastSeenId();

async function pollYougileMessages(): Promise<void> {
    const subscribeChat = process.env.YOUGILE_SUBSCRIBE_CHAT_ID;
    const token = process.env.TOKEN_YOUGILE;
    const targetChatId = process.env.YOUGILE_CHAT_ID;
    const botUserId = process.env.YOUGILE_BOT_USER_ID;

    if (!subscribeChat || !token || !targetChatId) return;

    try {
        const resp = await fetch(
            `https://ru.yougile.com/api-v2/chats/${subscribeChat}/messages?limit=50`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        if (!resp.ok) {
            console.error(`❌ YouGile poll ошибка (${resp.status})`);
            return;
        }

        const data = await resp.json() as YouGileMessagesResponse | YouGileMessage[];
        const messages: YouGileMessage[] = Array.isArray(data)
            ? data
            : (data as YouGileMessagesResponse).content ?? [];

        if (messages.length === 0) return;

        const toNumber = (id: string | number): number =>
            typeof id === 'string' ? parseInt(id, 10) : id;

        const maxId = messages.reduce((max, m) => Math.max(max, toNumber(m.id)), 0);

        // First ever launch — set baseline so we don't flood with history
        if (lastSeenMessageId === null) {
            lastSeenMessageId = maxId;
            saveLastSeenId(maxId);
            console.log(`✅ YouGile polling запущен впервые, baseline id=${lastSeenMessageId}`);
            return;
        }

        const newMessages = messages
            .filter(m => toNumber(m.id) > lastSeenMessageId!)
            .sort((a, b) => toNumber(a.id) - toNumber(b.id)); // oldest first

        if (newMessages.length === 0) return;

        // Update persisted state before forwarding to avoid re-sending on crash
        lastSeenMessageId = maxId;
        saveLastSeenId(maxId);

        for (const msg of newMessages) {
            if (msg.deleted || (!msg.text && !msg.textHtml)) continue;
            if (botUserId && msg.fromUserId === botUserId) continue;

            console.log(`📨 YouGile relay: id=${msg.id} от ${msg.fromUserId ?? 'unknown'} → ${targetChatId}`);

            try {
                const fwdResp = await fetch(
                    `https://ru.yougile.com/api-v2/chats/${targetChatId}/messages`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            text: msg.text || 'forwarded message',
                            ...(msg.textHtml ? { textHtml: msg.textHtml } : {})
                        })
                    }
                );

                if (!fwdResp.ok) {
                    console.error(`❌ Ошибка пересылки (${fwdResp.status}):`, await fwdResp.text());
                }
            } catch (err: any) {
                console.error('❌ Не удалось переслать сообщение:', err.message);
            }
        }
    } catch (err: any) {
        console.error('❌ YouGile polling error:', err.message);
    }
}

function startYougilePolling(): void {
    const subscribeChat = process.env.YOUGILE_SUBSCRIBE_CHAT_ID;
    const token = process.env.TOKEN_YOUGILE;
    const targetChatId = process.env.YOUGILE_CHAT_ID;

    if (!subscribeChat || !token || !targetChatId) {
        console.warn('⚠️  YouGile polling не настроен: укажите YOUGILE_SUBSCRIBE_CHAT_ID');
        return;
    }

    const intervalMs = parseInt(process.env.YOUGILE_POLL_INTERVAL_MS || '15000', 10);
    pollYougileMessages();
    setInterval(pollYougileMessages, intervalMs);
    console.log(`🔄 YouGile polling запущен (каждые ${intervalMs / 1000}с), чат: ${subscribeChat}`);
}

// ─────────────────────────────────────────────────────────────────────────────

// Routes
app.post('/api/shift-data', upload.single('screenshot'), async (req, res) => {
    try {
        console.log('Raw request body:', req.body);
        console.log('Uploaded file:', req.file);

        // Handle uploaded screenshot
        let screenshotPath = null;
        if (req.file) {
            screenshotPath = req.file.path;
            console.log('Screenshot saved to:', screenshotPath);
        }

        // Parse shift data - it might be in req.body.shiftData if sent as FormData
        let shiftData = req.body;
        if (req.body.shiftData) {
            try {
                shiftData = JSON.parse(req.body.shiftData);
            } catch (error) {
                console.error('Error parsing shift data:', error);
                res.status(400).json({ success: false, message: 'Invalid shift data format' });
                return;
            }
        }

        const {
            date,
            initialBalance,
            terminal,
            terminalReturns,
            terminalTransfer,
            cashInRegister,
            expenses,
            cashReturns,
            cashDeposits,
            cashWithdrawal,
            finalBalance
        } = shiftData;

        console.log('Parsed shift data:', {
            terminal: terminal,
            terminalReturns,
            terminalTransfer,
            nonCashRevenue: terminal - terminalReturns + terminalTransfer
        });

        const formattedDate = date.split("-").reverse().join(".");

        // Format expenses and returns as JSON key-value objects for Google Sheets
        const expensesFormatted = JSON.stringify(
            Object.fromEntries(
                (Array.isArray(expenses) ? expenses : []).map((e: any) => [
                    String(e?.name ?? ''),
                    String(e?.amount ?? 0)
                ])
            )
        );
        const cashReturnsFormatted = JSON.stringify(
            Object.fromEntries(
                (cashReturns && Array.isArray(cashReturns.items) ? cashReturns.items : []).map((r: any) => [
                    String(r?.name ?? ''),
                    String(r?.amount ?? 0)
                ])
            )
        );
        const cashDepositsFormatted = JSON.stringify(
            Object.fromEntries(
                (cashDeposits && Array.isArray(cashDeposits.items) ? cashDeposits.items : []).map((d: any) => [
                    String(d?.name ?? ''),
                    String(d?.amount ?? 0)
                ])
            )
        );

        // Calculate cash revenue
        const cashRevenue = cashInRegister.total - initialBalance.total + expenses.reduce((sum: number, e: any) => sum + e.amount, 0) - cashDeposits.total;
        //Calculate cash revenue with terminal revenue

        const nonCashRevenue = terminal - terminalReturns + terminalTransfer
        const totalRevenue = cashRevenue + nonCashRevenue;
        // Create a row for Google Sheets
        const row = [
            date,                    // A
            initialBalance.total,    // B
            terminal,            // C - Исходная сумма по терминалу
            terminalReturns,         // D - Возвраты по терминалу
            terminalTransfer,        // E - Переводы на карту
            cashInRegister.total,    // F
            expensesFormatted,       // G
            cashReturnsFormatted,    // H
            cashDepositsFormatted,   // I
            cashWithdrawal.total,    // J
            finalBalance,           // K
            cashRevenue             // L - Наличная выручка
        ];

        console.log('=== Подробные данные для Google Sheets ===');
        console.log('A. Дата:', date);
        console.log('B. Начальный остаток:', initialBalance.total);
        console.log('C. Всего безнал:', terminal);
        console.log('D. Возвраты по терминалу:', terminalReturns);
        console.log('E. Переводы на карту:', terminalTransfer);
        console.log('F. Наличные в кассе:', cashInRegister.total);
        console.log('G. Расходы:', expensesFormatted);
        console.log('H. Возвраты наличными:', cashReturnsFormatted);
        console.log('I. Внесения наличных:', cashDepositsFormatted);
        console.log('J. Выемка из кассы:', cashWithdrawal.total);
        console.log('K. Конечный остаток:', finalBalance);
        console.log('L. Наличная выручка:', cashRevenue);
        console.log('======================================');

        // Instead of appending to the end, insert at row 2 (just below the header)
        // First, create a new empty row at position 2
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
                requests: [
                    {
                        insertDimension: {
                            range: {
                                sheetId: 0, // Assuming first sheet
                                dimension: 'ROWS',
                                startIndex: 1, // Row 2 (0-indexed)
                                endIndex: 2 // Insert 1 row
                            }
                        }
                    }
                ]
            }
        });

        // Then, write the data to the newly inserted row
        const updateResponse = await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Sheet1!A2:L2',
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [row]
            }
        });

        console.log('Google Sheets update response:', updateResponse.data);

        // Отправляем отчет в yougile после успешного сохранения данных
        let yougileResult = null;
        try {
            console.log('📤 Отправка отчета в Yougile...');
            /////////////////////////////////////////////////////
            // const chat_id = "fb7d0b2f-40ef-4ef2-8bab-312ee0f50e87";
            const chat_id = process.env.YOUGILE_CHAT_ID;
            const url = `https://ru.yougile.com/api-v2/chats/${chat_id}/messages`;
            const token_yougile = process.env.TOKEN_YOUGILE;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token_yougile}`
                },
                body: JSON.stringify({
                    text: "new message",
                    textHtml: `
<b>СМЕНА ОТ ${formattedDate}</b>

<b>ВЫРУЧКА (с учетом возвратов)</b>
• Наличными: ${cashRevenue}₽
• Безналичными: ${nonCashRevenue}₽
ИТОГО: <b>${totalRevenue}₽</b>
───────────────
<b>Безналичные операции</b>
• Перевод: ${terminalTransfer}₽
• Терминал: ${terminal}₽
• Возврат по терминалу: ${terminalReturns}₽
───────────────
<b>Остаток на начало смены</b>
• ${initialBalance.total}₽
───────────────
<b>Внесение наличности</b>
• ${cashDepositsFormatted !== "{}" ? cashDepositsFormatted : "Отсутствуют"}
───────────────
<b>Расходы</b>
• ${expensesFormatted !== "{}" ? expensesFormatted : "Отсутствуют"}
───────────────
<b>Возвраты наличными</b>
• ${cashReturnsFormatted !== "{}" ? cashReturnsFormatted : "Отсутствуют"}
───────────────
<b>Наличные в кассе перед инкассацией</b>
• ${cashInRegister.total}₽
───────────────
<b>Инкассация</b>
• ${cashWithdrawal.total}₽
───────────────
<b>Остаток в кассе на конец смены</b>
• <b>${finalBalance}₽</b>
`
                })
            });

            const data = await response.json();
            console.log(data);
            /////////////////////////////////////////////////////

            yougileResult = data.status;

            console.log('Yougile result:', yougileResult);
        } catch (yougileError: any) {
            console.error('❌ Ошибка отправки в Yougile:', yougileError);
            yougileResult = {
                success: false,
                message: `Ошибка отправки в Yougile: ${yougileError?.message || 'Unknown error'}`
            };
        }

        res.status(200).json({
            success: true,
            message: 'Data saved successfully',
            screenshot: screenshotPath ? {
                filename: req.file?.filename,
                path: screenshotPath
            } : null,
            telegram: yougileResult
        });
    } catch (error) {
        console.error('Error saving shift data:', error);
        res.status(500).json({ success: false, message: 'Failed to save data', error });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Environment variables:');
    console.log(`- PORT: ${process.env.PORT}`);
    console.log(`- GOOGLE_SERVICE_ACCOUNT_KEY: ${process.env.GOOGLE_SERVICE_ACCOUNT_KEY}`);
    console.log(`- SPREADSHEET_ID: ${process.env.SPREADSHEET_ID}`);
    console.log(`- YOUGILE_CHAT_ID: ${process.env.YOUGILE_CHAT_ID ? 'Set' : 'Not set'}`);
    console.log(`- TOKEN_YOUGILE: ${process.env.TOKEN_YOUGILE ? 'Set' : 'Not set'}`);
    console.log(`- YOUGILE_SUBSCRIBE_CHAT_ID: ${process.env.YOUGILE_SUBSCRIBE_CHAT_ID ? 'Set' : 'Not set'}`);
    console.log(`- YOUGILE_POLL_INTERVAL_MS: ${process.env.YOUGILE_POLL_INTERVAL_MS || '15000 (default)'}`);
    console.log(`- YOUGILE_BOT_USER_ID: ${process.env.YOUGILE_BOT_USER_ID ? 'Set' : 'Not set (all messages will be forwarded)'}`);

    startYougilePolling();

    // Check if service account file exists
    try {
        if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
            const fileExists = fs.existsSync(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
            console.log(`Service account key file exists: ${fileExists}`);
        } else {
            console.error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable is not set');
        }
    } catch (error) {
        console.error('Error checking service account file:', error);
    }
});

server.on('error', (error) => {
    console.error('Server error:', error);
    fs.appendFileSync('server_crash.log', `Server Error: ${error.message}\n${error.stack}\n`);
}); 
