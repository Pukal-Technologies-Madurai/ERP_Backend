import sql from 'mssql';
import { servError, sentData, failed, dataFound } from '../../res.mjs'
import { isEqualNumber, ISOString, toArray } from '../../helper_functions.mjs';
import dotenv from 'dotenv';
dotenv.config();

const TALLYDB = process.env.TALLYDB || '';

const getERPAndTallySalesDifference = async (req, res) => {
	try {

		if (!TALLYDB) return failed(res, 'Tally Db not found');
		const
			Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
			Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

		const request = new sql.Request()
			.input('Fromdate', Fromdate)
			.input('Todate', Todate)
			.query(`
                DECLARE @unSyncedInvoice TABLE (
					erpPk INT, 
					erpVoucherNumber NVARCHAR(30), 
					erpAlterId BIGINT,
					erpTallyPk INT, 
					tallyPk INT, 
					tallyVoucherNumber NVARCHAR(30),
					tallyAlterId INT,
					RowStatus NVARCHAR(30)
				);
				--
				-- inseting first two cases
				--
				INSERT INTO @unSyncedInvoice (
					erpPk, erpVoucherNumber, erpAlterId,
					erpTallyPk, tallyPk, tallyVoucherNumber,
					tallyAlterId, RowStatus
				)
				SELECT 
					erp.Do_Id AS erpPk,
					erp.Do_Inv_No AS erpVoucherNumber,
					erp.Alter_Id AS erpAlterId,
					erp.Tally_Id AS erpTallyPk,
					tally.tally_id AS tallyPk,
					tally.invoice_no AS tallyVoucherNumber,
					tally.alter_id AS tallyAlterId,
					CASE 
						WHEN tally.tally_id IS NULL THEN 'Only in ERP DB'
						WHEN erp.Tally_Id IS NULL THEN 'Only in Tally DB'
						WHEN erp.Alter_Id <> tally.alter_id THEN 'Modified (Alter_Id mismatch)'
						ELSE 'Match'
					END AS RowStatus
				FROM tbl_Sales_Delivery_Gen_Info erp
				FULL OUTER JOIN [${TALLYDB}].[dbo].[sales_inv_geninfo_ob] tally
					ON erp.Tally_Id = tally.tally_id
				WHERE (
						erp.Tally_Id IS NULL
						OR tally.tally_id IS NULL
						OR erp.Alter_Id <> tally.alter_id
					)
					AND (
						-- Apply date filter
						(ISNULL(erp.Do_Date, '') BETWEEN @Fromdate AND @Todate)
						OR (ISNULL(tally.invoice_date, '') BETWEEN @Fromdate AND @Todate)
					);
				--
				-- inserting third case
				--
				INSERT INTO @unSyncedInvoice (
					erpPk, erpVoucherNumber, erpAlterId,
					erpTallyPk, tallyPk, tallyVoucherNumber,
					tallyAlterId, RowStatus
				)
				SELECT 
					erp.Do_Id,
					erp.Do_Inv_No,
					erp.Alter_Id,
					erp.Tally_Id,
					tally.tally_id,
					tally.invoice_no,
					tally.alter_id,
					'Child rows count mismatch'
				FROM tbl_Sales_Delivery_Gen_Info erp
				INNER JOIN [${TALLYDB}].[dbo].[sales_inv_geninfo_ob] tally
					ON erp.Tally_Id = tally.tally_id
				-- Join child counts
				LEFT JOIN (
					SELECT Delivery_Order_Id, COUNT(*) AS childCount
					FROM tbl_Sales_Delivery_Stock_Info
					GROUP BY Delivery_Order_Id
				) AS erpChild ON erp.Do_Id = erpChild.Delivery_Order_Id
				LEFT JOIN (
					SELECT tally_id, COUNT(*) AS childCount
					FROM [${TALLYDB}].[dbo].[sales_inv_stk_info_ob]
					GROUP BY tally_id
				) AS tallyChild ON tally.tally_id = tallyChild.tally_id
				WHERE ISNULL(erpChild.childCount, 0) <> ISNULL(tallyChild.childCount, 0)
				  AND NOT EXISTS (
					SELECT 1 FROM @unSyncedInvoice u
					WHERE u.erpPk = erp.Do_Id AND u.tallyPk = tally.tally_id
				  )
				  AND (
						erp.Do_Date BETWEEN @Fromdate AND @Todate
						OR tally.invoice_date BETWEEN @Fromdate AND @Todate
				  );
				--AND NOT EXISTS (
				--	SELECT 1 FROM @unSyncedInvoice u
				--	WHERE u.erpPk = erp.Do_Id AND u.tallyPk = tally.tally_id
				--);
				-- erp data
				SELECT * 
				FROM tbl_Sales_Delivery_Gen_Info
				WHERE Do_Id IN (SELECT DISTINCT erpPk FROM @unSyncedInvoice);
				-- tally data
				SELECT * 
				FROM [${TALLYDB}].[dbo].[sales_inv_geninfo_ob] AS tallyDb
				WHERE tally_id IN (SELECT DISTINCT tallyPk FROM @unSyncedInvoice);`
			);

		const result = await request;

		const ERPDifference = toArray(result.recordsets[0]);
		const TallyDifference = toArray(result.recordsets[1]);

		dataFound(res, [], 'data found', {
			ERPDifference, TallyDifference
			// ERPDifference: ERPDifference.map(row => ({
			// 	...row,
			// 	...(differenceInInvoice.find(difRow => isEqualNumber(
			// 		row.Do_Id, difRow.erpPk
			// 	)) || {})
			// })), 
			// TallyDifference: TallyDifference.map(row => ({
			// 	...row,
			// 	...(differenceInInvoice.find(difRow => isEqualNumber(
			// 		row.tally_id, difRow.tallyPk
			// 	)) || {})
			// })) 
		});

	} catch (e) {
		servError(e, res);
	}
}

