import sql from 'mssql';
import { servError, dataFound, noData, success, failed, invalidInput } from '../../res.mjs';
import { checkIsNumber, isValidObject } from '../../helper_functions.mjs'
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { getLargeData } from '../../middleware/miniAPIs.mjs';
dotenv.config();

const getTableAccronym = (arr, tableId) => {
    let str = '';
    for (let i = 0; i < arr.length; i++) {
        if (Number(arr[i].Table_Id) === Number(tableId)) {
            str = arr[i].Table_Accronym;
            break;
        }
    }
    return str;
}

const MobileReportTemplate = () => {

    const getTablesandColumnsForMobileReport = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    WITH TableColumns AS (
                        SELECT * FROM tbl_Table_Master_Columns
                    )
                    SELECT
                        t.*,
                        COALESCE((
                            SELECT c.* FROM TableColumns AS c WHERE c.Table_Id = t.Table_Id FOR JSON PATH
                        ), '[]') AS Columns
                    FROM tbl_Table_Master AS t
                `)

            const result = (await request).recordset

            if (result.length > 0) {
                const parsed = result.map(o => ({
                    ...o,
                    Columns: JSON.parse(o?.Columns)
                }))
                dataFound(res, parsed);
            } else {
                noData(res);
            }

        } catch (e) {
            servError(e, res);
        }
    }

 
const validateDetailRow = (d, i, errors) => {
    if (!checkIsNumber(d.Type)) errors.push(`Row ${i}: Type must be a number`);
    if (!checkIsNumber(d.Table_Id)) errors.push(`Row ${i}: Table_Id must be a number`);
    if (!d.Column_Name || d.Column_Name.trim() === '') errors.push(`Row ${i}: Column_Name is required`);
    

    if (d.List_Type !== undefined && d.List_Type !== null) {
        const listTypes = typeof d.List_Type === "string" 
            ? d.List_Type.split(",").map(Number).filter(n => !isNaN(n))
            : Array.isArray(d.List_Type) 
                ? d.List_Type.map(Number).filter(n => !isNaN(n))
                : [Number(d.List_Type)].filter(n => !isNaN(n));
        
        if (listTypes.length === 0) {
            errors.push(`Row ${i}: List_Type contains no valid numbers`);
        }
    }
};

const insertMobileTemplate = async (req, res) => {
    const { details, GroupFilter, reportName, createdBy } = req.body;
   
    try {

        if (!Array.isArray(details) || details.length < 1 || !reportName || !checkIsNumber(createdBy)) {
            return invalidInput(res, 'details (array), reportName, createdBy are required');
        }

        const errors = [];
        details.forEach((d, i) => validateDetailRow(d, i, errors));
        if (errors.length > 0) return invalidInput(res, `invalid Input errors ${errors.length}`, { errors });

    } catch (e) {
        return failed(res, 'validation error');
    }

    try {
        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
        
            const checkifNameExist = (await new sql.Request()
                .input('Report_Name', sql.NVarChar, reportName)
                .query('SELECT COUNT(*) AS name FROM tbl_Mobile_Report_Type WHERE Report_Name = @Report_Name')).recordset[0]?.name;

            if (checkifNameExist > 0) {
                await transaction.rollback();
                return failed(res, 'Report Name Already Exist');
            }

            const getMaxId = await new sql.Request(transaction).query(`SELECT ISNULL(MAX(Mob_Rpt_Id), 0) + 1 AS NewId FROM tbl_Mobile_Report_Type`);
            const Mob_Rpt_Id = getMaxId.recordset[0].NewId;

          
            await new sql.Request(transaction)
                .input('Mob_Rpt_Id', sql.Int, Mob_Rpt_Id)
                .input('Report_Name', sql.NVarChar, reportName)
                .input('Created_By', sql.Int, createdBy)
                .query(`
                INSERT INTO tbl_Mobile_Report_Type (Mob_Rpt_Id, Report_Name, Created_By, Created_At)
                VALUES (@Mob_Rpt_Id, @Report_Name, @Created_By, GETDATE())
            `);

            // Insert regular filter details
            const insertDetailSql = `
                INSERT INTO tbl_Mobile_Report_Details (Mob_Rpt_Id, Type, Table_Id, Column_Name, List_Type, FilterLevel)
                VALUES (@Mob_Rpt_Id, @Type, @Table_Id, @Column_Name, @List_Type, @FilterLevel)
            `;

            for (const d of details) {
                const TypeVal = Number(d.Type);
                const TableIdVal = Number(d.Table_Id);
                const FilterLevel = Number(d.FilterLevel || d.Level || 1); // Default to 1 if not provided

                // Process List_Type
                const listTypes = typeof d.List_Type === "string"
                    ? d.List_Type.split(",").map(Number).filter(n => !isNaN(n))
                    : Array.isArray(d.List_Type)
                        ? d.List_Type.map(Number).filter(n => !isNaN(n))
                        : [Number(d.List_Type)].filter(n => !isNaN(n));

                // Default to [1] if empty
                if (listTypes.length === 0) {
                    listTypes.push(1);
                }

                for (const lt of listTypes) {
                    await new sql.Request(transaction)
                        .input('Mob_Rpt_Id', sql.Int, Mob_Rpt_Id)
                        .input('Type', sql.Int, TypeVal)
                        .input('Table_Id', sql.Int, TableIdVal)
                        .input('Column_Name', sql.NVarChar, d.Column_Name)
                        .input('List_Type', sql.Int, lt)
                        .input('FilterLevel', sql.Int, FilterLevel)
                        .query(insertDetailSql);
                }
            }

            // Insert Group Filter into tbl_Group_Template if provided
            if (GroupFilter && Array.isArray(GroupFilter) && GroupFilter.length > 0) {
                // Get unique group filters (you might have multiple, but based on your table structure, we'll handle one)
                // Or you can insert multiple if needed
                
                // First, delete any existing group filters for this Mob_Rpt_Id (for update scenario)
                await new sql.Request(transaction)
                    .input('Mob_Rpt_Id', sql.Int, Mob_Rpt_Id)
                    .query('DELETE FROM tbl_Group_Template WHERE Mob_Rpt_Id = @Mob_Rpt_Id');

                // Insert new group filters
                const insertGroupFilterSql = `
                    INSERT INTO tbl_Group_Template (Mob_Rpt_Id,Table_Id, Column_Name)
                    VALUES (@Mob_Rpt_Id,@Table_Id, @Column_Name)
                `;

                // Since your table only has Mob_Rpt_Id and Column_Name, we'll take the first group filter
                // Or you can insert all if you want to support multiple
                const firstGroupFilter = GroupFilter[0];
                if (firstGroupFilter && firstGroupFilter.Column_Name) {
                    await new sql.Request(transaction)
                        .input('Mob_Rpt_Id', sql.Int, Mob_Rpt_Id)
                        .input('Table_Id', sql.NVarChar, firstGroupFilter.Table_Id)
                        .input('Column_Name', sql.NVarChar, firstGroupFilter.Column_Name)
                        .query(insertGroupFilterSql);
                }
                
                // If you want to insert multiple group filters (in case you add more slots later):
                /*
                for (const gf of GroupFilter) {
                    if (gf.Column_Name) {
                        await new sql.Request(transaction)
                            .input('Mob_Rpt_Id', sql.Int, Mob_Rpt_Id)
                            .input('Column_Name', sql.NVarChar, gf.Column_Name)
                            .query(insertGroupFilterSql);
                    }
                }
                */
            }

            // Generate and store report query string
            try {
                const tableMaster = (await new sql.Request(transaction).query('SELECT * FROM tbl_Table_Master')).recordset;
                const distinctTables = [...new Map(details.map(d => [Number(d.Table_Id), d.Table_Id])).values()];

                const colToInsert = details.map(d => {
                    const acc = getTableAccronym(tableMaster, d.Table_Id) || `T${d.Table_Id}`;
                    return `${acc}.${d.Column_Name} AS ${acc}_${d.Column_Name}`;
                });

                if (colToInsert.length > 0) {
                    let queryString = 'SELECT ' + colToInsert.join(', ') + ' FROM ';
                    const fromTables = distinctTables.map(tid => {
                        const tbl = tableMaster.find(x => Number(x.Table_Id) === Number(tid));
                        if (tbl) return `${tbl.Table_Name} AS ${tbl.Table_Accronym}`;
                        return `UnknownTable${tid} AS T${tid}`;
                    });

                    queryString += fromTables.join(', ');

                    await new sql.Request(transaction)
                        .input('Mob_Rpt_Id', sql.Int, Mob_Rpt_Id)
                        .input('Report_Columns', sql.NVarChar, queryString)
                        .query(`
                            IF EXISTS(SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'tbl_Mobile_Report_Type' AND COLUMN_NAME = 'Report_Columns')
                            BEGIN
                                UPDATE tbl_Mobile_Report_Type SET Report_Columns = @Report_Columns WHERE Mob_Rpt_Id = @Mob_Rpt_Id
                            END
                        `);
                }
            } catch (e) {
                console.log('Query string generation failed, continuing...', e.message);
                // Continue even if query generation fails
            }

            await transaction.commit();
            success(res, 'Mobile Template Created Successfully', { Mob_Rpt_Id });

        } catch (e) {
            await transaction.rollback();
            return servError(e, res, 'Error creating mobile template');
        }
    } catch (e) {
        servError(e, res);
    }
};


 const getMobileTemplates = async (req, res) => {
    const { Mob_Rpt_Id } = req.query;

    try {
        let query = `
        WITH mobType AS (
            SELECT m.Mob_Rpt_Id, m.Report_Name, m.Created_By, m.Created_At, m.Update_By, m.Update_At,
                   COALESCE(u.Name, 'User Not Found') AS CreatedByGet
            FROM tbl_Mobile_Report_Type AS m
            LEFT JOIN tbl_Users AS u ON m.Created_By = u.UserId
        ), tableMaster AS (
            SELECT * FROM tbl_Table_Master
        ), mobDetails AS (
            SELECT * FROM tbl_Mobile_Report_Details
        )
        SELECT
            m.*,
            COALESCE((
                SELECT 
                    d.Type, 
                    d.Table_Id, 
                    tbl.Table_Name, 
                    tbl.Table_Accronym, 
                    d.Column_Name, 
                    d.FilterLevel,
                    d.List_Type,
                    CASE 
                        WHEN d.List_Type = '1' THEN 'Sum'
                        WHEN d.List_Type = '2' THEN 'Avg'
                        ELSE d.List_Type
                    END AS List_Type_Display
                FROM mobDetails AS d
                LEFT JOIN tableMaster AS tbl ON tbl.Table_Id = d.Table_Id
                WHERE d.Mob_Rpt_Id = m.Mob_Rpt_Id
                FOR JSON PATH
            ), '[]') AS detailsList,
            COALESCE((
                SELECT 
                    gf.Table_Id,
                    gf.Column_Name,
                    tbls.Table_Name, 
                    tbls.Table_Accronym
                FROM tbl_Group_Template AS gf
                LEFT JOIN tableMaster AS tbls ON tbls.Table_Id = gf.Table_Id
                WHERE gf.Mob_Rpt_Id = m.Mob_Rpt_Id
                FOR JSON PATH
            ), '[]') AS groupFiltersList
        FROM mobType AS m
        `;

        const request = new sql.Request();
        if (checkIsNumber(Mob_Rpt_Id)) {
            query += ' WHERE m.Mob_Rpt_Id = @Mob_Rpt_Id';
            request.input('Mob_Rpt_Id', sql.Int, Mob_Rpt_Id);
        }

        const result = await request.query(query);
        const reports = result.recordset;

        if (reports.length > 0) {
            const parse = reports.map(o => ({
                ...o,
                detailsList: JSON.parse(o.detailsList),
                groupFiltersList: o.groupFiltersList ? JSON.parse(o.groupFiltersList) : []
            }));

            if (checkIsNumber(Mob_Rpt_Id)) {
                const single = parse[0];
                
             
                const groupFilterArray = (single.groupFiltersList || []).map(gf => ({
                    Type: 7,
                    Table_Id: Number(gf.Table_Id),
                    Column_Name: gf.Column_Name,
                    List_Type: "1,2", 
                    Level: 3 
                }));

                const responsePayload = {
                    Mob_Rpt_Id: single.Mob_Rpt_Id,
                    reportName: single.Report_Name,
                    GroupFilter: groupFilterArray, 
                    CreatedBy: single.CreatedByGet ?? single.Created_By,
                    details: (single.detailsList || []).map(d => ({
                        Type: Number(d.Type),
                        Table_Id: Number(d.Table_Id),
                        Table_Name: d.Table_Name ?? null,
                        Table_Accronym: d.Table_Accronym ?? null,
                        Column_Name: d.Column_Name,
                        List_Type: d.List_Type !== undefined && d.List_Type !== null ? Number(d.List_Type) : null,
                        FilterLevel: d.FilterLevel ? Number(d.FilterLevel) : null
                    }))
                };
                return dataFound(res, responsePayload); 
            }

          
            const allTemplates = parse.map(template => ({
                Mob_Rpt_Id: template.Mob_Rpt_Id,
                Report_Name: template.Report_Name,
                Created_By: template.Created_By,
                CreatedByGet: template.CreatedByGet,
                Created_At: template.Created_At,
                Update_By: template.Update_By,
                Update_At: template.Update_At,
                detailsList: template.detailsList,
                groupFiltersList: template.groupFiltersList,
                hasGroupFilter: template.groupFiltersList.length > 0
            }));
            
            dataFound(res, allTemplates);
        } else {
            noData(res);
        }

    } catch (e) {
        servError(e, res);
    }
};


    const executeMobileTemplateSQL = async (req, res) => {
        const { Mob_Rpt_Id, filterReq } = req.body;
        let exeQuery = '';

        if (!checkIsNumber(Mob_Rpt_Id)) return invalidInput(res, 'Mob_Rpt_Id is required');

        try {
            const exeQueryResult = await new sql.Request()
                .input('Mob_Rpt_Id', sql.Int, Mob_Rpt_Id)
                .query('SELECT Report_Columns FROM tbl_Mobile_Report_Type WHERE Mob_Rpt_Id = @Mob_Rpt_Id');

            exeQuery = exeQueryResult.recordset[0]?.Report_Columns;

            if (!exeQuery) return failed(res, 'Query Not Found for this mobile template');

            const filterIsObject = isValidObject(filterReq);
            let filterText = [];

            if (filterIsObject) {
               
                const mobileDetailsReq = await new sql.Request()
                    .input('Mob_Rpt_Id', Mob_Rpt_Id)
                    .query('SELECT d.*, t.Table_Accronym FROM tbl_Mobile_Report_Details d LEFT JOIN tbl_Table_Master t ON d.Table_Id = t.Table_Id WHERE d.Mob_Rpt_Id = @Mob_Rpt_Id');

                const rows = mobileDetailsReq.recordset;
                const structure = { tables: [] };

                structure.tables = rows.reduce((acc, r) => {
                    const table = acc.find(t => Number(t.Table_Id) === Number(r.Table_Id));
                    if (!table) {
                        acc.push({
                            Table_Id: r.Table_Id,
                            Table_Accronym: r.Table_Accronym,
                            columns: [{ Column_Name: r.Column_Name, Table_Id: r.Table_Id, accessColumnName: `${r.Table_Accronym}.${r.Column_Name}` }]
                        });
                    } else {
                        table.columns.push({ Column_Name: r.Column_Name, Table_Id: r.Table_Id, accessColumnName: `${r.Table_Accronym}.${r.Column_Name}` });
                    }
                    return acc;
                }, []);

                const columns = structure.tables.reduce((colArr, t) => colArr.concat(t.columns), []);

                Object.entries(filterReq).forEach(([key, value]) => {
                    let columnInfo = columns.find(col => col.Column_Name === key || `${col.Table_Id}_${col.Column_Name}` === key);
                    if (columnInfo) {
                        switch (value.type) {
                            case 'range':
                                if (value?.value?.min) filterText.push(` ${columnInfo.accessColumnName} >= '${value.value.min}' `);
                                if (value?.value?.max) filterText.push(` ${columnInfo.accessColumnName} <= '${value.value.max}' `);
                                break;
                            case 'date':
                                if (value?.value?.start) filterText.push(` CONVERT(DATE, ${columnInfo.accessColumnName}) >= CONVERT(DATE, '${value.value.start}') `);
                                if (value?.value?.end) filterText.push(` CONVERT(DATE, ${columnInfo.accessColumnName}) <= CONVERT(DATE, '${value.value.end}') `);
                                break;
                            case 'textCompare':
                                if (value?.value) filterText.push(` LOWER(${columnInfo.accessColumnName}) LIKE LOWER('%${value.value}%') `);
                                break;
                            default:
                                break;
                        }
                    }
                });

                exeQuery += filterText.length > 0 ? (String(exeQuery).includes('WHERE') ? ' AND ' + filterText.join(' AND ') : ' WHERE ' + filterText.join(' AND ')) : '';
            }

            const getQueryResult = await getLargeData(exeQuery, req.db);

            if (getQueryResult.length > 0) dataFound(res, getQueryResult); else noData(res);

        } catch (e) {
            servError(e, res, 'Server error', { exeQuery });
        }
    }

const updateMobileTemplate = async (req, res) => {
    const { Report_Type_Id, reportName, updatedBy, details, GroupFilter } = req.body; // Added GroupFilter

    try {
        if (!checkIsNumber(Report_Type_Id) || !Array.isArray(details) || details.length < 1 || !reportName || !checkIsNumber(updatedBy)) {
            return invalidInput(res, 'Report_Type_Id, details (array), reportName, updatedBy are required');
        }

        const errors = [];
        details.forEach((d, i) => validateDetailRow(d, i, errors));
        if (errors.length > 0) return invalidInput(res, `invalid Input errors ${errors.length}`, { errors });

    } catch {
        return failed(res, 'validation error');
    }

    try {
        const transaction = new sql.Transaction();
        await transaction.begin();

        try {
            // Check if report name already exists (excluding current report)
            const nameExists = (await new sql.Request(transaction)
                .input('Report_Name', sql.NVarChar, reportName)
                .input('Report_Type_Id', sql.Int, Report_Type_Id)
                .query(`SELECT COUNT(*) AS name FROM tbl_Mobile_Report_Type WHERE Report_Name = @Report_Name AND Mob_Rpt_Id != @Report_Type_Id`)
            ).recordset[0]?.name;

            if (nameExists > 0) {
                await transaction.rollback();
                return failed(res, 'Report Name Already Exist');
            }

            // Update main report type
            await new sql.Request(transaction)
                .input('Report_Name', sql.NVarChar, reportName)
                .input('Update_By', sql.Int, updatedBy)
                .input('Report_Type_Id', sql.Int, Report_Type_Id)
                .query(`
                UPDATE tbl_Mobile_Report_Type
                SET Report_Name = @Report_Name, Update_By = @Update_By, Update_At = GETDATE()
                WHERE Mob_Rpt_Id = @Report_Type_Id
            `);

            // Delete existing details
            await new sql.Request(transaction)
                .input('Report_Type_Id', sql.Int, Report_Type_Id)
                .query(`DELETE FROM tbl_Mobile_Report_Details WHERE Mob_Rpt_Id = @Report_Type_Id`);

            // Insert new details
            const insertDetailSql = `
                INSERT INTO tbl_Mobile_Report_Details (Mob_Rpt_Id, Type, Table_Id, Column_Name, List_Type, FilterLevel)
                VALUES (@Mob_Rpt_Id, @Type, @Table_Id, @Column_Name, @List_Type, @FilterLevel)
            `;

            for (const d of details) {
                const TypeVal = Number(d.Type);
                const TableIdVal = Number(d.Table_Id);
                const LevelVal = Number(d.FilterLevel) || (TypeVal >= 4 && TypeVal <= 6 ? 2 : 1); 

                const listTypes = typeof d.List_Type === "string"
                    ? d.List_Type.split(",").map(Number).filter(n => !isNaN(n))
                    : Array.isArray(d.List_Type)
                        ? d.List_Type.map(Number).filter(n => !isNaN(n))
                        : [Number(d.List_Type)].filter(n => !isNaN(n));

                // Default to [1] if empty
                if (listTypes.length === 0) {
                    listTypes.push(1);
                }

                for (const lt of listTypes) {
                    await new sql.Request(transaction)
                        .input('Mob_Rpt_Id', sql.Int, Report_Type_Id)
                        .input('Type', sql.Int, TypeVal)
                        .input('Table_Id', sql.Int, TableIdVal)
                        .input('Column_Name', sql.NVarChar, d.Column_Name)
                        .input('List_Type', sql.Int, lt)
                        .input('FilterLevel', sql.Int, LevelVal) 
                        .query(insertDetailSql);
                }
            }

            // Handle Group Filter - ADDED THIS SECTION
            // Delete existing group filters for this template
            await new sql.Request(transaction)
                .input('Mob_Rpt_Id', sql.Int, Report_Type_Id)
                .query(`DELETE FROM tbl_Group_Template WHERE Mob_Rpt_Id = @Mob_Rpt_Id`);

            // Insert new group filter if provided
            if (GroupFilter && Array.isArray(GroupFilter) && GroupFilter.length > 0) {
                const insertGroupFilterSql = `
                    INSERT INTO tbl_Group_Template (Mob_Rpt_Id,Table_Id, Column_Name)
                    VALUES (@Mob_Rpt_Id, @Table_Id,@Column_Name)
                `;

                // Take the first group filter (or insert all if you want multiple)
                const firstGroupFilter = GroupFilter[0];
                if (firstGroupFilter && firstGroupFilter.Column_Name) {
                    await new sql.Request(transaction) 
                        .input('Mob_Rpt_Id',  Report_Type_Id) 
                        .input('Table_Id', firstGroupFilter.Table_Id)   
                        .input('Column_Name',  firstGroupFilter.Column_Name)
                        .query(insertGroupFilterSql);
                }
                
                // If you want to support multiple group filters, use this loop instead:
                /*
                for (const gf of GroupFilter) {
                    if (gf.Column_Name) {
                        await new sql.Request(transaction)
                            .input('Mob_Rpt_Id', sql.Int, Report_Type_Id)
                            .input('Column_Name', sql.NVarChar, gf.Column_Name)
                            .query(insertGroupFilterSql);
                    }
                }
                */
            }

            // Generate and store report query string
            try {
                const tableMaster = (await new sql.Request(transaction).query('SELECT * FROM tbl_Table_Master')).recordset;
                const distinctTables = [...new Map(details.map(d => [Number(d.Table_Id), d.Table_Id])).values()];

                const colToInsert = details.map(d => {
                    const acc = getTableAccronym(tableMaster, d.Table_Id) || `T${d.Table_Id}`;
                    return `${acc}.${d.Column_Name} AS ${acc}_${d.Column_Name}`;
                });

                if (colToInsert.length > 0) {
                    let queryString = 'SELECT ' + colToInsert.join(', ') + ' FROM ';
                    const fromTables = distinctTables.map(tid => {
                        const tbl = tableMaster.find(x => Number(x.Table_Id) === Number(tid));
                        if (tbl) return `${tbl.Table_Name} AS ${tbl.Table_Accronym}`;
                        return `UnknownTable${tid} AS T${tid}`;
                    });

                    queryString += fromTables.join(', ');

                    await new sql.Request(transaction)
                        .input('Report_Type_Id', sql.Int, Report_Type_Id)
                        .input('Report_Columns', sql.NVarChar, queryString)
                        .query(`
                         IF NOT EXISTS (
	SELECT 1 
	FROM INFORMATION_SCHEMA.COLUMNS 
	WHERE TABLE_NAME = 'tbl_Mobile_Report_Type' 
	  AND COLUMN_NAME = 'Report_Columns'
)
BEGIN
	ALTER TABLE tbl_Mobile_Report_Type
	ADD Report_Columns NVARCHAR(MAX);
END

IF EXISTS (
	SELECT 1 
	FROM INFORMATION_SCHEMA.COLUMNS 
	WHERE TABLE_NAME = 'tbl_Mobile_Report_Type' 
	  AND COLUMN_NAME = 'Report_Columns'
)
BEGIN
    EXEC sp_executesql N'
        UPDATE tbl_Mobile_Report_Type
        SET Report_Columns = @Report_Columns,
            Update_At = GETDATE()
        WHERE Mob_Rpt_Id = @Report_Type_Id
    ',
    N'@Report_Columns NVARCHAR(MAX), @Report_Type_Id INT',
    @Report_Columns, @Report_Type_Id;
END
 `);
                }
            } catch (e) {
                console.log('Query string generation failed, continuing...', e.message);
            }

            await transaction.commit();
            return success(res, 'Mobile Template Updated Successfully');

        } catch (err) {
            await transaction.rollback();
            return servError(err, res, 'Error updating mobile template');
        }
    } catch (err) {
        servError(err, res);
    }
};


    const deleteMobileTemplate = async (req, res) => {
        const { Mob_Rpt_Id } = req.body;

        try {
            if (!checkIsNumber(Mob_Rpt_Id)) {
                return invalidInput(res, 'Mob_Rpt_Id is required');
            }

            const request = new sql.Request()
                .input('Mob_Rpt_Id', sql.Int, Mob_Rpt_Id)
                .query(`
                    DELETE FROM tbl_Mobile_REPORT_Details WHERE Mob_Rpt_Id = @Mob_Rpt_Id;
                    DELETE FROM tbl_Mobile_REPORT_Type WHERE Mob_Rpt_Id = @Mob_Rpt_Id;
                `);

            await request;
            success(res, 'Mobile Template deleted successfully');
        } catch (e) {
            servError(e, res);
        }
    }

    const saveMobileReportState = async (req, res) => {
        const { Mob_Rpt_Id, ReportState } = req.body;

        try {
            if (!checkIsNumber(Mob_Rpt_Id) || !ReportState) {
                return invalidInput(res, 'Mob_Rpt_Id and ReportState are required');
            }

            const request = new sql.Request()
                .input('Mob_Rpt_Id', sql.Int, Mob_Rpt_Id)
                .input('ReportState', JSON.stringify(ReportState))
                .query(`
                    UPDATE tbl_Mobile_Report_Type
                    SET
                        ReportState = @ReportState
                    WHERE
                        Mob_Rpt_Id = @Mob_Rpt_Id
                `);

            const result = await request;
            if (result.rowsAffected[0] > 0) {
                success(res, 'Mobile Report State Saved');
            } else {
                failed(res, 'Failed to save Mobile Report State');
            }
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getTablesandColumnsForMobileReport,
        insertMobileTemplate,
        getMobileTemplates,
        executeMobileTemplateSQL,
        updateMobileTemplate,
        deleteMobileTemplate,
        saveMobileReportState
    }
}

export default MobileReportTemplate();
