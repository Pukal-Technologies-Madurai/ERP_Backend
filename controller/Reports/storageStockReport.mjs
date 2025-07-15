import sql from 'mssql';
import { servError, sentData, noData, dataFound } from '../../res.mjs'
import { Addition, Division, groupData, isEqualNumber, ISOString, toArray } from '../../helper_functions.mjs';


const getStorageStockItemWise = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .input('Stock_Group_Id', 0)
            .input('Item_Id', 0)
            .execute('Stock_Summarry_Search');

        const result = await request;

        const filteredData = result.recordset.filter(
            row => !(
                isEqualNumber(row?.OB_Act_Qty, 0) &&
                isEqualNumber(row?.Pur_Act_Qty, 0) &&
                isEqualNumber(row?.Sal_Act_Qty, 0) &&
                isEqualNumber(row?.Bal_Act_Qty, 0) &&
                isEqualNumber(row?.OB_Bal_Qty, 0) &&
                isEqualNumber(row?.Pur_Qty, 0) &&
                isEqualNumber(row?.Sal_Qty, 0) &&
                isEqualNumber(row?.Bal_Qty, 0)
            )
        );

        const uniqueItemIdArray = [...new Set(
            filteredData.map(row => row?.Item_Group_Id)
        )];

        const getProductLosData = new sql.Request()
            .input(
                'filterItems',
                sql.NVarChar('max'),
                uniqueItemIdArray.map(item => item).join(', ')
            ).query(`
                WITH FilteredProducts AS (
                    SELECT 
                        TRY_CAST(value AS INT) AS Product_Id
                    FROM STRING_SPLIT(@filterItems, ',')
                    WHERE TRY_CAST(value AS INT) IS NOT NULL
                )
                SELECT 
                	p.Product_Id, 
                	p.Product_Name, 
                	p.ERP_Id,
                	p.Product_Rate,
                    COALESCE(los.Stock_Item, '-') AS Stock_Item,
                	COALESCE(los.Group_ST, '-') AS Group_ST,
                	COALESCE(los.Bag, '-') AS Bag,
                	COALESCE(los.Stock_Group, '-') AS Stock_Group,
                	COALESCE(los.S_Sub_Group_1, '-') AS S_Sub_Group_1,
                	COALESCE(los.Grade_Item_Group, '-') AS Grade_Item_Group,
                	COALESCE(los.Item_Name_Modified, '-') AS Item_Name_Modified
                FROM tbl_Product_Master AS p
                JOIN tbl_Stock_LOS AS los
                ON los.Stock_Tally_Id = p.ERP_Id
                WHERE (
                        @filterItems IS NULL 
                        OR LTRIM(RTRIM(@filterItems)) = '' 
                        OR P.Product_Id IN (SELECT DISTINCT Product_Id FROM FilteredProducts)
                );`
            );

        const productLosResult = (await getProductLosData).recordset;

        const mergeLosData = filteredData.map(row => {
            const {
                Product_Rate = 0, Stock_Item = '', Group_ST = '', Bag = '',
                Stock_Group = '', S_Sub_Group_1 = '', Grade_Item_Group = '',
                Item_Name_Modified = ''
            } = productLosResult.find(
                productDetails => isEqualNumber(
                    productDetails.Product_Id,
                    row?.Product_Id
                )
            ) || {};

            return {
                ...row,
                Product_Rate, Stock_Item, Group_ST, Bag,
                Stock_Group, S_Sub_Group_1, Grade_Item_Group,
                Item_Name_Modified
            }
        });

        sentData(res, mergeLosData);
    } catch (e) {
        servError(e, res);
    }
}

