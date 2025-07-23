import sql from "mssql";
import { sentData, servError, success } from "../../res.mjs";
import {
    checkIsNumber,
    Division,
    ISOString,
    toArray,
    toNumber,
} from "../../helper_functions.mjs";
import { getNextId } from "../../middleware/miniAPIs.mjs";



const nakalSalesReport = async (req, res) => {
    try {
        const Fromdate = req.query?.FromDate
            ? ISOString(req.query?.FromDate)
            : ISOString();
        const Todate = req.query?.ToDate
            ? ISOString(req.query?.ToDate)
            : ISOString();
        const broker = req.query.broker;

        const request = new sql.Request()
            .input("Fromdate", sql.Date, Fromdate)
            .input("Todate", sql.Date, Todate)
            .input("broker", sql.Int, broker).query(`
    WITH BrokerInfo AS (
    SELECT 
        s.Do_Id,
        s.Emp_Id AS CostCenterId,
        s.Emp_Type_Id AS CostTypeId,
        cc.Cost_Category AS CostTypeGet,
        ec.Cost_Center_Name AS CostCenterGet
    FROM tbl_Sales_Delivery_Staff_Info s
    JOIN tbl_ERP_Cost_Category cc ON cc.Cost_Category_Id = s.Emp_Type_Id
    JOIN tbl_ERP_Cost_Center ec ON ec.Cost_Center_Id = s.Emp_Id
    WHERE cc.Cost_Category LIKE '%BROKER%'
)

SELECT DISTINCT
    pigi.Do_Id, 
    pigi.Do_Inv_No, 
    pigi.Voucher_Type, 
    pigi.Do_Date AS Date, 
    pigi.Retailer_Id,
    pigi.Narration,
    COALESCE(r.Retailer_Name, 'Not found') AS Retailer_Name,
   CAST(ISNULL(pck.Pack, 0) AS DECIMAL(18, 2)) AS Pack,
    pisi.Item_Id AS Product_Id,
    COALESCE(p.Product_Name, 'Not found') AS Product_Name,
   CASE 
        WHEN ISNULL(TRY_CAST(pck.Pack AS DECIMAL(18,2)), 0) = 0 THEN 0
        ELSE ISNULL(pisi.Act_Qty, 0) / CAST(ISNULL(pck.Pack, 0) AS DECIMAL(18,2))
        END AS displayQuantity,
    COALESCE(pisi.Bill_Qty, 0) AS Bill_Qty,
    COALESCE(pisi.Act_Qty, 0) AS Act_Qty,
    COALESCE(pisi.Item_Rate, 0) AS Item_Rate,
    COALESCE(pisi.Amount, 0) AS Amount,
    COALESCE(br.Brokerage, 0) AS Brokerage,
    COALESCE(br.Coolie, 0) AS Coolie,
    bi.CostCenterId,
    COALESCE(bi.CostCenterGet, 'Not found') AS CostCenterGet,
    bi.CostTypeId,
    COALESCE(bi.CostTypeGet, 'Not found') AS CostTypeGet,
    COALESCE(v.Voucher_Type, 'Not found') AS VoucherGet,
    COALESCE(nd.Vilaivasi_Rate, 0) AS Vilaivasi_Rate,
    COALESCE(nd.Vilai_Vasi, 0) AS Vilai_Vasi,
    COALESCE(nd.Brok_Rate, 0) AS Brok_Rate,
    COALESCE(nd.Brok_Amt, 0) AS Brok_Amt,
    COALESCE(nd.Coolie_Rate, 0) AS Coolie_Rate,
    COALESCE(nd.Coolie_Amt, 0) AS Coolie_Amt
FROM tbl_Sales_Delivery_Gen_Info AS pigi
LEFT JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = pigi.Retailer_Id
LEFT JOIN tbl_Sales_Delivery_Stock_Info AS pisi ON pisi.Delivery_Order_Id = pigi.Do_Id
LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = pisi.Item_Id
LEFT JOIN tbl_Pack_Master AS pck ON pck.Pack_Id=p.Pack_Id
LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = pigi.Voucher_Type
LEFT JOIN tbl_Brokerage AS br ON br.Product_Id = pisi.Item_Id
LEFT JOIN tbl_Nakal_Data nd ON nd.Do_Id = pigi.Do_Id AND nd.Product_Id = pisi.Item_Id
LEFT JOIN BrokerInfo bi ON bi.Do_Id = pigi.Do_Id
WHERE 
    pigi.Cancel_status != 0
    AND nd.Do_Id IS NULL 
   AND pigi.Do_Date BETWEEN @Fromdate AND @Todate
    AND bi.Do_Id IS NOT NULL
    ${checkIsNumber(broker) ? " AND bi.CostCenterId = @broker " : ""}
          `);

        const result = await request;
        sentData(res, toArray(result.recordset));
    } catch (e) {
        servError(e, res);
    }
};


