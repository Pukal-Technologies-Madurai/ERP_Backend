import sql from 'mssql';
import { dataFound, invalidInput, sentData, servError } from '../../res.mjs';
import { checkIsNumber, filterableText, isEqualNumber, ISOString, toArray, toNumber } from '../../helper_functions.mjs';

import {
    purchaseReturnQuery,
    salesReturnQuery,
    salesInvFilterQuery,
    salesObFilterQuery,
    receiptFilterQuery,
    purchaseInvFilterQuery,
    purchaseObFilterQuery,
    paymentFilterQuery,
    journalFilterQuery,
    creditNoteFilterQuery,
    debitNoteFilterQuery,
    getSalesInvOutstanding,
    getSalesObOutstanding,
    getReceiptOutstanding,
    getPurchaseInvOutstanding,
    getPurchaseObOutstanding,
    getPaymentOutstanding,
    getJournalOutstanding,
    getCreditNoteOutstanding,
    getDebitNoteOutstanding
} from './journalOutstanding.mjs';

const getFilterValues = async (req, res) => {
    try {
        const request = new sql.Request()
            .query(`
            -- Voucher
                SELECT DISTINCT jgi.VoucherType AS value, v.Voucher_Type AS label
                FROM tbl_Journal_General_Info AS jgi
                LEFT JOIN tbl_Voucher_Type AS v
                ON v.Vocher_Type_Id = jgi.VoucherType
            -- Debit Account
                SELECT DISTINCT jei.Acc_Id AS value, a.Account_name AS label
                FROM tbl_Journal_Entries_Info AS jei
                LEFT JOIN tbl_Account_Master AS a ON a.Acc_Id = jei.Acc_Id
				WHERE jei.DrCr = 'Dr'
            -- Credit Account
                SELECT DISTINCT jei.Acc_Id AS value, a.Account_name AS label
                FROM tbl_Journal_Entries_Info AS jei
                LEFT JOIN tbl_Account_Master AS a ON a.Acc_Id = jei.Acc_Id
				WHERE jei.DrCr = 'Cr'
            -- Created By
                SELECT DISTINCT jgi.CreatedBy AS value, u.Name AS label
                FROM tbl_Journal_General_Info AS jgi
                LEFT JOIN tbl_Users AS u
                ON u.UserId = jgi.CreatedBy;`
            );

        const result = await request;

        dataFound(res, [], 'data found', {
            voucherType: toArray(result.recordsets[0]),
            debit_accounts: toArray(result.recordsets[1]),
            credit_accounts: toArray(result.recordsets[2]),
            created_by: toArray(result.recordsets[3])
        });
    } catch (e) {
        servError(e, res);
    }
}

const getAccountPendingReference = async (req, res) => {
    try {
        const { Acc_Id, JournalAutoId } = req.query;
        if (!checkIsNumber(Acc_Id)) return invalidInput(res, 'Acc_Id is required');

        const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('Acc_Id', sql.BigInt, Acc_Id)
            .input('JournalAutoId', sql.NVarChar(200), JournalAutoId)
            .query(`
            	DECLARE @OB_Date DATE = (SELECT MAX(OB_Date) FROM tbl_OB_Date);
                -- invoice returns
                ${purchaseReturnQuery}
                ${salesReturnQuery}
                -- voucher filters
                ${salesInvFilterQuery}
                ${salesObFilterQuery}
                ${receiptFilterQuery}
                ${purchaseInvFilterQuery}
                ${purchaseObFilterQuery}
                ${paymentFilterQuery}
                ${journalFilterQuery}
                ${creditNoteFilterQuery}
                ${debitNoteFilterQuery}
                -- sales outstandings (DR)
                ${getSalesInvOutstanding(JournalAutoId)}
                UNION ALL
                -- opening balance (DR)
                ${getSalesObOutstanding(JournalAutoId)}
                UNION ALL
                -- receipt outstandings (CR)
                ${getReceiptOutstanding(JournalAutoId)}
                UNION ALL
                -- purchase outstandings (CR)
                ${getPurchaseInvOutstanding(JournalAutoId)}
                UNION ALL
                -- opening balance (CR)
                ${getPurchaseObOutstanding(JournalAutoId)}
                UNION ALL
                -- payment outstandings (Dr)
                ${getPaymentOutstanding(JournalAutoId)}
                UNION ALL
                -- journal outstandings (Dr and Cr)
                ${getJournalOutstanding(JournalAutoId)}
                UNION ALL
                -- credit note outstandings (Cr)
                ${getCreditNoteOutstanding(JournalAutoId)}
                UNION ALL
                -- debit note outstandings (Dr)
                ${getDebitNoteOutstanding(JournalAutoId)}
                ORDER BY eventDate ASC;
            `);

        const result = await request;

        sentData(res, result.recordset);

    } catch (e) {
        servError(e, res);
    }
}

