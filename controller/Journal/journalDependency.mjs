import sql from 'mssql';
import { dataFound, invalidInput, sentData, servError } from '../../res.mjs';
import { checkIsNumber, ISOString, toArray } from '../../helper_functions.mjs';


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
        const { Acc_Id } = req.query;
        if (!checkIsNumber(Acc_Id)) return invalidInput(res, 'Acc_Id is required');

        const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('Acc_Id', sql.BigInt, Acc_Id)
            .query(`
                DECLARE @OB_Date DATE = (SELECT MAX(OB_Date) FROM tbl_OB_Date);
            -- OUTSTANDING SALES (Invoices + OB)
                SELECT *
                FROM (
                    SELECT 
                        pig.Do_Id                  AS voucherId,
                        pig.Do_Inv_No              AS voucherNumber,
                        pig.Do_Date                AS eventDate,
                        a.Acc_Id                   AS Acc_Id,
                        pig.Total_Invoice_value    AS totalValue,
                        'SALES'                    AS dataSource,
                        'SALES'                    AS actualSource,
                        COALESCE((
                            SELECT SUM(pb.Credit_Amo) 
                            FROM tbl_Receipt_Bill_Info pb
                            JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
                            WHERE 
                                pgi.status <> 0
                                -- AND pgi.receipt_bill_type = 1
                                AND pb.bill_id  = pig.Do_Id
                                AND pb.bill_name = pig.Do_Inv_No
                        ), 0) AS againstAmount,
                        COALESCE((
                            SELECT SUM(jr.Amount)
                            FROM dbo.tbl_Journal_Bill_Reference jr
                            JOIN dbo.tbl_Journal_Entries_Info  je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                            JOIN dbo.tbl_Journal_General_Info  jh ON jh.JournalAutoId = jr.JournalAutoId
                            WHERE 
                                jh.JournalStatus <> 0
                                AND je.Acc_Id = a.Acc_Id
                                AND je.DrCr   = 'Cr'
                                AND jr.RefId = pig.Do_Id 
                                AND jr.RefNo = pig.Do_Inv_No
                                AND jr.RefType = 'SALES'
                        ), 0) AS journalAdjustment,
                        'Dr' AS accountSide
                    FROM tbl_Sales_Delivery_Gen_Info pig
                    JOIN tbl_Retailers_Master r ON r.Retailer_Id = pig.Retailer_Id
                    JOIN tbl_Account_Master a ON a.ERP_Id = r.ERP_Id
                    WHERE 
                        pig.Cancel_status <> 0
                        AND a.Acc_Id = @Acc_Id
                        AND pig.Do_Date >= @OB_Date
                    UNION ALL
            -- Opening balance (sales side)
                SELECT 
                    cb.OB_Id		  AS voucherId, 
                    cb.bill_no        AS voucherNumber, 
                    cb.bill_date      AS eventDate, 
                    cb.Retailer_id    AS Acc_Id,  
                    cb.dr_amount      AS totalValue, 
                    'SALES'           AS dataSource,
                    'SALES-OB'        AS actualSource,
                    COALESCE((
                        SELECT SUM(pb.Credit_Amo) 
                        FROM tbl_Receipt_Bill_Info pb
                        JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
                        WHERE 
                            pgi.status <> 0
                            -- AND pgi.receipt_bill_type = 1
                            AND pb.bill_id = cb.OB_Id
                            AND pb.bill_name = cb.bill_no
                            -- AND pgi.receipt_date <= @OB_Date
                    ), 0) AS againstAmount,
                    COALESCE((
                        SELECT SUM(jr.Amount)
                        FROM dbo.tbl_Journal_Bill_Reference jr
                        JOIN dbo.tbl_Journal_Entries_Info  je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                        JOIN dbo.tbl_Journal_General_Info  jh ON jh.JournalAutoId = jr.JournalAutoId
                        WHERE 
                            jh.JournalStatus <> 0
                            AND je.Acc_Id = cb.Retailer_id
                            AND je.DrCr   = 'Cr'
                            AND jr.RefId = cb.OB_Id 
                            AND jr.RefNo = cb.bill_no
                            AND jr.RefType = 'SALES-OB'
                    ), 0) AS journalAdjustment,
                    'Dr' AS accountSide
                FROM tbl_Ledger_Opening_Balance cb
                WHERE 
                    cb.OB_date >= @OB_Date
                    AND cb.Retailer_id = @Acc_Id
                    AND cb.cr_amount = 0
                ) S
                WHERE S.totalValue > S.againstAmount + S.journalAdjustment
                UNION ALL
            -- RECEIPT OUTSTANDING 
                SELECT *
                FROM (
                    SELECT 
                        rgi.receipt_id            AS voucherId,
                        rgi.receipt_invoice_no    AS voucherNumber,
                        rgi.receipt_date          AS eventDate,
                        rgi.credit_ledger         AS Acc_Id,
                        rgi.credit_amount         AS totalValue,
                        'RECEIPT'                 AS dataSource,
                        'RECEIPT'                 AS actualSource,
                        (
                            SELECT COALESCE(SUM(Credit_Amo), 0)
                            FROM tbl_Receipt_Bill_Info pbi
                            WHERE 
            					pbi.receipt_id = rgi.receipt_id
            					AND pbi.receipt_no = rgi.receipt_invoice_no
                        ) + (
            				SELECT COALESCE(SUM(pb.Debit_Amo), 0) 
            				FROM tbl_Payment_Bill_Info AS pb
            				JOIN tbl_Payment_General_Info AS pgi ON pgi.pay_id = pb.payment_id
            				WHERE 
            					pgi.status <> 0
            					AND pb.pay_bill_id = rgi.receipt_id
            					AND pb.bill_name = rgi.receipt_invoice_no
            			) AS againstAmount,
                        COALESCE((
                            SELECT SUM(jr.Amount)
                            FROM dbo.tbl_Journal_Bill_Reference jr
                            JOIN dbo.tbl_Journal_Entries_Info  je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                            JOIN dbo.tbl_Journal_General_Info  jh ON jh.JournalAutoId = jr.JournalAutoId
                            WHERE 
                                jh.JournalStatus <> 0
                                AND je.Acc_Id = rgi.credit_ledger
                                AND je.DrCr   = 'Dr'
                                AND jr.RefId = rgi.receipt_id 
                                AND jr.RefNo = rgi.receipt_invoice_no
                                AND jr.RefType = 'RECEIPT'
                        ), 0) AS journalAdjustment,
                        'Cr' AS accountSide
                    FROM tbl_Receipt_General_Info rgi
                    WHERE 
                        rgi.credit_ledger = @Acc_Id
                        AND rgi.receipt_date >= @OB_Date
                        AND rgi.status <> 0
                ) R
                WHERE R.totalValue > R.againstAmount + R.journalAdjustment
                UNION ALL
            -- PURCHASE OUTSTANDING (Invoices + OB)
                SELECT *
                FROM (
                    SELECT 
                        pig.PIN_Id               AS voucherId,
                        pig.Po_Inv_No            AS voucherNumber,
                        pig.Po_Entry_Date        AS eventDate,
                        a.Acc_Id                 AS Acc_Id,
                        pig.Total_Invoice_value  AS totalValue,
                        'PURCHASE'               AS dataSource,
                        'PURCHASE'               AS actualSource,
                        COALESCE((
                            SELECT SUM(pb.Debit_Amo) 
                            FROM tbl_Payment_Bill_Info pb
                            JOIN tbl_Payment_General_Info pgi ON pgi.pay_id = pb.payment_id
                            WHERE 
                                pgi.status <> 0
                                -- AND pgi.pay_bill_type = 1
                                AND pb.pay_bill_id = pig.PIN_Id
                                AND pb.bill_name  = pig.Po_Inv_No
                        ), 0) AS againstAmount,
                        COALESCE((
                            SELECT SUM(jr.Amount)
                            FROM dbo.tbl_Journal_Bill_Reference jr
                            JOIN dbo.tbl_Journal_Entries_Info  je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                            JOIN dbo.tbl_Journal_General_Info  jh ON jh.JournalAutoId = jr.JournalAutoId
                            WHERE 
                                jh.JournalStatus <> 0
                                AND je.Acc_Id = a.Acc_Id
                                AND je.DrCr   = 'Dr'
                                AND jr.RefId = pig.PIN_Id 
                                AND jr.RefNo = pig.Po_Inv_No
                                AND jr.RefType = 'PURCHASE'
                        ), 0) AS journalAdjustment,
                        'Cr' AS accountSide
                    FROM tbl_Purchase_Order_Inv_Gen_Info pig
                    JOIN tbl_Retailers_Master r ON r.Retailer_Id = pig.Retailer_Id
                    JOIN tbl_Account_Master a ON a.ERP_Id = r.ERP_Id
                    WHERE 
                        pig.Cancel_status = 0
                        AND a.Acc_Id = @Acc_Id
                        AND pig.Po_Entry_Date >= @OB_Date
                    UNION ALL
            -- Opening balance (purchase side)
                    SELECT 
                        cb.OB_Id		AS voucherId, 
                        cb.bill_no      AS voucherNumber, 
                        cb.bill_date    AS eventDate, 
                        cb.Retailer_id  AS Acc_Id,  
                        cb.cr_amount    AS totalValue, 
                        'PURCHASE'      AS dataSource,
                        'PURCHASE-OB'   AS actualSource,
                        COALESCE((
                            SELECT SUM(pb.Debit_Amo) 
                            FROM tbl_Payment_Bill_Info pb
                            JOIN tbl_Payment_General_Info pgi ON pgi.pay_id = pb.payment_id
                            WHERE 
                                pgi.status <> 0
                                -- AND pgi.pay_bill_type = 1
                                AND pb.pay_bill_id = cb.OB_Id
                                AND pb.bill_name   = cb.bill_no
                                -- AND pgi.payment_date <= @OB_Date
                        ), 0) AS againstAmount,
                        COALESCE((
                            SELECT SUM(jr.Amount)
                            FROM dbo.tbl_Journal_Bill_Reference jr
                            JOIN dbo.tbl_Journal_Entries_Info  je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                            JOIN dbo.tbl_Journal_General_Info  jh ON jh.JournalAutoId = jr.JournalAutoId
                            WHERE 
                                jh.JournalStatus <> 0
                                AND je.Acc_Id = cb.Retailer_id
                                AND je.DrCr   = 'Dr'
                                AND jr.RefId = cb.OB_Id 
                                AND jr.RefNo = cb.bill_no
                                AND jr.RefType = 'PURCHASE-OB'
                        ), 0) AS journalAdjustment,
                        'Cr' AS accountSide
                    FROM tbl_Ledger_Opening_Balance cb
                    WHERE 
                        cb.OB_date >= @OB_Date
                        AND cb.Retailer_id = @Acc_Id
                        AND cb.dr_amount = 0
                ) P
                WHERE P.totalValue > P.againstAmount + P.journalAdjustment
                UNION ALL
            -- PAYMENT OUTSTANDING (unallocated payment)
                SELECT *
                FROM (
                    SELECT 
                        pgi.pay_id               AS voucherId,
                        pgi.payment_invoice_no   AS voucherNumber,
                        pgi.payment_date         AS eventDate,
                        pgi.debit_ledger         AS Acc_Id,
                        pgi.debit_amount         AS totalValue,
                        'PAYMENT'                AS dataSource,
                        'PAYMENT'                AS actualSource,
                        (
            				SELECT COALESCE(SUM(rbi.Credit_Amo), 0) 
            				FROM tbl_Receipt_Bill_Info AS rbi
            				JOIN tbl_Receipt_General_Info AS rgi ON rgi.receipt_id = rbi.receipt_id
            				WHERE 
            					rgi.status <> 0
            					AND rbi.bill_id = pgi.pay_id
            				    AND rbi.bill_name = pgi.payment_invoice_no
            			) + (
                            SELECT COALESCE(SUM(Debit_Amo), 0)
                            FROM tbl_Payment_Bill_Info pbi
                            WHERE pbi.payment_id = pgi.pay_id
                        ) AS againstAmount,
                        COALESCE((
                            SELECT SUM(jr.Amount)
                            FROM dbo.tbl_Journal_Bill_Reference jr
                            JOIN dbo.tbl_Journal_Entries_Info  je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                            JOIN dbo.tbl_Journal_General_Info  jh ON jh.JournalAutoId = jr.JournalAutoId
                            WHERE jh.JournalStatus <> 0
                                AND je.Acc_Id = pgi.debit_ledger
                                AND je.DrCr   = 'Cr'
                                AND jr.RefId = pgi.pay_id 
                                AND jr.RefNo = pgi.payment_invoice_no
                                AND jr.RefType = 'PAYMENT'
                        ), 0) AS journalAdjustment,
                        'Dr' AS accountSide
                    FROM tbl_Payment_General_Info pgi
                    WHERE 
                        pgi.debit_ledger = @Acc_Id
                        AND pgi.payment_date >= @OB_Date
                        AND pgi.status <> 0
                ) PMT
                WHERE PMT.totalValue > PMT.againstAmount + PMT.journalAdjustment
                UNION ALL
            -- JOURNAL OUTSTANDING (unallocated journal)
                SELECT *
                FROM (
                    SELECT 
                        jgi.JournalId			 AS voucherId,
                        jgi.JournalVoucherNo	 AS voucherNumber,
                        jgi.JournalDate          AS eventDate,
                        jei.Acc_Id		         AS Acc_Id,
                        jei.Amount		         AS totalValue,
                        'JOURNAL'                AS dataSource,
                        'JOURNAL'                AS actualSource,
                        0 AS againstAmount,
                        COALESCE((
                            SELECT SUM(jbr.Amount)
                            FROM dbo.tbl_Journal_Bill_Reference AS jbr
                            WHERE 
                                jbr.JournalAutoId = jei.JournalAutoId
                				AND jbr.LineId = jei.LineId
                				AND jbr.Acc_Id = jei.Acc_Id
                				AND jbr.DrCr = jei.DrCr
                        ), 0) AS journalAdjustment,
                        jei.DrCr AS accountSide
                    FROM tbl_Journal_Entries_Info AS jei
                	JOIN tbl_Journal_General_Info AS jgi ON jgi.JournalAutoId = jei.JournalAutoId
                    WHERE 
                		jgi.JournalStatus <> 0
                		AND jei.Acc_Id = @Acc_Id
                ) JO
                WHERE JO.totalValue > JO.journalAdjustment
                ORDER BY eventDate ASC;`
            );

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
                Account_name AS label 
            FROM tbl_Account_Master
            ORDER BY Account_name`
        );

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
}

export default {
    getFilterValues,
    getAccountPendingReference,
    getJournalAccounts
}