import sql from 'mssql';
import { sentData, servError } from "../../res.mjs"
import { checkIsNumber, Division, ISOString, toArray, toNumber } from '../../helper_functions.mjs';


const getBrokerInvolvedInPurchase = async (req, res) => {
    try {
        const request = new sql.Request()
            .query(`
                SELECT 
                	distinct pstaff.Involved_Emp_Id AS value,
                	COALESCE(c.Cost_Center_Name, 'Not found') AS label
                FROM tbl_Purchase_Order_Inv_Staff_Details AS pstaff
                LEFT JOIN tbl_ERP_Cost_Center AS c
                	ON c.Cost_Center_Id = pstaff.Involved_Emp_Id
                LEFT JOIN tbl_ERP_Cost_Category AS cc
                	ON cc.Cost_Category_Id = pstaff.Cost_Center_Type_Id
                WHERE 
                    cc.Cost_Category LIKE '%BROKER%'
                	AND pstaff.Involved_Emp_Id <> 0
                ORDER BY label`
            );

        const result = await request;

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
}

const purchaseBrokerageReport = async (req, res) => {

    try {
        const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();
        const broker = req.query.broker;

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('broker', sql.Int, broker)
            .query(`
                SELECT 
                    pigi.PIN_Id, 
                    pigi.Po_Inv_No, 
                    pigi.Voucher_Type, 
                    pigi.Po_Entry_Date, 
                    pigi.Retailer_Id, 
                    pigi.Total_Invoice_value,
                    ISNULL(r.Retailer_Name, 'Not found') AS Retailer_Name,
                    pisi.Item_Id AS Product_Id,
                    ISNULL(p.Product_Name, 'Not found') AS Product_Name,
                    CAST(ISNULL(pck.Pack, 0) AS DECIMAL(18, 2)) AS Pack,
                    ISNULL(pisi.Bill_Qty, 0) AS Bill_Qty,
                    ISNULL(pisi.Act_Qty, 0) AS Act_Qty,
                    ISNULL(pisi.Item_Rate, 0) AS Item_Rate,
                    CASE 
                        WHEN ISNULL(TRY_CAST(pck.Pack AS DECIMAL(18,2)), 0) = 0 THEN 0
                        ELSE ISNULL(pisi.Act_Qty, 0) / CAST(ISNULL(pck.Pack, 0) AS DECIMAL(18,2))
                    END AS displayQuantity,
                	pstaff.Involved_Emp_Id AS CostCenterId,
                	COALESCE(c.Cost_Center_Name, 'Not found') CostCenterGet,
                	pstaff.Cost_Center_Type_Id AS CostTypeId,
                	COALESCE(cc.Cost_Category, 'Not found') AS CostTypeGet,
                	COALESCE(v.Voucher_Type, 'Not found') AS VoucherGet
                FROM tbl_Purchase_Order_Inv_Gen_Info AS pigi
                LEFT JOIN tbl_Retailers_Master AS r
                    ON r.Retailer_Id = pigi.Retailer_Id
                LEFT JOIN tbl_Purchase_Order_Inv_Stock_Info AS pisi
                    ON pisi.PIN_Id = pigi.PIN_Id
                LEFT JOIN tbl_Product_Master AS p
                    ON p.Product_Id = pisi.Item_Id
                LEFT JOIN tbl_Pack_Master AS pck
                    ON pck.Pack_Id = p.Pack_Id
                LEFT JOIN tbl_Purchase_Order_Inv_Staff_Details AS pstaff
                	ON pstaff.PIN_Id = pigi.PIN_Id
                LEFT JOIN tbl_ERP_Cost_Center AS c
                	ON c.Cost_Center_Id = pstaff.Involved_Emp_Id
                LEFT JOIN tbl_ERP_Cost_Category AS cc
                	ON cc.Cost_Category_Id = pstaff.Cost_Center_Type_Id
                LEFT JOIN tbl_Voucher_Type AS v
                	ON v.Vocher_Type_Id = pigi.Voucher_Type
                WHERE 
                	pigi.Cancel_status = 0
                	AND pigi.Po_Entry_Date BETWEEN @Fromdate AND @Todate
                	AND cc.Cost_Category LIKE '%BROKER%'
                    ${checkIsNumber(broker) ? ' AND pstaff.Involved_Emp_Id = @broker ' : ''}`
            );

        const result = await request;

        sentData(res, toArray(result.recordset));
    } catch (e) {
        servError(e, res);
    }
}

export default {
    getBrokerInvolvedInPurchase,
    purchaseBrokerageReport,
}