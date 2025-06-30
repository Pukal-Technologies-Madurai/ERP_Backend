import sql from 'mssql';
import { servError, sentData } from '../../res.mjs'
import { isEqualNumber, ISOString } from '../../helper_functions.mjs';


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

export default {
    getStorageStockItemWise,
}