const postNakalReport = async (req, res) => {
    try {
        const nakalData = req.body;

        if (!Array.isArray(nakalData) || nakalData.length === 0) {
            return invalidInput(res, "Nakal data array is required");
        }

        let insertedCount = 0;

        for (let item of nakalData) {
            const {
                CostCenterId,
                Product_Id,
                Pack,
                Bill_Qty,
                Act_Qty,
                Item_Rate,
                Amount,
                Vilaivasi_Rate,
                Vilai_Vasi,
                Brok_Rate,
                Brok_Amt,
                Coolie_Rate,
                Coolie_Amt,
                Date: Do_Date,
                Do_Inv_No,
                Do_Id,
                Narration,
                Created_By,
                Retailer_Id,
            } = item;

            const getMaxId = await getNextId({
                table: "tbl_Nakal_Data",
                column: "Id",
            });
            if (!checkIsNumber(getMaxId.MaxId)) {
                return failed(res, "Error generating State ID");
            }
            const request = new sql.Request()
                .input("Id", getMaxId.MaxId)
                .input("Broker_Id", CostCenterId)
                .input("Product_Id", Product_Id)
                .input("Retailer_Id", Retailer_Id)
                .input("Pack", Pack)
                .input("Bill_Qty", Bill_Qty)
                .input("Act_Qty", Act_Qty)
                .input("Item_Rate", Item_Rate)
                .input("Amount", Amount)
                .input("Vilaivasi_Rate", Vilaivasi_Rate)
                .input("Vilai_Vasi", Vilai_Vasi)
                .input("Brok_Rate", Brok_Rate)
                .input("Brok_Amt", Brok_Amt)
                .input("Coolie_Rate", Coolie_Rate)
                .input("Coolie_Amt", Coolie_Amt)
                .input("Date", Do_Date)
                .input("Do_Inv_No", Do_Inv_No)
                .input("Do_Id", Do_Id)
                .input("Narration", Narration)
                .input("Created_By", Created_By)
                .input("Created_At", new global.Date());

            const result = await request.query(`
        INSERT INTO tbl_Nakal_Data (
          Id,Broker_Id, Product_Id, Pack, Bill_Qty, Act_Qty, Item_Rate, Amount,
          Vilaivasi_Rate, Vilai_Vasi, Brok_Rate, Brok_Amt,
          Coolie_Rate, Coolie_Amt, Date, Do_Inv_No, Do_Id,
          Narration, Created_By, Created_At,Retailer_Id
        )
        VALUES (
         @Id, @Broker_Id, @Product_Id, @Pack, @Bill_Qty, @Act_Qty, @Item_Rate, @Amount,
          @Vilaivasi_Rate, @Vilai_Vasi, @Brok_Rate, @Brok_Amt,
          @Coolie_Rate, @Coolie_Amt, @Date, @Do_Inv_No, @Do_Id,
          @Narration, @Created_By, @Created_At,@Retailer_Id
        )
      `);

            if (result.rowsAffected[0] > 0) insertedCount++;
        }

        success(res, `Nakal report entries saved successfully`);
    } catch (e) {
        servError(e, res);
    }
};