const getJournalAccounts = async (req, res) => {
    try {
        const request = new sql.Request();

        const result = await request.query(`
            SELECT 
                Acc_Id AS value, 
                Account_name AS label,
                Group_Id
            FROM tbl_Account_Master
            ORDER BY Account_name;
            SELECT Group_Id, Group_Name, Parent_AC_id
            FROM tbl_Accounting_Group
            ORDER BY Group_Name;`
        );

        const accountsList = toArray(result.recordsets[0]);
        const accountGroupData = toArray(result.recordsets[1]);


        function getAllChildGroupIds(groupId, groupList, visited = new Set()) {
            if (visited.has(groupId)) return [];

            visited.add(groupId);
            let result = [groupId];

            const children = groupList.filter(group => isEqualNumber(group.Parent_AC_id, groupId));

            for (const child of children) {
                result = result.concat(getAllChildGroupIds(child.Group_Id, groupList, visited));
            }

            return result;
        }

        function filterAccountsByGroupIds(selectedGroupId, accountGroups, accountsList) {
            const validGroupIds = getAllChildGroupIds(selectedGroupId, accountGroups);
            return accountsList.filter(account => validGroupIds.includes(account.Group_Id));
        }

        const sundryDebtors = filterAccountsByGroupIds(20, accountGroupData, accountsList);
        const sundryCreditors = filterAccountsByGroupIds(16, accountGroupData, accountsList);

        const distinctPartyAccounts = new Set([
            ...sundryDebtors.map(acc => acc.value),
            ...sundryCreditors.map(acc => acc.value)
        ]);

        const resAccounts = accountsList.map(acc => ({
            value: toNumber(acc.value),
            label: acc.label,
            isSundryParty: distinctPartyAccounts.has(acc.value)
        }))

        sentData(res, resAccounts);
    } catch (e) {
        servError(e, res);
    }
}

