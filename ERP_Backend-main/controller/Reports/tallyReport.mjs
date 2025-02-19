import sql from 'mssql';
import { servError, failed, invalidInput, dataFound, noData, success } from '../../res.mjs';
import { checkIsNumber, ISOString } from '../../helper_functions.mjs';
import { getLOL, getLOS } from '../../middleware/miniAPIs.mjs';

const QPayReport = () => {

    const getQpayData = async (req, res) => {
        const { Company_Id, Consolidate } = req.query;

        if (!checkIsNumber(Company_Id)) {
            return invalidInput(res, 'Company_Id is required');
        }

        try {

            const request = new sql.Request()
                .input('Company_Id', Company_Id)
                .input('Consolidate', Consolidate)
                .execute('Q_Pay_Online_Report_VW')

            const result = await request;

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const getQPayColumns = async (req, res) => {
        const { CompanyId, Report_Type_Id } = req.query;

        if (!checkIsNumber(CompanyId)) {
            return invalidInput(res, 'CompanyId is required')
        }

        const reportId = Report_Type_Id || 1

        try {
            const getColumns = new sql.Request()
                .input('reportId', reportId)
                .query(`
                    SELECT 
                    	Report_Columns
                    FROM
                    	tbl_Report_Type
                    WHERE
                    	Report_Type_Id = @reportId`)

            const columns = await getColumns;

            if (columns.recordset.length === 1) {
                let columnArray = columns.recordset[0].Report_Columns.split(',');
                const availableColumns = [];

                const getColHed = new sql.Request()
                    .query(`SELECT * FROM tbl_Report_Fileds`)

                const colHed = await getColHed;

                for (let i = 0; i < columnArray.length; i++) {
                    for (let j = 0; j < colHed.recordset.length; j++) {
                        if (columnArray[i] === colHed.recordset[j].Field_Name) {
                            availableColumns.push(colHed.recordset[j])
                        }
                    }
                }

                if (availableColumns.length > 0) {
                    const getVisiblity = new sql.Request()
                        .input('ReportId', reportId)
                        .input('CompanyId', CompanyId)
                        .query(`
                            SELECT 
                                * 
                            FROM 
                                tbl_Report_Column_Visiblity 
                            WHERE
                                ReportId = @ReportId
                                AND
                                CompanyId = @CompanyId
                            ORDER BY 
                                OrderBy`)

                    const visibledResult = await getVisiblity;
                    const visibledColumns = visibledResult.recordset;

                    const result = [];

                    for (let i = 0; i < availableColumns.length; i++) {
                        let obj = {};
                        obj.Field_Id = availableColumns[i].Field_Id;
                        obj.Field_Name = availableColumns[i].Field_Name;
                        obj.Fied_Data = availableColumns[i].Fied_Data;
                        obj.Defult_Display = availableColumns[i].Defult_Display;
                        obj.isVisible = 0;
                        obj.OrderBy = 0;

                        for (let j = 0; j < visibledColumns.length; j++) {
                            if (Number(availableColumns[i].Field_Id) === Number(visibledColumns[j].Field_Id)) {
                                obj.isVisible = visibledColumns[j].isVisible;
                                obj.OrderBy = visibledColumns[j].OrderBy;
                            }
                        }
                        result.push(obj)
                    }

                    if (result.length > 0) {
                        dataFound(res, result)
                    } else {
                        noData(res)
                    }

                } else {
                    noData(res)
                }

            } else {
                failed(res, 'No columns are specified for this report type = 1')
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const postColumnVisiblity = async (req, res) => {
        const { dataArray, ReportId, CompanyId } = req.body;

        if ((!Array.isArray(dataArray) || dataArray?.length === 0) || !checkIsNumber(ReportId) || !checkIsNumber(CompanyId)) {
            return invalidInput(res, 'dataArray, ReportId, CompanyId is required');
        }

        for (const item of dataArray) {
            if (!checkIsNumber(item.Field_Id) || typeof item.isVisible !== 'number') {
                return invalidInput(res, 'Each element in dataArray must have a valid Field_Id, FilterVisiblity and isVisible');
            }
        }

        try {
            const transaction = new sql.Transaction();
            await transaction.begin();

            try {
                const deleteEsist = new sql.Request(transaction)
                    .input('ReportId', ReportId)
                    .input('CompanyId', CompanyId)
                    .query(`
                        DELETE 
                        FROM 
                            tbl_Report_Column_Visiblity
                        WHERE
                            ReportId = @ReportId
                            AND
                            CompanyId = @CompanyId `)

                await deleteEsist;
            } catch (e) {
                await transaction.rollback();
                return servError(e, res)
            }

            try {
                for (let i = 0; i < dataArray.length; i++) {
                    const insertRequest = new sql.Request(transaction)
                        .input('ReportId', ReportId)
                        .input('CompanyId', CompanyId)
                        .input('Field_Id', dataArray[i].Field_Id)
                        .input('isVisible', Boolean(dataArray[i].Defult_Display) ? 1 : Boolean(dataArray[i].isVisible) ? 1 : 0)
                        .input('OrderBy', dataArray[i].OrderBy ? dataArray[i].OrderBy : null)
                        .query(`
                            INSERT INTO tbl_Report_Column_Visiblity
                                (ReportId, CompanyId, Field_Id, isVisible, OrderBy)
                            VALUES
                                (@ReportId, @CompanyId, @Field_Id, @isVisible, @OrderBy)
                        `)

                    const insertResult = await insertRequest;

                    if (!insertResult.rowsAffected[0] || insertResult.rowsAffected[0] <= 0) {
                        await transaction.rollback();
                        return failed(res, 'Failed to save, Try again')
                    }
                }

            } catch (e) {
                await transaction.rollback();
                return servError(e, res);
            }

            await transaction.commit();
            success(res, 'Changes saved')


        } catch (e) {
            servError(e, res);
        }
    }

    const getSalesData = async (req, res) => {
        const { Company_Id, Ledger_Id, Fromdate, Todate } = req.query;

        if (!checkIsNumber(Company_Id) || !Ledger_Id || !Fromdate || !Todate) {
            return invalidInput(res, 'Company_Id, Ledger_Id, Fromdate, Todate is required')
        }

        try {
            const request = new sql.Request()
                .input('Company_Id', Company_Id)
                .input('Ledger_Id', Ledger_Id)
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .execute('Q_Pay_Online_Sales_Report_VW')

            const result = await request;

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getStockItemBased = async (req, res) => {
        const { Company_Id, Fromdate, Todate } = req.query;

        if (!checkIsNumber(Company_Id) || !Fromdate || !Todate) {
            return invalidInput(res, 'Company_Id, Fromdate, Todate is required')
        }

        try {
            const request = new sql.Request()
                .input('Company_Id', Company_Id)
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .execute('Sales_Values_Items_Online_Report_VW')

            const result = await request;

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const productBasedSalesDetails = async (req, res) => {
        const { Fromdate, Todate } = req.query;
        const { db } = req;

        if (!Fromdate || !Todate) {
            return invalidInput(res, 'Fromdate and Todate is required')
        }

        try {
            const request = new sql.Request(db)
                .input('Fromdate', ISOString(Fromdate))
                .input('Todate', ISOString(Todate))
                .query(`
                    SELECT   
                        p.Stock_Tally_Id,
                        p.Stock_Item,
                        p.Brand,
                        p.Group_ST,
                        p.Bag,
                        p.Stock_Group,
                        p.S_Sub_Group_1,
                        p.Item_Name_Modified,
                        s.sales_party_ledger_id,
                        lol.Ledger_Name,
                        sin.tally_id,
                        sin.sales_tally_id,
                        sin.invoice_no,
                        CONVERT(DATE, s.invoice_date) AS Date,
                        sin.name_item_id,
                        sin.bill_qty,
                        sin.bill_unit,
                        sin.act_unit,
                        sin.item_rate,
                        sin.amount
                    FROM
                        sales_inv_stk_info_ob AS sin, 
                        sales_inv_geninfo_ob AS s, 
                        tbl_Stock_LOS AS p,
                        tbl_Ledger_LOL AS lol
                    WHERE 
                        s.tally_id = sin.tally_id
                        AND s.sales_party_ledger_id = lol.Ledger_Tally_Id
                        AND sin.name_item_id = p.Stock_Tally_Id
                        AND CONVERT(DATE, s.invoice_date) >= CONVERT(DATE, @Fromdate)  
                        AND CONVERT(DATE, s.invoice_date) <= CONVERT(DATE, @Todate)
                    `)

            const result = await request;

            if (result.recordset.length > 0) {
                const getKGs = (inpt) => {
                    const num = inpt.split('kg')
                    return num.length > 1 ? Number(num[0]) : 1
                }
                const withItemRate = result.recordset.map(o => ({
                    ...o,
                    Item_Rate: Number(o?.item_rate) / getKGs(o?.act_unit),
                    Quantity: o?.bill_qty + ' ' + o?.bill_unit
                }))
                dataFound(res, withItemRate)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res);
        }

    }

    const getTallyLOLData = async (req, res) => {
        
        try{
            const lolData = await getLOL(req.db);

            if (lolData.status && lolData.dataArray.length > 0) {
                dataFound(res, lolData.dataArray);
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const getTallyLOSData = async (req, res) => {
        
        try{
            const lolData = await getLOL(req.db);

            if (lolData.status && lolData.dataArray.length > 0) {
                dataFound(res, lolData.dataArray);
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res);
        }
    }


    return {
        getQpayData,
        postColumnVisiblity,
        getQPayColumns,
        getSalesData,
        getStockItemBased,
        productBasedSalesDetails,
        getTallyLOLData,
        getTallyLOSData,
    }

}

export default QPayReport();