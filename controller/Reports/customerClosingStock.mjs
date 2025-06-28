import sql from 'mssql';
import { invalidInput, noData, sentData, servError } from '../../res.mjs';
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

		const
			Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
			Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

		const request = new sql.Request()
			.input('searchItem', Item_Id)
			.input('Fromdate', Fromdate)
			.input('Todate', Todate)
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
						sdgi.Do_Date BETWEEN @Fromdate AND @Todate
						AND sdi.Item_Id = @searchItem
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
						csgi.ST_Date BETWEEN @Fromdate AND @Todate
						AND csi.Item_Id = @searchItem
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
					ISNULL(d.Item_Rate, 0) AS Billed_Rate,
					CASE 
						WHEN s.ST_Date IS NOT NULL AND (d.Do_Date IS NULL OR s.ST_Date > d.Do_Date) THEN 
							ISNULL(s.ST_Qty, 0) * ISNULL(p.Product_Rate, 0)
						WHEN s.ST_Date IS NOT NULL AND d.Do_Date IS NOT NULL AND s.ST_Date <= d.Do_Date THEN
							ISNULL(s.ST_Qty, 0) * ISNULL(p.Product_Rate, 0) + ISNULL(d.Bill_Qty, 0) * ISNULL(d.Item_Rate, 0)
						WHEN s.ST_Date IS NULL AND d.Do_Date IS NOT NULL THEN 
							ISNULL(d.Bill_Qty, 0) * ISNULL(d.Item_Rate, 0)
						ELSE 0
					END AS stockValueOfItem,
					CASE 
						WHEN s.ST_Date IS NOT NULL AND (d.Do_Date IS NULL OR s.ST_Date > d.Do_Date) THEN 
							ISNULL(s.ST_Qty, 0)
						WHEN s.ST_Date IS NOT NULL AND d.Do_Date IS NOT NULL AND s.ST_Date <= d.Do_Date THEN
							ISNULL(s.ST_Qty, 0) + ISNULL(d.Bill_Qty, 0)
						WHEN s.ST_Date IS NULL AND d.Do_Date IS NOT NULL THEN 
							ISNULL(d.Bill_Qty, 0)
						ELSE 0
					END AS stockQuantityOfItem,
					CASE 
						WHEN s.ST_Date IS NOT NULL AND (d.Do_Date IS NULL OR s.ST_Date > d.Do_Date) THEN 
							ISNULL(p.Product_Rate, 0)
						WHEN s.ST_Date IS NOT NULL AND d.Do_Date IS NOT NULL AND s.ST_Date <= d.Do_Date THEN
							ISNULL(d.Item_Rate, 0)
						WHEN s.ST_Date IS NULL AND d.Do_Date IS NOT NULL THEN 
							ISNULL(d.Item_Rate, 0)
						ELSE 0
					END AS stockRateOfItem
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

