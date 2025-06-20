import sql from 'mssql';
import { dataFound, noData, invalidInput, servError } from '../../res.mjs';
import { isEqualNumber, ISOString } from '../../helper_functions.mjs';

const toArray = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (typeof data === 'object') return [data];
    return [];
};

const cleanArray = (arr) => {

    if (
        arr.length === 1 &&
        typeof arr[0] === 'object' &&
        Object.keys(arr[0]).length === 0
    ) {
        return [];
    }

    return arr;
};

const externalAPI = async (req, res) => {
    try {
        // const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        // const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const DynamicDB = new sql.Request();
        DynamicDB.input('Company_Id', 5);
        DynamicDB.input('Vouche_Id', 0);
        DynamicDB.input('Fromdate', req.query.Fromdate);
        DynamicDB.input('Todate', req.query.Todate);

        const result = await DynamicDB.execute('Online_Sales_API');
        if (result.recordset.length > 0) {
            const sales = JSON.parse(result.recordset[0]?.SALES)
            dataFound(res, sales)
        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

const externalAPIPurchase = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Company_Id', 5)
            .input('Vouche_Id', 0)
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Purchase_API')

        const result = await request;
        if (result.recordset.length > 0) {
            const sales = JSON.parse(result.recordset[0]?.SALES)
            dataFound(res, sales)
        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

const externalAPISaleOrder = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Company_Id', 6)
            .input('Vouche_Id', 0)
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Sales_Order_API')

        const result = await request;
        if (result.recordset.length > 0) {
            const sales = JSON.parse(result.recordset[0]?.SALES)
            dataFound(res, sales)
        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

const externalAPIStockJournal = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .input('Company_Id', 6)
            .input('Vouche_Id', 0)
            .execute('Online_Stock_Journal_API')

        const result = await request;
        if (result.recordset.length > 0) {
            const stockjournal = JSON.parse(result.recordset[0]?.Stock);
            const removeCurlyBrase = toArray(stockjournal?.Stock_Journal).map(journal => ({
                ...journal,
                SOURCEENTRIES: cleanArray(toArray(journal?.SOURCEENTRIES)),
                DESTINATIONENTRIES: cleanArray(toArray(journal?.DESTINATIONENTRIES))
            }));

            dataFound(res, { Stock_Journal: removeCurlyBrase });
        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

const externalAPIReceipt = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Receipt_API');

        const result = await request;

        if (result.recordset.length > 0) {
            const receipt = JSON.parse(result.recordset[0]?.Receipt);

            dataFound(res, toArray(receipt.Receipt));
        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

const externalAPIPayment = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Payment_API')

        const result = await request;
        if (result.recordset.length > 0) {
            const payment = result.recordset;

            dataFound(res, payment.map(pay => ({
                ...pay,
                BILL_REFERENCE: JSON.parse(pay.BILL_REFERENCE)
            })));
        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

// -------- Admin API ---------------

const tallyAdminPurchaseAPI = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Purchase_Admin_API')

        const result = await request;
        if (result.recordset.length > 0) {
            // const purchase = result.recordset;
            const sales = JSON.parse(result.recordset[0]?.SALES)
            dataFound(res, sales)

            // dataFound(res, purchase.map(pur => ({
            //     ...pur,
            //     ALLINVENTORYENTRIES: JSON.parse(pur.ALLINVENTORYENTRIES),
            //     LEDGERENTRIES: JSON.parse(pur.LEDGERENTRIES),
            // })));
        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

const tallyAdminSaleAPI = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Sales_Admin_API')

        const result = await request;
        if (result.recordset.length > 0) {

            const sales = result.recordset;
            dataFound(res, sales.map(sale => ({
                ...sale,
                ALLINVENTORYENTRIES: JSON.parse(sale.ALLINVENTORYENTRIES),
                LEDGERENTRIES: JSON.parse(sale.LEDGERENTRIES),
            })));

        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

const tallyAdminPaymentAPI = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Payment_Admin_API')

        const result = await request;
        if (result.recordset.length > 0) {
            const payment = result.recordset;

            dataFound(res, payment.map(pay => ({
                ...pay,
                BILL_REFERENCE: JSON.parse(pay.BILL_REFERENCE)
            })));
        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

const tallyAdminReceiptAPI = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Receipt_Admin_API');

        const result = await request;

        if (result.recordset.length > 0) {
            const receipt = JSON.parse(result.recordset[0]?.Receipt);

            dataFound(res, toArray(receipt.Receipt));
        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

export default {
    externalAPI,
    externalAPIPurchase,
    externalAPISaleOrder,
    externalAPIStockJournal,
    externalAPIReceipt,
    externalAPIPayment,

    // -- admin api
    tallyAdminPurchaseAPI,
    tallyAdminSaleAPI,
    tallyAdminPaymentAPI,
    tallyAdminReceiptAPI
};