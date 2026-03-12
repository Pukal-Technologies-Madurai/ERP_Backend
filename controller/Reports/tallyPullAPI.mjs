import sql from 'mssql';
import { dataFound, noData, invalidInput, servError, sentData } from '../../res.mjs';
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

const nullDefender = (data, numberColumn = []) => {
    if (!Array.isArray(data)) return [];

    return data.map(item => {
        return Object.fromEntries(
            Object.entries(item).map(([key, value]) => {
                if (numberColumn.includes(key)) {
                    return [key, value ? Number(value) : 0];
                }
                return [key, value || ''];
            })
        )
    })
}

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

            dataFound(res, toArray(receipt.Receipt).map(receipt => ({
                ...receipt,
                billrefrence: JSON.parse(receipt.billrefrence),
            })));

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

const externalAPIJournal = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Journal_API');

        const result = await request;
        const journal = result.recordset;

        if (result.recordset.length > 0) {

            const firstLevelParsed = journal.map(jou => ({
                ...jou,
                DR_ledgerentries: JSON.parse(jou.DR_ledgerentries),
                CR_ledgerentries: JSON.parse(jou.CR_ledgerentries),
            }));

            const secondLevelParsed = firstLevelParsed.map(jou => ({
                ...jou,
                DR_ledgerentries: jou.DR_ledgerentries.map(dr => ({
                    ...dr,
                    billrefrence: JSON.parse(dr.billrefrence),
                })),
                CR_ledgerentries: jou.CR_ledgerentries.map(cr => ({
                    ...cr,
                    billrefrence: JSON.parse(cr.billrefrence),
                })),
            }));


            dataFound(res, secondLevelParsed);
        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

const externalAPIContra = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Contra_API');

        const result = await request;

        if (result.recordset.length > 0) {
            const contra = result.recordset;

            dataFound(res, toArray(contra));
        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

// -------- Admin API ---------------

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

            const sales = JSON.parse(result.recordset[0]?.SALES)
            dataFound(res, sales)
            // dataFound(res, sales.map(sale => ({
            //     ...sale,
            //     ALLINVENTORYENTRIES: JSON.parse(sale.ALLINVENTORYENTRIES),
            //     LEDGERENTRIES: JSON.parse(sale.LEDGERENTRIES),
            // })));

        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

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

const tallyAdminStockJournalAPI = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .input('Company_Id', 0)
            .input('Vouche_Id', 0)
            .execute('Online_Stock_Journal_Admin_API')

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

const tallyJournalAdminApi = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Journal_Admin_API');

        const result = await request;
        const journal = result.recordset;

        if (result.recordset.length > 0) {

            const firstLevelParsed = journal.map(jou => ({
                ...jou,
                DR_ledgerentries: JSON.parse(jou.DR_ledgerentries),
                CR_ledgerentries: JSON.parse(jou.CR_ledgerentries),
            }));

            const secondLevelParsed = firstLevelParsed.map(jou => ({
                ...jou,
                DR_ledgerentries: jou.DR_ledgerentries.map(dr => ({
                    ...dr,
                    billrefrence: JSON.parse(dr.billrefrence),
                })),
                CR_ledgerentries: jou.CR_ledgerentries.map(cr => ({
                    ...cr,
                    billrefrence: JSON.parse(cr.billrefrence),
                })),
            }));


            dataFound(res, secondLevelParsed);
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

            dataFound(res, toArray(receipt.Receipt).map(receipt => ({
                ...receipt,
                billrefrence: JSON.parse(receipt.billrefrence),
            })));
        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

// -------- Update API ---------------

const tallySalesUpdateAPI = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Sales_Update_API')

        const result = await request;
        if (result.recordset.length > 0) {

            const sales = JSON.parse(result.recordset[0]?.SALES)
            dataFound(res, sales)
            // dataFound(res, sales.map(sale => ({
            //     ...sale,
            //     ALLINVENTORYENTRIES: JSON.parse(sale.ALLINVENTORYENTRIES),
            //     LEDGERENTRIES: JSON.parse(sale.LEDGERENTRIES),
            // })));

        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

const tallyPurchaseUpdateAPI = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Purchase_Update_API')

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

const tallyJournalUpdateApi = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Journal_Update_API');

        const result = await request;
        const journal = result.recordset;

        if (result.recordset.length > 0) {

            const firstLevelParsed = journal.map(jou => ({
                ...jou,
                DR_ledgerentries: JSON.parse(jou.DR_ledgerentries),
                CR_ledgerentries: JSON.parse(jou.CR_ledgerentries),
            }));

            const secondLevelParsed = firstLevelParsed.map(jou => ({
                ...jou,
                DR_ledgerentries: jou.DR_ledgerentries.map(dr => ({
                    ...dr,
                    billrefrence: JSON.parse(dr.billrefrence),
                })),
                CR_ledgerentries: jou.CR_ledgerentries.map(cr => ({
                    ...cr,
                    billrefrence: JSON.parse(cr.billrefrence),
                })),
            }));


            dataFound(res, secondLevelParsed);
        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

const tallyPaymentUpdateAPI = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Payment_Update_API')

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

const tallyReceiptUpdateAPI = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Receipt_Update_API');

        const result = await request;

        if (result.recordset.length > 0) {
            const receipt = JSON.parse(result.recordset[0]?.Receipt);

            dataFound(res, toArray(receipt.Receipt).map(receipt => ({
                ...receipt,
                billrefrence: JSON.parse(receipt.billrefrence),
            })));
        } else {
            noData(res)
        }
    } catch (e) {
        servError(e, res)
    }
}

const tallyStockJournalUpdateAPI = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .input('Company_Id', 0)
            .input('Vouche_Id', 0)
            .execute('Online_Stock_Journal_Update_API')

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

// -------- New updates API ---------------

const debitNote = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Debit_Note_New_API');

        const result = await request;
        const [generalInfo, StockInfo, expencess] = result.recordsets;

        const debitNote = generalInfo.map(info => ({
            ...info,
            ALLINVENTORYENTRIES: StockInfo.filter(stock => isEqualNumber(stock.DB_Id, info.DB_Id)),
            LEDGERENTRIES: expencess.filter(exp => isEqualNumber(exp.DB_Id, info.DB_Id))
        }));

        sentData(res, debitNote)
    } catch (e) {
        servError(e, res)
    }
}

const creditNote = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Credit_Note_New_API');

        const result = await request;
        const [generalInfo, StockInfo, expencess] = result.recordsets;

        const creditNote = generalInfo.map(info => ({
            ...info,
            ALLINVENTORYENTRIES: StockInfo.filter(stock => isEqualNumber(stock.CR_Id, info.CR_Id)),
            LEDGERENTRIES: expencess.filter(exp => isEqualNumber(exp.CR_Id, info.CR_Id))
        }));

        sentData(res, creditNote)
    } catch (e) {
        servError(e, res)
    }
}