const getStorageStockGodownWise = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .input('Godown_Id', 0)
            .input('Item_Id', 0)
            .execute('Stock_Summarry_Search_Godown_New');

        const result = await request;

        const filteredData = result.recordset.filter(
            row => !(
                isEqualNumber(row?.OB_Act_Qty, 0) &&
                isEqualNumber(row?.Pur_Act_Qty, 0) &&
                isEqualNumber(row?.Sal_Act_Qty, 0) &&
                isEqualNumber(row?.OB_Bal_Qty, 0) &&
                isEqualNumber(row?.Pur_Qty, 0) &&
                isEqualNumber(row?.Sal_Qty, 0) &&
                isEqualNumber(row?.Bal_Qty, 0) &&
                isEqualNumber(row?.Act_Bal_Qty, 0)
            )
        );

        const uniqueItemIdArray = [...new Set(
            filteredData.map(row => row?.Item_Group_Id)
        )];

        const getProductLosData = new sql.Request()
            .input(
                'filterItems',
                sql.NVarChar('max'),
                uniqueItemIdArray.map(item => item).join(', ')
            ).query(`
                WITH FilteredProducts AS (
                    SELECT 
                        TRY_CAST(value AS INT) AS Product_Id
                    FROM STRING_SPLIT(@filterItems, ',')
                    WHERE TRY_CAST(value AS INT) IS NOT NULL
                )
                SELECT 
                	p.Product_Id, 
                	p.Product_Name, 
                	p.ERP_Id,
                	p.Product_Rate,
                    COALESCE(los.Stock_Item, '-') AS Stock_Item,
                	COALESCE(los.Group_ST, '-') AS Group_ST,
                	COALESCE(los.Bag, '-') AS Bag,
                	COALESCE(los.Stock_Group, '-') AS Stock_Group,
                	COALESCE(los.S_Sub_Group_1, '-') AS S_Sub_Group_1,
                	COALESCE(los.Grade_Item_Group, '-') AS Grade_Item_Group,
                	COALESCE(los.Item_Name_Modified, '-') AS Item_Name_Modified
                FROM tbl_Product_Master AS p
                JOIN tbl_Stock_LOS AS los
                ON los.Stock_Tally_Id = p.ERP_Id
                WHERE (
                        @filterItems IS NULL 
                        OR LTRIM(RTRIM(@filterItems)) = '' 
                        OR P.Product_Id IN (SELECT DISTINCT Product_Id FROM FilteredProducts)
                );`
            );

        const productLosResult = (await getProductLosData).recordset;

        const mergeLosData = filteredData.map(row => {
            const {
                Product_Rate = 0, Stock_Item = '', Group_ST = '', Bag = '',
                Stock_Group = '', S_Sub_Group_1 = '', Grade_Item_Group = '',
                Item_Name_Modified = ''
            } = productLosResult.find(
                productDetails => isEqualNumber(
                    productDetails.Product_Id,
                    row?.Product_Id
                )
            ) || {};

            return {
                ...row,
                Product_Rate, Stock_Item, Group_ST, Bag,
                Stock_Group, S_Sub_Group_1, Grade_Item_Group,
                Item_Name_Modified
            }
        });

        sentData(res, mergeLosData);
    } catch (e) {
        servError(e, res);
    }
}

const itemGroupWiseClosingDetails = async (req, res) => {
    try {

        const reqDate = req.query?.reqDate ? ISOString(req.query?.reqDate) : ISOString();
        const getMaxOfItemClosingDate = isEqualNumber(req?.query?.getMaxOfItemClosingDate, 1);

        const request = new sql.Request()
            .input('reqDate', reqDate)
            .query(`
                SELECT
                    latest.*,
                	COALESCE(los.Brand, 'not found') AS Brand, 
                    COALESCE(los.Group_ST, 'not found') AS Group_ST, 
                    COALESCE(los.Stock_Group, 'not found') AS Stock_Group, 
                    COALESCE(los.S_Sub_Group_1, 'not found') AS S_Sub_Group_1, 
                    COALESCE(los.Grade_Item_Group, 'not found') AS Grade_Item_Group
                FROM (
                    SELECT DISTINCT Item_Group_Id
                    FROM tbl_Daily_Stock_Value
                ) ig
                OUTER APPLY (
                    SELECT TOP 1 *
                    FROM tbl_Daily_Stock_Value pcs
                    WHERE 
                        pcs.Item_Group_Id = ig.Item_Group_Id
                        ${getMaxOfItemClosingDate ? `
                        AND pcs.Trans_Date <= @reqDate ` : ''}
                    ORDER BY pcs.Trans_Date DESC
                ) AS latest 
                LEFT JOIN ( 
					SELECT 
						DISTINCT Item_Group_Id,
						Brand,Group_ST,
						Stock_Group,
						S_Sub_Group_1,
						Grade_Item_Group 
					FROM tbl_Stock_LOS 
					WHERE  
						Item_Group_Id IS NOT NULL 
						and Item_Group_Id <> 0
				) AS los
                ON los.Item_Group_Id = ig.Item_Group_Id`
            );

        const result = await request;

        sentData(res, result.recordset);

    } catch (e) {
        servError(e, res);
    }
}

