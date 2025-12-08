import sql from 'mssql';
import { isEqualNumber, ISOString, toArray, toNumber } from '../../helper_functions.mjs';
import { sentData, servError } from '../../res.mjs';

const PaymentReports = () => {

    const getPendingPaymentReference = async (req, res) => {
        try {
            const
                Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString(),
                Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    WITH BILL_REFERENCES AS (
                        SELECT 
                            pbi.payment_id,
                            SUM(pbi.Debit_Amo) AS total_referenced
                        FROM tbl_Payment_Bill_Info pbi
                    	WHERE payment_date BETWEEN @Fromdate AND @Todate
                        GROUP BY pbi.payment_id 
                    ),
                    PAYMENT_TOTALS AS (
                        SELECT 
                            pgi.pay_id,
                            pgi.debit_amount,
                            ISNULL(br.total_referenced, 0) AS total_referenced
                        FROM tbl_Payment_General_Info pgi
                        LEFT JOIN BILL_REFERENCES br 
                            ON br.payment_id = pgi.pay_id
                        WHERE 
                            pgi.payment_date BETWEEN @Fromdate AND @Todate
                            AND pgi.pay_bill_type IN (1, 3)
                            AND ISNULL(br.total_referenced, 0) < pgi.debit_amount
                    )
                    SELECT 
                        pgi.*,
                        pt.total_referenced,
                        vt.Voucher_Type,
                        debAcc.Account_name AS DebitAccountGet,
                        creAcc.Account_name AS CreditAccountGet
                    FROM tbl_Payment_General_Info pgi
                    JOIN PAYMENT_TOTALS pt 
                        ON pt.pay_id = pgi.pay_id
                    LEFT JOIN tbl_Voucher_Type vt
                        ON vt.Vocher_Type_Id = pgi.payment_voucher_type_id
                    LEFT JOIN tbl_Account_Master debAcc
                        ON debAcc.Acc_Id = pgi.debit_ledger
                    LEFT JOIN tbl_Account_Master creAcc
                        ON creAcc.Acc_Id = pgi.credit_ledger`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const getAccountsTransaction = async (req, res) => {
        try {
            const
                Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString(),
                Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    WITH DEBIT_ACCOUNT_SUM AS (
                    	SELECT 
                    		pgi.debit_ledger,
                    		SUM(pgi.debit_amount) AS accountTotalDebit,
                    		COUNT(pgi.pay_id) AS transactionCount
                    	FROM tbl_Payment_General_Info AS pgi
                    	WHERE 
                            pgi.status <> 0
                            AND payment_date BETWEEN @Fromdate AND @Todate
                    	GROUP BY pgi.debit_ledger
                    ), DEBIT_TOTAL AS (
                        SELECT 
                        	DISTINCT pgi.debit_ledger AS accountId, 
                        	a.Account_name AS accountGet,
                    		ag.Group_Id AS accountGroup,
                    		COALESCE(ag.Group_Name, 'Not found') AS accountGroupGet,
                        	accDebSum.accountTotalDebit,
                        	accDebSum.transactionCount,
                    		'DEBIT ACCOUNT' AS accountType
                        FROM tbl_Payment_General_Info AS pgi
                        LEFT JOIN tbl_Account_Master AS a
                            ON a.Acc_Id = pgi.debit_ledger
                    	LEFT JOIN tbl_Accounting_Group AS ag
                    		ON ag.Group_Id = a.Group_Id
                        LEFT JOIN DEBIT_ACCOUNT_SUM AS accDebSum
                            ON accDebSum.debit_ledger = pgi.debit_ledger
                        WHERE pgi.payment_date BETWEEN @Fromdate AND @Todate
                    ), CREDIT_ACCOUNT_SUM AS (
                    	SELECT 
                    		pgi.credit_ledger,
                    		SUM(pgi.debit_amount) AS accountTotalDebit,
                    		COUNT(pgi.pay_id) AS transactionCount
                    	FROM tbl_Payment_General_Info AS pgi
                    	WHERE 
                            pgi.status <> 0
                            AND payment_date BETWEEN @Fromdate AND @Todate
                    	GROUP BY pgi.credit_ledger
                    ), CREDIT_TOTAL AS (
                        SELECT 
                        	DISTINCT pgi.credit_ledger AS accountId, 
                        	a.Account_name AS accountGet,
                    		ag.Group_Id AS accountGroup,
                    		COALESCE(ag.Group_Name, 'Not found') AS accountGroupGet,
                        	accCreSum.accountTotalDebit,
                        	accCreSum.transactionCount,
                    		'CREDIT ACCOUNT' AS accountType
                        FROM tbl_Payment_General_Info AS pgi
                        LEFT JOIN tbl_Account_Master AS a
                            ON a.Acc_Id = pgi.credit_ledger
                    	LEFT JOIN tbl_Accounting_Group AS ag
                    		ON ag.Group_Id = a.Group_Id
                        LEFT JOIN CREDIT_ACCOUNT_SUM AS accCreSum
                            ON accCreSum.credit_ledger = pgi.credit_ledger
                        WHERE pgi.payment_date BETWEEN @Fromdate AND @Todate
                    )
                    SELECT * FROM DEBIT_TOTAL
                    UNION ALL 
                    SELECT * FROM CREDIT_TOTAL`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const itemTotalExpenceWithStockGroup = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    SELECT 
                    	pci.item_id,
                    	COALESCE(pm.Product_Name, 'Not found') Product_Name,
                    	COALESCE(sl.Stock_Group, 'Not grouped') Stock_Group,
                    	COALESCE(sl.Grade_Item_Group, 'Not grouped') Grade_Item_Group,
                    	SUM(pci.expence_value) AS total_expense_value,
                    	COUNT(pci.auto_id) AS payment_count
                    FROM tbl_Payment_Costing_Info AS pci
                    JOIN tbl_Payment_General_Info AS pgi
                    	ON pgi.pay_id = pci.payment_id
                    LEFT JOIN tbl_Product_Master AS pm
                    	ON pm.Product_Id = pci.item_id
                    LEFT JOIN tbl_Stock_LOS AS sl
                    	ON sl.Stock_Tally_Id = pm.ERP_Id
                    WHERE 
                    	pgi.payment_date BETWEEN @Fromdate AND @Todate
                    	AND pgi.status <> 0
                    GROUP BY 
                    	pci.item_id,
                    	pm.Product_Name,
                    	sl.Stock_Group,
                    	sl.Grade_Item_Group;`
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    const paymentDue = async (req, res) => {
        try {

            const request = new sql.Request()
                .query(`
                    DECLARE @OB_Date DATE = (
                    	SELECT MAX(OB_Date) FROM tbl_OB_Date
                    );
                    SELECT 
                    	a.Account_name as retailerName,
                    	COALESCE(v.Voucher_Type, '') voucherTypeGet,
                    	COALESCE(b.BranchCode, inv.company) companyName,
                    	inv.*,
                    	inv.paymentReference + inv.journalReference AS totalReference
                    FROM (
                        SELECT 
                            pig.PIN_Id id,
                    		pig.Voucher_Type voucherType,
                            pig.Po_Inv_No voucherNumber,
                            pig.Ref_Po_Inv_No AS refNumber,
                    		pig.Po_Inv_Date billDate,
                            pig.Po_Entry_Date AS entryDate,
                            a.Acc_Id vendorAccId,
                    		COALESCE(pig.QualityCondition, '') qualityCondition,
                    		COALESCE(pig.PaymentDays, 0) paymentDays,
                    		COALESCE(pig.Discount, 0) discount,
                            pig.Total_Invoice_value invoiceValue,
                            'INV' AS dataSource,
                    		'' as company,
                            COALESCE((
                                SELECT SUM(pb.Debit_Amo) 
                                FROM tbl_Payment_Bill_Info AS pb
                                JOIN tbl_Payment_General_Info AS pgi
                                    ON pgi.pay_id = pb.payment_id
                                WHERE 
                                    pgi.status <> 0
                                    -- AND pgi.pay_bill_type = 1
                                    AND pb.pay_bill_id = pig.PIN_Id
                                    AND pb.bill_name = pig.Po_Inv_No
                            ), 0) AS paymentReference,
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
                            ), 0) AS journalReference
                        FROM tbl_Purchase_Order_Inv_Gen_Info AS pig
                        JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = pig.Retailer_Id
                        JOIN tbl_Account_Master AS a ON a.ERP_Id = R.ERP_Id
                        WHERE 
                            pig.Cancel_status = 0
                            AND pig.Po_Entry_Date >= @OB_Date
                        UNION ALL
                    -- from purchase invoice
                        SELECT 
                            cb.OB_Id AS id, 
                    		null voucherType,
                            cb.bill_no voucherNo, 
                            cb.bill_no refNo, 
                            cb.bill_date billDate, 
                            cb.bill_date entryDate, 
                            cb.Retailer_id vendorAccId,
                    		'' qualityCondition,
                    		0 paymentDays,
                    		0 discount,
                            cb.cr_amount invoiceValue, 
                            'OB' AS dataSource,
                    		cb.Bill_Company as company,
                        	COALESCE((
                                SELECT SUM(pb.Debit_Amo) 
                                FROM tbl_Payment_Bill_Info AS pb
                                JOIN tbl_Payment_General_Info AS pgi ON pgi.pay_id = pb.payment_id
                                WHERE 
                                    pgi.status <> 0
                                    -- AND pgi.pay_bill_type = 1
                                    AND pb.pay_bill_id = cb.OB_Id
                                    AND pb.bill_name = cb.bill_no
                                    -- AND pgi.payment_date >= @OB_Date
                            ), 0) AS paymentReference,
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
                            ), 0) AS journalReference
                        FROM tbl_Ledger_Opening_Balance AS cb
                        WHERE 
                            cb.OB_date >= @OB_Date 
                            AND cb.dr_amount = 0
                    	UNION ALL
                    -- receipt outstanding
                    	SELECT 
                    		rgi.receipt_id id,
                    		rgi.receipt_voucher_type_id voucherType,
                    		rgi.receipt_invoice_no voucherNo,
                    		rgi.receipt_invoice_no refNo,
                    		rgi.receipt_date billDate,
                    		rgi.receipt_date entryDate,
                    		rgi.credit_ledger vendorAccId,
                    		'' qualityCondition,
                    		0 paymentDays,
                    		0 discount,
                    		rgi.credit_amount invoiceValue,
                    		'RECEIPT' AS dataSource,
                    		'' as company,
                    		(
                                SELECT COALESCE(SUM(rbi.Credit_Amo), 0) 
                                FROM tbl_Receipt_Bill_Info AS rbi
                                WHERE 
                                    rbi.receipt_id = rgi.receipt_id
                                    AND rbi.receipt_no = rgi.receipt_invoice_no
                            ) + (
                                SELECT COALESCE(SUM(pb.Debit_Amo), 0) 
                                FROM tbl_Payment_Bill_Info AS pb
                                JOIN tbl_Payment_General_Info AS pgi ON pgi.pay_id = pb.payment_id
                                WHERE 
                                    pgi.status <> 0
                                    AND pb.pay_bill_id = rgi.receipt_id
                                    AND pb.bill_name = rgi.receipt_invoice_no
                            ) AS paymentReference,
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
                            ), 0) AS journalReference
                    	FROM tbl_Receipt_General_Info AS rgi
                    	WHERE
                    		rgi.receipt_date >= @OB_Date
                            AND rgi.status <> 0
                    ) AS inv
                    JOIN tbl_Account_Master AS a ON a.Acc_Id = inv.vendorAccId
                    LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = inv.voucherType
                    LEFT JOIN tbl_Branch_Master AS b ON b.BranchId = v.Branch_Id
                    WHERE 
                        inv.paymentReference + inv.journalReference < inv.invoiceValue
                        AND TRIM(COALESCE(inv.refNumber, '')) NOT IN (
							SELECT TRIM(COALESCE(Do_Inv_No, '')) 
							FROM tbl_Sales_Delivery_Gen_Info
							WHERE Do_Date >= @OB_Date
						)`);

            const result = await request;

            const uniquePIN = new Set(result.recordset.map(row => row.id));

            const purchaseItems = new sql.Request()
                .input('PIN', sql.NVarChar(sql.MAX), Array.from(uniquePIN).join(','))
                .query(`
                    WITH receivedPin AS (
                    	SELECT TRY_CAST(value AS INT) AS pinId
                        FROM STRING_SPLIT(@PIN, ',')
                        WHERE TRY_CAST(value AS INT) IS NOT NULL
                    )
                    SELECT
                    	pod.PIN_Id id,
                    	pod.S_No as orderNo,
                    	pod.Item_Id itemId,
                    	p.Product_Name itemName,
                    	pod.Bill_Qty billQuantity,
                    	pod.Item_Rate rate,
                    	pod.Final_Amo amount
                    FROM tbl_Purchase_Order_Inv_Stock_Info AS pod
                    LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = pod.Item_Id
                    WHERE PIN_ID IN (SELECT pinId FROM receivedPin)
                    ORDER BY S_No;`
                );

            const itemDetails = toArray((await purchaseItems).recordset);

            const withDue = result.recordset.map(row => {
                const invoiceValue = toNumber(row.invoiceValue);
                const discountAmount = (invoiceValue / 100) * toNumber(row.discount);
                const amount = invoiceValue - discountAmount;
                const paymentReference = toNumber(row.paymentReference);
                const journalReference = toNumber(row.journalReference);
                const totalReference = paymentReference + journalReference;
                const dueAmount = invoiceValue - totalReference;

                const paymentDays = toNumber(row.paymentDays);
                const entryDate = new Date(row.entryDate);

                let dueDate = null;
                let daysRemaining = '';

                const itemData = itemDetails.filter(item => isEqualNumber(item?.id, row?.id))

                if (paymentDays > 0) {
                    dueDate = new Date(entryDate);
                    dueDate.setDate(dueDate.getDate() + paymentDays);

                    const today = new Date();

                    today.setHours(0, 0, 0, 0);
                    dueDate.setHours(0, 0, 0, 0);

                    const diffMs = dueDate.getTime() - today.getTime();
                    daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) - 1;
                }


                return {
                    ...row,
                    dueAmount,
                    invoiceValue,
                    discountAmount,
                    amount,
                    paymentReference,
                    journalReference,
                    totalReference,
                    dueDate: dueDate ? ISOString(dueDate) : ISOString(row.entryDate),
                    daysRemaining: dueDate ? daysRemaining : 'N/A',
                    itemData: itemData
                };
            });

            sentData(res, withDue.sort((a, b) => a.daysRemaining - b.daysRemaining));
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getPendingPaymentReference,
        getAccountsTransaction,
        itemTotalExpenceWithStockGroup,
        paymentDue
    }
}

export default PaymentReports();