const groupOutstandings = async (req, res) => {
    try {
        const Fromdate = req.query?.Fromdate ? req.query?.Fromdate : ISOString();
        const Todate = req.query?.Todate ? req.query?.Todate : ISOString();

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .execute(`Transaction_Group_Reort_VW`);

        const result = await request;

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
}

const partyOutstanding = async (req, res) => {
    try {
        const Fromdate = req.query?.Fromdate ? req.query?.Fromdate : ISOString();
        const Todate = req.query?.Todate ? req.query?.Todate : ISOString();
        const Group_Id = toNumber(req.query?.Group_Id);

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('Group_Id', sql.BigInt, Group_Id)
            .execute(`Transaction_Debtors_Creditors_Report_Group_VW`);

        const result = await request;

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
}

const accountTransaction = async (req, res) => {
    try {
        const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();
        const Acc_Id = toNumber(req.query?.Acc_Id);

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('Acc_Id', sql.BigInt, Acc_Id)
            .execute(`Transaction_Report_vw_By_Acc_Id_1`);

        const result = await request;

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
}

const getVoucherInfo = async (req, res) => {
    try {
        const VoucherNo = req.query?.VoucherNo;
        if (!VoucherNo) return invalidInput(res, 'VoucherNo is required');
        console.log(VoucherNo)

        const request = new sql.Request()
            .input('rawText', sql.NVarChar(100), filterableText(VoucherNo));

        const result = await request.query(`
            -- Basic Details Query
            DECLARE @VoucherNo NVarChar(100) = TRIM(@rawText);
            SELECT
                party_name,
                Voucher_type,
                entry_date,
                amount,
                narration,
                status,
                created_by,
                created_date,
                modified_by,
                modified_date
            FROM (
                -- 1. Sales Invoice
                SELECT 
                    r.Retailer_Name AS party_name,
                    'Sales Invoice' AS Voucher_type,
                    s.Do_Date AS entry_date,
                    s.Total_Invoice_value AS amount,
                    s.Narration AS narration,
                    s.Cancel_status AS status,
                    uc.Name AS created_by,
                    s.Created_on AS created_date,
                    NULL AS modified_by,
                    NULL AS modified_date,
                    s.Do_Inv_No AS VoucherNo
                FROM tbl_Sales_Delivery_Gen_Info s
                LEFT JOIN tbl_Retailers_Master r ON s.Retailer_Id = r.Retailer_Id
                LEFT JOIN tbl_Users uc ON s.Created_by = uc.UserId
                WHERE s.Do_Inv_No = @VoucherNo

                UNION ALL

                -- 2. Purchase Invoice
                SELECT 
                    r.Retailer_Name AS party_name,
                    'Purchase Invoice' AS Voucher_type,
                    p.Po_Entry_Date AS entry_date,
                    p.Total_Invoice_value AS amount,
                    p.Narration AS narration,
                    CASE WHEN p.Cancel_status = 1 THEN 4 ELSE 1 END AS status, 
                    uc.Name AS created_by,
                    p.Created_on AS created_date,
                    um.Name AS modified_by,
                    p.Alterd_on AS modified_date,
                    p.Po_Inv_No AS VoucherNo
                FROM tbl_Purchase_Order_Inv_Gen_Info p
                LEFT JOIN tbl_Retailers_Master r ON p.Retailer_Id = r.Retailer_Id
                LEFT JOIN tbl_Users uc ON p.Created_by = uc.UserId
                LEFT JOIN tbl_Users um ON p.Altered_by = um.UserId
                WHERE p.Po_Inv_No = @VoucherNo

                UNION ALL
                
                -- 3. Receipt
                SELECT 
                    a.Account_name AS party_name,
                    'Receipt' AS Voucher_type,
                    r.receipt_date AS entry_date,
                    r.credit_amount AS amount,
                    r.remarks AS narration,
                    r.status AS status,
                    uc.Name AS created_by,
                    r.created_on AS created_date,
                    NULL AS modified_by,
                    NULL AS modified_date,
                    r.receipt_invoice_no AS VoucherNo
                FROM tbl_Receipt_General_Info r
                LEFT JOIN tbl_Account_Master a ON r.credit_ledger = a.Acc_Id
                LEFT JOIN tbl_Users uc ON r.created_by = uc.UserId
                WHERE r.receipt_invoice_no = @VoucherNo

                UNION ALL

                -- 4. Payment
                SELECT 
                    a.Account_name AS party_name,
                    'Payment' AS Voucher_type,
                    p.payment_date AS entry_date,
                    p.debit_amount AS amount,
                    p.remarks AS narration,
                    p.status AS status,
                    uc.Name AS created_by,
                    p.created_on AS created_date,
                    NULL AS modified_by,
                    NULL AS modified_date,
                    p.payment_invoice_no AS VoucherNo
                FROM tbl_Payment_General_Info p
                LEFT JOIN tbl_Account_Master a ON p.debit_ledger = a.Acc_Id
                LEFT JOIN tbl_Users uc ON p.created_by = uc.UserId
                WHERE p.payment_invoice_no = @VoucherNo

                UNION ALL

                -- 5. Journal
                SELECT 
                    '' AS party_name,
                    v.Voucher_Type AS Voucher_type,
                    j.JournalDate AS entry_date,
                    0 AS amount,
                    j.Narration AS narration,
                    j.JournalStatus AS status,
                    uc.Name AS created_by,
                    j.CreatedAt AS created_date,
                    NULL AS modified_by,
                    j.UpdatedAt AS modified_date,
                    j.JournalVoucherNo AS VoucherNo
                FROM tbl_Journal_General_Info j
                LEFT JOIN tbl_Voucher_Type v ON j.VoucherType = v.Vocher_Type_Id
                LEFT JOIN tbl_Users uc ON j.CreatedBy = uc.UserId
                WHERE j.JournalVoucherNo = @VoucherNo

                UNION ALL

                -- 6. Credit Note
                SELECT 
                    r.Retailer_Name AS party_name,
                    'Credit Note' AS Voucher_type,
                    c.CR_Date AS entry_date,
                    c.Total_Invoice_value AS amount,
                    c.Narration AS narration,
                    c.Cancel_status AS status,
                    uc.Name AS created_by,
                    c.Created_on AS created_date,
                    NULL AS modified_by,
                    NULL AS modified_date,
                    c.CR_Inv_No AS VoucherNo
                FROM tbl_Credit_Note_Gen_Info c
                LEFT JOIN tbl_Retailers_Master r ON c.Retailer_Id = r.Retailer_Id
                LEFT JOIN tbl_Users uc ON c.Created_by = uc.UserId
                WHERE c.CR_Inv_No = @VoucherNo

                UNION ALL

                -- 7. Debit Note
                SELECT 
                    r.Retailer_Name AS party_name,
                    'Debit Note' AS Voucher_type,
                    d.DB_Date AS entry_date,
                    d.Total_Invoice_value AS amount,
                    d.Narration AS narration,
                    d.Cancel_status AS status,
                    uc.Name AS created_by,
                    d.Created_on AS created_date,
                    NULL AS modified_by,
                    NULL AS modified_date,
                    d.DB_Inv_No AS VoucherNo
                FROM tbl_Debit_Note_Gen_Info d
                LEFT JOIN tbl_Retailers_Master r ON d.Retailer_Id = r.Retailer_Id
                LEFT JOIN tbl_Users uc ON d.Created_by = uc.UserId
                WHERE d.DB_Inv_No = @VoucherNo
                
                UNION ALL

                -- 8. Opening Balance
                SELECT 
                    a.Account_name AS party_name,
                    'Opening Balance' AS Voucher_type,
                    ob.OB_date AS entry_date,
                    CASE WHEN ob.dr_amount > 0 THEN ob.dr_amount ELSE ob.cr_amount END AS amount,
                    '' AS narration,
                    1 AS status, -- OB is always active
                    NULL AS created_by,
                    NULL AS created_date,
                    NULL AS modified_by,
                    NULL AS modified_date,
                    ob.bill_no AS VoucherNo
                FROM tbl_Ledger_Opening_Balance ob
                LEFT JOIN tbl_Account_Master a ON ob.Retailer_id = a.Acc_Id
                WHERE ob.bill_no = @VoucherNo
            ) AS Main;

            -- References Query
            -- 1. Sales Return (Purchase table referring to Sales)
            SELECT 
                'Sales Return' AS ref_type,
                p.Po_Inv_No AS ref_voucher_no,
                p.Po_Entry_Date AS ref_date,
                p.Total_Invoice_value AS ref_amount,
                r.Retailer_Name AS party_name
            FROM tbl_Purchase_Order_Inv_Gen_Info p
            LEFT JOIN tbl_Retailers_Master r ON p.Retailer_Id = r.Retailer_Id
            WHERE p.Ref_Po_Inv_No = @VoucherNo

            UNION ALL

            -- 2. Purchase Return (Sales table referring to Purchase)
            SELECT 
                'Purchase Return' AS ref_type,
                s.Do_Inv_No AS ref_voucher_no,
                s.Do_Date AS ref_date,
                s.Total_Invoice_value AS ref_amount,
                r.Retailer_Name AS party_name
            FROM tbl_Sales_Delivery_Gen_Info s
            LEFT JOIN tbl_Retailers_Master r ON s.Retailer_Id = r.Retailer_Id
            WHERE s.Ref_Inv_Number = @VoucherNo

            UNION ALL

            -- 3. Credit Note
            SELECT 
                'Credit Note' AS ref_type,
                c.CR_Inv_No AS ref_voucher_no,
                c.CR_Date AS ref_date,
                c.Total_Invoice_value AS ref_amount,
                r.Retailer_Name AS party_name
            FROM tbl_Credit_Note_Gen_Info c
            LEFT JOIN tbl_Retailers_Master r ON c.Retailer_Id = r.Retailer_Id
            WHERE c.Ref_Inv_Number = @VoucherNo

            UNION ALL

            -- 4. Debit Note
            SELECT 
                'Debit Note' AS ref_type,
                d.DB_Inv_No AS ref_voucher_no,
                d.DB_Date AS ref_date,
                d.Total_Invoice_value AS ref_amount,
                r.Retailer_Name AS party_name
            FROM tbl_Debit_Note_Gen_Info d
            LEFT JOIN tbl_Retailers_Master r ON d.Retailer_Id = r.Retailer_Id
            WHERE d.Ref_Inv_Number = @VoucherNo

            UNION ALL

            -- 5. Receipt
            SELECT 
                'Receipt' AS ref_type,
                g.receipt_invoice_no AS ref_voucher_no,
                g.receipt_date AS ref_date,
                b.Credit_Amo AS ref_amount,
                a.Account_name AS party_name
            FROM tbl_Receipt_Bill_Info b
            JOIN tbl_Receipt_General_Info g ON b.receipt_id = g.receipt_id
            LEFT JOIN tbl_Account_Master a ON g.credit_ledger = a.Acc_Id
            WHERE b.bill_name = @VoucherNo

            UNION ALL

            -- 6. Payment
            SELECT 
                'Payment' AS ref_type,
                g.payment_invoice_no AS ref_voucher_no,
                g.payment_date AS ref_date,
                b.Debit_Amo AS ref_amount,
                a.Account_name AS party_name
            FROM tbl_Payment_Bill_Info b
            JOIN tbl_Payment_General_Info g ON b.payment_id = g.pay_id
            LEFT JOIN tbl_Account_Master a ON g.debit_ledger = a.Acc_Id
            WHERE b.bill_name = @VoucherNo

            UNION ALL

            -- 7. Journal
            SELECT 
                'Journal' AS ref_type,
                g.JournalVoucherNo AS ref_voucher_no,
                g.JournalDate AS ref_date,
                b.Amount AS ref_amount,
                '' AS party_name
            FROM tbl_Journal_Bill_Reference b
            JOIN tbl_Journal_General_Info g ON b.JournalAutoId = g.JournalAutoId
            WHERE b.RefNo = @VoucherNo
            ORDER BY ref_date ASC;
        `);

        dataFound(res, [], 'Data found', {
            basicDetails: result.recordsets[0][0] || null,
            references: result.recordsets[1] || []
        });

    } catch (e) {
        servError(e, res);
    }
}

export default {
    getFilterValues,
    getAccountPendingReference,
    getJournalAccounts,
    groupOutstandings,
    partyOutstanding,
    accountTransaction,
    getVoucherInfo
}