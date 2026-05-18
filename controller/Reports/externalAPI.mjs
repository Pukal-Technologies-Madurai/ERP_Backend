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

        const [rows, meta] = result.recordsets || [];

        if (!rows || rows.length === 0) {
            return noData(res);
        }

        dataFound(res, {
            rows,                                
            lastStockValueDate: meta?.[0] ?? null 
        });

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


export const SalesGraphCard = async (req, res) => {
   try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Dashboard_Sales_VW @Fromdate, @Todate`);

        const [DayWise, WeekWiseData, DayWiseTonnage, WeekWiseTonnage] = result.recordsets || [];

        if (!DayWise || DayWise.length === 0) {
            return noData(res);
        }

        dataFound(res, {
            DayWise,                                
            WeekWiseData,
            DayWiseTonnage,
            WeekWiseTonnage
        });

    } catch (error) {
        servError(error, res);
    }
};


export const onlinePurchaseReport = async (req, res) => {
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Online_Purchase_VW @Fromdate, @Todate`);

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }
};

export const onlinePurchaseReportItem = async (req, res) => {
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Online_Purchase_Item_VW @Fromdate, @Todate`);

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }
};

export const PurchaseGraphCard = async (req, res) => {
   try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Dashboard_Purchase_VW @Fromdate, @Todate`);

        const [DayWise, WeekWiseData, DayWiseTonnage, WeekWiseTonnage] = result.recordsets || [];

        if (!DayWise || DayWise.length === 0) {
            return noData(res);
        }

        dataFound(res, {
            DayWise,                                
            WeekWiseData,
            DayWiseTonnage,
            WeekWiseTonnage
        });

    } catch (error) {
        servError(error, res);
    }
};


export const SaleOrderReport = async (req, res) => {
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Online_Sales_Order_LOL_VW @Fromdate, @Todate`);

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }
}

export const SaleOrderReportItem = async (req, res) => {
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Online_Sales_Order_Item_LOL_VW @Fromdate, @Todate`);

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }
}

export const PurchaseOrderReport = async (req, res) => {
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query("EXEC Reporting_Online_Purchase_Order_VW @Fromdate, @Todate")

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }
}

export const PurchaseOrderItemReport = async (req, res) => {
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query("EXEC Reporting_Online_Purchase_Order_Item_VW @Fromdate, @Todate")

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }

}


export const StockValueGraph = async (req, res) => {
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Dashboard_Stock_Value_VW @Fromdate, @Todate`);

        const [DayWise, WeekWiseData, DayWiseTonnage, WeekWiseTonnage] = result.recordsets || [];

        if (!DayWise || DayWise.length === 0) {
            return noData(res);
        }

        dataFound(res, {
            DayWise,
            WeekWiseData,
            DayWiseTonnage,
            WeekWiseTonnage
        });

    } catch (error) {
        servError(error, res);
    }
};


export const StockValueReport = async (req, res) => {
    try {
        const { Fromdate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .query("EXEC Stock_Value_CL_Rate @Fromdate")

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }
};


export const StaffBasedReport = async (req, res) => {
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Online_Stock_Journal_Item_VW @Fromdate, @Todate`);

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }
}


export const StaffBasedReportLOS = async (req, res) => {
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Online_Stock_Journal_Item_VW @Fromdate, @Todate`);

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }
}

export const costcenterList = async (req, res) => {
    try {
        const result = await new sql.Request()
            .execute("ERP_Cost_Center_vw");

        const recordset = result.recordset || [];

        if (recordset.length === 0) {
            return noData(res);
        }

        return dataFound(res, recordset);

    } catch (error) {
        console.error("Cost Center List Error:", error);
        return servError(error, res);
    }
};


export const OnlinePaymentReport = async (req, res) => {
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Online_Payment_VW @Fromdate, @Todate`);

        const [Summary, IndirectExpense, DirectExpense] = result.recordsets || [];

        if (!Summary || Summary.length === 0) {
            return noData(res);
        }

        dataFound(res, {
            Summary,
            IndirectExpense,
            DirectExpense
        });

    } catch (error) {
        servError(error, res);
    }
};


export const costingReport = async (req, res) => {
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Online_Payment_Costing_VW @Fromdate, @Todate`);

        const [ItemSummary, Accountgroup] = result.recordsets || [];

        if (!ItemSummary || ItemSummary.length === 0) {
            return noData(res);
        }

        dataFound(res, {
            ItemSummary,
            Accountgroup
        });

    } catch (error) {
        servError(error, res);

    }

};


export const DebtorsCreditors = async (req, res) => {
    try {
        const { Fromdate, Todate } = req.query;

        const fromDate = Fromdate ? ISOString(Fromdate) : ISOString();
        const toDate = Todate ? ISOString(Todate) : ISOString();

        const result = await new sql.Request()
            .input("Fromdate", fromDate)
            .input("Todate", toDate)
            .query(`EXEC Reporting_Debtors_Creditors_VW @Fromdate, @Todate`);

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }
};