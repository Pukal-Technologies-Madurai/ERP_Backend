import { webcrypto, createPrivateKey, createPublicKey } from 'crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { sentData, servError, invalidInput, dataFound,success } from '../../res.mjs';
import { CompactEncrypt, compactDecrypt, importSPKI, importPKCS8 } from 'jose';
import { getNextId } from '../../middleware/miniAPIs.mjs';
import { ISOString,createPadString,randomNumber } from '../../helper_functions.mjs';
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
  const TOKEN_URL = 'https://tmbapi.tmbank.in/tmb-api-external/tmb-api/tmb_acctstmt/oauth2/token';
  const CLIENT_ID = process.env.TMB_CLIENT_ID;
  const CLIENT_SECRET = process.env.TMB_CLIENT_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('TMB Client ID or Secret missing');

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: 'acctstmt',
    grant_type: 'client_credentials',
  });



  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  console.log("res",res)

  if (!res.ok) throw new Error(`Token API failed (${res.status})`);
  const data = await res.json();
  if (!data.access_token) throw new Error('No access token received from TMB');

  return data.access_token;
};


const fetchStatement = async (req, res) => {
  try {
    const {  startDate, endDate } = req.body;
    if ( !startDate || !endDate) return invalidInput(res, 'Missing required fields');




    const accessToken = await getToken();

    const  accNo='002530350870041'

    const encryptedRequest = await JWEEncrypt({ accNo, startDate, endDate });


    const SERVICE_URL = 'https://tmbapi.tmbank.in/tmb-api-external/tmb-api/tmb_accountstatement_api/fetchstatement';
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
    const {  startDate, endDate } = req.body;
    if ( !startDate || !endDate)
      return invalidInput(res, 'Missing required fields');

    const accessToken = await getToken();
    const accountNo='002530350870041'
    const encryptedRequest = await JWEEncrypt({ accountNo, startDate, endDate });

    const SERVICE_URL =
      'https://tmbapi.tmbank.in/tmb-api-external/tmb-api/tmb_accountstatement_api/fetchstatement';
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
  const AccountNo = req.query.AccountNo;

  try {
    if (!FromDate || !ToDate) {
      return invalidInput(res, "FromDate and ToDate are required");
    }

    if (!AccountNo) {
      return invalidInput(res, "AccountNo is required");
    }

    const request = new sql.Request();
    request.input("FromDate", sql.DateTime, FromDate);
    request.input("ToDate", sql.DateTime, ToDate);
    request.input("AccountNo", sql.VarChar, AccountNo); 

    let query = `
    SELECT bt.*, ba.pay_id,ba.receipt_id
    FROM tbl_Bank_Transactions bt
left join tbl_Bank_Activity ba ON ba.Id=bt.Id
        WHERE TranDate BETWEEN @FromDate AND @ToDate 
          AND AccountNo = @AccountNo 
        ORDER BY TranDate DESC
    `;

    const result = await request.query(query);
    sentData(res, result.recordset);

  } catch (error) {
    console.error("Error fetching bank statement:", error);
    servError(error, res);
  }
};



const getStatementFromBuffer = async (req, res) => {
  try {
    const { startDate, endDate, accountNo } = req.query;
    

    if (!startDate || !endDate || !accountNo) {
      return invalidInput(res, 'Missing required fields: startDate, endDate, and accountNo are required');
    }

    const accessToken = await getToken();

    const encryptedRequest = await JWEEncrypt({ accountNo, startDate, endDate });

    const SERVICE_URL = 'https://tmbapi.tmbank.in/tmb-api-external/tmb-api/tmb_accountstatement_api/fetchstatement';
    
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
      return invalidInput(res, `TMB API failed: ${apiRes.status}: ${text}`);
    }

    const jsonResponse = JSON.parse(text);
    if (!jsonResponse.Response) {
      return invalidInput(res, 'No Response field in TMB API response');
    }

    const decrypted = await JWEDecrypt(jsonResponse.Response);

    let statementData;
    try {
      statementData = JSON.parse(decrypted);
    } catch (err) {
      return invalidInput(res, 'Decrypted response is not valid JSON');
    }

    const transactions = statementData.transactions;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return dataFound(res, {
        success: true,
        message: 'No transactions found from external source',
        data: [],
        totalCount: 0
      });
    }


    const formattedTransactions = transactions.map(txn => ({
      TranDate: txn.tranDate,
      ValDate: txn.valDate,
      ChequeNum: txn.chequeNum || '',
      TranParticulars: txn.tranParticulars || '',
      TranType: txn.tranType || '',
      Amount: txn.amount || '',
      Refno: txn.refno || '',
      AcctBal: txn.acctBal || ''
    }));


    dataFound(res, {
      success: true,
      message: 'Statement data fetched successfully',
      data: formattedTransactions,
      totalCount: formattedTransactions.length,
      source: 'external_api_buffer'
    });

  } catch (err) {
    console.error('Get statement from buffer error:', err);
    servError(err, res);
  }
};

