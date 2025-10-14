import { webcrypto, createPrivateKey, createPublicKey } from 'crypto';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { sentData, servError, invalidInput, dataFound } from '../../res.mjs';
import { CompactEncrypt, compactDecrypt, importSPKI, importPKCS8 } from 'jose';
import { getNextId } from '../../middleware/miniAPIs.mjs';
import { ISOString } from '../../helper_functions.mjs';
import sql from 'mssql';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const convertPrivateKeyToPKCS8 = (keyPem) => {
    try {
        const keyObject = createPrivateKey({ key: keyPem, format: 'pem' });
        const pkcs8Key = keyObject.export({ type: 'pkcs8', format: 'pem' });

        return pkcs8Key;
    } catch (err) {
        throw err;
    }
};


const saveConvertedKey = (pkcs8Key) => {
    const convertedKeyPath = path.resolve('../../../certs/erpsmt_pkcs8.pem');
    try {
        fs.writeFileSync(convertedKeyPath, pkcs8Key);
        return convertedKeyPath;
    } catch (error) {
        return null;
    }
};

const loadPublicKeyFromCert = async () => {
    // const certPath = path.resolve('../../BANK_STATEMENT/certs/tmbank2025.crt');
    // const certPath = path.resolve('./certs/tmbank2025.crt');
    const certPath = path.resolve(__dirname, '../../certs/tmbank2025.crt');
    if (!fs.existsSync(certPath)) throw new Error(`Certificate not found at ${certPath}`);
    const certPem = fs.readFileSync(certPath, 'utf8').trim();
    const publicKeyObject = createPublicKey(certPem);
    const spkiPem = publicKeyObject.export({ type: 'spki', format: 'pem' });
    return spkiPem.replace(/\r\n/g, '\n');
};

const loadPrivateKey = async () => {
    // const convertedKeyPath = path.resolve('../../BANK_STATEMENT/certs/erpsmt_pkcs8.pem');
    const convertedKeyPath = path.resolve(__dirname, '../../certs/erpsmt_pkcs8.pem');
    if (fs.existsSync(convertedKeyPath)) {
        const keyPem = fs.readFileSync(convertedKeyPath, 'utf8').trim();
        if (keyPem.includes('BEGIN PRIVATE KEY')) {
            return importPKCS8(keyPem, 'RSA-OAEP-256');
        }
    }

    // const originalKeyPath = path.resolve('../../BANK_STATEMENT/certs/erpsmt.pem');
    const originalKeyPath = path.resolve(__dirname, '../../certs/erpsmt.pem');
    if (!fs.existsSync(originalKeyPath)) throw new Error(`Private key not found at ${originalKeyPath}`);
    const keyPem = fs.readFileSync(originalKeyPath, 'utf8').trim();

    if (keyPem.includes('BEGIN PRIVATE KEY')) {
        saveConvertedKey(keyPem);
        return importPKCS8(keyPem, 'RSA-OAEP-256');
    }

    if (keyPem.includes('BEGIN RSA PRIVATE KEY')) {
        const pkcs8Key = convertPrivateKeyToPKCS8(keyPem);
        saveConvertedKey(pkcs8Key);
        return importPKCS8(pkcs8Key, 'RSA-OAEP-256');
    }

    throw new Error('Unrecognized private key format');
};

const JWEEncrypt = async (payloadObj) => {
    if (!payloadObj) throw new Error('JWEEncrypt: payload is required');
    const payload = typeof payloadObj === 'string' ? payloadObj : JSON.stringify(payloadObj);

    const spkiPem = await loadPublicKeyFromCert();
    const publicKey = await importSPKI(spkiPem, 'RSA-OAEP-256');
    const encoder = new TextEncoder();
    const jweCompact = await new CompactEncrypt(encoder.encode(payload))
        .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
        .encrypt(publicKey);

    return jweCompact;
};

const JWEDecrypt = async (jweToken) => {
    if (!jweToken) throw new Error('JWEDecrypt: JWE token required');

    const privateKey = await loadPrivateKey();
    const { plaintext } = await compactDecrypt(jweToken, privateKey);
    const decoder = new TextDecoder();
    const result = decoder.decode(plaintext);
    return result;
};

