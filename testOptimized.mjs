import 'dotenv/config';
import sql from 'mssql';
import { getBaseBillsQuery, getAdjustmentsQuery } from './controller/Journal/journalNodeOutstanding.mjs';
import { toArray, toNumber, Addition, Subraction } from './helper_functions.mjs';

const config = { 
    server: process.env.SERVER, 
    instanceName: process.env.INSTANCE, 
    port: Number(process.env.DB_PORT), 
    driver: 'SQL Server', 
    database: process.env.DATABASE, 
    user: process.env.USER, 
    password: process.env.PASSWORD, 
    options: { trustServerCertificate: true, enableArithAbort: true } 
};

async function run() {
    try {
        console.time("DB Connection");
        await sql.connect(config);
        console.timeEnd("DB Connection");

        // Fetch accounts map
        const accountsResult = await new sql.Request().query('SELECT Acc_Id, Account_name FROM tbl_Account_Master');
        const accountMap = {};
        accountsResult.recordset.forEach(acc => accountMap[acc.Acc_Id] = acc.Account_name);
        console.log("Accounts loaded:", Object.keys(accountMap).length);

        // Run base bills query (recordsets 0-8)
        console.time("Base Bills Query");
        const baseBillsResult = await new sql.Request().query(getBaseBillsQuery);
        console.timeEnd("Base Bills Query");

        console.log("Combining base bills...");
        const baseBills = [].concat(
            toArray(baseBillsResult.recordsets[0]), // Sales
            toArray(baseBillsResult.recordsets[1]), // Sales OB
            toArray(baseBillsResult.recordsets[2]), // Receipts
            toArray(baseBillsResult.recordsets[3]), // Purchase
            toArray(baseBillsResult.recordsets[4]), // Purchase OB
            toArray(baseBillsResult.recordsets[5]), // Payments
            toArray(baseBillsResult.recordsets[6]), // Credit Notes
            toArray(baseBillsResult.recordsets[7]), // Debit Notes
            toArray(baseBillsResult.recordsets[8])  // Journals
        );
        console.log("Base bills combined, count:", baseBills.length);

        // Run adjustments query (recordsets 9-12) - separate request
        console.time("Adjustments Query");
        const adjResult = await new sql.Request().query(getAdjustmentsQuery);
        console.timeEnd("Adjustments Query");

        const receiptAdjs = toArray(adjResult.recordsets[0]);
        const paymentAdjs = toArray(adjResult.recordsets[1]);
        const creditNoteAdjs = toArray(adjResult.recordsets[2]);
        const journalAdjs = toArray(adjResult.recordsets[3]);
        console.log("Adjs:", { receiptAdjs: receiptAdjs.length, paymentAdjs: paymentAdjs.length, creditNoteAdjs: creditNoteAdjs.length, journalAdjs: journalAdjs.length });

        // Build O(1) lookup maps
        console.time("Node Processing");

        const createAdjMap = (adjs) => {
            const map = new Map();
            adjs.forEach(a => {
                const numId = Number(a.targetVoucherId);
                const strNo = String(a.targetVoucherNumber || '').toUpperCase().trim();
                const key = `${numId}_${strNo}`;
                map.set(key, (map.get(key) || 0) + toNumber(a.amount));
            });
            return map;
        };

        const createJournalMap = (adjs) => {
            const map = new Map();
            adjs.forEach(a => {
                const numId = Number(a.targetVoucherId);
                const strNo = String(a.targetVoucherNumber || '').toUpperCase().trim();
                const side = String(a.sourceSide || '').toUpperCase().trim();
                const key = `${numId}_${strNo}_${side}`;
                map.set(key, (map.get(key) || 0) + toNumber(a.amount));
            });
            return map;
        };

        const createCreditNoteMap = (adjs) => {
            const map = new Map();
            adjs.forEach(a => {
                const strNo = String(a.targetVoucherNumber || '').toUpperCase().trim();
                map.set(strNo, (map.get(strNo) || 0) + toNumber(a.amount));
            });
            return map;
        };

        const receiptAdjsMap = createAdjMap(receiptAdjs);
        const paymentAdjsMap = createAdjMap(paymentAdjs);
        const creditNoteAdjsMap = createCreditNoteMap(creditNoteAdjs);
        const journalAdjsMap = createJournalMap(journalAdjs);

        const getAdjustmentSum = (map, targetVoucherId, targetVoucherNumber) => {
            const numId = Number(targetVoucherId);
            const strNo = String(targetVoucherNumber || '').toUpperCase().trim();
            return map.get(`${numId}_${strNo}`) || 0;
        };

        const getCreditNoteAdjSum = (targetVoucherNumber) => {
            const strNo = String(targetVoucherNumber || '').toUpperCase().trim();
            return creditNoteAdjsMap.get(strNo) || 0;
        };

        const getJournalAdjSum = (targetVoucherId, targetVoucherNumber, sourceSide) => {
            const numId = Number(targetVoucherId);
            const strNo = String(targetVoucherNumber || '').toUpperCase().trim();
            const side = String(sourceSide || '').toUpperCase().trim();
            return journalAdjsMap.get(`${numId}_${strNo}_${side}`) || 0;
        };

        const bills = baseBills.map(bill => {
            let againstAmount = 0;
            let journalAdjustment = 0;

            const dataSource = bill.dataSource;
            
            if (dataSource === 'SALES') {
                const rp = getAdjustmentSum(receiptAdjsMap, bill.voucherId, bill.voucherNumber);
                const cn = getCreditNoteAdjSum(bill.voucherNumber);
                againstAmount = Addition(rp, cn);
                journalAdjustment = getJournalAdjSum(bill.voucherId, bill.voucherNumber, 'Cr');
            } else if (dataSource === 'RECEIPT') {
                journalAdjustment = getJournalAdjSum(bill.voucherId, bill.voucherNumber, 'Dr');
            } else if (dataSource === 'PURCHASE') {
                againstAmount = getAdjustmentSum(paymentAdjsMap, bill.voucherId, bill.voucherNumber);
                journalAdjustment = getJournalAdjSum(bill.voucherId, bill.voucherNumber, 'Dr');
            } else if (dataSource === 'PAYMENT') {
                journalAdjustment = getJournalAdjSum(bill.voucherId, bill.voucherNumber, 'Cr');
            } else if (dataSource === 'CREDIT_NOTE') {
                againstAmount = getAdjustmentSum(paymentAdjsMap, bill.voucherId, bill.voucherNumber);
                journalAdjustment = getJournalAdjSum(bill.voucherId, bill.voucherNumber, 'Dr');
            } else if (dataSource === 'DEBIT_NOTE') {
                againstAmount = getAdjustmentSum(receiptAdjsMap, bill.voucherId, bill.voucherNumber);
                journalAdjustment = getJournalAdjSum(bill.voucherId, bill.voucherNumber, 'Cr');
            } else if (dataSource === 'JOURNAL') {
                const rp = getAdjustmentSum(receiptAdjsMap, bill.voucherId, bill.voucherNumber);
                const pb = getAdjustmentSum(paymentAdjsMap, bill.voucherId, bill.voucherNumber);
                againstAmount = Addition(rp, pb);

                const sourceSide = bill.accountSide === 'Dr' ? 'Cr' : 'Dr';
                const jr1 = getJournalAdjSum(bill.voucherId, bill.voucherNumber, sourceSide);
                const jr2 = getJournalAdjSum(bill.voucherId, bill.voucherNumber, bill.accountSide);
                journalAdjustment = Addition(jr1, jr2);
            }

            const totalAdjustments = Addition(againstAmount, journalAdjustment);
            bill.againstAmount = againstAmount;
            bill.journalAdjustment = journalAdjustment;
            bill.BalanceAmount = Subraction(bill.totalValue, totalAdjustments);
            bill.Account_name = accountMap[bill.Acc_Id] || 'Unknown';
            return bill;
        });

        const filteredBills = bills.filter(row => row.BalanceAmount > 0);
        filteredBills.sort((a, b) => (a.Account_name > b.Account_name ? 1 : (a.Account_name < b.Account_name ? -1 : 0)));

        console.timeEnd("Node Processing");

        console.log(`Total outstanding bills calculated: ${filteredBills.length}`);
        console.log(`Sample of first 3 bills:`);
        console.table(filteredBills.slice(0, 3));
        
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
run();