const ledgerClosingStock = async (req, res) => {
	try {
		const { Retailer_Id } = req.query;

		const
			Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
			Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

		if (!checkIsNumber(Retailer_Id)) return invalidInput(res, 'Retailer_Id is required');

		const request = new sql.Request()
			.input('Retailer_Id', Retailer_Id)
			.input('Fromdate', Fromdate)
			.input('Todate', Todate)
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
							PARTITION BY sdgi.Retailer_Id, sdi.Item_Id
							ORDER BY sdgi.Do_Date DESC
						) AS rn
					FROM tbl_Sales_Delivery_Stock_Info sdi
					JOIN tbl_Sales_Delivery_Gen_Info sdgi ON sdgi.Do_Id = sdi.Delivery_Order_Id
					WHERE 
						sdgi.Do_Date BETWEEN @Fromdate AND @Todate
						AND sdgi.Retailer_Id = @Retailer_Id
						AND sdi.Bill_Qty <> 0
				), LatestStock AS (
					SELECT 
						csgi.Retailer_Id,
						csgi.ST_Date,
						csi.Item_Id,
						csi.ST_Qty,
						csgi.ST_Id,
						ROW_NUMBER() OVER (
							PARTITION BY csgi.Retailer_Id, csi.Item_Id
							ORDER BY csgi.ST_Date DESC
						) AS rn
					FROM tbl_Closing_Stock_Info AS csi
					JOIN tbl_Closing_Stock_Gen_Info AS csgi ON csgi.ST_Id = csi.St_Id
					WHERE 
						csgi.ST_Date BETWEEN @Fromdate AND @Todate
						AND csgi.Retailer_Id = @Retailer_Id
						AND csi.ST_Qty <> 0
				)
				SELECT 
					COALESCE(d.Retailer_Id, s.Retailer_Id) AS Retailer_Id,
					d.Do_Date,
					s.ST_Date AS closingDate,
					COALESCE(d.Item_Id, s.Item_Id) AS Item_Id,
					ISNULL(d.Bill_Qty, 0) AS Bill_Qty,
					ISNULL(s.ST_Qty, 0) AS ClosingQTY,
					d.Do_Id,
					s.ST_Id AS closingId,
					p.Product_Name,
					p.Short_Name,
					p.Product_Rate,
					ISNULL(d.Item_Rate, 0) AS Billed_Rate,
					CASE 
						WHEN s.ST_Date IS NOT NULL AND (d.Do_Date IS NULL OR s.ST_Date > d.Do_Date) THEN 
							ISNULL(s.ST_Qty, 0) * ISNULL(p.Product_Rate, 0)
						WHEN s.ST_Date IS NOT NULL AND d.Do_Date IS NOT NULL AND s.ST_Date <= d.Do_Date THEN
							ISNULL(s.ST_Qty, 0) * ISNULL(p.Product_Rate, 0) + ISNULL(d.Bill_Qty, 0) * ISNULL(d.Item_Rate, 0)
						WHEN s.ST_Date IS NULL AND d.Do_Date IS NOT NULL THEN 
							ISNULL(d.Bill_Qty, 0) * ISNULL(d.Item_Rate, 0)
						ELSE 0
					END AS stockValueOfItem,
					CASE 
						WHEN s.ST_Date IS NOT NULL AND (d.Do_Date IS NULL OR s.ST_Date > d.Do_Date) THEN 
							ISNULL(s.ST_Qty, 0)
						WHEN s.ST_Date IS NOT NULL AND d.Do_Date IS NOT NULL AND s.ST_Date <= d.Do_Date THEN
							ISNULL(s.ST_Qty, 0) + ISNULL(d.Bill_Qty, 0)
						WHEN s.ST_Date IS NULL AND d.Do_Date IS NOT NULL THEN 
							ISNULL(d.Bill_Qty, 0)
						ELSE 0
					END AS stockQuantityOfItem,
					CASE 
						WHEN s.ST_Date IS NOT NULL AND (d.Do_Date IS NULL OR s.ST_Date > d.Do_Date) THEN 
							ISNULL(p.Product_Rate, 0)
						WHEN s.ST_Date IS NOT NULL AND d.Do_Date IS NOT NULL AND s.ST_Date <= d.Do_Date THEN
							ISNULL(d.Item_Rate, 0)
						WHEN s.ST_Date IS NULL AND d.Do_Date IS NOT NULL THEN 
							ISNULL(d.Item_Rate, 0)
						ELSE 0
					END AS stockRateOfItem
				FROM LatestPerRetailer d
				FULL OUTER JOIN LatestStock s ON d.Retailer_Id = s.Retailer_Id AND d.Item_Id = s.Item_Id AND d.rn = 1 AND s.rn = 1
				JOIN tbl_Product_Master p ON p.Product_Id = COALESCE(d.Item_Id, s.Item_Id)
				JOIN tbl_Retailers_Master r ON r.Retailer_Id = COALESCE(d.Retailer_Id, s.Retailer_Id)
				WHERE (d.rn = 1 OR s.rn = 1);`
			);

		const result = await request;

		if (result.recordset.length > 0) {
			const withValidValues = result.recordset.map(row => ({
				...row,
				deliveryDisplayDate: row?.Do_Date ? LocalDate(row?.Do_Date) : '',
				closingDisplayDate: row?.closingDate ? LocalDate(row?.closingDate) : '',
				entryDays: row?.Do_Date ? getDaysBetween(row?.Do_Date, ISOString()) : '',
				updateDays: row?.closingDate ? getDaysBetween(row?.closingDate, ISOString()) : ''
			}));

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

		const
			Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
			Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

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
						sdi.Item_Rate AS Product_Rate,
						ROW_NUMBER() OVER (
							PARTITION BY sdgi.Retailer_Id, sdi.Item_Id
							ORDER BY sdgi.Do_Date DESC
						) AS rn
					FROM tbl_Sales_Delivery_Stock_Info sdi
					JOIN tbl_Sales_Delivery_Gen_Info sdgi ON sdi.Delivery_Order_Id = sdgi.Do_Id
					JOIN tbl_Product_Master P ON P.Product_Id = sdi.Item_Id
					WHERE 
						sdgi.Do_Date BETWEEN @Fromdate AND @Todate
						AND sdi.Bill_Qty > 0
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
						csgi.ST_Date BETWEEN @Fromdate AND @Todate
						AND csi.ST_Qty > 0
				), FilteredStock AS (
					SELECT * FROM LatestClosingPerItem WHERE rn = 1
				), FilteredDelivery AS (
					SELECT * FROM LatestDeliveryPerItem WHERE rn = 1
				), JoinedLatestPerItem AS (
					SELECT 
						COALESCE(FS.Retailer_Id, FD.Retailer_Id) AS Retailer_Id,
						COALESCE(FS.Item_Id, FD.Item_Id) AS Item_Id,
						FS.ST_Date,
						FD.Do_Date,
						FS.ST_Id,
						FD.Do_Id,
						FS.ST_Qty,
						FD.Bill_Qty,
						FS.Product_Rate AS ClosingRate,
						FD.Product_Rate AS DeliveryRate,
						CASE 
							WHEN FS.ST_Date IS NOT NULL AND (FD.Do_Date IS NULL OR FS.ST_Date > FD.Do_Date) THEN 
								ISNULL(FS.ST_Qty, 0) * ISNULL(FS.Product_Rate, 0)
							WHEN FS.ST_Date IS NOT NULL AND FD.Do_Date IS NOT NULL AND FS.ST_Date <= FD.Do_Date THEN
								ISNULL(FS.ST_Qty, 0) * ISNULL(FS.Product_Rate, 0) + ISNULL(FD.Bill_Qty, 0) * ISNULL(FD.Product_Rate, 0)
							WHEN FS.ST_Date IS NULL AND FD.Do_Date IS NOT NULL THEN 
								ISNULL(FD.Bill_Qty, 0) * ISNULL(FD.Product_Rate, 0)
							ELSE 0
						END AS StockValueOfItem
					FROM FilteredStock FS
					FULL OUTER JOIN FilteredDelivery FD 
						ON FS.Retailer_Id = FD.Retailer_Id AND FS.Item_Id = FD.Item_Id
				), FinalRetailerSummary AS (
					SELECT 
						R.Retailer_Id,
						R.Retailer_Name,
						MAX(J.ST_Date) AS Latest_Closing_Date,
						MAX(J.Do_Date) AS Latest_Delivery_Date,
						SUM(ISNULL(FS.ST_Qty, 0) * ISNULL(FS.Product_Rate, 0)) AS total_stock_value,
						SUM(ISNULL(FD.Bill_Qty, 0) * ISNULL(FD.Product_Rate, 0)) AS total_delivery_value,
						MAX(J.ST_Id) AS Latest_Closing_Id,
						MAX(J.Do_Id) AS Latest_Delivery_Id,
						SUM(J.StockValueOfItem) AS liveStockValue
					FROM tbl_Retailers_Master R
					LEFT JOIN JoinedLatestPerItem J ON J.Retailer_Id = R.Retailer_Id
					LEFT JOIN FilteredStock FS ON FS.Retailer_Id = R.Retailer_Id AND FS.Item_Id = J.Item_Id
					LEFT JOIN FilteredDelivery FD ON FD.Retailer_Id = R.Retailer_Id AND FD.Item_Id = J.Item_Id
					GROUP BY R.Retailer_Id, R.Retailer_Name, R.ERP_Id
				)
				SELECT rwc.*,
					sal.UserId AS salesPersonId,
					del.Cost_Center_Id AS deliveryPersonId,
					COALESCE(sal.Name, '-') AS salesPerson,
					COALESCE(del.Cost_Center_Name, '-') AS deliveryPerson
				FROM FinalRetailerSummary as rwc
					LEFT JOIN tbl_Sales_Delivery_Gen_Info AS sdgi ON
						sdgi.Do_Id = rwc.Latest_Delivery_Id
					LEFT JOIN tbl_ERP_Cost_Center AS del ON
						del.Cost_Center_Id = sdgi.Delivery_Person_Id
					LEFT JOIN tbl_Closing_Stock_Gen_Info AS csgi ON
						csgi.ST_Id = rwc.Latest_Closing_Id
					LEFT JOIN tbl_Users AS sal ON
						sal.UserId = csgi.Created_by
				WHERE Latest_Closing_Date IS NOT NULL OR Latest_Delivery_Date IS NOT NULL
				ORDER BY Retailer_Name;`
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