const getToken = async () => {
    const TOKEN_URL = 'https://tmb.apiuat.tmbank.in/tmb-api-external/uat-ext/accountstatement/oauth2/token';
    const CLIENT_ID = process.env.TMB_CLIENT_ID;
    const CLIENT_SECRET = process.env.TMB_CLIENT_SECRET;

    if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('TMB Client ID or Secret missing');

    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        scope: 'actstmt',
        grant_type: 'client_credentials',
    });

    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
    });

    if (!res.ok) throw new Error(`Token API failed (${res.status})`);
    const data = await res.json();
    if (!data.access_token) throw new Error('No access token received from TMB');

    return data.access_token;
};

const fetchStatement = async (req, res) => {
    try {
        const { accountNo, startDate, endDate } = req.body;
        if (!accountNo || !startDate || !endDate) return invalidInput(res, 'Missing required fields');

        const accessToken = await getToken();

        const encryptedRequest = await JWEEncrypt({ accountNo, startDate, endDate });

        const SERVICE_URL = 'https://tmb.apiuat.tmbank.in/tmb-api-external/uat-ext/tmb_accountstatement_api/fetchstatement';
        const apiRes = await fetch(SERVICE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'TMB-Client-Id': process.env.TMB_CLIENT_ID,
                'TMB-Client-Secret': process.env.TMB_CLIENT_SECRET,
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ Request: encryptedRequest }),
        });

        const text = await apiRes.text();

        if (!apiRes.ok) {
            console.error('TMB API error:', text);
            return invalidInput(res, `TMB API failed: ${apiRes.status}`);
        }

        const jsonResponse = JSON.parse(text);
        if (!jsonResponse.Response) return invalidInput(res, 'No Response field in TMB API response');

        const decrypted = await JWEDecrypt(jsonResponse.Response);

        let parsedData;

        try {
            parsedData = JSON.parse(decrypted);
        } catch (err) {
            return invalidInput(res, 'Decrypted response is not valid JSON');
        }

        dataFound(res, parsedData);

    } catch (err) {
        console.error('fetchStatement error:', err);
        servError(err, res);
    }
};



const encryptEndpoint = async (req, res) => {
    try {
        const { data } = req.body;
        if (!data) return invalidInput(res, 'Missing data in request body');
        const encrypted = await JWEEncrypt(data);
        sentData(res, { success: true, encrypted });
    } catch (err) {
        console.error('Encrypt endpoint error:', err);
        servError(err, res);
    }
};


const decryptEndpoint = async (req, res) => {
    try {
        const { jweToken } = req.body;
        if (!jweToken) return invalidInput(res, 'Missing jweToken in request body');
        const decrypted = await JWEDecrypt(jweToken);
        let parsedData;
        try { parsedData = JSON.parse(decrypted); } catch { parsedData = decrypted; }
        sentData(res, { success: true, decrypted: parsedData });
    } catch (err) {
        console.error('Decrypt endpoint error:', err);
        servError(err, res);
    }
};


