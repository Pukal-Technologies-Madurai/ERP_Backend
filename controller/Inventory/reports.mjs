import sql from 'mssql';
import { servError, sentData } from '../../res.mjs';
import { isEqualNumber, ISOString } from '../../helper_functions.mjs';

const getInventoryReport = async (req, res) => {
    try {

        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const fromDateObj = new Date(Fromdate);
        const yesterdayObj = new Date(fromDateObj);
        yesterdayObj.setDate(fromDateObj.getDate() - 1);
        const oneWeekAgoObj = new Date(fromDateObj);
        oneWeekAgoObj.setDate(fromDateObj.getDate() - 7);
        const oneMonthAgoObj = new Date(fromDateObj);
        oneMonthAgoObj.setMonth(fromDateObj.getMonth() - 1);

        const stockRequest = new sql.Request()
            .input('Fromdate', sql.DateTime, Fromdate)
            .input('Todate', sql.DateTime, Todate)
            .input('Stock_Group_Id', 0)
            .input('Item_Id', 0);
        const stockResult = await stockRequest.execute('Stock_Summarry_Search');

        const filteredData = stockResult.recordset.filter(
            row =>
                !(
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


        const productLosQuery = `
      WITH FilteredProducts AS (
        SELECT TRY_CAST(value AS INT) AS Product_Id
        FROM STRING_SPLIT(@filterItems, ',')
        WHERE TRY_CAST(value AS INT) IS NOT NULL
      ),
      LOS_Ranked AS (
        SELECT los.*,
               ROW_NUMBER() OVER (PARTITION BY los.Stock_Tally_Id ORDER BY los.Stock_Tally_Id) AS rn
        FROM tbl_Stock_LOS AS los
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
      LEFT JOIN LOS_Ranked AS los
        ON los.Stock_Tally_Id = p.ERP_Id AND los.rn = 1
      WHERE (@filterItems IS NULL OR LTRIM(RTRIM(@filterItems)) = '' OR p.Product_Id IN (SELECT DISTINCT Product_Id FROM FilteredProducts))
    `;

        const productLosData = await new sql.Request()
            .input('filterItems', sql.NVarChar('max'), uniqueItemGroupIdArray.join(','))
            .query(productLosQuery);

        const losMap = {};
        productLosData.recordset.forEach(p => {
            losMap[p.Product_Id] = p;
        });


        const uniqueProductIds = [...new Set(filteredData.map(r => parseInt(r.Product_Id, 10)).filter(Boolean))];
        const deliverySumMap = {};
        if (uniqueProductIds.length > 0) {
            const deliveryQuery = `
        SELECT
          Item_Id AS Product_Id,
          SUM(CASE WHEN Do_Date >= @monthStart AND Do_Date <= @today THEN Act_Qty ELSE 0 END) / 30.0 AS OneMonth_Act_Qty,
          SUM(CASE WHEN Do_Date >= @weekStart AND Do_Date <= @today THEN Act_Qty ELSE 0 END) / 7.0 AS OneWeek_Act_Qty,
          SUM(CASE WHEN Do_Date = @yesterday THEN Act_Qty ELSE 0 END) AS Yesterday_Act_Qty
        FROM tbl_Sales_Delivery_Stock_Info
        WHERE Item_Id IN (${uniqueProductIds.join(',')})
        GROUP BY Item_Id
      `;
            const deliveryData = await new sql.Request()
                .input('monthStart', sql.DateTime, oneMonthAgoObj)
                .input('weekStart', sql.DateTime, oneWeekAgoObj)
                .input('yesterday', sql.DateTime, yesterdayObj)
                .input('today', sql.DateTime, fromDateObj)
                .query(deliveryQuery);

            deliveryData.recordset.forEach(d => {
                deliverySumMap[d.Product_Id] = d;
            });
        }

        const mergedMap = new Map();
        filteredData.forEach(row => {
            const productId = parseInt(row.Product_Id, 10);
            if (!mergedMap.has(productId)) {
                const los = losMap[productId] || {};
                const delivery = deliverySumMap[productId] || {};
                mergedMap.set(productId, {
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
                });
            }
        });

        sentData(res, Array.from(mergedMap.values()));
    } catch (e) {
        servError(e, res);
    }
};

export default { getInventoryReport };
