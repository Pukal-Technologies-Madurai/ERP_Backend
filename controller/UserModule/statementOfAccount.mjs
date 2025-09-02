
import sql from 'mssql';
import { invalidInput, dataFound, noData, servError, failed, sentData } from '../../res.mjs';
import { checkIsNumber, ISOString, stringCompare, toArray } from '../../helper_functions.mjs'

const CustomerAPIs = () => {

    const getBalance = async (req, res) => {
        const { UserId } = req.query;

        try {
            if (!checkIsNumber(UserId)) {
                return res.status(400).json({ data: [], success: false, message: 'UserId is required', isCustomer: false });
            }

            const result = await new sql.Request()
                .input('UserId', UserId)
                .query(`SELECT Cust_Id FROM tbl_Customer_Master WHERE User_Mgt_Id = @UserId`);

            if (result.recordset.length === 0) {
                return res.status(404).json({ data: [], success: false, message: 'Customer Not Found', isCustomer: false });
            }

            const Cust_Id = result.recordset[0].Cust_Id;

            const GetCustDetails = new sql.Request();
            GetCustDetails.input('Cust_Id', Cust_Id);

            const CustInfo = await GetCustDetails.execute('Customer_Deatils_By_Cust_Id');

            if (CustInfo.recordset.length === 0) {
                return res.status(404).json({ data: [], success: false, message: 'Customer Details Not Found', isCustomer: true });
            }

            const recordsetArray = await Promise.all(CustInfo.recordset.map(async (obj) => {
                const GetBalance = new sql.Request();
                GetBalance.input('Cust_Id', Cust_Id);
                GetBalance.input('Cust_Details_Id', obj.Cust_Details_Id);

                try {
                    const ResData = await GetBalance.execute('Online_OS_Debtors_Reort_VW');
                    return ResData.recordset;
                } catch (e) {
                    console.error(e);
                    res.status(422).json({ data: [], success: false, message: '', isCustomer: true });
                    throw e;
                }
            }));

            const flattenedArray = recordsetArray.flat();

            res.status(200).json({ data: flattenedArray, success: true, message: '', isCustomer: true });
        } catch (e) {
            servError(e, res)
        }
    }

    const StatementOfAccound = async (req, res) => {
        const { Cust_Id, Acc_Id, Company_Id, Fromdate, Todate } = req.query;

        if (!checkIsNumber(Cust_Id) || !checkIsNumber(Acc_Id) || !checkIsNumber(Company_Id) || !Fromdate || !Todate) {
            return invalidInput(res, 'Cust_Id, Acc_Id, Company_Id, Fromdate, Todate are Required')
        }

        const GetStatement = new sql.Request()
            .input('Cust_Id', Cust_Id)
            .input('Acc_Id', Acc_Id)
            .input('Company_Id', Company_Id)
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .execute('Online_Statement_Of_Accounts_VW');

        try {
            const ResData = await GetStatement;
            if (ResData && ResData.recordset.length > 0) {
                dataFound(res, ResData.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const paymentInvoiceList = async (req, res) => {
        try {
            const { UserId } = req.query;
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();

            if (!checkIsNumber(UserId)) {
                return invalidInput(res, 'UserId is required')
            }

            const result = await new sql.Request()
                .input('UserId', UserId)
                .query('SELECT Cust_Id FROM tbl_Customer_Master WHERE User_Mgt_Id = @UserId');

            if (result.recordset.length === 0) {
                return res.status(404).json({ data: [], success: false, message: 'Customer Not Found', isCustomer: false });
            }

            const Cust_Id = result.recordset[0].Cust_Id;

            const GetCustDetails = new sql.Request();
            GetCustDetails.input('Cust_Id', Cust_Id);
            const CustInfo = await GetCustDetails.execute('Customer_Deatils_By_Cust_Id');

            if (CustInfo.recordset.length === 0) {
                return res.status(404).json({ data: [], success: false, message: 'Customer Details Not Found', isCustomer: true });
            }

            const recordsetArray = await Promise.all(CustInfo.recordset.map(async (obj) => {
                const getPaymentDetails = new sql.Request();
                getPaymentDetails.input('Cust_Id', obj.Cust_Id);
                getPaymentDetails.input('Acc_Id', obj.Customer_Ledger_Id);
                // getPaymentDetails.input('Fromdate', Fromdate);

                try {
                    const ResData = await getPaymentDetails.execute('Online_Payment_Invoice_List');
                    return ResData.recordset;
                } catch (e) {
                    console.error(e);
                    return [];
                }
            }));

            const flattenedArray = recordsetArray.flat();
            res.status(200).json({ data: flattenedArray, success: true, message: '', isCustomer: true });

        } catch (e) {
            servError(e, res)
        }
    }

    const getLOLDropDown = async (req, res) => {
        try {
            const request = new sql.query(`
                SELECT 
                	Ledger_Tally_Id, 
                	Ledger_Name,
                	Actual_Party_Name_with_Brokers
                FROM tbl_Ledger_LOL
                ORDER BY Ledger_Name`
            );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const paymentInvoiceListByFilters = async (req, res) => {
        try {
            const { ledgerId, source = 'ERP' } = req.body;
            const reqDate = req.body?.reqDate ? ISOString(req.body?.reqDate) : ISOString();

            const LedgerArray = toArray(ledgerId);

            if (LedgerArray.length === 0) return invalidInput(res, 'Select Ledger');

            if (stringCompare(source, 'TALLY')) {
                const recordsetArray = await Promise.all(LedgerArray.map(async (obj) => {
                    const getPaymentDetails = new sql.Request();
                    getPaymentDetails.input('Acc_Id', obj.Ledger_Tally_Id);
                    getPaymentDetails.input('Fromdate', reqDate);

                    try {
                        const ResData = await getPaymentDetails.execute('Online_Payment_Invoice_List_TALLY');
                        return ResData.recordset;
                    } catch (e) {
                        console.error(e);
                        return [];
                    }
                }));

                const flattenedArray = recordsetArray.flat();
                return res.status(200).json({ data: flattenedArray, success: true, message: '', isCustomer: true });

            } else {
                const request = await new sql.Request()
                    .input('reqDate', reqDate)
                    .input('Acc_Id', toArray(LedgerArray).map(item => item.Ledger_Tally_Id).join(', '))
                    .query(`
                        WITH LedgerList AS (
                        	SELECT TRY_CAST(value AS INT) AS LedgerId
                            FROM STRING_SPLIT(@Acc_Id, ',')
                        	WHERE TRY_CAST(value AS INT) IS NOT NULL
                        ), LatestOBDate AS (
                            SELECT MAX(OB_Date) AS max_ob_date FROM tbl_OB_Date
                        ), LedgerDetails AS (
                            SELECT 
                                lol.Ledger_Tally_Id,
                        		lol.Ledger_Name,
                        		lol.Ref_Brokers,
                        		r.ERP_Id,
                        		a.Acc_Id
                            FROM tbl_Ledger_LOL lol
                        	JOIN tbl_Retailers_Master r ON r.ERP_Id = lol.Ledger_Tally_Id
                        	JOIN tbl_Account_Master a ON a.ERP_Id = r.ERP_Id
                            WHERE (
                                @Acc_Id IS NULL 
                                OR LTRIM(RTRIM(@Acc_Id)) = '' 
                        		OR lol.Ledger_Tally_Id IN (SELECT DISTINCT LedgerId FROM LedgerList)
                        	) 
                        ),
                        Sales_Invoice AS (
                            SELECT 
                                pig.Do_Id AS tally_id,
                                pig.Do_Inv_No AS invoice_no,
                                pig.Do_Date AS invoice_date,
                                a.Acc_Id AS Retailer_Id,
                                pig.Total_Invoice_value,
                                'INV' AS dataSource,
                                COALESCE((
                                    SELECT SUM(pb.Credit_Amo)
                                    FROM tbl_Receipt_Bill_Info pb
                                    JOIN tbl_Receipt_General_Info pgi
                                        ON pgi.receipt_id = pb.receipt_id
                                    WHERE 
                                        pgi.status <> 0
                                        AND pgi.receipt_bill_type = 1
                                        AND pb.bill_id = pig.Do_Id
                                        AND pb.bill_name = pig.Do_Inv_No
                                ), 0) AS totalReceipt,
                                COALESCE((
                                    SELECT SUM(jr.Amount)
                                    FROM dbo.tbl_Journal_Bill_Reference jr
                                    JOIN dbo.tbl_Journal_Entries_Info  je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                                    JOIN dbo.tbl_Journal_General_Info  jh ON jh.JournalAutoId = jr.JournalAutoId
                                    WHERE 
                                        jh.JournalStatus <> 0
                                        AND je.Acc_Id = a.Acc_Id
                                        AND je.DrCr   = 'Cr'
                                        AND jr.RefId = pig.Do_Id 
                                        AND jr.RefNo = pig.Do_Inv_No
                                        AND jr.RefType = 'SALES'
                                ), 0) AS journalAdjustment,
                        		b.BranchName Bill_Company
                            FROM tbl_Sales_Delivery_Gen_Info pig
                            JOIN tbl_Retailers_Master r ON r.Retailer_Id = pig.Retailer_Id
                            JOIN tbl_Account_Master a ON a.ERP_Id = r.ERP_Id
                        	JOIN tbl_Branch_Master AS b ON b.BranchId = pig.Branch_Id
                            WHERE 
                                pig.Cancel_status <> 0
                                AND pig.Do_Date >= (SELECT max_ob_date FROM LatestOBDate)
                                AND pig.Do_Date <= @reqDate
                                AND a.ERP_Id IN (SELECT DISTINCT ERP_Id FROM LedgerDetails)
                        ),
                        Opening_Balance AS (
                            SELECT 
                                cb.OB_Id AS tally_id,
                                cb.bill_no AS invoice_no,
                                cb.bill_date AS invoice_date,
                                cb.Retailer_id AS Retailer_Id,
                                cb.dr_amount AS Total_Invoice_value,
                                'OB' AS dataSource,
                                COALESCE((
                                    SELECT SUM(pb.Credit_Amo)
                                    FROM tbl_Receipt_Bill_Info pb
                                    JOIN tbl_Receipt_General_Info pgi ON pgi.receipt_id = pb.receipt_id
                                    WHERE 
                                        pgi.status <> 0
                                        AND pgi.receipt_bill_type = 1
                                        AND pb.bill_id = cb.OB_Id
                                        AND pb.bill_name = cb.bill_no
                                ), 0) AS totalReceipt,
                                COALESCE((
                                    SELECT SUM(jr.Amount)
                                    FROM dbo.tbl_Journal_Bill_Reference jr
                                    JOIN dbo.tbl_Journal_Entries_Info  je ON je.LineId = jr.LineId AND je.JournalAutoId = jr.JournalAutoId
                                    JOIN dbo.tbl_Journal_General_Info  jh ON jh.JournalAutoId = jr.JournalAutoId
                                    WHERE 
                                        jh.JournalStatus <> 0
                                        AND je.Acc_Id = cb.Retailer_id
                                        AND je.DrCr   = 'Cr'
                                        AND jr.RefId = cb.OB_Id 
                                        AND jr.RefNo = cb.bill_no
                                        AND jr.RefType = 'SALES-OB'
                                ), 0) AS journalAdjustment,
                        		cb.Bill_Company
                            FROM tbl_Ledger_Opening_Balance cb
                            WHERE 
                                cb.OB_date >= (SELECT max_ob_date FROM LatestOBDate)
                                AND cb.OB_date <= @reqDate
                                AND cb.cr_amount = 0
                                AND cb.Retailer_id IN (
                                    SELECT a.Acc_Id
                                    FROM tbl_Account_Master a
                                    WHERE a.ERP_Id IN (SELECT DISTINCT ERP_Id FROM LedgerDetails)
                                )
                        ),
                        Combined_Invoice AS (
                            SELECT * FROM Sales_Invoice
                            UNION ALL
                            SELECT * FROM Opening_Balance
                        )
                        SELECT 
                        	DISTINCT inv.invoice_no,
                            inv.tally_id,
                        	inv.invoice_date,
                        	inv.Retailer_Id,
                        	inv.Total_Invoice_value,
                        	inv.dataSource,
                        	inv.totalReceipt,
                        	inv.Bill_Company,
                            r.Retailer_Name,
                            lol.Ref_Brokers,
                            inv.journalAdjustment,
                            COALESCE(inv.totalReceipt + inv.journalAdjustment, 0) AS Paid_Amount,
                        	COALESCE(inv.Total_Invoice_value - (inv.totalReceipt + inv.journalAdjustment), 0) Bal_Amount
                        FROM Combined_Invoice inv
                        JOIN tbl_Account_Master a ON a.Acc_Id = inv.Retailer_Id
                        JOIN tbl_Retailers_Master r ON r.ERP_Id = a.ERP_Id
                        LEFT JOIN tbl_Ledger_LOL lol ON lol.Ledger_Tally_Id = r.ERP_Id
                        WHERE 
                            inv.totalReceipt < inv.Total_Invoice_value
                        ORDER BY inv.invoice_date;`
                    );

                return res.status(200).json({ data: request.recordset, success: true, message: '', isCustomer: true });
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const invoiceDetails = async (req, res) => {
        const { Company_Id, UserId, Invoice_No } = req.query;

        if (!checkIsNumber(Company_Id) || !checkIsNumber(UserId) || !Invoice_No) {
            return invalidInput(res, 'Company_Id, UserId, Invoice_No is required');
        }

        try {

            const result = await new sql.Request()
                .input('UserId', UserId)
                .query('SELECT Cust_Id FROM tbl_Customer_Master WHERE User_Mgt_Id = @UserId');

            if (result.recordset.length === 0) {
                return failed(res, 'Customer Not Found');
            }

            const Cust_Id = result.recordset[0].Cust_Id;

            const request = new sql.Request();
            request.input('Cust_Id', Cust_Id);
            request.input('Company_Id', Company_Id);
            request.input('Invoice_No', Invoice_No);

            const invoiceResult = await request.execute('Online_Sales_Print');

            if (invoiceResult.recordsets) {
                dataFound(res, invoiceResult.recordsets)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const customerSalesReport = async (req, res) => {
        const { UserId } = req.query;

        try {
            if (!checkIsNumber(UserId)) {
                return res.status(400).json({ data: [], success: false, message: 'UserId is required', isCustomer: false });
            }

            const result = await new sql.Request()
                .input('UserId', UserId)
                .query(`SELECT Cust_Id FROM tbl_Customer_Master WHERE User_Mgt_Id = @UserId`);

            if (result.recordset.length === 0) {
                return res.status(404).json({ data: [], success: false, message: 'Customer Not Found', isCustomer: false });
            }

            const Cust_Id = result.recordset[0].Cust_Id;

            const GetCustDetails = new sql.Request();
            GetCustDetails.input('Cust_Id', Cust_Id);

            const CustInfo = await GetCustDetails.execute('Customer_Deatils_By_Cust_Id');

            if (CustInfo.recordset.length === 0) {
                return res.status(404).json({ data: [], success: false, message: 'Customer Details Not Found', isCustomer: true });
            }

            const recordsetArray = await Promise.all(CustInfo.recordset.map(async (obj) => {
                const GetBalance = new sql.Request();
                GetBalance.input('Cust_Id', Cust_Id);
                GetBalance.input('Cust_Details_Id', obj.Cust_Details_Id);

                try {
                    const ResData = await GetBalance.execute('Online_Sales_Reort_VW');
                    return ResData.recordset;
                } catch (e) {
                    console.error(e);
                    return { error: e };
                }
            }));

            const hasError = recordsetArray.some(item => item.error);

            if (hasError) {
                return res.status(422).json({ data: [], success: false, message: '', isCustomer: true });
            }

            const flattenedArray = recordsetArray.flat();

            res.status(200).json({ data: flattenedArray, success: true, message: '', isCustomer: true });
        } catch (e) {
            console.log(e);
            res.status(500).json({ message: 'Internal Server Error', status: 'Failure', data: [], isCustomer: false });
        }
    }

    const salesInfo = async (req, res) => {
        const { Cust_Id, Acc_Id, Company_Id } = req.query;

        if (!checkIsNumber(Cust_Id) || !Acc_Id || !checkIsNumber(Company_Id)) {
            return invalidInput(res, 'Cust_Id, Acc_Id, Company_Id is require');
        }

        try {
            const request = new sql.Request();
            request.input('Cust_Id', Cust_Id);
            request.input('Acc_Id', Acc_Id)
            request.input('Company_Id', Company_Id);

            const result = await request.execute('Online_Sales_Statement');

            if (result.recordset.length) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    return {
        getBalance,
        StatementOfAccound,
        paymentInvoiceList,
        getLOLDropDown,
        paymentInvoiceListByFilters,
        invoiceDetails,
        customerSalesReport,
        salesInfo,
    }
}

export default CustomerAPIs()
