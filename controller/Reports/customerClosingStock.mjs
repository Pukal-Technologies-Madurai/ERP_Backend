import sql from 'mssql';
import { dataFound, failed, invalidInput, noData, sentData, servError, success } from '../../res.mjs';
import { Addition, checkIsNumber, getDaysBetween, ISOString, LocalDate, toNumber } from '../../helper_functions.mjs';



const getSoldItems = async (req, res) => {
	try {
		const request = new sql.Request()
			.query(`
                SELECT 
                	i.Item_Id,
                	p.Product_Name AS Item_Name
                FROM (
                	SELECT DISTINCT Item_Id
                	FROM tbl_Closing_Stock_Info
                	UNION
                	SELECT DISTINCT Item_Id
                	FROM tbl_Sales_Delivery_Stock_Info
                ) AS i 
                JOIN tbl_Product_Master AS p
                ON p.Product_Id = i.Item_Id
                ORDER BY Item_Name`
			);

		const result = await request;

		sentData(res, result.recordset)
	} catch (e) {
		servError(e, res);
	}
}

const searchWhoHasTheItem = async (req, res) => {
	try {
		const { Item_Id } = req.query;

		if (!checkIsNumber(Item_Id)) return invalidInput(res, 'Item_Id is required');

		const request = new sql.Request()
			.input('searchItem', Item_Id)
			.query(`
                WITH LatestPerRetailer AS (
                	SELECT 
                		sdgi.Retailer_Id,
                		sdgi.Do_Date,
                		sdi.Item_Id,
                		sdi.Bill_Qty,
                		sdgi.Do_Id,
                		sdi.Item_Rate,
                		ROW_NUMBER() OVER (
                			PARTITION BY sdgi.Retailer_Id
                			ORDER BY sdgi.Do_Date DESC
                		) AS rn
                	FROM tbl_Sales_Delivery_Stock_Info sdi
                	JOIN tbl_Sales_Delivery_Gen_Info sdgi
                		ON sdgi.Do_Id = sdi.Delivery_Order_Id
                	WHERE 
                		sdi.Item_Id = @searchItem
                		AND sdi.Bill_Qty <> 0
                ), LatestStock AS (
                	SELECT 
                		csgi.Retailer_Id,
                		csgi.ST_Date,
                		csi.Item_Id,
                		csi.ST_Qty,
                		csgi.ST_Id,
                		ROW_NUMBER() OVER (
                			PARTITION BY csgi.Retailer_Id
                			ORDER BY csgi.ST_Date DESC
                		) AS rn
                	FROM tbl_Closing_Stock_Info AS csi
                	JOIN tbl_Closing_Stock_Gen_Info AS csgi
                		ON csgi.ST_Id = csi.St_Id
                	WHERE 
                		csi.Item_Id = @searchItem
                		AND csi.ST_Qty <> 0
                )
                SELECT 
                	COALESCE(d.Retailer_Id, s.Retailer_Id) AS Retailer_Id,
                	r.Retailer_Name,
                	d.Do_Date,
                	s.ST_Date AS closingDate,
                	@searchItem AS Item_Id,
                	ISNULL(d.Bill_Qty, 0) AS Bill_Qty,
                	ISNULL(s.ST_Qty, 0) AS ClosingQTY,
                	d.Do_Id,
                	s.ST_Id AS closingId,
                	p.Product_Name,
                	p.Short_Name,
                	p.Product_Rate,
                	ISNULL(d.Item_Rate, 0) AS Billed_Rate
                FROM LatestPerRetailer d
                FULL OUTER JOIN LatestStock s
                	ON d.Retailer_Id = s.Retailer_Id
                	AND d.rn = 1 AND s.rn = 1
                JOIN tbl_Product_Master p 
                	ON p.Product_Id = @searchItem
                JOIN tbl_Retailers_Master r 
                	ON r.Retailer_Id = COALESCE(d.Retailer_Id, s.Retailer_Id)
                WHERE (d.rn = 1 OR s.rn = 1);`
			);

		const result = await request;

		const getEstimatedQty = (item) => {
			const closing = new Date(item.closingDate)
			const delivery = new Date(item.Do_Date);
			const totalQty = Addition(item?.Bill_Qty, item?.ClosingQTY)

			if (!item.closingDate || !item.Do_Date) return {
				qty: totalQty,
				date: (item?.closingDate && (closing > delivery)) ? item?.closingDate : item.Do_Date
			}

			return closing > delivery ? {
				qty: toNumber(item.ClosingQTY),
				date: closing
			} : {
				qty: totalQty,
				date: delivery
			}
		}

		if (result.recordset.length > 0) {
			const withValidValues = result.recordset.map(row => {
				const calc = getEstimatedQty(row);
				return {
					...row,
					finalQty: calc.qty,
					recentDate: calc.date,
					finalRate: row?.Billed_Rate ? toNumber(row?.Billed_Rate) : toNumber(row?.Product_Rate)
				}
			});

			sentData(res, withValidValues);
		} else {
			noData(res);
		}

	} catch (e) {
		servError(e, res);
	}
}

