import sql from 'mssql';
import { failed, invalidInput, sentData, servError, success } from '../../res.mjs'
import { toArray, toNumber } from '../../helper_functions.mjs';


const createReportColumnVisiblityState = async (req, res) => {
    try {
        const { visibleColumns = [], reportName = '', reportUrl = '', displayName = '', reportGroup= '' } = req.body;

        if (!reportName || !reportUrl || !reportGroup) return invalidInput(res, 'reportName and reportUrl and reportGroup are required')

        const columnsJson = JSON.stringify(toArray(visibleColumns).map(col => ({
            ColumnName: String(col?.ColumnName),
            ColumnOrder: toNumber(col?.ColumnOrder),
        })));

        const request = new sql.Request()
            .input('jsonVisibleColumns', sql.NVarChar(sql.MAX), columnsJson)
            .input('reportName', sql.NVarChar, reportName)
            .input('reportUrl', sql.NVarChar, reportUrl)
            .input('displayName', sql.NVarChar, displayName)
            .input('reportGroup', sql.NVarChar, reportGroup)
            .query(`
                -- removing existing
                DELETE FROM tbl_reports_column_visiblity_state
                WHERE reportName = @reportName AND reportUrl = @reportUrl;
                -- inserting new state
                INSERT INTO tbl_reports_column_visiblity_state (reportName, reportUrl, displayName, reportGroup, columnName, orderNum)
                SELECT
                    @reportName,
                    @reportUrl,
                    @displayName,
                    @reportGroup,
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
                    displayName,
                    reportGroup,
                    reportName,
                    reportUrl
                FROM tbl_reports_column_visiblity_state 
                WHERE reportName <> '' 
                    ${reportName ? ' AND reportName = @reportName ' : ''} 
                    ${reportUrl ? ' AND reportUrl = @reportUrl ' : ''}
                    ${reportGroup ? ' AND reportGroup = @reportGroup ' : ''};`
            );

        const result = await request;

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res)
    }
}

// const getReportVisiblityAndGroupinState = async (req, res) => {
//     try {
//         const { reportGroup } = req.query;

//         if (!reportGroup) return invalidInput(res, 'reportGroup is required');

//         const request = new sql.Request()
//             .input('reportGroup', sql.NVarChar, reportGroup)
//             .query(`
//                 SELECT 
//                     columnName, 
//                     COALESCE(orderNum, 1) AS orderNum,
//                     displayName,
//                     reportGroup,
//                     reportName,
//                     reportUrl
//                 FROM tbl_reports_column_visiblity_state 
//                 WHERE reportGroup = @reportGroup;
//                 SELECT 
//                     columnName, 
//                     COALESCE(orderNum, 1) AS orderNum,
//                     reportGroup,
//                     reportName,
//                     reportUrl
//                 FROM tbl_reports_column_grouping_state 
//                 WHERE reportGroup = @reportGroup;
//             `);

//         const result = await request;

//         sentData(res, result.recordset);
//     } catch (e) {
//         servError(e, res)
//     }
// }

export default {
    createReportColumnVisiblityState,
    getReportColumnVisiblityState
}