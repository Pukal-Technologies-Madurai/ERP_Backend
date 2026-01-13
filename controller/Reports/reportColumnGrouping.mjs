import sql from 'mssql';
import { failed, invalidInput, sentData, servError, success } from '../../res.mjs'
import { toArray, toNumber } from '../../helper_functions.mjs';


export const createReportColumnGroupingState = async (req, res) => {
    try {
        const { groupingColumns = [], reportName = '', reportUrl = '', reportGroup= '' } = req.body;

        if (!reportName || !reportUrl || !reportGroup) return invalidInput(res, 'reportName and reportUrl and reportGroup are required')

        const columnsJson = JSON.stringify(toArray(groupingColumns).map(col => ({
            ColumnName: String(col?.ColumnName),
            ColumnOrder: toNumber(col?.ColumnOrder),
        })));

        const request = new sql.Request()
            .input('jsonGroupingColumns', sql.NVarChar(sql.MAX), columnsJson)
            .input('reportName', sql.NVarChar, reportName)
            .input('reportUrl', sql.NVarChar, reportUrl)
            .input('reportGroup', sql.NVarChar, reportGroup)
            .query(`
                -- removing existing
                DELETE FROM tbl_reports_column_grouping_state
                WHERE reportName = @reportName AND reportUrl = @reportUrl;
                -- inserting new state
                INSERT INTO tbl_reports_column_grouping_state (reportName, reportUrl, reportGroup, columnName, orderNum)
                SELECT
                    @reportName,
                    @reportUrl,
                    @reportGroup,
                    j.[ColumnName],
                    j.[ColumnOrder]
                FROM OPENJSON(@jsonGroupingColumns)
                WITH (
                    ColumnName NVARCHAR(200),
                    ColumnOrder INT
                ) AS j;`
            );

        const result = await request;

        const insertedRows = result.rowsAffected?.[1] ?? 0;

        if (insertedRows === toArray(groupingColumns).length) {
            success(res, 'Changes saved');
        } else {
            failed(res);
        }

    } catch (e) {
        servError(e, res);
    }
}

export const getReportColumnGroupingState = async (req, res) => {
    try {
        const { reportName = '', reportUrl = '', reportGroup = '' } = req.query;

        // if (!reportName || !reportUrl || !reportGroup) return invalidInput(res, 'reportName and reportUrl and reportGroup are required')

        const request = new sql.Request()
            .input('reportName', sql.NVarChar, reportName)
            .input('reportUrl', sql.NVarChar, reportUrl)
            .input('reportGroup', sql.NVarChar, reportGroup)
            .query(`
                SELECT 
                    columnName, 
                    COALESCE(orderNum, 1) AS orderNum,
                    reportGroup,
                    reportName,
                    reportUrl
                FROM tbl_reports_column_grouping_state 
                ${(reportName || reportUrl || reportGroup) ? ' WHERE ' : ''} 
                    ${reportName ? ' reportName = @reportName ' : ''} 
                    ${reportUrl ? ' AND reportUrl = @reportUrl ' : ''}
                    ${reportGroup ? ' AND reportGroup = @reportGroup ' : ''};`
            );

        const result = await request;

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res)
    }
}