const salesNewApi = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', req.query.Fromdate)
            .input('Todate', req.query.Todate)
            .execute('Online_Sales_New_API');

        const numberColumn = ['Sal_Id', 'Credit_Days', 'Invoiceamount'];

        const result = await request;
        const [generalInfo, StockInfo, expencess, broker, transporter] = result.recordsets;

        const genNullDef = nullDefender(generalInfo, numberColumn)

        const creditNote = genNullDef.map(info => ({
            ...info,
            ALLINVENTORYENTRIES: StockInfo.filter(stock => isEqualNumber(stock.Sal_Id, info.Sal_Id)),
            LEDGERENTRIES: expencess.filter(exp => isEqualNumber(exp.Sal_Id, info.Sal_Id)),
            Other_Reference: broker.find(br => isEqualNumber(br.Sal_Id, info.Sal_Id)) || '',
            Dispatched_Through: transporter.find(tr => isEqualNumber(tr.Sal_Id, info.Sal_Id)) || '',
        }));

        dataFound(res, { Sales: creditNote })
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
    externalAPIJournal,
    externalAPIContra,

    // -- admin api
    tallyAdminPurchaseAPI,
    tallyAdminSaleAPI,
    tallyAdminStockJournalAPI,
    tallyAdminPaymentAPI,
    tallyAdminReceiptAPI,
    tallyJournalAdminApi,


    // -- update api

    tallySalesUpdateAPI,
    tallyPurchaseUpdateAPI,
    tallyJournalUpdateApi,
    tallyPaymentUpdateAPI,
    tallyReceiptUpdateAPI,
    tallyStockJournalUpdateAPI,


    // -- new updates api
    debitNote,
    creditNote,
    salesNewApi
};