const ledgerBasedClosingStockWithLOL = async (req, res) => {

	try {
		const
			Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
			Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

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
						sdi.Item_Rate AS Product_Rate,
						ROW_NUMBER() OVER (
							PARTITION BY sdgi.Retailer_Id, sdi.Item_Id
							ORDER BY sdgi.Do_Date DESC
						) AS rn
					FROM tbl_Sales_Delivery_Stock_Info sdi
					JOIN tbl_Sales_Delivery_Gen_Info sdgi ON sdi.Delivery_Order_Id = sdgi.Do_Id
					JOIN tbl_Product_Master P ON P.Product_Id = sdi.Item_Id
					WHERE 
						sdgi.Do_Date BETWEEN @Fromdate AND @Todate
						AND sdi.Bill_Qty > 0
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
						csgi.ST_Date BETWEEN @Fromdate AND @Todate
						AND csi.ST_Qty > 0
				), FilteredStock AS (
					SELECT * FROM LatestClosingPerItem WHERE rn = 1
				), FilteredDelivery AS (
					SELECT * FROM LatestDeliveryPerItem WHERE rn = 1
				), JoinedLatestPerItem AS (
					SELECT 
						COALESCE(FS.Retailer_Id, FD.Retailer_Id) AS Retailer_Id,
						COALESCE(FS.Item_Id, FD.Item_Id) AS Item_Id,
						FS.ST_Date,
						FD.Do_Date,
						FS.ST_Id,
						FD.Do_Id,
						FS.ST_Qty,
						FD.Bill_Qty,
						FS.Product_Rate AS ClosingRate,
						FD.Product_Rate AS DeliveryRate,
						CASE 
							WHEN FS.ST_Date IS NOT NULL AND (FD.Do_Date IS NULL OR FS.ST_Date > FD.Do_Date) THEN 
								ISNULL(FS.ST_Qty, 0) * ISNULL(FS.Product_Rate, 0)
							WHEN FS.ST_Date IS NOT NULL AND FD.Do_Date IS NOT NULL AND FS.ST_Date <= FD.Do_Date THEN
								ISNULL(FS.ST_Qty, 0) * ISNULL(FS.Product_Rate, 0) + ISNULL(FD.Bill_Qty, 0) * ISNULL(FD.Product_Rate, 0)
							WHEN FS.ST_Date IS NULL AND FD.Do_Date IS NOT NULL THEN 
								ISNULL(FD.Bill_Qty, 0) * ISNULL(FD.Product_Rate, 0)
							ELSE 0
						END AS StockValueOfItem
					FROM FilteredStock FS
					FULL OUTER JOIN FilteredDelivery FD 
						ON FS.Retailer_Id = FD.Retailer_Id AND FS.Item_Id = FD.Item_Id
				), FinalRetailerSummary AS (
					SELECT 
						R.Retailer_Id,
						R.Retailer_Name,
						R.ERP_Id,
						MAX(J.ST_Date) AS Latest_Closing_Date,
						MAX(J.Do_Date) AS Latest_Delivery_Date,
						SUM(ISNULL(FS.ST_Qty, 0) * ISNULL(FS.Product_Rate, 0)) AS total_stock_value,
						SUM(ISNULL(FD.Bill_Qty, 0) * ISNULL(FD.Product_Rate, 0)) AS total_delivery_value,
						MAX(J.ST_Id) AS Latest_Closing_Id,
						MAX(J.Do_Id) AS Latest_Delivery_Id,
						SUM(J.StockValueOfItem) AS liveStockValue
					FROM tbl_Retailers_Master R
					LEFT JOIN JoinedLatestPerItem J ON J.Retailer_Id = R.Retailer_Id
					LEFT JOIN FilteredStock FS ON FS.Retailer_Id = R.Retailer_Id AND FS.Item_Id = J.Item_Id
					LEFT JOIN FilteredDelivery FD ON FD.Retailer_Id = R.Retailer_Id AND FD.Item_Id = J.Item_Id
					GROUP BY R.Retailer_Id, R.Retailer_Name, R.ERP_Id
				)
				SELECT rwc.*,
					sal.UserId AS salesPersonId,
					del.Cost_Center_Id AS deliveryPersonId,
					COALESCE(sal.Name, '-') AS salesPerson,
					COALESCE(del.Cost_Center_Name, '-') AS deliveryPerson,
					lol.Ledger_Tally_Id,
				    lol.Ledger_Name,
				    lol.Ledger_Alias,
				    lol.Actual_Party_Name_with_Brokers,
				    lol.Party_Name,
				    lol.Party_Location,
				    lol.Party_Nature,
				    lol.Party_Group,
				    lol.Ref_Brokers,
				    lol.Ref_Owners,
				    lol.Party_Mobile_1,
				    lol.Party_Mobile_2,
				    lol.Party_District,
				    lol.Date_Added,
				    lol.Party_Mailing_Name,
				    lol.Party_Mailing_Address
				FROM FinalRetailerSummary as rwc
					LEFT JOIN tbl_Sales_Delivery_Gen_Info AS sdgi ON
						sdgi.Do_Id = rwc.Latest_Delivery_Id
					LEFT JOIN tbl_ERP_Cost_Center AS del ON
						del.Cost_Center_Id = sdgi.Delivery_Person_Id
					LEFT JOIN tbl_Closing_Stock_Gen_Info AS csgi ON
						csgi.ST_Id = rwc.Latest_Closing_Id
					LEFT JOIN tbl_Users AS sal ON
						sal.UserId = csgi.Created_by	
					LEFT JOIN tbl_Ledger_LOL AS lol
					ON lol.Ledger_Tally_Id = rwc.ERP_Id
				WHERE Latest_Closing_Date IS NOT NULL OR Latest_Delivery_Date IS NOT NULL
				ORDER BY Retailer_Name;`
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
						sdi.Item_Rate AS Product_Rate,
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
				), JoinedLatestPerItem AS (
					SELECT 
						COALESCE(FS.Retailer_Id, FD.Retailer_Id) AS Retailer_Id,
						COALESCE(FS.Item_Id, FD.Item_Id) AS Item_Id,
						FS.ST_Date,
						FD.Do_Date,
						FS.ST_Id,
						FD.Do_Id,
						FS.ST_Qty,
						FD.Bill_Qty,
						FS.Product_Rate AS ClosingRate,
						FD.Product_Rate AS DeliveryRate,
						CASE 
							WHEN FS.ST_Date IS NOT NULL AND (FD.Do_Date IS NULL OR FS.ST_Date > FD.Do_Date) THEN 
								ISNULL(FS.ST_Qty, 0) * ISNULL(FS.Product_Rate, 0)
							WHEN FS.ST_Date IS NOT NULL AND FD.Do_Date IS NOT NULL AND FS.ST_Date <= FD.Do_Date THEN
								ISNULL(FS.ST_Qty, 0) * ISNULL(FS.Product_Rate, 0) + ISNULL(FD.Bill_Qty, 0) * ISNULL(FD.Product_Rate, 0)
							WHEN FS.ST_Date IS NULL AND FD.Do_Date IS NOT NULL THEN 
								ISNULL(FD.Bill_Qty, 0) * ISNULL(FD.Product_Rate, 0)
							ELSE 0
						END AS StockValueOfItem
					FROM FilteredStock FS
					FULL OUTER JOIN FilteredDelivery FD 
						ON FS.Retailer_Id = FD.Retailer_Id AND FS.Item_Id = FD.Item_Id
				), FinalRetailerSummary AS (
					SELECT 
						R.Retailer_Id,
						R.Retailer_Name,
						MAX(J.ST_Date) AS Latest_Closing_Date,
						MAX(J.Do_Date) AS Latest_Delivery_Date,
						SUM(ISNULL(FS.ST_Qty, 0) * ISNULL(FS.Product_Rate, 0)) AS total_stock_value,
						SUM(ISNULL(FD.Bill_Qty, 0) * ISNULL(FD.Product_Rate, 0)) AS total_delivery_value,
						MAX(J.ST_Id) AS Latest_Closing_Id,
						MAX(J.Do_Id) AS Latest_Delivery_Id,
						SUM(J.StockValueOfItem) AS liveStockValue
					FROM tbl_Retailers_Master R
					LEFT JOIN JoinedLatestPerItem J ON J.Retailer_Id = R.Retailer_Id
					LEFT JOIN FilteredStock FS ON FS.Retailer_Id = R.Retailer_Id AND FS.Item_Id = J.Item_Id
					LEFT JOIN FilteredDelivery FD ON FD.Retailer_Id = R.Retailer_Id AND FD.Item_Id = J.Item_Id
					GROUP BY R.Retailer_Id, R.Retailer_Name, R.ERP_Id
				)
				SELECT rwc.*,
					sal.UserId AS salesPersonId,
					del.Cost_Center_Id AS deliveryPersonId,
					COALESCE(sal.Name, '-') AS salesPerson,
					COALESCE(del.Cost_Center_Name, '-') AS deliveryPerson
				FROM FinalRetailerSummary as rwc
					LEFT JOIN tbl_Sales_Delivery_Gen_Info AS sdgi ON
						sdgi.Do_Id = rwc.Latest_Delivery_Id
					LEFT JOIN tbl_ERP_Cost_Center AS del ON
						del.Cost_Center_Id = sdgi.Delivery_Person_Id
					LEFT JOIN tbl_Closing_Stock_Gen_Info AS csgi ON
						csgi.ST_Id = rwc.Latest_Closing_Id
					LEFT JOIN tbl_Users AS sal ON
						sal.UserId = csgi.Created_by
				WHERE Latest_Closing_Date IS NOT NULL OR Latest_Delivery_Date IS NOT NULL
				ORDER BY Retailer_Name;`
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

const losBasedReport = async (req, res) => {
	try {

		const
			Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
			Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

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
						sdi.Item_Rate AS Product_Rate,
						ROW_NUMBER() OVER (
							PARTITION BY sdgi.Retailer_Id, sdi.Item_Id
							ORDER BY sdgi.Do_Date DESC
						) AS rn
					FROM tbl_Sales_Delivery_Stock_Info sdi
					JOIN tbl_Sales_Delivery_Gen_Info sdgi ON sdi.Delivery_Order_Id = sdgi.Do_Id
					WHERE 
						sdgi.Do_Date BETWEEN @Fromdate AND @Todate
						AND sdi.Bill_Qty > 0
				), LatestClosingPerItem AS (
					SELECT 
						csgi.Retailer_Id,
						csi.Item_Id,
						csgi.ST_Id,
						csgi.ST_Date,
						csi.ST_Qty,
						P.Product_Rate,
						ROW_NUMBER() OVER (
							PARTITION BY csgi.Retailer_Id, csi.Item_Id
							ORDER BY csgi.ST_Date DESC
						) AS rn
					FROM tbl_Closing_Stock_Info csi
					JOIN tbl_Closing_Stock_Gen_Info csgi ON csi.ST_Id = csgi.ST_Id
					JOIN tbl_Product_Master P ON P.Product_Id = csi.Item_Id
					WHERE 
						csgi.ST_Date BETWEEN @Fromdate AND @Todate
						AND csi.ST_Qty > 0
				), FilteredStock AS (
					SELECT * FROM LatestClosingPerItem WHERE rn = 1
				), FilteredDelivery AS (
					SELECT * FROM LatestDeliveryPerItem WHERE rn = 1
				), JoinedLatestPerItem AS (
					SELECT 
						COALESCE(FS.Item_Id, FD.Item_Id) AS Item_Id,
						FS.ST_Date,
						FD.Do_Date,
						FS.ST_Qty,
						FD.Bill_Qty,
						FS.Product_Rate AS ClosingRate,
						FD.Product_Rate AS DeliveryRate,
						CASE 
							WHEN FS.ST_Date IS NOT NULL AND (FD.Do_Date IS NULL OR FS.ST_Date > FD.Do_Date) THEN 
								ISNULL(FS.ST_Qty, 0) * ISNULL(FS.Product_Rate, 0)
							WHEN FS.ST_Date IS NOT NULL AND FD.Do_Date IS NOT NULL AND FS.ST_Date <= FD.Do_Date THEN
								ISNULL(FS.ST_Qty, 0) * ISNULL(FS.Product_Rate, 0) + ISNULL(FD.Bill_Qty, 0) * ISNULL(FD.Product_Rate, 0)
							WHEN FS.ST_Date IS NULL AND FD.Do_Date IS NOT NULL THEN 
								ISNULL(FD.Bill_Qty, 0) * ISNULL(FD.Product_Rate, 0)
							ELSE 0
						END AS StockValueOfItem,
						CASE 
							WHEN FS.ST_Date IS NOT NULL AND (FD.Do_Date IS NULL OR FS.ST_Date > FD.Do_Date) THEN 
								ISNULL(FS.ST_Qty, 0)
							WHEN FS.ST_Date IS NOT NULL AND FD.Do_Date IS NOT NULL AND FS.ST_Date <= FD.Do_Date THEN
								ISNULL(FS.ST_Qty, 0) + ISNULL(FD.Bill_Qty, 0)
							WHEN FS.ST_Date IS NULL AND FD.Do_Date IS NOT NULL THEN 
								ISNULL(FD.Bill_Qty, 0)
							ELSE 0
						END AS StockQuantityOfItem
					FROM FilteredStock FS
					FULL OUTER JOIN FilteredDelivery FD ON FS.Retailer_Id = FD.Retailer_Id AND FS.Item_Id = FD.Item_Id
				), FinalProductSummary AS (
					SELECT 
						P.Product_Id,
						SUM(J.StockValueOfItem) AS StockValueOfItem,
						SUM(J.StockQuantityOfItem) AS StockQuantityOfItem,
						MAX(J.ST_Date) AS Latest_Closing_Date,
						MAX(J.Do_Date) AS Latest_Delivery_Date
					FROM JoinedLatestPerItem J
					JOIN tbl_Product_Master P ON P.Product_Id = J.Item_Id
					GROUP BY P.Product_Id
				)
				SELECT 
					fps.*,
					P.Product_Name,
				    COALESCE(P.Short_Name, '-') AS Short_Name,
					COALESCE(P.Product_Rate, 0) AS Product_Rate,
					P.ERP_Id,
					P.Brand,
					COALESCE(b.Brand_Name, '-') AS Brand_Name,
					COALESCE(los.Stock_Item, '-') AS Stock_Item,
					COALESCE(los.Group_ST, '-') AS Group_ST,
					COALESCE(los.Bag, '-') AS Bag,
					COALESCE(los.Stock_Group, '-') AS Stock_Group,
					COALESCE(los.S_Sub_Group_1, '-') AS S_Sub_Group_1,
					COALESCE(los.Grade_Item_Group, '-') AS Grade_Item_Group,
					COALESCE(los.Item_Name_Modified, '-') AS Item_Name_Modified,
					COALESCE(los.POS_Group, '-') AS POS_Group,
					COALESCE(los.POS_Item_Name, '-') AS POS_Item_Name
				FROM FinalProductSummary AS fps
				LEFT JOIN tbl_Product_Master AS P
					ON P.Product_Id = fps.Product_Id
				LEFT JOIN tbl_Brand_Master AS b
					ON b.Brand_Id = P.Brand
				LEFT JOIN tbl_Stock_LOS AS los
					ON los.Stock_Tally_Id = P.ERP_Id
				ORDER BY Product_Name;`
			);

		const result = await request;

		if (result.recordset.length > 0) {
			const withValidValues = result.recordset.map(row => ({
				...row,
				deliveryDisplayDate: row?.Latest_Delivery_Date ? LocalDate(row?.Latest_Delivery_Date) : '',
				closingDisplayDate: row?.Latest_Closing_Date ? LocalDate(row?.Latest_Closing_Date) : '',
				entryDays: row?.Latest_Delivery_Date ? getDaysBetween(row?.Latest_Delivery_Date, ISOString()) : '',
				updateDays: row?.Latest_Closing_Date ? getDaysBetween(row?.Latest_Closing_Date, ISOString()) : '',
			}));

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
	ledgerClosingStock,
	ledgerBasedClosingStock,
	ledgerSalesPersonGroupingClosingStock,
	ledgerBasedClosingStockWithLOL,
	losBasedReport
}