const getERPSalesDataStatus = async (req, res) => {
	try {

		if (!TALLYDB) return failed(res, 'Tally Db not found');

		const
			Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
			Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

		const { excluedeSyced = 1 } = req.query;

		const request = new sql.Request()
			.input('Fromdate', Fromdate)
			.input('Todate', Todate)
			.query(`
                WITH FilteredERP AS (
					SELECT 
						sgi.*,
						r.Retailer_Name
					FROM tbl_Sales_Delivery_Gen_Info AS sgi
					LEFT JOIN tbl_Retailers_Master AS r
						ON r.Retailer_Id = sgi.Retailer_Id
					WHERE sgi.Do_Date BETWEEN @Fromdate AND @Todate
				), erpSalesChildCount AS (
					SELECT 
						Delivery_Order_Id, 
						COUNT(*) AS childCount,
						SUM(Bill_Qty) AS childQuantity
					FROM tbl_Sales_Delivery_Stock_Info
					WHERE Delivery_Order_Id IN (SELECT Do_Id FROM FilteredERP)
					GROUP BY Delivery_Order_Id
				), tallySalesChildCount AS (
					SELECT 
						tally_id, 
						COUNT(st.salst_id) AS childCount,
						SUM(st.bill_qty) AS childQuantity
					FROM [Online_SMT_Tally].[dbo].[sales_inv_stk_info_ob] AS st
					WHERE st.tally_id IN (
						SELECT t.tally_id
						FROM [Online_SMT_Tally].[dbo].[sales_inv_geninfo_ob] t
						JOIN FilteredERP e ON 
							e.Do_Inv_No COLLATE SQL_Latin1_General_CP1_CI_AS = t.invoice_no
					)
					GROUP BY tally_id
				)
				SELECT 
					erp.*,
					ISNULL(erpChild.childCount, 0) AS erpChildCount,
					ISNULL(erpChild.childQuantity, 0) AS erpChildQuantity,
					ISNULL(tallyChild.childCount, 0) AS tallyChildCount,
					ISNULL(tallyChild.childQuantity, 0) AS tallyChildQuantity,
					CASE 
						WHEN tally.tally_id IS NULL THEN 'Not Synced'
						WHEN ISNULL(erpChild.childCount, 0) <> ISNULL(tallyChild.childCount, 0) THEN 'Child not Synced'
						ELSE 'Synced'
					END AS RowStatus
				FROM FilteredERP erp
				LEFT JOIN [Online_SMT_Tally].[dbo].[sales_inv_geninfo_ob] tally
					ON erp.Do_Inv_No COLLATE SQL_Latin1_General_CP1_CI_AS = tally.invoice_no
				LEFT JOIN erpSalesChildCount AS erpChild 
					ON erp.Do_Id = erpChild.Delivery_Order_Id
				LEFT JOIN tallySalesChildCount AS tallyChild 
					ON tally.tally_id = tallyChild.tally_id
				${isEqualNumber(excluedeSyced, 1) ? `
				WHERE 
					tally.tally_id IS NULL
					OR ISNULL(erpChild.childCount, 0) <> ISNULL(tallyChild.childCount, 0) 
					OR ISNULL(erpChild.childQuantity, 0) <> ISNULL(tallyChild.childQuantity, 0) `: ''}
				ORDER BY erp.Do_Inv_No, erp.Do_Date;`
			);

		const result = await request;

		sentData(res, result.recordset)

	} catch (e) {
		servError(e, res);
	}
}