const ledgerBasedClosingStock = async (req, res) => {
	try {

		const request = new sql.Request()
			.query(`
                WITH LatestDeliveryPerItem AS (
					SELECT 
						sdgi.Retailer_Id,
						sdi.Item_Id,
						sdgi.Do_Id,
						sdgi.Do_Date,
						sdi.Bill_Qty,
						P.Product_Name,
						P.Product_Rate,
						ROW_NUMBER() OVER (
							PARTITION BY sdgi.Retailer_Id, sdi.Item_Id
							ORDER BY sdgi.Do_Date DESC
						) AS rn
					FROM tbl_Sales_Delivery_Stock_Info sdi
					JOIN tbl_Sales_Delivery_Gen_Info sdgi ON sdi.Delivery_Order_Id = sdgi.Do_Id
					JOIN tbl_Product_Master P ON P.Product_Id = sdi.Item_Id
					WHERE sdi.Bill_Qty > 0 
				), LatestClosingPerItem AS (
					SELECT 
						csgi.Retailer_Id,
						csi.Item_Id,
						csgi.ST_Id,
						csgi.ST_Date,
						csi.ST_Qty,
						P.Product_Name,
						P.Product_Rate,
						ROW_NUMBER() OVER (
							PARTITION BY csgi.Retailer_Id, csi.Item_Id
							ORDER BY csgi.ST_Date DESC
						) AS rn
					FROM tbl_Closing_Stock_Info csi
					JOIN tbl_Closing_Stock_Gen_Info csgi ON csi.ST_Id = csgi.ST_Id
					JOIN tbl_Product_Master P ON P.Product_Id = csi.Item_Id
					WHERE csi.ST_Qty > 0
				), FilteredStock AS (
					SELECT * FROM LatestClosingPerItem WHERE rn = 1
				), FilteredDelivery AS (
					SELECT * FROM LatestDeliveryPerItem WHERE rn = 1
				), RetailerClosing AS (
					SELECT 
						R.Retailer_Id,
						R.Retailer_Name,
						MAX(FS.ST_Date) AS Latest_Closing_Date,
						MAX(FD.Do_Date) AS Latest_Delivery_Date,
						SUM(ISNULL(FS.ST_Qty, 0) * ISNULL(FS.Product_Rate, 0)) AS total_stock_value,
						SUM(ISNULL(FD.Bill_Qty, 0) * ISNULL(FD.Product_Rate, 0)) AS total_delivery_value,
						MAX(FS.ST_Id) AS Latest_Closing_Id,
						MAX(FD.Do_Id) AS Latest_Delivery_Id
					FROM tbl_Retailers_Master R
					LEFT JOIN FilteredStock FS ON FS.Retailer_Id = R.Retailer_Id
					LEFT JOIN FilteredDelivery FD ON FD.Retailer_Id = R.Retailer_Id AND FD.Item_Id = FS.Item_Id
					WHERE 
						FS.Retailer_Id IS NOT NULL 
						OR FD.Retailer_Id IS NOT NULL
					GROUP BY R.Retailer_Id, R.Retailer_Name
				)
				SELECT 
					rwc.*,
					sal.UserId AS salesPersonId,
					del.UserId AS deliveryPersonId,
					COALESCE(sal.Name, '-') AS salesPerson,
					COALESCE(del.Name, '-') AS deliveryPerson
				FROM RetailerClosing AS rwc
				LEFT JOIN tbl_Sales_Delivery_Gen_Info AS sdgi ON
					sdgi.Do_Id = rwc.Latest_Delivery_Id
				LEFT JOIN tbl_Users AS del ON
					del.UserId = sdgi.Delivery_Person_Id
				LEFT JOIN tbl_Closing_Stock_Gen_Info AS csgi ON
					csgi.ST_Id = rwc.Latest_Closing_Id
				LEFT JOIN tbl_Users AS sal ON
					sal.UserId = csgi.Created_by;`
			);

		const result = await request;

		const getEstimatedQty = (item) => {
			const closing = new Date(item.Latest_Closing_Date)
			const delivery = new Date(item.Latest_Delivery_Date);
			const totalStockValue = Addition(item?.total_stock_value, item?.total_delivery_value)

			if (!item.Latest_Closing_Date || !item.Latest_Delivery_Date) return {
				stockValue: totalStockValue,
				date: (item?.Latest_Closing_Date && (closing > delivery)) ? item?.Latest_Closing_Date : item.Latest_Delivery_Date
			}

			return closing > delivery ? {
				stockValue: toNumber(item.total_stock_value),
				date: closing
			} : {
				stockValue: totalStockValue,
				date: delivery
			}
		}

		if (result.recordset.length > 0) {
			const withValidValues = result.recordset.map(row => {
				const calc = getEstimatedQty(row);
				return {
					...row,
					finalClosingStock: calc.stockValue,
					recentDate: calc.date,
					deliveryDisplayDate: row?.Latest_Delivery_Date ? LocalDate(row?.Latest_Delivery_Date) : '',
					closingDisplayDate: row?.Latest_Closing_Date ? LocalDate(row?.Latest_Closing_Date) : '',
					entryDays: row?.Latest_Delivery_Date ? getDaysBetween(row?.Latest_Delivery_Date, ISOString()) : '',
					updateDays: row?.Latest_Closing_Date ? getDaysBetween(row?.Latest_Closing_Date, ISOString()) : ''
				}
			});

			sentData(res, withValidValues);
		} else {
			noData(res);
		}

	} catch (e) {
		servError(e, res);
	}
}

