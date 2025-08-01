import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput, sentData } from '../../res.mjs';
import { ISOString } from '../../helper_functions.mjs';


const getUnAssignedBatchFromTripAndProcessing = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .query(`
                SELECT 
                	TOP (200)
                	tm.Trip_Id AS uniquId,
                	tm.Trip_Date eventDate,
                	p.Product_Name AS productNameGet,
                	fg.Godown_Name AS fromGodownGet,
                	tg.Godown_Name AS toGodownGet,
                	COALESCE(ar.QTY, 0) AS quantity,
                	COALESCE(ar.Gst_Rate, 0) AS rate,
                	COALESCE(ar.Total_Value, 0) AS amount,
                	COALESCE(cb.Name, 'Not found') AS createdByGet,
                	ar.CreatedAt AS createdAt,
                	'MATERIAL_INWARD' AS module
                FROM tbl_Trip_Arrival AS ar
                LEFT JOIN tbl_Product_Master AS p ON ar.Product_Id = p.Product_Id
                LEFT JOIN tbl_Godown_Master AS fg ON fg.Godown_Id = ar.From_Location
                LEFT JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = ar.To_Location
                LEFT JOIN tbl_Users AS cb ON cb.UserId = ar.Created_By
                JOIN tbl_Trip_Details AS td ON td.Arrival_Id = ar.Arr_Id
                JOIN tbl_Trip_Master AS tm ON tm.Trip_Id = td.Trip_Id
                WHERE 
                	TRIM(COALESCE(ar.Batch_No, '')) = ''
                	AND CONVERT(DATE, tm.Trip_Date) BETWEEN @Fromdate AND @Todate
                	AND tm.billType = 'MATERIAL INWARD'
                UNION ALL
                SELECT 
                	TOP (200)
                	pr.PR_Id AS uniquId,
                	pr.Process_date eventDate,
                	p.Product_Name AS productNameGet,
                	'' AS fromGodownGet,
                	tg.Godown_Name AS toGodownGet,
                	COALESCE(prd.Dest_Qty, 0) AS quantity,
                	COALESCE(prd.Dest_Rate, 0) AS rate,
                	COALESCE(prd.Dest_Amt, 0) AS amount,
                	COALESCE(cb.Name, 'Not found') AS createdByGet,
                	pr.Created_At AS createdAt,
                	'PROCESSING' AS module
                FROM tbl_Processing_Destin_Details AS prd
                LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = prd.Dest_Item_Id
                --LEFT JOIN tbl_Godown_Master AS fg ON fg.Godown_Id = prd.From_Location
                LEFT JOIN tbl_Godown_Master AS tg ON tg.Godown_Id = prd.Dest_Goodown_Id
                JOIN tbl_Processing_Gen_Info AS pr ON pr.PR_Id = prd.PR_Id
                LEFT JOIN tbl_Users AS cb ON cb.UserId = pr.Created_By
                WHERE 
                	TRIM(COALESCE(prd.Dest_Batch_Lot_No, '')) = ''
                	AND pr.Process_date BETWEEN @Fromdate AND @Todate
                ORDER BY eventDate ASC;`
            );

        const result = await request;

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
}

export default {
    getUnAssignedBatchFromTripAndProcessing,
}