const StockGroupWiseClosingDetails = async (req, res) => {
    try {

        const reqDate = req.query?.reqDate ? ISOString(req.query?.reqDate) : ISOString();

        const request = new sql.Request()
            .input('reqDate', reqDate)
            .query(`
                SELECT
                    latest.Item_Group_Id,
                	latest.Group_Name,
                	latest.Trans_Date,
                	COALESCE(los.Brand, 'not found') AS Brand, 
                    COALESCE(los.Group_ST, 'not found') AS Group_ST, 
                    COALESCE(los.Stock_Group, 'not found') AS Stock_Group, 
                    COALESCE(los.S_Sub_Group_1, 'not found') AS S_Sub_Group_1, 
                    COALESCE(los.Grade_Item_Group, 'not found') AS Grade_Item_Group,
                	latest.Bal_Qty AS Bal_Qty,
                	latest.CL_Rate AS CL_Rate,
                	latest.CL_Value AS Stock_Value
                FROM (
                    SELECT DISTINCT Item_Group_Id
                    FROM tbl_Daily_Stock_Value
                ) ig
                OUTER APPLY (
                    SELECT TOP 1 *
                    FROM tbl_Daily_Stock_Value pcs
                    WHERE 
                        pcs.Item_Group_Id = ig.Item_Group_Id
                		AND pcs.Trans_Date <= @reqDate
                    ORDER BY pcs.Trans_Date DESC
                ) AS latest 
                LEFT JOIN ( 
                	SELECT 
                		DISTINCT Item_Group_Id,
                		Brand,Group_ST,
                		Stock_Group,
                		S_Sub_Group_1,
                		Grade_Item_Group 
                	FROM tbl_Stock_LOS 
                	WHERE  
                		Item_Group_Id IS NOT NULL 
                		and Item_Group_Id <> 0
                ) AS los
                ON los.Item_Group_Id = ig.Item_Group_Id`
            );

        const result = (await request).recordset;

        if (result.length > 0) {
            const grouped = groupData(result, 'Stock_Group');

            const calcBalQty = (colmn, arr = []) => toArray(arr).reduce(
                (acc, obj) => Addition(acc, obj[colmn]), 0
            );

            const calculateMean = (colmn, arr = []) => {
                const total = calcBalQty(colmn, arr);
                return Division(total, arr.length)
            }

            const aggregate = grouped.map(({ groupedData, ...rest }) => {
                const arr = toArray(groupedData);

                return {
                    ...rest,
                    product_details: arr,
                    Bal_Qty: calcBalQty('Bal_Qty', arr),
                    CL_Rate: calculateMean('CL_Rate', arr),
                    Stock_Value: calcBalQty('Stock_Value', arr),
                }
            })

            dataFound(res, aggregate);
        } else {
            noData(res)
        }

    } catch (e) {
        servError(e, res);
    }
}

export default {
    getStorageStockItemWise,
    getStorageStockGodownWise,
    itemGroupWiseClosingDetails,
    StockGroupWiseClosingDetails,
}