const ledgerSalesPersonGroupingClosingStock = async (req, res) => {
	try {
		const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
		const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

		const request = new sql.Request()
			.input('Fromdate', Fromdate)
			.input('Todate', Todate)
			.query(`
                WITH LatestDeliveryPerItem AS (
					SELECT 
						sdgi.Retailer_Id,
						sdi.Item_Id,
						sdgi.Do_Id,
						sdgi.Do_Date,
						sdi.Bill_Qty,
						P.Product_Name,
						P.Product_Rate,
						ROW_NUMBER() OVER (
							PARTITION BY sdgi.Retailer_Id, sdi.Item_Id
							ORDER BY sdgi.Do_Date DESC
						) AS rn
					FROM tbl_Sales_Delivery_Stock_Info sdi
					JOIN tbl_Sales_Delivery_Gen_Info sdgi ON sdi.Delivery_Order_Id = sdgi.Do_Id
					JOIN tbl_Product_Master P ON P.Product_Id = sdi.Item_Id
					WHERE 
						sdi.Bill_Qty > 0
						AND sdgi.Do_Date BETWEEN @Fromdate AND @Todate
				), LatestClosingPerItem AS (
					SELECT 
						csgi.Retailer_Id,
						csi.Item_Id,
						csgi.ST_Id,
						csgi.ST_Date,
						csi.ST_Qty,
						P.Product_Name,
						P.Product_Rate,
						ROW_NUMBER() OVER (
							PARTITION BY csgi.Retailer_Id, csi.Item_Id
							ORDER BY csgi.ST_Date DESC
						) AS rn
					FROM tbl_Closing_Stock_Info csi
					JOIN tbl_Closing_Stock_Gen_Info csgi ON csi.ST_Id = csgi.ST_Id
					JOIN tbl_Product_Master P ON P.Product_Id = csi.Item_Id
					WHERE 
						csi.ST_Qty > 0
						AND csgi.ST_Date BETWEEN @Fromdate AND @Todate
				), FilteredStock AS (
					SELECT * FROM LatestClosingPerItem WHERE rn = 1
				), FilteredDelivery AS (
					SELECT * FROM LatestDeliveryPerItem WHERE rn = 1
				), RetailerClosing AS (
					SELECT 
						R.Retailer_Id,
						R.Retailer_Name,
						MAX(FS.ST_Date) AS Latest_Closing_Date,
						MAX(FD.Do_Date) AS Latest_Delivery_Date,
						SUM(ISNULL(FS.ST_Qty, 0) * ISNULL(FS.Product_Rate, 0)) AS total_stock_value,
						SUM(ISNULL(FD.Bill_Qty, 0) * ISNULL(FD.Product_Rate, 0)) AS total_delivery_value,
						MAX(FS.ST_Id) AS Latest_Closing_Id,
						MAX(FD.Do_Id) AS Latest_Delivery_Id
					FROM tbl_Retailers_Master R
					LEFT JOIN FilteredStock FS ON FS.Retailer_Id = R.Retailer_Id
					LEFT JOIN FilteredDelivery FD ON FD.Retailer_Id = R.Retailer_Id AND FD.Item_Id = FS.Item_Id
					WHERE 
						FS.Retailer_Id IS NOT NULL 
						OR FD.Retailer_Id IS NOT NULL
					GROUP BY R.Retailer_Id, R.Retailer_Name
				)
				SELECT 
					rwc.*,
					sal.UserId AS salesPersonId,
					del.UserId AS deliveryPersonId,
					COALESCE(sal.Name, '-') AS salesPerson,
					COALESCE(del.Name, '-') AS deliveryPerson
				FROM RetailerClosing AS rwc
				LEFT JOIN tbl_Sales_Delivery_Gen_Info AS sdgi ON
					sdgi.Do_Id = rwc.Latest_Delivery_Id
				LEFT JOIN tbl_Users AS del ON
					del.UserId = sdgi.Delivery_Person_Id
				LEFT JOIN tbl_Closing_Stock_Gen_Info AS csgi ON
					csgi.ST_Id = rwc.Latest_Closing_Id
				LEFT JOIN tbl_Users AS sal ON
					sal.UserId = csgi.Created_by;`
			);

		const result = await request;

		const getEstimatedQty = (item) => {
			const closing = new Date(item.Latest_Closing_Date)
			const delivery = new Date(item.Latest_Delivery_Date);
			const totalStockValue = Addition(item?.total_stock_value, item?.total_delivery_value)

			if (!item.Latest_Closing_Date || !item.Latest_Delivery_Date) return {
				stockValue: totalStockValue,
				date: (item?.Latest_Closing_Date && (closing > delivery)) ? item?.Latest_Closing_Date : item.Latest_Delivery_Date
			}

			return closing > delivery ? {
				stockValue: toNumber(item.total_stock_value),
				date: closing
			} : {
				stockValue: totalStockValue,
				date: delivery
			}
		}

		if (result.recordset.length > 0) {
			const withValidValues = result.recordset.map(row => {
				const calc = getEstimatedQty(row);
				return {
					...row,
					finalClosingStock: calc.stockValue,
					recentDate: calc.date,
					deliveryDisplayDate: row?.Latest_Delivery_Date ? LocalDate(row?.Latest_Delivery_Date) : '',
					closingDisplayDate: row?.Latest_Closing_Date ? LocalDate(row?.Latest_Closing_Date) : '',
					entryDays: row?.Latest_Delivery_Date ? getDaysBetween(row?.Latest_Delivery_Date, ISOString()) : '',
					updateDays: row?.Latest_Closing_Date ? getDaysBetween(row?.Latest_Closing_Date, ISOString()) : ''
				}
			});

			sentData(res, withValidValues);
		} else {
			noData(res);
		}

	} catch (e) {
		servError(e, res);
	}
}

export default {
	getSoldItems,
	searchWhoHasTheItem,
	ledgerBasedClosingStock,
	ledgerSalesPersonGroupingClosingStock,
}