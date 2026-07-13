import { servError, sentData, } from '../../res.mjs';
import { ISOString } from '../../helper_functions.mjs';
import sql from 'mssql';

export const getErpVoucherTransactions = async (req, res) => {
    try {
        const reqDate = req.query?.reqDate ? ISOString(req.query.reqDate) : ISOString();
        const branch = req.query?.branch;

        const request = new sql.Request()
            .input('reqDate', sql.Date, reqDate)
            .input('branch', sql.Int, branch)
            .query(`
                -- *********** sale order ***********
                SELECT 
                	COUNT(*) voucherCount, 
                	COALESCE(SUM(Total_Invoice_value), 0) voucherTotal,
                	'Sale Order' AS voucherName
                FROM tbl_Sales_Order_Gen_Info
                WHERE So_Date = @reqDate AND Cancel_status <> 0 AND Branch_Id  = @branch
                -- *********** sale invoice ***********
                UNION ALL
                SELECT 
                	COUNT(*) voucherCount, 
                	COALESCE(SUM(Total_Invoice_value), 0) voucherTotal,
                	'Sales Invoice' AS voucherName
                FROM tbl_Sales_Delivery_Gen_Info
                WHERE Do_Date = @reqDate AND Cancel_status <> 0 AND Branch_Id  = @branch
                -- *********** delivery details ***********
                UNION ALL
                SELECT 
                	COUNT(*) voucherCount, 
                	COALESCE(SUM(Total_Invoice_value), 0) voucherTotal,
                	'Pending Delivery' AS voucherName
                FROM tbl_Sales_Delivery_Gen_Info
                WHERE Do_Date = @reqDate AND Cancel_status <> 0 AND Delivery_Status <> 7 AND Branch_Id  = @branch
                -- *********** completed delivery ***********
                UNION ALL
                SELECT 
                	COUNT(*) voucherCount, 
                	COALESCE(SUM(Total_Invoice_value), 0) voucherTotal,
                	'Completed Delivered' AS voucherName
                FROM tbl_Sales_Delivery_Gen_Info
                WHERE Do_Date = @reqDate AND Cancel_status <> 0 AND Delivery_Status = 7 AND Branch_Id  = @branch
                -- *********** credit note ***********
                UNION ALL
                SELECT 
                	COUNT(*) voucherCount, 
                	COALESCE(SUM(Total_Invoice_value), 0) voucherTotal,
                	'Credit Note' AS voucherName
                FROM tbl_Credit_Note_Gen_Info
                WHERE CR_Date = @reqDate AND Cancel_status <> 0 AND Branch_Id  = @branch
                -- *********** receipt info ***********
                UNION ALL
                SELECT 
                	COUNT(*) voucherCount, 
                	COALESCE(SUM(credit_amount), 0) voucherTotal,
                	'Receipt' AS voucherName
                FROM tbl_Receipt_General_Info
                WHERE receipt_date = @reqDate AND status <> 0
                -- *********** payment info ***********
                UNION ALL
                SELECT 
                	COUNT(*) voucherCount, 
                	COALESCE(SUM(debit_amount), 0) voucherTotal,
                	'Payment' AS voucherName
                FROM tbl_Payment_General_Info
                WHERE payment_date = @reqDate AND status <> 0`);

        const result = await request;

        sentData(res, result.recordset)
    } catch (e) {
        servError(e, res);
    }
}