const getNakalReport = async (req, res) => {
    try {
        const { FromDate, ToDate, broker, ledger, item } = req.query;
        const request = new sql.Request();

        if (FromDate) request.input("FromDate", sql.Date, new Date(FromDate));
        if (ToDate) request.input("ToDate", sql.Date, new Date(ToDate));

        if (broker && !isNaN(broker)) {
            request.input("broker", sql.Int, parseInt(broker));
        }
        if (ledger && !isNaN(ledger)) {
            request.input("ledger", sql.Int, parseInt(ledger));
        }
        if (item && !isNaN(item)) {
            request.input("Item", sql.Int, parseInt(item));
        }
        const query = `
  SELECT 
    outerNk.Broker_Id,
    ecc.Cost_Center_Name AS Broker_Name,
    SUM(CASE 
          WHEN ISNULL(TRY_CAST(outerNk.Pack AS DECIMAL(18,2)), 0) = 0 THEN 0
          WHEN outerNk.Act_Qty IS NULL THEN 0
          ELSE ISNULL(outerNk.Act_Qty, 0) / CAST(ISNULL(outerNk.Pack, 0) AS DECIMAL(18,2))
        END) AS Total_Qty,
    SUM(ISNULL(outerNk.Act_Qty, 0)) AS Total_KGS,
    SUM(ISNULL(outerNk.Amount, 0)) AS Total_Amount,
    SUM(ISNULL(outerNk.Vilai_Vasi, 0)) AS Broker_Exp,
    SUM(ISNULL(outerNk.Vilaivasi_Rate,0)) AS VilaiVasi,
    COUNT(outerNk.Broker_Id) AS Total_Bags,
    COALESCE((
      SELECT
        rm.Retailer_Name,
        LL.Ledger_Name,
        ll.Ledger_Tally_Id,
        ll.Ledger_Alias,
        nd.Do_Inv_No,
        nd.Date,
        pm.Product_Name,
        pm.Product_Id,
        pm.Short_Name,
        nd.Amount,
        nd.Brok_Rate,
        nd.Item_Rate,
	    	nd.Brok_Amt,
		    nd.Coolie_Rate,
		    nd.Coolie_Amt,
        CASE 
          WHEN ISNULL(TRY_CAST(nd.Pack AS DECIMAL(18,2)), 0) = 0 THEN 0
          WHEN nd.Act_Qty IS NULL THEN 0
          ELSE ISNULL(nd.Act_Qty, 0) / CAST(ISNULL(nd.Pack, 0) AS DECIMAL(18,2))
        END AS QTY,
        nd.Act_Qty AS KGS,
        nd.Vilai_Vasi,
        nd.Vilaivasi_Rate
      FROM tbl_Nakal_Data nd
      LEFT JOIN tbl_Product_Master pm ON pm.Product_Id = nd.Product_Id
      LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id = nd.Retailer_Id
      LEFT JOIN tbl_Ledger_LOL ll ON ll.Ledger_Tally_Id = rm.ERP_Id
        WHERE 
        nd.Broker_Id = outerNk.Broker_Id
        AND (@FromDate IS NULL OR CONVERT(DATE, nd.Date) >= @FromDate)
        AND (@ToDate IS NULL OR CONVERT(DATE, nd.Date) <= @ToDate)
        ${broker && !isNaN(broker) ? "AND nd.Broker_Id = @broker" : ""}
        ${ledger && !isNaN(ledger) ? "AND rm.ERP_Id = @ledger" : ""} 
        ${item && !isNaN(item) ? "AND  pm.Product_Id = @item" : ""} 
      ORDER BY nd.Date DESC, nd.Do_Inv_No
      FOR JSON PATH
    ), '[]') AS Items

  FROM tbl_Nakal_Data outerNk
  LEFT JOIN tbl_ERP_Cost_Center ecc ON ecc.Cost_Center_Id = outerNk.Broker_Id
  WHERE 
    (@FromDate IS NULL OR CONVERT(DATE, outerNk.Date) >= @FromDate)
    AND (@ToDate IS NULL OR CONVERT(DATE, outerNk.Date) <= @ToDate)
    ${broker && !isNaN(broker) ? "AND outerNk.Broker_Id = @broker" : ""}
    ${ledger && !isNaN(ledger)
                ? "AND outerNk.Retailer_Id IN (SELECT Retailer_Id FROM tbl_Retailers_Master WHERE ERP_Id = @ledger)"
                : ""
            }
    ${item && !isNaN(item) ? "AND outerNk.Product_Id = @item" : ""}
  GROUP BY outerNk.Broker_Id, ecc.Cost_Center_Name
  ORDER BY ecc.Cost_Center_Name

    `;

        const result = await request.query(query);
        const rows = result.recordset.map((row) => ({
            Broker_Id: row.Broker_Id,
            Broker_Name: row.Broker_Name,
            Total_Qty: Number(row.Total_Qty || 0).toFixed(2),
            Total_KGS: Number(row.Total_KGS || 0).toFixed(2),
            Total_Amount: Number(row.Total_Amount || 0).toFixed(2),
            Broker_Exp: Number(row.Broker_Exp || 0).toFixed(2),
            VilaiVasi: Number(row.VilaiVasi || 0).toFixed(2),
            Total_Bags: Number(row.Total_Bags || 0),
            Items: JSON.parse(row.Items || "[]"),
        }));

        sentData(res, rows);
    } catch (e) {
        console.error("Error in getNakalReport:", e);
        servError(e, res);
    }
};
export default {
    nakalSalesReport,
    postNakalReport,
    getNakalReport,
};
