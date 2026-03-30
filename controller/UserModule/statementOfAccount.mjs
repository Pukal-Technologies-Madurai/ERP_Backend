
import sql from 'mssql';
import { invalidInput, dataFound, noData, servError, failed, sentData } from '../../res.mjs';
import { Addition, checkIsNumber, ISOString, stringCompare, Subraction, toArray } from '../../helper_functions.mjs'
import {
    purchaseReturnQuery, salesReturnQuery,
    salesInvFilterQuery, salesObFilterQuery,
    receiptFilterQuery,
    purchaseInvFilterQuery, purchaseObFilterQuery,
    paymentFilterQuery, journalFilterQuery,
    creditNoteFilterQuery, debitNoteFilterQuery,
    getSalesInvOutstanding, getSalesObOutstanding,
    getReceiptOutstanding,
    getPurchaseInvOutstanding, getPurchaseObOutstanding,
    getPaymentOutstanding, getJournalOutstanding,
    getCreditNoteOutstanding, getDebitNoteOutstanding,
} from '../Journal/journalOutstanding.mjs';

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
                    return res.status(422).json({ data: [], success: false, message: '', isCustomer: true });
                    // throw e;
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
                lol.Ledger_Tally_Id, 
                lol.Ledger_Name,
            	lol.Actual_Party_Name_with_Brokers,
            	am.Acc_Id
            FROM tbl_Ledger_LOL AS lol
            JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = lol.Ret_Id
            JOIN tbl_Account_Master AS am ON am.Acc_Id = rm.AC_Id
            ORDER BY lol.Ledger_Name`
            );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    const paymentInvoiceListByFilters = async (req, res) => {
        try {
            const { ledgerId } = req.body;
            const reqDate = req.body?.reqDate ? ISOString(req.body?.reqDate) : ISOString();

            const LedgerArray = toArray(ledgerId);

            if (LedgerArray.length === 0) return invalidInput(res, 'Select Ledger');

            const recordsetArray = await Promise.all(
                toArray(LedgerArray).map(async (ledger) => {
                    const Acc_Id = ledger?.Acc_Id;
                    if (!Acc_Id) return [];

                    try {
                        const result = await new sql.Request()
                            .input('Acc_Id', Acc_Id)
                            .input('reqDate', reqDate)
                            .query(`
                                DECLARE @OB_Date DATE = (SELECT MAX(OB_Date) FROM tbl_OB_Date);
                                ${purchaseReturnQuery}
                                ${salesReturnQuery}
                                ${salesInvFilterQuery}
                                ${salesObFilterQuery}
                                ${receiptFilterQuery}
                                ${purchaseInvFilterQuery}
                                ${purchaseObFilterQuery}
                                ${paymentFilterQuery}
                                ${journalFilterQuery}
                                ${creditNoteFilterQuery}
                                ${debitNoteFilterQuery}
                                ${getSalesInvOutstanding(null)}
                                UNION ALL
                                ${getSalesObOutstanding(null)}
                                UNION ALL
                                ${getReceiptOutstanding(null)}
                                UNION ALL
                                ${getPurchaseInvOutstanding(null)}
                                UNION ALL
                                ${getPurchaseObOutstanding(null)}
                                UNION ALL
                                ${getPaymentOutstanding(null)}
                                UNION ALL
                                ${getJournalOutstanding(null)}
                                UNION ALL
                                ${getCreditNoteOutstanding(null)}
                                UNION ALL
                                ${getDebitNoteOutstanding(null)}
                                ORDER BY eventDate ASC;
                            `);

                        return toArray(result.recordset).map(inv => ({
                            tally_id: inv.voucherId,
                            invoice_no: inv.voucherNumber,
                            invoice_date: ISOString(inv.eventDate),
                            Retailer_Id: inv.Acc_Id,
                            Total_Invoice_value: inv.totalValue,
                            dataSource: inv.dataSource,
                            totalReceipt: inv.againstAmount,
                            journalAdjustment: inv.journalAdjustment,
                            Bal_Amount: Subraction(inv.totalValue, Addition(inv.againstAmount, inv.journalAdjustment)),
                            Paid_Amount: Addition(inv.againstAmount, inv.journalAdjustment),
                            accountSide: inv.accountSide,
                        }));
                    } catch (err) {
                        console.error(`paymentInvoiceListByFilters – Acc_Id ${Acc_Id}:`, err);
                        return [];
                    }
                })
            );

            const data = recordsetArray.flat();

            return sentData(res, data);

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
