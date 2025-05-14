import { dataFound, noData,servError } from "../../res.mjs";
import {  checkIsNumber,  ISOString } from '../../helper_functions.mjs';
import sql from 'mssql';



const TripReports = () => {
    const getPayments = async (req, res) => {
         try {
             const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
             const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();
             const {
                 retailer_id = '',
                 voucher_id = '',
                 collection_type = '',
                 verify_status = '',
                 payment_status = '',
                 collected_by = '',
             } = req.query;
 
             const request = new sql.Request()
                 .input('Fromdate', Fromdate)
                 .input('Todate', Todate)
                 .input('retailer_id', retailer_id)
                 .input('voucher_id', voucher_id)
                 .input('collection_type', collection_type)
                 .input('verify_status', verify_status)
                 .input('payment_status', payment_status)
                 .input('collected_by', collected_by)
                 .query(`
                     WITH GENERALDETAILS AS (
                        SELECT
                            gi.*,
                            COALESCE(r.Retailer_Name, 'not found') AS RetailerGet,
                            COALESCE(v.Voucher_Type, 'not found') AS VoucherGet,
                            COALESCE(cre.Name, 'not found') AS CreatedByGet,
                            COALESCE(upd.Name, 'not found') AS UpdatedByGet,
                            COALESCE(col.Name, 'not found') AS CollectedByGet,
                            COALESCE(verify.Name, 'not found') AS VerifiedByGet
                        FROM tbl_Sales_Receipt_General_Info AS gi
                         LEFT JOIN tbl_Retailers_Master AS r
                             ON r.Retailer_Id = gi.retailer_id
                         LEFT JOIN tbl_Voucher_Type AS v
                             ON v.Vocher_Type_Id = gi.voucher_id
                        LEFT JOIN tbl_Users AS cre
                            ON cre.UserId = gi.created_by
                        LEFT JOIN tbl_Users AS upd
                            ON upd.UserId = gi.updated_by
                         LEFT JOIN tbl_Users AS col
                            ON col.UserId = gi.collected_by
                         LEFT JOIN tbl_Users AS verify
                            ON verify.UserId = gi.collected_by
                        WHERE 
                             gi.collection_date BETWEEN @Fromdate AND @Todate
                             ${checkIsNumber(retailer_id) ? ' AND gi.retailer_id = @retailer_id ' : ''}
                             ${checkIsNumber(voucher_id) ? ' AND gi.voucher_id = @voucher_id ' : ''}
                             ${checkIsNumber(collected_by) ? ' AND gi.collected_by = @collected_by ' : ''}
                             ${collection_type ? ' AND gi.collection_type = @collection_type ' : ''}
                             ${verify_status ? ' AND gi.verify_status = @verify_status ' : ''}
                             ${payment_status ? ' AND gi.payment_status = @payment_status ' : ''}
                     ), DETAILSINFO AS (
                        SELECT 
                             di.*,
                             so.Do_Inv_No, so.Do_Date,
                             COALESCE(so.Total_Invoice_value, 0) AS Total_Invoice_value
                        FROM tbl_Sales_Receipt_Details_Info AS di
                        LEFT JOIN tbl_Sales_Delivery_Gen_Info AS so
                            ON so.Do_Id = di.bill_id
                        WHERE di.collection_id IN (SELECT DISTINCT collection_id FROM GENERALDETAILS)
                     ), RECEIPTTOTALS AS (
                         SELECT
                             SUM(collected_amount) AS total_collected_amount, bill_id
                         FROM tbl_Sales_Receipt_Details_Info
                         WHERE bill_id IN (SELECT DISTINCT bill_id FROM DETAILSINFO)
                         GROUP BY bill_id
                     )
                     SELECT 
                        gi.*,
                        COALESCE((
                            SELECT di.*,
                             COALESCE((
                                 SELECT r.total_collected_amount 
                                 FROM RECEIPTTOTALS AS r
                                 WHERE r.bill_id = di.bill_id
                             ), 0) AS total_receipt_amount
                            FROM DETAILSINFO di
                            WHERE di.collection_id = gi.collection_id
                            FOR JSON PATH
                        ), '[]') AS Receipts
                     FROM GENERALDETAILS AS gi
                     ORDER BY gi.collection_date DESC`
                 );
 
             const result = await request;
 
             if (result.recordset.length > 0) {
                 const parseData = result.recordset.map(gi => ({
                     ...gi,
                     Receipts: JSON.parse(gi.Receipts)
                 }));
 
                 dataFound(res, parseData);
             } else {
                 noData(res)
             }
         } catch (e) {
             servError(e, res);
         }
     }
     const getCummulative = async (req, res) => {
         try {
             const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
             const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();
             const {
                 retailer_id = '',
                 voucher_id = '',
                 collection_type = '',
                 verify_status = '',
                 payment_status = '',
                 collected_by = '',
             } = req.query;
 
             const request = new sql.Request()
                 .input('Fromdate', Fromdate)
                 .input('Todate', Todate)
                 .input('retailer_id', retailer_id)
                 .input('voucher_id', voucher_id)
                 .input('collection_type', collection_type)
                 .input('verify_status', verify_status)
                 .input('payment_status', payment_status)
                 .input('collected_by', collected_by)
                 .query(`
                    WITH GENERALDETAILS AS (
    SELECT
        gi.*,
        COALESCE(r.Retailer_Name, 'not found') AS RetailerGet,
        COALESCE(col.Name, 'not found') AS CollectedByGet
    FROM tbl_Sales_Receipt_General_Info AS gi
    LEFT JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = gi.retailer_id
    LEFT JOIN tbl_Users AS col ON col.UserId = gi.collected_by
    WHERE 
        gi.collection_date BETWEEN @Fromdate AND @Todate
        ${checkIsNumber(retailer_id) ? ' AND gi.retailer_id = @retailer_id ' : ''}
        ${checkIsNumber(voucher_id) ? ' AND gi.voucher_id = @voucher_id ' : ''}
        ${checkIsNumber(collected_by) ? ' AND gi.collected_by = @collected_by ' : ''}
        ${collection_type ? ' AND gi.collection_type = @collection_type ' : ''}
        ${verify_status ? ' AND gi.verify_status = @verify_status ' : ''}
        ${payment_status ? ' AND gi.payment_status = @payment_status ' : ''}
),
DETAILSINFO AS (
    SELECT 
        di.*,
        so.Do_Inv_No, so.Do_Date,
        COALESCE(so.Total_Invoice_value, 0) AS Total_Invoice_value
    FROM tbl_Sales_Receipt_Details_Info AS di
    LEFT JOIN tbl_Sales_Delivery_Gen_Info AS so ON so.Do_Id = di.bill_id
    WHERE di.collection_id IN (SELECT collection_id FROM GENERALDETAILS)
),
RECEIPTTOTALS AS (
    SELECT
        bill_id,
        SUM(collected_amount) AS total_collected_amount
    FROM tbl_Sales_Receipt_Details_Info
    GROUP BY bill_id
)
SELECT 
    collection_type,
    SUM(receipt.collected_amount) AS total_collected,
    (
        SELECT 
            gi.collection_inv_no,
            gi.collection_date,
            gi.RetailerGet,
            gi.CollectedByGet,
            gi.collection_type,
            (
                SELECT 
                    di.*, 
                    COALESCE(rt.total_collected_amount, 0) AS total_receipt_amount
                FROM DETAILSINFO AS di
                LEFT JOIN RECEIPTTOTALS rt ON rt.bill_id = di.bill_id
                WHERE di.collection_id = gi.collection_id
                FOR JSON PATH
            ) AS Receipts
        FROM GENERALDETAILS gi
        WHERE gi.collection_type = outergi.collection_type
        FOR JSON PATH
    ) AS retailers
FROM GENERALDETAILS AS outergi
JOIN DETAILSINFO AS receipt ON receipt.collection_id = outergi.collection_id
GROUP BY collection_type
ORDER BY collection_type;
`
                 );
 
           const result = await request;

if (result.recordset.length > 0) {
    const parsedData = result.recordset.map(row => {
      
        const parsedReceipts = row.retailers ? JSON.parse(row.retailers) : [];

        return {
            ...row, 
            retailers: parsedReceipts 
        };
    });
    
    dataFound(res, parsedData); 
} else {
    noData(res);
}


    } catch (e) {
        servError(e, res);
    }
};
    return {
        getPayments,
        getCummulative
    };
};



export default TripReports();