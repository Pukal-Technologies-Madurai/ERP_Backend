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

const ReportTemplate = () => {

    const getTablesandColumnsForReport = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    WITH TableColumns AS (
                        SELECT
                            *
                        FROM
                            tbl_Table_Master_Columns
                    )
                    SELECT
                        t.*,
                        COALESCE((
                            SELECT
                                c.*
                            FROM
                                TableColumns AS c
                            WHERE
                                c.Table_Id = t.Table_Id
                            FOR JSON PATH
                        ), '[]') AS Columns
                    FROM 
                        tbl_Table_Master AS t
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

    const insertTemplate = async (req, res) => {
        const { tables, reportName, createdBy, tableJoins } = req.body;

        try {
            if (!Array.isArray(tables) || tables.length < 1 || !reportName || !checkIsNumber(createdBy) || !Array.isArray(tableJoins)) {
                return invalidInput(res, 'tables, reportName, createdBy, tableJoins is required');
            }

            let errorCount = 0;
            let errors = [];

            for (let i = 0; i < tables.length; i++) {
                if (!checkIsNumber(tables[i].Table_Id)) {
                    errorCount += 1;
                    errors.push('Table Id missing')
                }
                if (Array.isArray(tables[i].columns) && tables[i].columns.length !== 0 && checkIsNumber(tables[i].Table_Id)) {
                    for (let j = 0; j < tables[i].columns; j++) {
                        if (!tables[i]?.columns[j]?.Column_Name) {
                            errorCount += 1;
                            errors.push('Column_Name missing')
                        }
                    }
                } else {
                    errorCount += 1;
                    errors.push('Invalid columns array inside table array')
                }
            }

            if (tables.reduce((sum, obj) => sum += Boolean(Number(obj?.isChecked)) ? 1 : 0, 0) > 1 && tableJoins.length !== 0) {
                if (tableJoins.length > 0) {
                    for (let i = 0; i < tableJoins.length; i++) {
                        if (!tableJoins[i]?.Join_First_Table_Id) {
                            errorCount += 1;
                            errors.push('Join_First_Table_Id is missing in tableJoins')
                        }
                        if (!tableJoins[i]?.Join_First_Table_Column) {
                            errorCount += 1;
                            errors.push('Join_First_Table_Column is missing in tableJoins')
                        }
                        if (!tableJoins[i]?.Join_Second_Table_Id) {
                            errorCount += 1;
                            errors.push('Join_Second_Table_Id is missing in tableJoins')
                        }
                        if (!tableJoins[i]?.Join_Second_Table_Column) {
                            errorCount += 1;
                            errors.push('Join_Second_Table_Column is missing in tableJoins')
                        }
                    }
                }
            }
            // else {
            //     errorCount += 1;
            //     errors.push('multiple tables received but no joins are supplied')
            // }

            if (errorCount > 0) {
                return invalidInput(res, `invalid Input errors ${errorCount}`, { errors });
            }

        } catch (e) {
            return failed(res, 'validation error')
        }

        try {
            const transaction = new sql.Transaction()
            await transaction.begin();

            try {
                // Check if Report Name Already Exists
                const checkifReportNameExist = (await new sql.Request()
                    .input('Report_Name', reportName)
                    .query('SELECT COUNT(*) AS name FROM tbl_Report_Type WHERE Report_Name = @Report_Name')).recordset[0]?.name

                if (checkifReportNameExist > 0) {
                    return failed(res, 'Report Name Already Exist')
                }

                // Creating Report Type
                const reportTypeInsertRequest = new sql.Request(transaction)
                    .input('reportName', reportName)
                    .input('CreatedBy', createdBy)
                    .query(`
                        INSERT INTO tbl_Report_Type
                            (Report_Name, CreatedBy)
                        VALUES
                            (@reportName, @CreatedBy);
                        
                        SELECT SCOPE_IDENTITY() AS ReportID;`);

                const reportTypeInsertResult = await reportTypeInsertRequest;

                const rowInserted = reportTypeInsertResult.rowsAffected[0] > 0;
                const ReportID = reportTypeInsertResult.recordset[0].ReportID;

                const tableMaster = (await sql.query('SELECT * FROM tbl_Table_Master')).recordset;
                const colToInsert = [];

                if (rowInserted) {
                    //Inserting Tables and Columns 

                    for (let i = 0; i < tables.length; i++) {
                        for (let j = 0; j < tables[i]?.columns?.length; j++) {

                            colToInsert.push(
                                getTableAccronym(tableMaster, tables[i]?.Table_Id) + 
                                '.' + 
                                tables[i]?.columns[j]?.Column_Name + 
                                ' AS ' +
                                getTableAccronym(tableMaster, tables[i]?.Table_Id) +
                                '_' +
                                tables[i]?.columns[j]?.Column_Name
                            );

                            const columnsInsertRequest = new sql.Request(transaction)
                                .input('Report_Type_Id', ReportID)
                                .input('Table_Id', tables[i]?.Table_Id)
                                .input('Column_Name', tables[i]?.columns[j]?.Column_Name)
                                .input('Order_By', tables[i]?.columns[j]?.Order_By)
                                .query(`
                                INSERT INTO tbl_ReportColumns
                                    (Report_Type_Id, Table_Id, Column_Name, Order_By)
                                VALUES
                                    (@Report_Type_Id, @Table_Id, @Column_Name, @Order_By)
                                `)

                            const result = (await columnsInsertRequest).rowsAffected[0];

                            if (result === 0) {
                                await transaction.rollback();
                                return failed(res, 'Failed to insert Columns')
                            }
                        }
                    }

                    if (tables.length > 1 && tableJoins.length > 0) {
                        // Inserting Table Joins if exist 
                        for (let i = 0; i < tableJoins.length; i++) {
                            const joinsInsertRequest = new sql.Request(transaction)
                                .input('Report_Type_Id', ReportID)
                                .input('Join_First_Table_Id', tableJoins[i]?.Join_First_Table_Id)
                                .input('Join_First_Table_Column', tableJoins[i]?.Join_First_Table_Column)
                                .input('Join_Second_Table_Id', tableJoins[i]?.Join_Second_Table_Id)
                                .input('Join_Second_Table_Column', tableJoins[i]?.Join_Second_Table_Column)
                                .query(`
                                    INSERT INTO tbl_Report_Table_Join
                                        (Report_Type_Id, Join_First_Table_Id, Join_First_Table_Column, Join_Second_Table_Id, Join_Second_Table_Column)
                                    VALUES
                                        (@Report_Type_Id, @Join_First_Table_Id, @Join_First_Table_Column, @Join_Second_Table_Id, @Join_Second_Table_Column)
                                `)

                            const result = (await joinsInsertRequest).rowsAffected[0];

                            if (result === 0) {
                                await transaction.rollback();
                                return failed(res, 'Failed to insert Joins')
                            }
                        }
                    }

                    // Generating sql Query 
                    let queryString = 'SELECT ' + colToInsert.join(', ') + ' FROM ';

                    queryString += tables.map(table => `${table.Table_Name} AS ${getTableAccronym(tableMaster, table.Table_Id)}`).join(', ');

                    if (tableJoins.length > 0) {
                        const joinConditions = tableJoins.map(join => {
                            const table1Alias = getTableAccronym(tableMaster, join.Join_First_Table_Id);
                            const table2Alias = getTableAccronym(tableMaster, join.Join_Second_Table_Id);
                            return `${table1Alias}.${join.Join_First_Table_Column} = ${table2Alias}.${join.Join_Second_Table_Column}`;
                        });
                        queryString += ' WHERE ' + joinConditions.join(' AND ');
                    }

                    const updateReport = new sql.Request(transaction)
                        .input('queryString', queryString)
                        .input('Report_Type_Id', ReportID)
                        .query(`
                            UPDATE 
                                tbl_Report_Type
                            SET
                                Report_Columns = @queryString
                            WHERE
                                Report_Type_Id = @Report_Type_Id
                            `)

                    const updateResult = await updateReport;

                    if (updateResult.rowsAffected[0] === 0) {
                        await transaction.rollback();
                        return failed(res, 'Failed to update Query')
                    }

                    transaction.commit();
                    success(res, 'Template Created Successfully');

                } else {
                    await transaction.rollback();
                    return failed(res, 'Failed to create ReportName')
                }

            } catch (e) {
                await transaction.rollback();
                return servError(e, res, 'ReportName already exists')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getTemplates = async (req, res) => {

        const { ReportId } = req.query;

        try {
            let query = `
            WITH reportName AS (
                	SELECT 
                    	r.*,
                    	COALESCE(u.Name, 'User Not Found') AS CreatedByGet
                    FROM 
                    	tbl_Report_Type AS r
                    	LEFT JOIN tbl_Users AS u
                    	ON r.CreatedBy = u.UserId
                    WHERE 
                    	Type = 1
                ), tableMaster AS (
                	SELECT * FROM tbl_Table_Master
                ), tableColumns AS (
                	SELECT * FROM tbl_Table_Master_Columns
                ), columnsList AS (
                	SELECT * FROM tbl_ReportColumns
                ), joinList AS (
                	SELECT * FROM tbl_Report_Table_Join
                ) 
                SELECT 
                	r.*,
                	COALESCE((
                		SELECT 
                			DISTINCT cl.Table_Id,
                			tbl.Table_Name,
                			tbl.AliasName,
                			tbl.Table_Type,
                			tbl.Table_Accronym,
                			COALESCE((
                				SELECT
                                    clm.Table_Id,
                                    clm.Column_Data_Type,
                                    clm.IS_Default,
                                    clm.IS_Join_Key,
                					clmlist.Column_Name,
                					clmlist.Report_Type_Id,
                					clmlist.Order_By
                				FROM
                					columnsList AS clmlist,
                					tableColumns AS clm
                				WHERE
                					clmlist.Table_Id = cl.Table_Id
                					AND
                                    clm.Table_Id = cl.Table_Id
                                    AND
                					clmlist.Column_Name = clm.Column_Name
                					AND
                					clmlist.Report_Type_Id = r.Report_Type_Id
                				FOR JSON PATH
                			), '[]') AS columnsList
                		FROM
                			columnsList AS cl,
                			tableMaster AS tbl
                		WHERE
                			cl.Report_Type_Id = r.Report_Type_Id
                			AND
                			tbl.Table_Id = cl.Table_Id
                		FOR JSON PATH
                	), '[]') AS tablesList,
                	COALESCE((
                		SELECT
                			jlist.*,
                			tmlistOne.Table_Name AS FirstTableName,
                			tmlistTwo.Table_Name AS SecondTableName
                		FROM
                			joinList AS jlist,
                			tableMaster AS tmlistOne,
                			tableMaster AS tmlistTwo
                		WHERE
                			jlist.Report_Type_Id = r.Report_Type_Id
                			AND
                			tmlistOne.Table_Id = jlist.Join_First_Table_Id
                			AND
                			tmlistTwo.Table_Id = jlist.Join_Second_Table_Id
                		FOR JSON PATH
                	), '[]') AS TableJoins
                From 
                	reportName AS r
            `

            if (checkIsNumber(ReportId)) {
                query += ' WHERE r.Report_Type_Id = @Report_Type_Id';
            }

            const request = new sql.Request();

            if (checkIsNumber(ReportId)) {
                request.input('Report_Type_Id', ReportId);
            }

            const result = await request.query(query);
            const reports = result.recordset;

            if (reports.length > 0) {
                const parseOne = reports.map(o => ({
                    ...o,
                    tablesList: JSON.parse(o.tablesList),
                    TableJoins: JSON.parse(o.TableJoins)
                }))
                const parseTwo = parseOne.map(o => ({
                    ...o,
                    tablesList: o?.tablesList?.map(oo => ({
                        ...oo,
                        columnsList: JSON.parse(oo?.columnsList)
                    }))
                }))
                dataFound(res, parseTwo)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const executeTemplateSQL = async (req, res) => {
        const { ReportID, filterReq } = req.body;
        let exeQuery = '';

        if (!checkIsNumber(ReportID)) {
            return invalidInput(res, 'ReportID is required');
        }

        try {
            let exeQueryResult = await new sql.Request()
                .input('Report_Type_Id', sql.Int, ReportID)
                .query('SELECT Report_Columns FROM tbl_Report_Type WHERE Report_Type_Id = @Report_Type_Id');

            exeQuery = exeQueryResult.recordset[0]?.Report_Columns;
            let filterText = [];

            if (!exeQuery) {
                return failed(res, 'Query Not Found');
            } else {
                const whereExist = String(exeQuery).includes('WHERE');
                const filterIsObject = isValidObject(filterReq);

                if (filterIsObject) {
                    const response = await fetch(`${process.env.domain}api/reports/template?ReportId=${ReportID}`);
                    const data = await response.json();

                    if (data.success) {
                        exeQuery += filterIsObject ? (!whereExist ? ' WHERE ' : ' AND ') : '';
                        const o = data.data[0];
                        const structure = {
                            Report_Type_Id: o?.Report_Type_Id,
                            reportName: o?.Report_Name,
                            tables: o?.tablesList?.map(table => ({
                                Table_Id: table?.Table_Id,
                                Table_Name: table?.Table_Name,
                                AliasName: table?.AliasName,
                                Table_Accronym: table?.Table_Accronym,
                                isChecked: true,
                                columns: table?.columnsList?.map(column => ({
                                    Column_Data_Type: column?.Column_Data_Type,
                                    Column_Name: column?.Column_Name,
                                    IS_Default: column?.IS_Default,
                                    IS_Join_Key: column?.IS_Join_Key,
                                    Order_By: column?.Order_By,
                                    Table_Id: column?.Table_Id,
                                    isVisible: true,
                                    accessColumnName: `${table?.Table_Accronym}.${column?.Column_Name}`
                                }))
                            }))
                        };

                        const columns = structure.tables.reduce((colArr, table) => colArr.concat(table.columns), []);

                        Object.entries(filterReq).forEach(([key, value]) => {
                            let columnInfo = columns.find(col => col.Column_Name === key);
                            if (columnInfo) {
                                switch (value.type) {
                                    case 'range':
                                        if (value?.value?.min) {
                                            filterText.push(` ${columnInfo.accessColumnName} >= '${value.value.min}' `);
                                        }
                                        if (value?.value?.max) {
                                            filterText.push(` ${columnInfo.accessColumnName} <= '${value.value.max}' `);
                                        }
                                        break;
                                    case 'date':
                                        if (value?.value?.start) {
                                            filterText.push(` CONVERT(DATE, ${columnInfo.accessColumnName}) >= CONVERT(DATE, '${value.value.start}') `);
                                        }
                                        if (value?.value?.end) {
                                            filterText.push(` CONVERT(DATE, ${columnInfo.accessColumnName}) <= CONVERT(DATE, '${value.value.end}') `);
                                        }
                                        break;
                                    case 'textCompare':
                                        if (value?.value) {
                                            filterText.push(` LOWER(${columnInfo.accessColumnName}) LIKE LOWER('%${value.value}%') `);
                                        }
                                        break;
                                    default:
                                        break;
                                }
                            }
                        });

                        exeQuery += filterText.join(' AND ');
                    }
                }
            }

            const getQueryResult = await getLargeData(exeQuery, req.db);

            if (getQueryResult.length > 0) {
                dataFound(res, getQueryResult);
            } else {
                noData(res);
            }

        } catch (e) {
            servError(e, res, 'Server error', { exeQuery });
        }
    };

    const updateTemplate = async (req, res) => {
        const { tables, Report_Type_Id, reportName, createdBy, tableJoins } = req.body;

        try {
            if (!Array.isArray(tables) || tables.length < 1 || !checkIsNumber(Report_Type_Id) || !reportName || !checkIsNumber(createdBy) || !Array.isArray(tableJoins)) {
                return invalidInput(res, 'tables, reportName, createdBy, tableJoins, Report_Type_Id is required');
            }

            let errorCount = 0;
            let errors = [];

            for (let i = 0; i < tables.length; i++) {
                if (!checkIsNumber(tables[i].Table_Id)) {
                    errorCount += 1;
                    errors.push('Table Id missing')
                }
                if (Array.isArray(tables[i].columns) && tables[i].columns.length !== 0 && checkIsNumber(tables[i].Table_Id)) {
                    for (let j = 0; j < tables[i].columns; j++) {
                        if (!tables[i]?.columns[j]?.Column_Name) {
                            errorCount += 1;
                            errors.push('Column_Name missing')
                        }
                    }
                } else {
                    errorCount += 1;
                    errors.push('Invalid columns array inside table array')
                }
            }

            if (tables.reduce((sum, obj) => sum += Boolean(Number(obj?.isChecked)) ? 1 : 0, 0) > 1 && tableJoins.length !== 0) {
                if (tableJoins.length > 0) {
                    for (let i = 0; i < tableJoins.length; i++) {
                        if (!tableJoins[i]?.Join_First_Table_Id) {
                            errorCount += 1;
                            errors.push('Join_First_Table_Id is missing in tableJoins')
                        }
                        if (!tableJoins[i]?.Join_First_Table_Column) {
                            errorCount += 1;
                            errors.push('Join_First_Table_Column is missing in tableJoins')
                        }
                        if (!tableJoins[i]?.Join_Second_Table_Id) {
                            errorCount += 1;
                            errors.push('Join_Second_Table_Id is missing in tableJoins')
                        }
                        if (!tableJoins[i]?.Join_Second_Table_Column) {
                            errorCount += 1;
                            errors.push('Join_Second_Table_Column is missing in tableJoins')
                        }
                    }
                }
            }
            // else {
            //     errorCount += 1;
            //     errors.push('multiple tables received but no joins are supplied')
            // }

            if (errorCount > 0) {
                return invalidInput(res, `invalid Input errors ${errorCount}`, { errors });
            }

        } catch (e) {
            return failed(res, 'validation error')
        }

        try {
            const transaction = new sql.Transaction()
            await transaction.begin();

            try {
                // Check if Report Name Already Exists
                const checkifReportNameExist = (await new sql.Request()
                    .input('Report_Name', reportName)
                    .input('Report_Type_Id', Report_Type_Id)
                    .query(`
                        SELECT COUNT(*) AS name 
                        FROM tbl_Report_Type 
                        WHERE 
                            Report_Name = @Report_Name 
                            AND 
                            Report_Type_Id != @Report_Type_Id
                        `)).recordset[0]?.name

                if (checkifReportNameExist > 0) {
                    return failed(res, 'Report Name Already Exist')
                }

                // Creating Report Type
                const reportTypeInsertRequest = new sql.Request(transaction)
                    .input('Report_Name', reportName)
                    .input('ReportState', JSON.stringify({ tables, reportName, tableJoins }))
                    .input('CreatedBy', createdBy)
                    .input('Report_Type_Id', Report_Type_Id)
                    .query(`
                        UPDATE 
                            tbl_Report_Type
                        SET
                            Report_Name = @Report_Name,
                            ReportState = @ReportState, 
                            CreatedBy = @CreatedBy
                        WHERE
                            Report_Type_Id = @Report_Type_Id`);

                await reportTypeInsertRequest;

                const tableMaster = (await sql.query('SELECT * FROM tbl_Table_Master')).recordset;
                const colToInsert = [];

                const deleteExist = new sql.Request(transaction)
                    .input('Report_Type_Id', Report_Type_Id)
                    .query(`
                        DELETE FROM tbl_ReportColumns WHERE Report_Type_Id = @Report_Type_Id;
                        DELETE FROM tbl_Report_Table_Join WHERE Report_Type_Id = @Report_Type_Id;
                    `)

                await deleteExist;

                //Inserting Tables and Columns 

                for (let i = 0; i < tables.length; i++) {
                    for (let j = 0; j < tables[i]?.columns?.length; j++) {
                        
                        colToInsert.push(
                            getTableAccronym(tableMaster, tables[i]?.Table_Id) + 
                            '.' + 
                            tables[i]?.columns[j]?.Column_Name + 
                            ' AS ' +
                            getTableAccronym(tableMaster, tables[i]?.Table_Id) +
                            '_' +
                            tables[i]?.columns[j]?.Column_Name
                        );

                        const columnsInsertRequest = new sql.Request(transaction)
                            .input('Report_Type_Id', Report_Type_Id)
                            .input('Table_Id', tables[i]?.Table_Id)
                            .input('Column_Name', tables[i]?.columns[j]?.Column_Name)
                            .input('Order_By', tables[i]?.columns[j]?.Order_By)
                            .query(`
                                INSERT INTO tbl_ReportColumns
                                    (Report_Type_Id, Table_Id, Column_Name, Order_By)
                                VALUES
                                    (@Report_Type_Id, @Table_Id, @Column_Name, @Order_By)
                                `)

                        const result = (await columnsInsertRequest).rowsAffected[0];

                        if (result === 0) {
                            await transaction.rollback();
                            return failed(res, 'Failed to insert Columns')
                        }
                    }
                }

                if (tables.length > 1 && tableJoins.length > 0) {
                    // Inserting Table Joins if exist 
                    for (let i = 0; i < tableJoins.length; i++) {
                        const joinsInsertRequest = new sql.Request(transaction)
                            .input('Report_Type_Id', Report_Type_Id)
                            .input('Join_First_Table_Id', tableJoins[i]?.Join_First_Table_Id)
                            .input('Join_First_Table_Column', tableJoins[i]?.Join_First_Table_Column)
                            .input('Join_Second_Table_Id', tableJoins[i]?.Join_Second_Table_Id)
                            .input('Join_Second_Table_Column', tableJoins[i]?.Join_Second_Table_Column)
                            .query(`
                                    INSERT INTO tbl_Report_Table_Join
                                        (Report_Type_Id, Join_First_Table_Id, Join_First_Table_Column, Join_Second_Table_Id, Join_Second_Table_Column)
                                    VALUES
                                        (@Report_Type_Id, @Join_First_Table_Id, @Join_First_Table_Column, @Join_Second_Table_Id, @Join_Second_Table_Column)
                                `)

                        const result = (await joinsInsertRequest).rowsAffected[0];

                        if (result === 0) {
                            await transaction.rollback();
                            return failed(res, 'Failed to insert Joins')
                        }
                    }
                }

                // Generating sql Query 
                let queryString = 'SELECT ' + colToInsert.join(', ') + ' FROM ';

                queryString += tables.map(table => `${table.Table_Name} AS ${getTableAccronym(tableMaster, table.Table_Id)}`).join(', ');

                if (tableJoins.length > 0) {
                    const joinConditions = tableJoins.map(join => {
                        const table1Alias = getTableAccronym(tableMaster, join.Join_First_Table_Id);
                        const table2Alias = getTableAccronym(tableMaster, join.Join_Second_Table_Id);
                        return `${table1Alias}.${join.Join_First_Table_Column} = ${table2Alias}.${join.Join_Second_Table_Column}`;
                    });
                    queryString += ' WHERE ' + joinConditions.join(' AND ');
                }

                const updateReport = new sql.Request(transaction)
                    .input('queryString', queryString)
                    .input('Report_Type_Id', Report_Type_Id)
                    .query(`
                            UPDATE 
                                tbl_Report_Type
                            SET
                                Report_Columns = @queryString
                            WHERE
                                Report_Type_Id = @Report_Type_Id
                            `)

                const updateResult = await updateReport;

                if (updateResult.rowsAffected[0] === 0) {
                    await transaction.rollback();
                    return failed(res, 'Failed to update Query')
                }

                transaction.commit();
                success(res, 'Template Created Successfully');

            } catch (e) {
                await transaction.rollback();
                return servError(e, res, 'ReportName already exists')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const deleteTemplate = async (req, res) => {
        const { Report_Type_Id } = req.body;

        try {
            const request = new sql.Request()
                .input('Report_Type_Id', Report_Type_Id)
                .query(`
                    DELETE FROM tbl_Report_Type WHERE Report_Type_Id = @Report_Type_Id;
                    DELETE FROM tbl_ReportColumns WHERE Report_Type_Id = @Report_Type_Id;
                    DELETE FROM tbl_Report_Table_Join WHERE Report_Type_Id = @Report_Type_Id;
                    `)
            await request;

            success(res, 'Templates deleted successfully')
        } catch (e) {
            servError(e, res);
        }
    }

    const saveReportState = async (req, res) => {
        const { Report_Type_Id, ReportState } = req.body;

        try {
            const request = new sql.Request()
                .input('Report_Type_Id', Report_Type_Id)
                .input('ReportState', JSON.stringify(ReportState))
                .query(`
                    UPDATE tbl_Report_Type
                    SET
                        ReportState = @ReportState
                    WHERE
                        Report_Type_Id = @Report_Type_Id
                    `);
            
            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Report State Saved')
            } else {
                failed(res, 'Failed to save')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getTablesandColumnsForReport,
        insertTemplate,
        getTemplates,
        executeTemplateSQL,
        updateTemplate,
        deleteTemplate,
        saveReportState
    }
}


export default ReportTemplate();