const syncSelectedWithPayment=async(req,res)=>{
  const transaction = new sql.Transaction();
    
    try {
        const { Acc,transactions, paymentDetails } = req.body;

        if (!paymentDetails.pay_bill_type || !paymentDetails.payment_voucher_type_id)
            throw new Error('Missing required payment details');
        if (!Acc)
            throw new Error('Missing required Credit details');

        if (!transactions || transactions.length === 0)
            throw new Error('No transactions selected');

        await transaction.begin();

        const payment_date = paymentDetails.payment_date ? ISOString(paymentDetails.payment_date) : ISOString();
        const currentUser  = req.user?.UserId || 1;
        const  creditLedger=Acc.Acc_Id;
        const  creditLedgerName=Acc.Account_name;

       
        const get_year_id = await transaction.request()
            .input('payment_date', payment_date)
            .query(`
                SELECT Id AS Year_Id, Year_Desc
                FROM tbl_Year_Master
                WHERE Fin_Start_Date <= @payment_date
                  AND Fin_End_Date   >= @payment_date
            `);

        if (get_year_id.recordset.length === 0) throw new Error('Year_Id not found');
        const { Year_Id, Year_Desc } = get_year_id.recordset[0];

        
        const voucherCodeGet = await transaction.request()
            .input('Vocher_Type_Id', paymentDetails.payment_voucher_type_id)
            .query(`SELECT Voucher_Code FROM tbl_Voucher_Type WHERE Vocher_Type_Id = @Vocher_Type_Id`);

        if (voucherCodeGet.recordset.length === 0) throw new Error('Failed to get VoucherCode');
        const Voucher_Code = voucherCodeGet.recordset[0]?.Voucher_Code || '';

        
        const maxIdsGet = await transaction.request()
            .input('Year_Id', Year_Id)
            .input('payment_voucher_type_id', paymentDetails.payment_voucher_type_id)
            .query(`
                SELECT
                    (SELECT COALESCE(MAX(pay_id),  0) FROM tbl_Payment_General_Info) AS MaxPaymentId,
                    (SELECT COALESCE(MAX(payment_sno), 0) FROM tbl_Payment_General_Info
                     WHERE year_id = @Year_Id 
                       AND payment_voucher_type_id = @payment_voucher_type_id)   AS MaxPaymentSno
            `);

        
        let nextPaymentId  = Number(maxIdsGet.recordset[0].MaxPaymentId)  + 1;
        let nextPaymentSno = Number(maxIdsGet.recordset[0].MaxPaymentSno) + 1;


        const insertedReceipts = [];

        
        for (const txn of transactions) {


            const parseAmount = (amountStr) => {
                if (!amountStr) return 0;
                const cleaned = String(amountStr)
                    .replace('Rs.', '')   
                    .replace('CR', '')    
                    .replace('DR', '')   
                    .trim();
                return parseFloat(cleaned) || 0;
            };

        

              const Id = txn.Id;

              if (!Id) {
                  console.warn(`Skipping transaction — no Id: ${txn.TranParticulars}`);
                  continue;
              }
  
             
              const existingCheck = await transaction.request()
                  .input('Id', Id)
                  .query(`
                      SELECT COUNT(1) AS ExistsCount
                      FROM tbl_Bank_Activity
                      WHERE Id = @Id
                  `);
  
              const alreadyExists = Number(existingCheck.recordset[0].ExistsCount) > 0;
  
              if (alreadyExists) {
           
                  continue; 
              }
  
             
              const payment_id         = nextPaymentId++;   
              const payment_sno        = nextPaymentSno++;
              const payment_invoice_no = `${Voucher_Code}/${createPadString(payment_sno, 6)}/${Year_Desc}`;
              const Alter_Id           = randomNumber(6, 8);
              const txn_date           = txn.TranDate ? ISOString(txn.TranDate) : payment_date;
              const debit_amount       = parseAmount(txn.Amount);
              const txn_check_no       = txn.ChequeNum || paymentDetails.check_no  || null;
              const txn_check_date     = txn.ChequeNum ? txn_date : (paymentDetails.check_date || null);
              const txn_remarks        = [txn.TranParticulars, paymentDetails.remarks].filter(Boolean).join(' | ');
  
              
              await transaction.request()
                  .input('pay_id',                  payment_id)
                  .input('year_id',                 Year_Id)
                  .input('payment_voucher_type_id', paymentDetails.payment_voucher_type_id)
                  .input('payment_sno',             payment_sno)
                  .input('payment_invoice_no',      payment_invoice_no)
                  .input('payment_date',            txn_date)
                  .input('pay_bill_type',           paymentDetails.pay_bill_type)
                  .input('credit_ledger',           creditLedger)
                  .input('credit_ledger_name',      creditLedgerName)
                  .input('credit_amount',           debit_amount)
                  .input('debit_ledger',            paymentDetails.debit_ledger      || 0)
                  .input('debit_ledger_name',       paymentDetails.debit_ledger_name || '')
                  .input('debit_amount',            0)
                  .input('transaction_type',        paymentDetails.transaction_type  || '')
                  .input('remarks',                 txn_remarks)
                  .input('check_no',                txn_check_no)
                  .input('check_date',              txn_check_date)
                  .input('bank_name',               paymentDetails.bank_name         || null)
                  .input('bank_date',               txn_date)
                  .input('status',                  paymentDetails.status            || '1')
                  .input('created_by',              currentUser)
                  .input('Alter_Id',                Alter_Id)
                  .query(`
                      INSERT INTO tbl_Payment_General_Info (
                          pay_id, year_id, payment_voucher_type_id, payment_sno,
                          payment_invoice_no, payment_date, pay_bill_type,
                          credit_ledger, credit_ledger_name, credit_amount,
                          debit_ledger,  debit_ledger_name,  debit_amount,
                          check_no, check_date, bank_name, bank_date,
                          transaction_type, remarks,
                          status, created_by, created_on, Alter_Id
                      ) VALUES (
                          @pay_id, @year_id, @payment_voucher_type_id, @payment_sno,
                          @payment_invoice_no, @payment_date, @pay_bill_type,
                          @credit_ledger, @credit_ledger_name, @credit_amount,
                          @debit_ledger,  @debit_ledger_name,  @debit_amount,
                          @check_no, @check_date, @bank_name, @bank_date,
                          @transaction_type, @remarks,
                          @status, @created_by, GETDATE(), @Alter_Id
                      )
                  `);
  
             
              await transaction.request()
                  .input('Id',     Id)
                  .input('pay_id', payment_id)
                  .query(`
                      INSERT INTO tbl_Bank_Activity (Id, receipt_id, pay_id)
                      VALUES (@Id, NULL, @pay_id)
                  `);
          }
    

        await transaction.commit();

       

        return success(res, `receipt(s) processed successfully`);

    } catch (error) {
        try { await transaction.rollback(); } catch (_) {}
        console.error('Error in syncSelectedWithReceipt:', error);
        return servError(error, res);
    }
};


export default {
  fetchStatement,
  decrypt: decryptEndpoint,
  encrypt: encryptEndpoint,
  getToken: getTokenEndpoint,
  syncStatement,
  getBankStatement,
  syncSelectedWithPayment,
  getStatementFromBuffer
};


