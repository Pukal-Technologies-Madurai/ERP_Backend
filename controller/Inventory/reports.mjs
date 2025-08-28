import sql from 'mssql'
import { servError, sentData } from '../../res.mjs';
import { isEqualNumber, ISOString } from '../../helper_functions.mjs';

const getInventoryReport = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const fromDateStr = Fromdate.split('T')[0];
        const [year, month, day] = fromDateStr.split('-').map(Number);

        const yesterday = `${year}-${month.toString().padStart(2, '0')}-${(day - 1).toString().padStart(2, '0')}T00:00:00.000Z`;
        const oneWeekAgo = `${year}-${month.toString().padStart(2, '0')}-${(day - 7).toString().padStart(2, '0')}T00:00:00.000Z`;
        const oneMonthAgo = `${year}-${(month - 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T00:00:00.000Z`;

        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .input('Stock_Group_Id', 0)
            .input('Item_Id', 0);
        const result = await request.execute('Stock_Summarry_Search');

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

        const uniqueItemGroupIdArray = [...new Set(filteredData.map(row => row?.Item_Group_Id).filter(Boolean))];

        const getProductLosData = new sql.Request()
            .input('filterItems', sql.NVarChar('max'), uniqueItemGroupIdArray.join(', '))
            .query(`
                WITH FilteredProducts AS (
                    SELECT TRY_CAST(value AS INT) AS Product_Id
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
                JOIN tbl_Stock_LOS AS los ON los.Stock_Tally_Id = p.ERP_Id
                WHERE (
                    @filterItems IS NULL 
                    OR LTRIM(RTRIM(@filterItems)) = '' 
                    OR p.Product_Id IN (SELECT DISTINCT Product_Id FROM FilteredProducts)
                );
            `);
        const productLosResult = (await getProductLosData).recordset;

        const losMap = {};
        productLosResult.forEach(p => {
            losMap[p.Product_Id] = p;
        });

        const uniqueProductIdsRaw = [...new Set(filteredData.map(row => row?.Product_Id))];
        const uniqueProductIds = uniqueProductIdsRaw
            .map(id => parseInt(id, 10))
            .filter(id => !Number.isNaN(id));

        let deliverySumMap = {};

        if (uniqueProductIds.length > 0) {
            const productIdsString = uniqueProductIds.join(',');


            const deliverySumQuery = `
          SELECT
    Item_Id AS Product_Id,
    SUM(CASE WHEN Do_Date >= @monthStart AND Do_Date <= @today THEN Act_Qty ELSE 0 END) AS OneMonth_Qty,
    SUM(CASE WHEN Do_Date >= @monthStart AND Do_Date <= @today THEN Act_Qty ELSE 0 END) / 30.0 AS OneMonth_Act_Qty,
    SUM(CASE WHEN Do_Date >= @weekStart AND Do_Date <= @today THEN Act_Qty ELSE 0 END) AS OneWeek_Qty,
    SUM(CASE WHEN Do_Date >= @weekStart AND Do_Date <= @today THEN Act_Qty ELSE 0 END) / 7.0 AS OneWeek_Act_Qty,
    SUM(CASE WHEN Do_Date = @yesterday THEN Act_Qty ELSE 0 END) AS Yesterday_Act_Qty
FROM tbl_Sales_Delivery_Stock_Info
WHERE Item_Id IN (${productIdsString})
GROUP BY Item_Id;
            `;

            const deliveryRequest = new sql.Request()
                .input('monthStart', sql.DateTime, oneMonthAgo)
                .input('weekStart', sql.DateTime, oneWeekAgo)
                .input('yesterday', sql.DateTime, yesterday)
                .input('today', sql.DateTime, Fromdate);

            const deliveryResult = await deliveryRequest.query(deliverySumQuery);
            const deliverySumsResult = deliveryResult.recordset;

            deliverySumsResult.forEach(row => {
                deliverySumMap[row.Product_Id] = row;
            });
        }

        const mergedData = filteredData.map(row => {
            const los = losMap[row.Product_Id] || {};
            const delivery = deliverySumMap[row.Product_Id] || {};

            return {
                ...row,
                Product_Rate: los.Product_Rate || 0,
                Stock_Item: los.Stock_Item || '',
                Group_ST: los.Group_ST || '',
                Bag: los.Bag || '',
                Stock_Group: los.Stock_Group || '',
                S_Sub_Group_1: los.S_Sub_Group_1 || '',
                Grade_Item_Group: los.Grade_Item_Group || '',
                Item_Name_Modified: los.Item_Name_Modified || '',
                OneMonth_Act_Qty: Number(delivery.OneMonth_Act_Qty) || 0,
                OneWeek_Act_Qty: Number(delivery.OneWeek_Act_Qty) || 0,
                Yesterday_Act_Qty: Number(delivery.Yesterday_Act_Qty) || 0
            };
        });

        sentData(res, mergedData);

    } catch (e) {
        servError(e, res);
    }
};


export default {
    getInventoryReport,
}