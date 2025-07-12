import sql from "mssql";
import {
    dataFound,
    failed,
    invalidInput,
    noData,
    sentData,
    servError,
    success,
} from "../../res.mjs";

const lom = () => {

    const getDetailsData = async (req, res) => {
        try {
            //             const results = [];

            const tables = [
                { master: "Cost Center", table: "tbl_ERP_Cost_Center" },
                { master: "Cost Categories", table: "tbl_ERP_Cost_Category" },
                { master: "Ledger", table: "tbl_Account_Master" },
                { master: "Godown", table: "tbl_Godown_Master" },
                { master: "Group", table: "tbl_Accounting_Group" },
                { master: "Stock", table: "tbl_Product_Master" },
                { master: "Voucher type", table: "tbl_Voucher_Type" },
                { master: "Units", table: "tbl_UOM" },
                { master: "Stock Group", table: "-" },
                { master: "Currency", table: "-" },
                { master: "Brand", table: "tbl_Brand_Master" },
                { master: "Area", table: "tbl_Area_Master" },
                { master: "Pos Brand", table: "tbl_POS_Brand" },
                { master: "Route Master", table: "tbl_Route_Master" },
                { master: "Pos_Rate_Master", table: "tbl_Pos_Rate_Master" },
                { master: "Stock_Los", table: "tbl_Stock_LOS" },
                { master: "Ledger Lol", table: "tbl_Ledger_LOL" },
            ];


            const results = await Promise.all(tables.map(async ({ master, table }) => {
                try {
                    if (table === "-") {
                        return {
                            master,
                            count: "-",
                            fields: "-",
                            columns: [],
                            message: "Table not configured"
                        };
                    }

                    // Get count and columns in parallel
                    const [countRes, columnRes] = await Promise.all([
                        new sql.Request().query(`SELECT COUNT(*) AS count FROM [dbo].[${table}]`),
                        new sql.Request().query(`
                        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
                        FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_NAME = '${table}'
                    `)
                    ]);


                    const sampleData = await new sql.Request()
                        .query(`SELECT * FROM [dbo].[${table}]`);

                    return {
                        master,
                        table_name: table,
                        count: countRes.recordset[0].count,
                        fields: columnRes.recordset.length,
                        columns: columnRes.recordset,
                        data: sampleData.recordset
                    };

                } catch (err) {
                    console.error(`Error processing table ${table}:`, err);
                    return {
                        master,
                        table_name: table,
                        count: "-",
                        fields: "-",
                        error: err.message,
                        columns: []
                    };
                }
            }));

            // Return successful response
            res.status(200).json({
                success: true,
                data: results,
                message: "Table details retrieved successfully"
            });

        } catch (e) {
            console.error("Error in getDetailsData:", e);
            res.status(500).json({
                success: false,
                message: "Failed to retrieve table details",
                error: e.message
            });
        }
    };

    const getTallyDatabase = async (req, res) => {
        try {
            const request = new sql.Request(req.db);

            const tables = [
                { master: "Cost Center", table: "cost_centre_ob" },
                { master: "Cost Categories", table: "cost_catagory_ob" },
                { master: "Ledger", table: "ledger_ob" },
                { master: "Godown", table: "godown_ob" },
                { master: "Group", table: "group_ob" },
                { master: "Stock", table: "stock_items_ob" },
                { master: "Voucher Group", table: "tbl_Voucher_Group" },
                { master: "Units", table: "units_ob" },
                { master: "Stock Group", table: "stock_group_ob" },
                { master: "Currency", table: "-" },
                { master: "Brand", table: "-" },
                { master: "Area", table: "-" },
                { master: "Pos Brand", table: "-" },
                { master: "Route Master", table: "-" },
                { master: "Pos_Rate_Master", table: "-" },
                { master: "Stock_Los", table: "tbl_Stock_LOS" },
                { master: "Ledger Lol", table: "tbl_Ledger_LOL" },
            ];

            const results = [];

            for (const { master, table } of tables) {
                // Skip tables with no actual table name
                if (!table || table === "-") {
                    results.push({
                        master,
                        count: "-",
                        fields: "-",
                        columns: [],
                        data: [],
                        error: "No table defined",
                    });
                    continue;
                }

                try {
                    // Fetch count
                    const countRes = await request.query(`
                    SELECT COUNT(*) AS count FROM [dbo].[${table}]
                `);

                    const count = countRes.recordset[0]?.count ?? 0;

                    // Fetch column meta
                    const colMetaRes = await request.query(`
                    SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = '${table}'
                `);

                    const fieldsCount = colMetaRes.recordset?.length ?? 0;
                    const columnDetails = colMetaRes.recordset || [];

                    // Fetch sample data (limit to avoid huge response)
                    const sampleDataRes = await request.query(`
                    SELECT * FROM [dbo].[${table}]
                `);

                    const sampleData = sampleDataRes.recordset || [];

                    results.push({
                        master,
                        count,
                        fields: fieldsCount,
                        columns: columnDetails,
                        data: sampleData,
                    });

                } catch (err) {
                    results.push({
                        master,
                        count: "-",
                        fields: "-",
                        columns: [],
                        data: [],
                        error: `Error fetching data for '${table}': ${err.message}`,
                    });
                }
            }

            return dataFound(res, results);

        } catch (e) {
            return servError(e, res);
        }
    };

    const getDatabaseTables = async (req, res) => {
        try {
            const dbTablesQuery = await new sql.Request().query(`
            SELECT database_name, table_name, display_name, page
            FROM tbl_Database_Tables 
            WHERE is_active = 1
            ORDER BY display_name, database_name
        `);

            const displayNameGroups = {};
            dbTablesQuery.recordset.forEach(row => {
                if (!displayNameGroups[row.display_name]) {
                    displayNameGroups[row.display_name] = {};
                }
                displayNameGroups[row.display_name][row.database_name] = {
                    table_name: row.table_name,
                    display_name: row.display_name,
                    page: row.page
                };
            });

            const dbNames = [...new Set(dbTablesQuery.recordset.map(r => r.database_name))];
            const results = [];

            for (const [displayName, dbEntries] of Object.entries(displayNameGroups)) {
                const rowData = {
                    display_name: displayName,
                    page: Object.values(dbEntries)[0]?.page
                };

                for (const dbName of dbNames) {
                    if (dbEntries[dbName]) {
                        try {
                            const request = dbName === 'Online_SMT_Tally'
                                ? new sql.Request(req.db)
                                : new sql.Request();

                            const countRes = await request.query(
                                `SELECT COUNT(*) AS count FROM [${dbName}].[dbo].[${dbEntries[dbName].table_name}]`
                            );

                            const colMetaRes = await request.query(`
                            SELECT 
                                COLUMN_NAME, 
                                DATA_TYPE, 
                                IS_NULLABLE
                            FROM [${dbName}].INFORMATION_SCHEMA.COLUMNS
                            WHERE TABLE_NAME = '${dbEntries[dbName].table_name}'
                        `);

                            rowData[dbName] = {
                                count: countRes.recordset[0].count,
                                fields: colMetaRes.recordset.length,
                                columns: colMetaRes.recordset,
                                table_name: dbEntries[dbName].table_name,
                                page: dbEntries[dbName].page
                            };
                        } catch (err) {
                            rowData[dbName] = {
                                error: err.message,
                                count: "-",
                                fields: "-",
                                table_name: dbEntries[dbName].table_name,
                                page: dbEntries[dbName].page
                            };
                        }
                    } else {
                        rowData[dbName] = null;
                    }
                }
                results.push(rowData);
            }

            return dataFound(res, {
                data: results,
                databases: dbNames
            });
        } catch (e) {
            return servError(e, res);
        }
    };

    return {
        getDetailsData,
        getTallyDatabase,
        getDatabaseTables
    };
};

export default lom();