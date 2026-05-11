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