const syncStatement = async (req, res) => {
    let transaction;
    try {
        const { accountNo, startDate, endDate } = req.body;
        if (!accountNo || !startDate || !endDate)
            return invalidInput(res, 'Missing required fields');

        const accessToken = await getToken();
        const encryptedRequest = await JWEEncrypt({ accountNo, startDate, endDate });

        const SERVICE_URL =
            'https://tmb.apiuat.tmbank.in/tmb-api-external/uat-ext/tmb_accountstatement_api/fetchstatement';
        const apiRes = await fetch(SERVICE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'TMB-Client-Id': process.env.TMB_CLIENT_ID,
                'TMB-Client-Secret': process.env.TMB_CLIENT_SECRET,
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ Request: encryptedRequest }),
        });

        const text = await apiRes.text();
        if (!apiRes.ok) return invalidInput(res, `TMB API failed: ${apiRes.status}: ${text}`);

        const jsonResponse = JSON.parse(text);
        if (!jsonResponse.Response) return invalidInput(res, 'No Response field in TMB API response');

        const decrypted = await JWEDecrypt(jsonResponse.Response);

        let statementData;
        try {
            statementData = JSON.parse(decrypted);
        } catch (err) {
            return invalidInput(res, 'Decrypted response is not valid JSON');
        }

        const transactions = statementData.transactions;
        if (!Array.isArray(transactions) || transactions.length === 0)
            return invalidInput(res, 'No statement data to sync');

        let insertedCount = 0;
        let skippedCount = 0;

        for (let txn of transactions) {
            const {
                tranDate,
                valDate,
                chequeNum = '',
                tranParticulars = '',
                tranType = '',
                amount = '',
                refno = '',
                acctBal = '',
            } = txn;

            if (!tranDate) {
                skippedCount++;
                continue;
            }


            const checkRequest = new sql.Request();
            checkRequest.input('TranDate', tranDate);
            checkRequest.input('TranParticulars', tranParticulars);
            checkRequest.input('Amount', amount);
            checkRequest.input('TranType', tranType);

            const checkQuery = `
        SELECT COUNT(*) as count 
        FROM tbl_Bank_Transactions 
        WHERE TranDate = @TranDate 
        AND TranParticulars = @TranParticulars 
        AND Amount = @Amount 
        AND TranType = @TranType
      `;

            const checkResult = await checkRequest.query(checkQuery);

            if (checkResult.recordset[0].count > 0) {
                skippedCount++;
                continue;
            }


            const idRequest = new sql.Request();
            const maxIdResult = await idRequest.query('SELECT ISNULL(MAX(Id), 0) + 1 as NextId FROM tbl_Bank_Transactions');
            const nextId = maxIdResult.recordset[0].NextId;


            const insertRequest = new sql.Request();
            insertRequest.input('Id', nextId);
            insertRequest.input('TranDate', tranDate);
            insertRequest.input('ValDate', valDate);
            insertRequest.input('ChequeNum', chequeNum);
            insertRequest.input('TranParticulars', tranParticulars);
            insertRequest.input('TranType', tranType);
            insertRequest.input('Amount', amount);
            insertRequest.input('Refno', refno);
            insertRequest.input('AcctBal', acctBal);
            insertRequest.input('Created_at', new Date());

            const insertQuery = `
        INSERT INTO tbl_Bank_Transactions
        (Id, TranDate, ValDate, ChequeNum, TranParticulars, TranType, Amount, Refno, AcctBal, Created_at)
        VALUES (@Id, @TranDate, @ValDate, @ChequeNum, @TranParticulars, @TranType, @Amount, @Refno, @AcctBal, @Created_at)
      `;

            await insertRequest.query(insertQuery);
            insertedCount++;
        }

        dataFound(res, {
            message: `Statement data synced successfully`,
            inserted: insertedCount,
            skipped: skippedCount,
            totalProcessed: transactions.length
        });

    } catch (err) {
        console.error('Sync statement error:', err);
        servError(err, res);
    }
};


const getTokenEndpoint = async (req, res) => {
    try {
        const token = await getToken();
        sentData(res, { access_token: token });
    } catch (error) {
        servError(error, res);
    }
};


const getBankStatement = async (req, res) => {
    const FromDate = req.query?.FromDate
        ? ISOString(req.query?.FromDate)
        : ISOString();
    const ToDate = req.query?.ToDate
        ? ISOString(req.query?.ToDate)
        : ISOString();

    try {
        if (!FromDate || !ToDate) {
            return invalidInput(res, "FromDate and ToDate are required");
        }
        console.log("fromdate", FromDate),
            console.log("todate", ToDate)
        const request = new sql.Request();
        request.input("FromDate", sql.DateTime, FromDate);
        request.input("ToDate", sql.DateTime, ToDate);

        let query = `SELECT * FROM tbl_Bank_Transactions WHERE TranDate BETWEEN @FromDate AND @ToDate ORDER BY TranDate DESC`;

        const result = await request.query(query);
        console.log("result", result)

        sentData(res, result.recordset)

    } catch (error) {
        console.error("Error fetching bank statement:", error);
        servError(error, res);
    }
};
export default {
    fetchStatement,
    decrypt: decryptEndpoint,
    encrypt: encryptEndpoint,
    getToken: getTokenEndpoint,
    syncStatement,
    getBankStatement
};

