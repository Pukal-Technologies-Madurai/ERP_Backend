import sql from 'mssql';
import { dataFound, failed, invalidInput, noData, sentData, servError, success } from '../../res.mjs';
import { Addition, checkIsNumber, toNumber } from '../../helper_functions.mjs';



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


export default {
	getSoldItems,
	searchWhoHasTheItem,
}