const getSalesDifferenceItemWise = async (req, res) => {
	try {

		if (!TALLYDB) return failed(res, 'Tally Db not found');

		const
			Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
			Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

		const { excluedeSyced = 1 } = req.query;

		const request = new sql.Request()
			.input('Fromdate', Fromdate)
			.input('Todate', Todate)
			.query(`
                WITH FilteredERP AS (
					SELECT 
						sdi.Do_Id, 
						sdi.Do_Inv_No, 
						sdi.Do_Date, 
						COALESCE(r.Retailer_Name, 'Not found') AS Purticular,
						COALESCE(v.Voucher_Type, 'Not found') AS VoucherTypeGet
					FROM tbl_Sales_Delivery_Gen_Info AS sdi
					LEFT JOIN tbl_Retailers_Master AS r
						ON r.Retailer_Id = sdi.Retailer_Id
					LEFT JOIN tbl_Voucher_Type AS v
						ON v.Vocher_Type_Id = sdi.Voucher_Type
					WHERE sdi.Do_Date BETWEEN @Fromdate AND @Todate
				),
				FilteredTally AS (
					SELECT 
						sgi.tally_id, 
						sgi.invoice_no, 
						sgi.invoice_date, 
						COALESCE(l.ledger_name, 'Not found') as Purticular,
						COALESCE(v.voucher_name, 'Not found') AS VoucherTypeGet
					FROM [${TALLYDB}].[dbo].[sales_inv_geninfo_ob] AS sgi 
					LEFT JOIN [${TALLYDB}].[dbo].[ledger_ob] AS l
					ON l.tally_id = sgi.sales_party_ledger_id
					LEFT JOIN [${TALLYDB}].[dbo].[voucher_type_ob] AS v
					ON v.tally_id = sgi.sales_voucher_type_id
					WHERE sgi.invoice_date BETWEEN @Fromdate AND @Todate
				),
				ERPSales AS (
					SELECT 
						e.Do_Id AS erpPk,
						e.Do_Inv_No AS invoiceNo,
						e.Purticular AS erpLedger,
						e.VoucherTypeGet AS erpVoucher,
						e.Do_Date AS erpDate,
						p.Product_Id,
						p.ERP_Id AS Item_Id,
						p.Product_Name AS erpItemName,
						s.Bill_Qty AS erpQty,
						s.Item_Rate AS erpRate,
						s.Amount AS erpAmount
					FROM FilteredERP e
					JOIN tbl_Sales_Delivery_Stock_Info s
						ON e.Do_Id = s.Delivery_Order_Id
					JOIN tbl_Product_Master AS p
						ON p.Product_Id = s.Item_Id
				),
				TallySales AS (
					SELECT 
						t.tally_id AS tallyPk,
						t.invoice_no AS invoiceNo,
						t.Purticular AS tallyLedger,
						t.VoucherTypeGet AS tallyVoucher,
						t.invoice_date AS tallyDate,
						s.name_item_id AS Item_Id,
						p.stock_item_name AS tallyItemName,
						s.bill_qty AS tallyQty,
						s.item_rate AS tallyRate,
						s.amount AS tallyAmount
					FROM FilteredTally t
					JOIN [${TALLYDB}].[dbo].[sales_inv_stk_info_ob] s
						ON t.tally_id = s.tally_id
					JOIN [${TALLYDB}].[dbo].[stock_items_ob] AS p
						ON p.tally_id = s.name_item_id
				),
				MergedSales AS (
					SELECT 
						erp.erpPk,
						tally.tallyPk,
						COALESCE(erp.erpDate, tally.tallyDate) AS transactionDate,
						COALESCE(
							erp.invoiceNo COLLATE SQL_Latin1_General_CP1_CI_AS, 
							tally.invoiceNo COLLATE SQL_Latin1_General_CP1_CI_AS
						) AS invoiceNo,
						COALESCE(
							erp.erpLedger COLLATE SQL_Latin1_General_CP1_CI_AS, 
							tally.tallyLedger COLLATE SQL_Latin1_General_CP1_CI_AS
						) AS LedgerName,
						COALESCE(
							erp.erpVoucher COLLATE SQL_Latin1_General_CP1_CI_AS, 
							tally.tallyVoucher COLLATE SQL_Latin1_General_CP1_CI_AS
						) AS VoucherTypeGet,
						COALESCE(erp.Item_Id, tally.Item_Id) AS Item_Id,
						COALESCE(
							tally.tallyItemName COLLATE SQL_Latin1_General_CP1_CI_AS,
							erp.erpItemName COLLATE SQL_Latin1_General_CP1_CI_AS
						) AS ItemName,
						erp.erpQty,
						tally.tallyQty,
						erp.erpRate,
						tally.tallyRate,
						erp.erpAmount,
						tally.tallyAmount,
						CASE 
							WHEN erp.Item_Id IS NULL THEN 'Only in Tally'
							WHEN tally.Item_Id IS NULL THEN 'Only in ERP'
							WHEN ISNULL(erp.erpQty, 0) <> ISNULL(tally.tallyQty, 0)
								AND ISNULL(erp.erpRate, 0) <> ISNULL(tally.tallyRate, 0)
								AND ISNULL(erp.erpAmount, 0) <> ISNULL(tally.tallyAmount, 0)
								THEN 'Qty + Rate + Amount Mismatch'
							WHEN ISNULL(erp.erpQty, 0) <> ISNULL(tally.tallyQty, 0)
								AND ISNULL(erp.erpRate, 0) <> ISNULL(tally.tallyRate, 0)
								THEN 'Qty + Rate Mismatch'
							WHEN ISNULL(erp.erpQty, 0) <> ISNULL(tally.tallyQty, 0)
								AND ISNULL(erp.erpAmount, 0) <> ISNULL(tally.tallyAmount, 0)
								THEN 'Qty + Amount Mismatch'
							WHEN ISNULL(erp.erpRate, 0) <> ISNULL(tally.tallyRate, 0)
								AND ISNULL(erp.erpAmount, 0) <> ISNULL(tally.tallyAmount, 0)
								THEN 'Rate + Amount Mismatch'
							WHEN ISNULL(erp.erpQty, 0) <> ISNULL(tally.tallyQty, 0)
								THEN 'Qty Mismatch'
							WHEN ISNULL(erp.erpRate, 0) <> ISNULL(tally.tallyRate, 0)
								THEN 'Rate Mismatch'
							WHEN ISNULL(erp.erpAmount, 0) <> ISNULL(tally.tallyAmount, 0)
								THEN 'Amount Mismatch'
							ELSE 'Match'
						END AS Status
					FROM ERPSales erp
					FULL OUTER JOIN TallySales tally
						ON erp.invoiceNo COLLATE SQL_Latin1_General_CP1_CI_AS = 
						   tally.invoiceNo COLLATE SQL_Latin1_General_CP1_CI_AS
						AND erp.Item_Id = tally.Item_Id
					${isEqualNumber(excluedeSyced, 1) ?`
					WHERE 
						erp.erpQty <> tally.tallyQty
						OR erp.erpRate <> tally.tallyRate
						OR erp.erpAmount <> tally.tallyAmount ` : ''}
				)
				SELECT *
				FROM MergedSales
				ORDER BY invoiceNo COLLATE SQL_Latin1_General_CP1_CI_AS, Item_Id;`
			);

		const result = await request;

		sentData(res, result.recordset)

	} catch (e) {
		servError(e, res);
	}
}

