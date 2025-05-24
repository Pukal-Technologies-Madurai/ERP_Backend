import { servError, success, failed, sentData, invalidInput, dataFound, noData, } from '../../res.mjs';
import { ISOString, checkIsNumber, createPadString, isEqualNumber, toArray } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
import sql from 'mssql';

const stockJournalTypes = [
    {
        label: 'MATERIAL INWARD',
        value: 1
    },
    {
        label: 'OTHER GODOWN',
        value: 2
    },
    {
        label: 'PROCESSING',
        value: 3
    },
];

const PaymentDataDependency = () => {

    const getAccountGroups = async (req, res) => {
        try {
            const result = await sql.query('SELECT * FROM tbl_Accounting_Group');

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    const getAccounts = async (req, res) => {
        try {
            const { GroupId, GroupName } = req.query;

            const request = new sql.Request()
                .input('GroupId', GroupId)
                .input('GroupName', GroupName)
                .query(`
                    SELECT 
                    	am.Acc_Id,
                        am.ERP_Id,
                    	am.Account_name,
                    	am.Group_Id,
                    	ag.Group_Name AS GroupNameGet
                    FROM tbl_Account_Master AS am
                    LEFT JOIN tbl_Accounting_Group AS ag
                    ON ag.Group_Id = am.Group_Id
                    WHERE am.Acc_Id IS NOT NULL
                    ${checkIsNumber(GroupId) ? ' AND am.Group_Id = @Group_Id ' : ''}
                    ${GroupName ? ' AND ag.Group_Name = @GroupName ' : ''}
                    ORDER BY am.Account_name `
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    const searchPaymentInvoice = async (req, res) => {
        try {
            const { debit_ledger, credit_ledger, pay_bill_type } = req.query;

            const request = new sql.Request()
                .input('debit_ledger', debit_ledger)
                .input('credit_ledger', credit_ledger)
                .input('pay_bill_type', pay_bill_type)
                .query(`
                    SELECT payments.* 
                    FROM (
                    	SELECT 
                    		pgi.*,
                    		COALESCE((
                    			SELECT SUM(Debit_Amo)
                    			FROM tbl_Payment_Bill_Info AS pbi
                    			WHERE pbi.payment_id = pgi.pay_id
                    		), 0) AS TotalReferenceAdded,
                    		COALESCE(deb.Account_name, 'Not found') AS debitAccountGet,
                    		COALESCE(cre.Account_name, 'Not found') AS creditAccountGet,
                    		COALESCE(vt.Voucher_Type, 'Not found') AS VoucherTypeGet
                    	FROM tbl_Payment_General_Info AS pgi
                    		LEFT JOIN tbl_Account_Master AS deb
                    		ON deb.Acc_Id = pgi.debit_ledger
                    		LEFT JOIN tbl_Account_Master AS cre
                    		ON cre.Acc_Id = pgi.credit_ledger
                    	    LEFT JOIN tbl_Voucher_Type AS vt
                    	    ON vt.Vocher_Type_Id = pgi.payment_voucher_type_id
                    	WHERE pay_id IS NOT NULL
                            ${checkIsNumber(debit_ledger) ? ' AND pgi.debit_ledger = @debit_ledger ' : ''}
                            ${checkIsNumber(credit_ledger) ? ' AND pgi.credit_ledger = @credit_ledger ' : ''}
                            ${checkIsNumber(pay_bill_type) ? ' AND pgi.pay_bill_type = @pay_bill_type ' : ''}
                    ) as payments
                    WHERE payments.debit_amount > payments.TotalReferenceAdded
                    ORDER BY payments.payment_date ASC, payments.created_on ASC;`
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    // const getPaymentInvoiceBillInfo = async (req, res) => {
    //     try {
    //         const { payment_id, pay_bill_type = 1 } = req.query;

    //         if (!checkIsNumber(payment_id)) return invalidInput(res, 'payment_id is required');

    //         const purchaseInvoiceBillType = `
    //             SELECT 
    //                 pbi.*,
    //                 pogi.Po_Inv_Date AS PurchaseInvoiceDate,
    //                 ISNULL(pb.TotalPaidAmount, 0) AS TotalPaidAmount,
    //                 pogi.Total_Invoice_value - ISNULL(pb.TotalPaidAmount, 0) AS PendingAmount
    //             FROM tbl_Payment_Bill_Info AS pbi
    //             LEFT JOIN tbl_Purchase_Order_Inv_Gen_Info AS pogi
    //                 ON pogi.PIN_Id = pbi.pay_bill_id
    //             LEFT JOIN (
    //                 SELECT 
    //                     pay_bill_id,
    //                     SUM(Debit_Amo) AS TotalPaidAmount
    //                 FROM tbl_Payment_Bill_Info
    //                 GROUP BY pay_bill_id
    //             ) AS pb ON pb.pay_bill_id = pbi.pay_bill_id
    //             WHERE pbi.payment_id = @payment_id;`

    //         const request = new sql.Request()
    //             .input('payment_id', payment_id)
    //             .query(isEqualNumber(pay_bill_type, 1) ? purchaseInvoiceBillType : '');

    //         const result = await request;

    //         sentData(res, result.recordset)
    //     } catch (e) {
    //         servError(e, res);
    //     }
    // }

    const getPaymentInvoiceBillInfo = async (req, res) => {
        try {
            const { payment_id, pay_bill_type = 1 } = req.query;

            if (!checkIsNumber(payment_id)) return invalidInput(res, 'payment_id is required');

            const request = new sql.Request()
                .input('payment_id', payment_id)
                .query(`
                    WITH PAYMENT_BILL_INFO AS (
                    	SELECT 
                    		pbi.*
                    	FROM tbl_Payment_Bill_Info AS pbi
                    	WHERE pbi.payment_id = @payment_id
                    ), 
                    -- CTE for Purchase Invoice
                    PURCHASE_INVOICE_DATE AS (
                    	SELECT 
                    		PIN_Id AS pay_bill_id, 
                    		Po_Inv_Date AS PurchaseInvoiceDate,
                    		COALESCE((
                    			SELECT SUM(Debit_Amo)
                    			FROM tbl_Payment_Bill_Info AS refAmount
                                LEFT JOIN tbl_Payment_General_Info AS pgi
                                    ON pgi.pay_id = refAmount.payment_id
                    			WHERE 
                    				ref.PIN_Id = refAmount.pay_bill_id
                    				AND refAmount.JournalBillType = 'PURCHASE INVOICE'
                                    AND pgi.status <> 0
                    		), 0) AS TotalPaidAmount
                    	FROM tbl_Purchase_Order_Inv_Gen_Info AS ref
                    	WHERE PIN_Id IN (
                    		SELECT DISTINCT pay_bill_id 
                    		FROM PAYMENT_BILL_INFO 
                    		WHERE bill_type = 1 AND JournalBillType = 'PURCHASE INVOICE'
                    	)
                    ), 
                    -- CTE for Material Inward
                    MATERIAL_INWARD_DATE AS (
                    	SELECT 
                    		Trip_Id AS pay_bill_id, 
                    		Trip_Date AS TripDate,
                    		COALESCE((
                    			SELECT SUM(Debit_Amo)
                    			FROM tbl_Payment_Bill_Info AS refAmount
                                LEFT JOIN tbl_Payment_General_Info AS pgi
                                    ON pgi.pay_id = refAmount.payment_id
                    			WHERE 
                    				refAmount.pay_bill_id = tm.Trip_Id
                    				AND refAmount.JournalBillType = 'MATERIAL INWARD'
                                    AND pgi.status <> 0
                    		), 0) AS TotalPaidAmount
                    	FROM tbl_Trip_Master AS tm
                    	WHERE Trip_Id IN (
                    		SELECT pay_bill_id 
                    		FROM PAYMENT_BILL_INFO 
                    		WHERE bill_type = 3 AND JournalBillType = 'MATERIAL INWARD'
                    	)
                    ), 
                    -- CTE for Other Godown
                    OTHER_GODOWN_TRANSFER_DATE AS (
                    	SELECT 
                    		Trip_Id AS pay_bill_id, 
                    		Trip_Date AS TripDate,
                    		COALESCE((
                    			SELECT SUM(Debit_Amo)
                    			FROM tbl_Payment_Bill_Info AS refAmount
                                LEFT JOIN tbl_Payment_General_Info AS pgi
                                    ON pgi.pay_id = refAmount.payment_id
                    			WHERE 
                    				refAmount.pay_bill_id = tm.Trip_Id
                    				AND refAmount.JournalBillType = 'OTHER GODOWN'
                                    AND pgi.status <> 0
                    		), 0) AS TotalPaidAmount
                    	FROM tbl_Trip_Master AS tm
                    	WHERE Trip_Id IN (
                    		SELECT pay_bill_id 
                    		FROM PAYMENT_BILL_INFO 
                    		WHERE bill_type = 3 AND JournalBillType = 'OTHER GODOWN'
                    	)
                    ), 
                    -- CTE for Processing
                    PROCESSING_DATE AS (
                    	SELECT 
                    		PR_Id AS pay_bill_id, 
                    		Process_date AS ProcessDate,
                    		COALESCE((
                    			SELECT SUM(Debit_Amo)
                    			FROM tbl_Payment_Bill_Info AS refAmount
                                LEFT JOIN tbl_Payment_General_Info AS pgi
                                    ON pgi.pay_id = refAmount.payment_id
                    			WHERE 
                    				refAmount.pay_bill_id = pg.PR_Id
                    				AND refAmount.JournalBillType = 'PROCESSING'
                                    AND pgi.status <> 0
                    		), 0) AS TotalPaidAmount
                    	FROM tbl_Processing_Gen_Info AS pg
                    	WHERE PR_Id IN (
                    		SELECT pay_bill_id 
                    		FROM PAYMENT_BILL_INFO 
                    		WHERE bill_type = 3 AND JournalBillType = 'PROCESSING'
                    	)
                    )
                    -- Final Select
                    SELECT 
                    	pbi.*,
                    	-- Resolve the referenceBillDate
                    	CASE 
                    		WHEN pbi.bill_type = 1 AND pbi.JournalBillType = 'PURCHASE INVOICE' THEN pid.PurchaseInvoiceDate
                    		WHEN pbi.bill_type = 3 AND pbi.JournalBillType = 'MATERIAL INWARD' THEN mid.TripDate
                    		WHEN pbi.bill_type = 3 AND pbi.JournalBillType = 'OTHER GODOWN' THEN ogd.TripDate
                    		WHEN pbi.bill_type = 3 AND pbi.JournalBillType = 'PROCESSING' THEN pr.ProcessDate
                    		ELSE NULL
                    	END AS referenceBillDate,
                    	-- Resolve the TotalPaidAmount per type
                    	CASE 
                    		WHEN pbi.bill_type = 1 AND pbi.JournalBillType = 'PURCHASE INVOICE' THEN pid.TotalPaidAmount
                    		WHEN pbi.bill_type = 3 AND pbi.JournalBillType = 'MATERIAL INWARD' THEN mid.TotalPaidAmount
                    		WHEN pbi.bill_type = 3 AND pbi.JournalBillType = 'OTHER GODOWN' THEN ogd.TotalPaidAmount
                    		WHEN pbi.bill_type = 3 AND pbi.JournalBillType = 'PROCESSING' THEN pr.TotalPaidAmount
                    		ELSE NULL
                    	END AS totalPaidAmount
                    FROM PAYMENT_BILL_INFO AS pbi
                    LEFT JOIN PURCHASE_INVOICE_DATE AS pid ON pbi.pay_bill_id = pid.pay_bill_id
                    LEFT JOIN MATERIAL_INWARD_DATE AS mid ON pbi.pay_bill_id = mid.pay_bill_id
                    LEFT JOIN OTHER_GODOWN_TRANSFER_DATE AS ogd ON pbi.pay_bill_id = ogd.pay_bill_id
                    LEFT JOIN PROCESSING_DATE AS pr ON pbi.pay_bill_id = pr.pay_bill_id;`
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    const getPaymentInvoiceCostingInfo = async (req, res) => {
        try {
            const { payment_id } = req.query;

            if (!checkIsNumber(payment_id)) return invalidInput(res, 'payment_id is required');

            const request = new sql.Request()
                .input('payment_id', payment_id)
                .query(`
                    WITH PAYMENT_COSTING_INFO AS (
                    	SELECT pci.*
                    	FROM tbl_Payment_Costing_Info pci
                    	WHERE pci.payment_id = @payment_id
                    ), TRIP_DETAILS_INFO_QUANTITY AS (
                    	SELECT 
                    		td.Trip_Id AS pay_bill_id,
                    		ta.Product_Id AS item_id,
                    		ta.QTY AS itemQuantity,
                    		tm.BillType AS JournalBillType, -- MATERIAL INWARD OR OTHER GODOWN
                    		COALESCE((
                    			SELECT SUM(expence_value)
                    			FROM tbl_Payment_Costing_Info 
                    			WHERE 
                    				pay_bill_id = td.Trip_Id
                    				AND item_id = ta.Product_Id
                    				AND (JournalBillType = 'MATERIAL INWARD' OR JournalBillType = 'OTHER GODOWN')
                    		), 0) AS PaidAmount
                    	FROM tbl_Trip_Details AS td
                    	JOIN tbl_Trip_Arrival AS ta
                    		ON ta.Arr_Id = td.Arrival_Id
                    	JOIN tbl_Trip_Master AS tm
                    		ON tm.Trip_Id = td.Trip_Id
                    	WHERE td.Trip_Id IN (
                    		SELECT DISTINCT pay_bill_id 
                    		FROM PAYMENT_COSTING_INFO 
                    		WHERE 
                    			JournalBillType = 'MATERIAL INWARD' 
                    			OR JournalBillType = 'OTHER GODOWN'
                    	) AND tm.BillType IN ('MATERIAL INWARD', 'OTHER GODOWN')
                    ), TRIP_PROCESSING_DESTINATION_QUANTITY AS (
                    	SELECT 
                    		pdi.PR_Id AS pay_bill_id, 
                    		pdi.Dest_Item_Id AS item_id,
                    		pdi.Dest_Qty AS itemQuantity,
                    		'PROCESSING' AS JournalBillType,
                    		COALESCE((
                    			SELECT SUM(expence_value)
                    			FROM tbl_Payment_Costing_Info 
                    			WHERE 
                    				pay_bill_id = pdi.PR_Id
                    				AND item_id = pdi.Dest_Item_Id
                    				AND JournalBillType = 'PROCESSING'
                    		), 0) AS PaidAmount
                    	FROM tbl_Processing_Destin_Details AS pdi
                    	WHERE pdi.PR_Id IN (
                    		SELECT DISTINCT pay_bill_id 
                    		FROM PAYMENT_COSTING_INFO 
                    		WHERE JournalBillType = 'PROCESSING' 
                    	)
                    )
                    SELECT 
                    	pci.*,
                    	CASE 
                    		WHEN pci.JournalBillType IN ('MATERIAL INWARD', 'OTHER GODOWN') THEN tdq.itemQuantity
                    		WHEN pci.JournalBillType = 'PROCESSING' THEN pdq.itemQuantity
                    		ELSE 0
                    	END AS itemQuantity,
                    	CASE 
                    		WHEN pci.JournalBillType IN ('MATERIAL INWARD', 'OTHER GODOWN') THEN tdq.PaidAmount
                    		WHEN pci.JournalBillType = 'PROCESSING' THEN pdq.PaidAmount
                    		ELSE 0
                    	END AS PaidAmount
                    FROM PAYMENT_COSTING_INFO pci
                    LEFT JOIN TRIP_DETAILS_INFO_QUANTITY tdq 
                    	ON pci.pay_bill_id = tdq.pay_bill_id AND pci.item_id = tdq.item_id
                    LEFT JOIN TRIP_PROCESSING_DESTINATION_QUANTITY pdq 
                    	ON pci.pay_bill_id = pdq.pay_bill_id AND pci.item_id = pdq.item_id;`
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    const searchStockJournal = async (req, res) => {
        try {
            const { stockJournalType = 1, filterItems = [], voucher } = req.body;
            const reqDate = req.body?.reqDate ? ISOString(req.body?.reqDate) : ISOString();

            if (stockJournalType < 1 || stockJournalType > 3) return invalidInput(res, `Invalid journal type: ${stockJournalType}`);

            const getStockJournalTypeString = stockJournalTypes.find(
                type => isEqualNumber(type.value, stockJournalType)
            ).label;

            const getTypeOneAndTwo = `
                WITH FilteredProducts AS (
                    SELECT 
                        TRY_CAST(value AS INT) AS Product_Id
                    FROM STRING_SPLIT(@filterItems, ',')
                    WHERE TRY_CAST(value AS INT) IS NOT NULL
                ), FINDTRIP AS (
                	SELECT
                        DISTINCT td.Trip_Id AS journalId
                    FROM
                        tbl_Trip_Details AS td
                    LEFT JOIN tbl_Trip_Arrival as ta
                        ON ta.Arr_Id = td.Arrival_Id
                	LEFT JOIN tbl_Trip_Master AS tm
                		ON td.Trip_Id = tm.Trip_Id
                    WHERE 
                		(
                            @filterItems IS NULL 
                            OR LTRIM(RTRIM(@filterItems)) = '' 
                            OR ta.Product_Id IN (SELECT DISTINCT Product_Id FROM FilteredProducts)
                        )
                		AND tm.Trip_Date = @reqDate
                		AND tm.BillType = @BillType
                		AND tm.TripStatus <> 'Canceled'
                        ${checkIsNumber(voucher) ? ' AND tm.VoucherType = @voucher ' : ''}
                ), TRIP_DETAILS AS (
                    SELECT
                        td.Trip_Id AS journalId,
                		ta.Arr_Id,
                		ta.Arrival_Date AS journalDate,
                		ta.From_Location,
                		ta.To_Location,
                		ta.BatchLocation,
                		ta.Product_Id AS productId,
                		ta.HSN_Code,
                		ta.QTY AS quantity,
                		ta.KGS,
                		ta.Unit_Id,
                		ta.Units AS unitsGet,
                		ta.Gst_Rate AS itemRate,
                		ta.Total_Value AS amount,
                        COALESCE(pm.Product_Name, 'unknown') AS productNameGet,
                        COALESCE(gm_from.Godown_Name, 'Unknown') AS fromLocationGet,
                        COALESCE(gm_to.Godown_Name, 'Unknown') AS toLocationGet
                    FROM
                        tbl_Trip_Details AS td
                    LEFT JOIN tbl_Trip_Arrival as ta
                        ON ta.Arr_Id = td.Arrival_Id
                    LEFT JOIN tbl_Product_Master AS pm
                        ON pm.Product_Id = ta.Product_Id
                    LEFT JOIN tbl_Godown_Master AS gm_from
                        ON gm_from.Godown_Id = ta.From_Location
                    LEFT JOIN tbl_Godown_Master AS gm_to
                        ON gm_to.Godown_Id = ta.To_Location
                	LEFT JOIN tbl_Trip_Master AS tm
                		ON td.Trip_Id = tm.Trip_Id
                    WHERE 
                		td.Trip_Id IN (SELECT journalId FROM FINDTRIP)
                ), TRIP_MASTER AS (
                    SELECT
                        tm.Trip_Id AS journalId,
                		tm.TR_INV_ID AS journalVoucherNo,
                		tm.Branch_Id,
                		tm.VoucherType,
                		tm.Vehicle_No,
                		tm.Trip_Date AS journalDate,
                		tm.Godownlocation,
                		tm.BillType,
                		tm.Narration AS narration,
                		COALESCE(bm.BranchName, 'unknown') AS branchGet,
                		COALESCE(v.Voucher_Type, 'unknown') AS voucherTypeGet
                    FROM tbl_Trip_Master AS tm
                	LEFT JOIN tbl_Branch_Master AS bm
                	ON bm.BranchId = tm.Branch_Id
                    LEFT JOIN tbl_Voucher_Type AS v
                    ON v.Vocher_Type_Id = tm.VoucherType
                    WHERE 
                		tm.Trip_Id IN (SELECT journalId FROM FINDTRIP)
                )
                SELECT 
                    tm.*,
                    COALESCE((
                        SELECT td.* 
                        FROM TRIP_DETAILS AS td
                        WHERE td.journalId = tm.journalId
                        FOR JSON PATH
                    ), '[]') AS Products_List
                FROM 
                    TRIP_MASTER AS tm; `;

            const getProcessing = `
                WITH FilteredProducts AS (
                    SELECT 
                        TRY_CAST(value AS INT) AS Product_Id
                    FROM STRING_SPLIT(@filterItems, ',')
                    WHERE TRY_CAST(value AS INT) IS NOT NULL
                ), FINDJOURNAL AS (
                	SELECT 
                		DISTINCT d.PR_Id AS journalId
                    FROM tbl_Processing_Destin_Details AS d
                	LEFT JOIN tbl_Processing_Gen_Info AS pgi
                	ON pgi.PR_Id = d.PR_Id
                    WHERE 
                		(
                            @filterItems IS NULL 
                            OR LTRIM(RTRIM(@filterItems)) = '' 
                			OR d.Dest_Item_Id IN (SELECT DISTINCT Product_Id FROM FilteredProducts)
                		)
                		AND pgi.Process_date = @reqDate
                		AND pgi.PR_Status <> 'Canceled'
                        ${checkIsNumber(voucher) ? ' AND pgi.VoucherType = @voucher ' : ''}
                ), Destination AS (
                    SELECT 
                		d.PR_Id AS journalId,
                		d.Dest_Item_Id AS productId,
                		d.Dest_Goodown_Id,
                		d.Dest_Batch_Lot_No,
                		d.Dest_Qty AS quantity,
                		d.Dest_Unit_Id,
                		d.Dest_Unit AS unitsGet,
                		d.Dest_Rate AS itemRate,
                		d.Dest_Amt AS amount,
                        p.Product_Name AS productNameGet,
                        g.Godown_Name AS toLocationGet
                    FROM tbl_Processing_Destin_Details AS d
                    LEFT JOIN tbl_Product_Master AS p
                    ON d.Dest_Item_Id = p.Product_Id
                    LEFT JOIN tbl_Godown_Master AS g
                    ON d.Dest_Goodown_Id = g.Godown_Id
                	LEFT JOIN tbl_Processing_Gen_Info AS pgi
                	ON pgi.PR_Id = d.PR_Id
                    WHERE 
                		d.PR_Id IN (SELECT journalId FROM FINDJOURNAL)
                ), SJ_Main AS (
                    SELECT 
                		pgi.PR_Id AS journalId,
                		pgi.PR_Inv_Id AS journalVoucherNo,
                		pgi.Branch_Id,
                		pgi.VoucherType,
                		pgi.Process_date AS journalDate,
                		pgi.Machine_No,
                		pgi.Godownlocation,
                		pgi.Narration AS narration,
                		pgi.Created_At,
                		br.BranchName AS branchGet,
                		COALESCE(v.Voucher_Type, 'Not found') AS voucherTypeGet,
                		g.Godown_Name AS GodownNameGet
                	FROM tbl_Processing_Gen_Info AS pgi
                	LEFT JOIN tbl_Branch_Master AS br
                	ON br.BranchId = pgi.Branch_Id
                	LEFT JOIN tbl_Voucher_Type AS v
                	ON v.Vocher_Type_Id = pgi.VoucherType
                	LEFT JOIN tbl_Godown_Master AS g
                	ON g.Godown_Id = pgi.Godownlocation
                    WHERE pgi.PR_Id IN (SELECT journalId FROM FINDJOURNAL)
                ), Source AS (
                    SELECT s.*,
                        p.Product_Name,
                        g.Godown_Name
                    FROM tbl_Processing_Source_Details AS s
                    LEFT JOIN tbl_Product_Master AS p
                    ON s.Sour_Item_Id = p.Product_Id
                    LEFT JOIN tbl_Godown_Master AS g
                    ON s.Sour_Goodown_Id = g.Godown_Id
                    WHERE s.PR_Id IN (SELECT journalId FROM FINDJOURNAL)
                )
                SELECT 
                    main.*,
                    'PROCESSING' AS BillType,
                    COALESCE(( 
                        SELECT source.*
                        FROM Source AS source
                        WHERE source.PR_Id = main.journalId
                        FOR JSON PATH
                    ), '[]') AS SourceDetails,
                    COALESCE((
                        SELECT destination.*
                        FROM Destination AS destination
                        WHERE destination.journalId = main.journalId
                        FOR JSON PATH
                    ), '[]') AS Products_List
                FROM SJ_Main AS main
                ORDER BY main.journalId; `;

            const request = new sql.Request()
                .input('reqDate', reqDate)
                .input('BillType', getStockJournalTypeString)
                .input('voucher', voucher)
                .input('filterItems', toArray(filterItems).map(item => item).join(', '))
                .query(
                    isEqualNumber(stockJournalType, 3) ? getProcessing : getTypeOneAndTwo
                );

            const result = await request;

            if (result.recordset.length > 0) {
                const parseJsonData = isEqualNumber(
                    stockJournalType, 3
                ) ? result.recordset.map(journal => ({
                    ...journal,
                    SourceDetails: JSON.parse(journal.SourceDetails),
                    Products_List: JSON.parse(journal.Products_List),
                }))
                    : result.recordset.map(journal => ({
                        ...journal,
                        Products_List: JSON.parse(journal.Products_List)
                    }));

                dataFound(res, parseJsonData)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const getFilterValues = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    -- Voucher
                    SELECT DISTINCT pgi.payment_voucher_type_id AS value, v.Voucher_Type AS label
                    FROM tbl_Payment_General_Info AS pgi
                    LEFT JOIN tbl_Voucher_Type AS v
                    ON v.Vocher_Type_Id = pgi.payment_voucher_type_id
                    -- Debit Account
                    SELECT DISTINCT pgi.debit_ledger AS value, a.Account_name AS label
                    FROM tbl_Payment_General_Info AS pgi
                    LEFT JOIN tbl_Account_Master AS a
                    ON a.Acc_Id = pgi.debit_ledger
                    -- Credit Account
                    SELECT DISTINCT pgi.credit_ledger AS value, a.Account_name AS label
                    FROM tbl_Payment_General_Info AS pgi
                    LEFT JOIN tbl_Account_Master AS a
                    ON a.Acc_Id = pgi.credit_ledger
                    -- Created By
                    SELECT DISTINCT pgi.created_by AS value, u.Name AS label
                    FROM tbl_Payment_General_Info AS pgi
                    LEFT JOIN tbl_Users AS u
                    ON u.UserId = pgi.created_by;`
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

    return {
        getAccountGroups,
        getAccounts,
        searchPaymentInvoice,
        getPaymentInvoiceBillInfo,
        getPaymentInvoiceCostingInfo,
        searchStockJournal,
        getFilterValues
    }
}

export default PaymentDataDependency();