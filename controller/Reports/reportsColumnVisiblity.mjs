import sql from 'mssql';
import { failed, invalidInput, sentData, servError, success } from '../../res.mjs'
import { toArray, toNumber } from '../../helper_functions.mjs';


const createReportColumnVisiblityState = async (req, res) => {
    try {
        const { visibleColumns = [], reportName = '', reportUrl = '' } = req.body;

        const columnsJson = JSON.stringify(toArray(visibleColumns).map(col => ({
            ColumnName: String(col?.ColumnName),
            ColumnOrder: toNumber(col?.ColumnOrder),
        })));
        console.log(columnsJson)

        const request = new sql.Request()
            .input('jsonVisibleColumns', sql.NVarChar(sql.MAX), columnsJson)
            .input('reportName', sql.NVarChar, reportName)
            .input('reportUrl', sql.NVarChar, reportUrl)
            .query(`
                -- removing existing
                DELETE FROM tbl_reports_column_visiblity_state
                WHERE reportName = @reportName AND reportUrl = @reportUrl;
                -- inserting new state
                INSERT INTO tbl_reports_column_visiblity_state (reportName, reportUrl, columnName, orderNum)
                SELECT
                    @reportName,
                    @reportUrl,
                    j.[ColumnName],
                    j.[ColumnOrder]
                FROM OPENJSON(@jsonVisibleColumns)
                WITH (
                    ColumnName NVARCHAR(200),
                    ColumnOrder INT
                ) AS j;`
            );

        const result = await request;

        const insertedRows = result.rowsAffected?.[1] ?? 0;

        if (insertedRows === toArray(visibleColumns).length) {
            success(res, 'Changes saved');
        } else {
            failed(res);
        }

    } catch (e) {
        servError(e, res);
    }
}

const getReportColumnVisiblityState = async (req, res) => {
    try {
        const { reportName = '', reportUrl = '' } = req.query;

        if (!reportName || !reportUrl) return invalidInput(res, 'reportName and reportUrl are required')

        const request = new sql.Request()
            .input('reportName', sql.NVarChar, reportName)
            .input('reportUrl', sql.NVarChar, reportUrl)
            .query(`
                SELECT columnName, COALESCE(orderNum, 1) AS orderNum
                FROM tbl_reports_column_visiblity_state 
                WHERE reportName = @reportName AND reportUrl = @reportUrl;`
            );

        const result = await request;

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res)
    }
}


export default {
    createReportColumnVisiblityState,
    getReportColumnVisiblityState
}