import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import fs from 'fs';

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
const PORT = parseInt(process.env.PORT || '5000', 10);

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

// Google Sheets API setup
const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '',
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Routes
app.post('/api/shift-data', async (req, res) => {
    try {
        console.log('Raw request body:', req.body);

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
        } = req.body;

        console.log('Parsed shift data:', {
            terminal,
            terminalReturns,
            terminalTransfer,
            terminalRevenue: terminal - terminalReturns + terminalTransfer
        });

        // Format expenses and returns for better readability in Google Sheets
        const expensesFormatted = expenses.map((e: any) => `${e.name}: ${e.amount}`).join('; ');
        const cashReturnsFormatted = cashReturns.items.map((r: any) => `${r.name}: ${r.amount}`).join('; ');
        const cashDepositsFormatted = cashDeposits.items.map((d: any) => `${d.name}: ${d.amount}`).join('; ');

        // Calculate cash revenue
        const cashRevenue = cashInRegister.total - initialBalance.total + expenses.reduce((sum: number, e: any) => sum + e.amount, 0) + cashReturns.total - cashDeposits.total;

        // Create a row for Google Sheets
        const row = [
            date,                    // A
            initialBalance.total,    // B
            terminal,                // C - Исходная сумма по терминалу
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
        console.log('C. Терминал:', terminal);
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

        res.status(200).json({ success: true, message: 'Data saved successfully' });
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