const getERPAndTallyPurchaseDifference = async (req, res) => {
	try {

		if (!TALLYDB) return failed(res, 'Tally Db not found');
		const
			Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
			Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

		const request = new sql.Request()
			.input('Fromdate', Fromdate)
			.input('Todate', Todate)
			.query(`
                DECLARE @unSyncedInvoice TABLE (
					erpPk INT, 
					erpVoucherNumber NVARCHAR(30), 
					erpAlterId BIGINT,
					erpTallyPk INT, 
					tallyPk INT, 
					tallyVoucherNumber NVARCHAR(30),
					tallyAlterId INT,
					RowStatus NVARCHAR(30)
				);
				--
				-- inseting first two cases
				--
				INSERT INTO @unSyncedInvoice (
					erpPk, erpVoucherNumber, erpAlterId,
					erpTallyPk, tallyPk, tallyVoucherNumber,
					tallyAlterId, RowStatus
				)
				SELECT 
					erp.Do_Id AS erpPk,
					erp.Do_Inv_No AS erpVoucherNumber,
					erp.Alter_Id AS erpAlterId,
					erp.Tally_Id AS erpTallyPk,
					tally.tally_id AS tallyPk,
					tally.invoice_no AS tallyVoucherNumber,
					tally.alter_id AS tallyAlterId,
					CASE 
						WHEN tally.tally_id IS NULL THEN 'Only in ERP DB'
						WHEN erp.Tally_Id IS NULL THEN 'Only in Tally DB'
						WHEN erp.Alter_Id <> tally.alter_id THEN 'Modified (Alter_Id mismatch)'
						ELSE 'Match'
					END AS RowStatus
				FROM tbl_Sales_Delivery_Gen_Info erp
				FULL OUTER JOIN [${TALLYDB}].[dbo].[sales_inv_geninfo_ob] tally
					ON erp.Tally_Id = tally.tally_id
				WHERE (
						erp.Tally_Id IS NULL
						OR tally.tally_id IS NULL
						OR erp.Alter_Id <> tally.alter_id
					)
					AND (
						-- Apply date filter
						(ISNULL(erp.Do_Date, '') BETWEEN @Fromdate AND @Todate)
						OR (ISNULL(tally.invoice_date, '') BETWEEN @Fromdate AND @Todate)
					);
				--
				-- inserting third case
				--
				INSERT INTO @unSyncedInvoice (
					erpPk, erpVoucherNumber, erpAlterId,
					erpTallyPk, tallyPk, tallyVoucherNumber,
					tallyAlterId, RowStatus
				)
				SELECT 
					erp.Do_Id,
					erp.Do_Inv_No,
					erp.Alter_Id,
					erp.Tally_Id,
					tally.tally_id,
					tally.invoice_no,
					tally.alter_id,
					'Child rows count mismatch'
				FROM tbl_Sales_Delivery_Gen_Info erp
				INNER JOIN [${TALLYDB}].[dbo].[sales_inv_geninfo_ob] tally
					ON erp.Tally_Id = tally.tally_id
				-- Join child counts
				LEFT JOIN (
					SELECT Delivery_Order_Id, COUNT(*) AS childCount
					FROM tbl_Sales_Delivery_Stock_Info
					GROUP BY Delivery_Order_Id
				) AS erpChild ON erp.Do_Id = erpChild.Delivery_Order_Id
				LEFT JOIN (
					SELECT tally_id, COUNT(*) AS childCount
					FROM [${TALLYDB}].[dbo].[sales_inv_stk_info_ob]
					GROUP BY tally_id
				) AS tallyChild ON tally.tally_id = tallyChild.tally_id
				WHERE ISNULL(erpChild.childCount, 0) <> ISNULL(tallyChild.childCount, 0)
				  AND NOT EXISTS (
					SELECT 1 FROM @unSyncedInvoice u
					WHERE u.erpPk = erp.Do_Id AND u.tallyPk = tally.tally_id
				  )
				  AND (
						erp.Do_Date BETWEEN @Fromdate AND @Todate
						OR tally.invoice_date BETWEEN @Fromdate AND @Todate
				  );
				--AND NOT EXISTS (
				--	SELECT 1 FROM @unSyncedInvoice u
				--	WHERE u.erpPk = erp.Do_Id AND u.tallyPk = tally.tally_id
				--);
				-- erp data
				SELECT * 
				FROM tbl_Sales_Delivery_Gen_Info
				WHERE Do_Id IN (SELECT DISTINCT erpPk FROM @unSyncedInvoice);
				-- tally data
				SELECT * 
				FROM [${TALLYDB}].[dbo].[sales_inv_geninfo_ob] AS tallyDb
				WHERE tally_id IN (SELECT DISTINCT tallyPk FROM @unSyncedInvoice);`
			);

		const result = await request;

		const ERPDifference = toArray(result.recordsets[0]);
		const TallyDifference = toArray(result.recordsets[1]);

		dataFound(res, [], 'data found', {
			ERPDifference, TallyDifference
			// ERPDifference: ERPDifference.map(row => ({
			// 	...row,
			// 	...(differenceInInvoice.find(difRow => isEqualNumber(
			// 		row.Do_Id, difRow.erpPk
			// 	)) || {})
			// })), 
			// TallyDifference: TallyDifference.map(row => ({
			// 	...row,
			// 	...(differenceInInvoice.find(difRow => isEqualNumber(
			// 		row.tally_id, difRow.tallyPk
			// 	)) || {})
			// })) 
		});

	} catch (e) {
		servError(e, res);
	}
}

