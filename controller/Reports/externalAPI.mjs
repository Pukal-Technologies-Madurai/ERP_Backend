import sql from "mssql";
import { servError, noData, dataFound } from "../../res.mjs";
import { ISOString } from "../../helper_functions.mjs";

export const onlineSalesReport = async (req, res) => {
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Online_Sales_VW @Fromdate, @Todate`);

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }
};

export const onlineSalesReportItem = async (req, res) => {
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Online_Sales_Item_VW @Fromdate, @Todate`);

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }
};

export const unitEconomicsReport = async (req, res) => { 
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Online_Unit_Eco_VW @Fromdate, @Todate`);

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }
};

export const onlineSalesReportLOL = async (req, res) => {
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Online_Sales_LOL_VW @Fromdate, @Todate`);

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }
}

export const onlineSalesReportItemLOL = async (req,res) => {
     try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Online_Sales_Item_LOL_VW @Fromdate, @Todate`);

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }
}