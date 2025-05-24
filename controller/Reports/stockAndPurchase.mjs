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

const StockAndPurchaseReport = () => {

    const stockReport = async (req, res) => {
        const { ReportDate } = req.query;
        const guid = req.config.Tally_Guid;
        const company_id = req.config.Tally_Company_Id;

        if (!ReportDate) {
            return invalidInput(res, 'Report Date is Required')
        }

        try {
            const DynamicDB = new sql.Request(req.db);
            DynamicDB.input('guid', guid);
            DynamicDB.input('Company_Id', company_id.toString());
            DynamicDB.input('Fromdate', ReportDate);

            const StockReport = await DynamicDB.execute('Stouck_Abstract_Oinline_Search_New');

            if (StockReport && StockReport.recordset.length > 0) {
                StockReport.recordset.map(obj => {
                    obj.product_details = JSON.parse(obj.product_details)
                })
                return dataFound(res, StockReport.recordset)
            } else {
                return noData(res)
            }
        } catch (e) {
            servError(e, res)
        } finally {
            req.db.close()
        }
    }

    const liveStockReport = async (req, res) => {

        try {
            const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

            const result = await new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .execute('Online_Live_Stock_Reort_VW')

            if (result.recordset.length > 0) {
                return dataFound(res, result.recordset)
            } else {
                return noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const purchaseReport = async (req, res) => {
        try {
            const { Report_Type, Fromdate, Todate } = req.query;
            const guid = req.config.Tally_Guid;

            const DynamicDB = new sql.Request(req.db);
            DynamicDB.input('Report_Type', Report_Type);
            DynamicDB.input('Guid', guid);
            DynamicDB.input('Fromdate', Fromdate)
            DynamicDB.input('Todate', Todate);

            const result = await DynamicDB.execute('Purchase_Order_Online_Report');
            if (Number(Report_Type) !== 3) {
                result.recordset.map(obj => {
                    obj.product_details = JSON.parse(obj.product_details)
                    obj.product_details.map(o => {
                        o.product_details_1 = JSON.parse(o.product_details_1)
                    })
                })
            } else {
                result.recordset.map(o => {
                    o.Order_details = JSON.parse(o.Order_details)
                })
            }
            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        } finally {
            req.db.close()
        }
    }

    const salesReport = async (req, res) => {
        const Fromdate = ISOString(req.query.Fromdate);
        const Todate = ISOString(req.query.Todate);

        try {

            const result = await new sql.Request(req.db)
                .input('Fromdate', Fromdate)
                .input('To_date', Todate)
                .execute('Avg_Live_Sales_Report_3')

            if (result.recordsets[0].length > 0) {
                const columnDataTypes = Array.isArray(result.recordsets[1]) ? result.recordsets[1] : [];
                const dayWiseSales = Array.isArray(result.recordsets[2]) ? result.recordsets[2] : [];

                const uniqueKeys = dayWiseSales[0] ? Object.keys(dayWiseSales[0]).map(keys => ({
                    Column_Name: keys,
                    Data_Type: 'number',
                })) : [];

                const mergeDataType = [...columnDataTypes, ...uniqueKeys]

                const mergeData = (Array.isArray(result.recordsets[0]) ? result.recordsets[0] : []).map(o => ({
                    ...o,
                    ...dayWiseSales.find(daySales => isEqualNumber(daySales?.sales_party_ledger_id, o?.Ledger_Tally_Id))
                }))
                dataFound(res, mergeData, 'dataFound', {
                    dataTypeInfo: mergeDataType,
                    // daysTransactions: dayWiseSales
                })
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const salesItemDetails = async (req, res) => {
        const Fromdate = ISOString(req.query.Fromdate);
        const Todate = ISOString(req.query.Todate);
        const Ledger_Id = req.query.Ledger_Id;

        try {

            const result = await new sql.Request(req.db)
                .input('Fromdate', Fromdate)
                .input('To_date', Todate)
                .input('Ledger_Id', Number(Ledger_Id))
                .execute('Avg_Live_Sales_Report_2')

            if (result.recordset.length > 0) {
                dataFound(res, result.recordsets[0], 'dataFound', { dataTypeInfo: result.recordsets[1] })
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const porductBasedSalesResult = async (req, res) => {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();

        try {

            const DynamicDB = new sql.Request(req.db)
                .input('Fromdate', Fromdate)
                .input('To_date', Todate)
                .execute('Avg_Live_Sales_Report_1')

            const result = await DynamicDB;
            if (result.recordsets[0].length > 0) {
                const itemSales = Array.isArray(result.recordsets[0]) ? result.recordsets[0] : [];
                const losAbs = Array.isArray(result.recordsets[1]) ? result.recordsets[1] : [];
                const dayBasedSales = Array.isArray(result.recordsets[2]) ? result.recordsets[2] : [];

                const mergedItemWithDayBasedSales = itemSales.map(item => {
                    const daysWithSales = dayBasedSales.find(
                        day => (
                            day.Item_Name_Modified === item.Item_Name_Modified
                            && day.Stock_Group === item.Stock_Group
                        )
                    )

                    return {
                        ...item,
                        ...daysWithSales
                    }
                })

                dataFound(res, mergedItemWithDayBasedSales, 'dataFound', {
                    LOSAbstract: losAbs,
                    dateWiseSales: dayBasedSales
                })
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
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

    return {
        stockReport,
        liveStockReport,
        purchaseReport,
        externalAPI,
        salesReport,
        salesItemDetails,
        porductBasedSalesResult,
        externalAPIPurchase,
        externalAPISaleOrder,
        externalAPIStockJournal,
        externalAPIReceipt,
        externalAPIPayment,
    }
}

export default StockAndPurchaseReport();