const getERPPurchaseDataStatus = async (req, res) => {
	try {

		if (!TALLYDB) return failed(res, 'Tally Db not found');

		const
			Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
			Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

		const { excluedeSyced = 1 } = req.query;

		const request = new sql.Request()
			.input('Fromdate', Fromdate)
			.input('Todate', Todate)
			.query(`
                WITH FilteredERP AS (
					SELECT 
						sgi.*,
						r.Retailer_Name
					FROM tbl_Sales_Delivery_Gen_Info AS sgi
					LEFT JOIN tbl_Retailers_Master AS r
						ON r.Retailer_Id = sgi.Retailer_Id
					WHERE sgi.Do_Date BETWEEN @Fromdate AND @Todate
				), erpSalesChildCount AS (
					SELECT Delivery_Order_Id, COUNT(*) AS childCount
					FROM tbl_Sales_Delivery_Stock_Info
					WHERE Delivery_Order_Id IN (SELECT Do_Id FROM FilteredERP)
					GROUP BY Delivery_Order_Id
				), tallySalesChildCount AS (
					SELECT tally_id, COUNT(*) AS childCount
					FROM [${TALLYDB}].[dbo].[sales_inv_stk_info_ob]
					WHERE tally_id IN (
						SELECT t.tally_id
						FROM [${TALLYDB}].[dbo].[sales_inv_geninfo_ob] t
						JOIN FilteredERP e ON 
							e.Do_Inv_No COLLATE SQL_Latin1_General_CP1_CI_AS = t.invoice_no
					)
					GROUP BY tally_id
				)
				SELECT 
					erp.*,
					ISNULL(erpChild.childCount, 0) AS erpChildCount,
					ISNULL(tallyChild.childCount, 0) AS tallyChildCount,
					CASE 
						WHEN tally.tally_id IS NULL THEN 'Not Synced'
						WHEN ISNULL(erpChild.childCount, 0) <> ISNULL(tallyChild.childCount, 0) THEN 'Child not Synced'
						ELSE 'Synced'
					END AS RowStatus
				FROM FilteredERP erp
				LEFT JOIN [${TALLYDB}].[dbo].[sales_inv_geninfo_ob] tally
					ON erp.Do_Inv_No COLLATE SQL_Latin1_General_CP1_CI_AS = tally.invoice_no
				LEFT JOIN erpSalesChildCount AS erpChild 
					ON erp.Do_Id = erpChild.Delivery_Order_Id
				LEFT JOIN tallySalesChildCount AS tallyChild 
					ON tally.tally_id = tallyChild.tally_id
				${isEqualNumber(excluedeSyced, 1) ? `
				WHERE 
					tally.tally_id IS NULL
					OR ISNULL(erpChild.childCount, 0) <> ISNULL(tallyChild.childCount, 0) `: ''}
				ORDER BY erp.Do_Inv_No, erp.Do_Date;`
			);

		const result = await request;

		sentData(res, result.recordset)

	} catch (e) {
		servError(e, res);
	}
}

export default {
	getERPAndTallySalesDifference,
	getERPSalesDataStatus,
	getSalesDifferenceItemWise,
	getERPAndTallyPurchaseDifference,
	getERPPurchaseDataStatus
}