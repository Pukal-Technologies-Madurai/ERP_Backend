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
import * as XLSX from "xlsx";

const los = () => {

    const loslist = async (req, res) => {
        try {
            const result = await sql.query("SELECT * FROM tbl_Stock_LOS ORDER BY Is_Tally_Updated desc");

            if (result.recordset.length) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const displayLoSColumn = async (req, res) => {
        const { company_id } = req.query;

        if (!company_id) {
            return invalidInput(res, "Company_Id is Required");
        }

        try {
            const request = new sql.Request().input("company_id", company_id)
                .query(`
                    SELECT *
                    FROM tbl_Column_Los
                    WHERE company_Id = $1 AND status = 1`
                );

            const result = await request;

            if (result.recordset.length) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
        } catch (error) {
            servError(error, res);
        }
    };

    const applyLosColumnChanges = async (req, res) => {
        try {
            const { columns } = req.body;

            if (!columns) {
                return invalidInput(res, "Columns and Company ID are required");
            }

            for (const column of columns) {
                const request = new sql.Request()
                    .input('status', column.status)
                    .input('id', column.id)
                    .input('Position', column.position)
                    .input('Alias_Name', column.alias_name)

                await request.query(`
                    UPDATE tbl_Column_Los 
                    SET Position=@Position,status = @status,Alias_Name=@Alias_Name
                    WHERE Id = @id;`
                );
            }

            return success(res, 'Changes Saved!');
        } catch (error) {
            return servError(error, res);
        }
    };

    const dropDownLosColumn = async (req, res) => {
        const { company_id } = req.query;

        if (!company_id) {
            return invalidInput(res, "Report Date is Required");
        }

        try {
            const request = new sql.Request().input("company_id", company_id)
                .query(`
                    SELECT *
                    FROM tbl_Column_Los
                    WHERE company_id = $1`
                );

            const result = await request;

            if (result.recordset.length) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
        } catch (error) {
            servError(error, res);
        }
    };

    const updateLosData = async (req, res) => {
        const transaction = new sql.Transaction();

        try {
            const {
                Auto_Id, Stock_Tally_Id, Stock_Item, Brand, Group_ST, Bag, Stock_Group, S_Sub_Group_1,
                Grade_Item_Group, Item_Name_Modified, Date_Added, POS_Group, Active, POS_Item_Name, Item_Group_Id
            } = req.body;

            if (!Auto_Id || !Stock_Tally_Id) {
                return invalidInput(res, "Auto_Id and Stock_Tally_Id are required");
            }

            await transaction.begin();

            const stockRequest = new sql.Request(transaction)
                .input('Stock_Tally_Id', sql.VarChar, Stock_Tally_Id)
                .input('Stock_Item', sql.VarChar, Stock_Item || null)
                .input('Brand', sql.VarChar, Brand || null)
                .input('Group_ST', sql.VarChar, Group_ST || null)
                .input('Bag', sql.VarChar, Bag || null)
                .input('Stock_Group', sql.VarChar, Stock_Group || null)
                .input('S_Sub_Group_1', sql.VarChar, S_Sub_Group_1 || null)
                .input('Grade_Item_Group', sql.VarChar, Grade_Item_Group || null)
                .input('Item_Name_Modified', sql.VarChar, Item_Name_Modified || null)
                .input('POS_Group', sql.VarChar, POS_Group || null)
                .input('Active', sql.Bit, Active || null)
                .input('POS_Item_Name', sql.VarChar, POS_Item_Name || null)
                .input('Item_Group_Id', sql.Int, Item_Group_Id || null)
                .input('Auto_Id', sql.Int, Auto_Id);

            const stockResult = await stockRequest.query(`
                UPDATE tbl_Stock_LOS
                SET 
                    Stock_Tally_Id = @Stock_Tally_Id,
                    Stock_Item = @Stock_Item,
                    Brand = @Brand,
                    Group_ST = @Group_ST,
                    Bag = @Bag,
                    Stock_Group = @Stock_Group,
                    S_Sub_Group_1 = @S_Sub_Group_1,
                    Grade_Item_Group = @Grade_Item_Group,
                    Item_Name_Modified = @Item_Name_Modified,
                    POS_Group = @POS_Group,
                    Active = @Active,
                    POS_Item_Name = @POS_Item_Name,
                    Item_Group_Id = @Item_Group_Id
                WHERE Auto_Id = @Auto_Id;`
            );

            if (stockResult.rowsAffected[0] === 0) {
                throw new Error("Stock record not found");
            }

            const ledgerRequest = new sql.Request(req.db)
                .input('Stock_Tally_Id', Stock_Tally_Id)
                .input('Stock_Item', Stock_Item || null)
                .input('Brand', Brand || null)
                .input('Group_ST', Group_ST || null)
                .input('Bag', Bag || null)
                .input('Stock_Group', Stock_Group || null)
                .input('S_Sub_Group_1', S_Sub_Group_1 || null)
                .input('Grade_Item_Group', Grade_Item_Group || null)
                .input('Item_Name_Modified', Item_Name_Modified || null)
                .input('POS_Group', POS_Group || null)
                .input('Active', sql.Bit, Active || null)
                .input('POS_Item_Name', POS_Item_Name || null)
                .input('Item_Group_Id', Item_Group_Id || null);

            const ledgerResult = await ledgerRequest.query(`
                UPDATE tbl_Stock_LOS
                SET 
                    Stock_Item = @Stock_Item,
                    Brand = @Brand,
                    Group_ST = @Group_ST,
                    Bag = @Bag,
                    Stock_Group = @Stock_Group,
                    S_Sub_Group_1 = @S_Sub_Group_1,
                    Grade_Item_Group = @Grade_Item_Group,
                    Item_Name_Modified = @Item_Name_Modified,
                    POS_Group = @POS_Group,
                    Active = @Active,
                    POS_Item_Name = @POS_Item_Name,
                    Item_Group_Id = @Item_Group_Id
                WHERE Stock_Tally_Id = @Stock_Tally_Id;`
            );

            if (ledgerResult.rowsAffected[0] === 0) {
                throw new Error("Los record not found");
            }

            await transaction.commit();
            success(res, 'Data Updated')

        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res)
        }
    };

    const excelUpload = async (req, res) => {
        try {
            if (!req.file) {
                return invalidInput(res, "File is Required");
            }

            const { company_id, Created_By, isRetailer } = req.body;
            if (!company_id || !Created_By || isRetailer === undefined) {
                return invalidInput(
                    res,
                    "company_id, Created_By, and isRetailer are required"
                );
            }

            if (!req.db) {
                return invalidInput(res, "Database connection is required");
            }

            const workbook = XLSX.read(req.file.buffer, {
                type: "buffer",
                codepage: 65001,
                cellText: true,
                cellDates: true,
                raw: false,
            });

            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const excelData = XLSX.utils.sheet_to_json(worksheet, { defval: null });

            let aliasToColumnMap = {};
            try {
                const aliasMapResult = await new sql.Request().query(`
                SELECT ColumnName, Alias_Name FROM tbl_Column_Los
            `);

                for (const row of aliasMapResult.recordset) {
                    if (row.Alias_Name && row.ColumnName) {
                        aliasToColumnMap[row.Alias_Name.trim()] = row.ColumnName.trim();
                    }
                }
            } catch (error) {
                console.warn(
                    "Column mapping table not found, using direct column names"
                );
                if (excelData.length > 0) {
                    for (const key in excelData[0]) {
                        aliasToColumnMap[key.trim()] = key.trim();
                    }
                }
            }

            const results = [];
            let successCount = 0;

            for (const row of excelData) {
                try {

                    const mappedRow = {};
                    for (const [key, value] of Object.entries(row)) {
                        const realKey = aliasToColumnMap[key.trim()] || key.trim();
                        mappedRow[realKey] =
                            typeof value === "string" ? value.normalize() : value;
                    }

                    const {
                        Stock_Item = null,
                        Brand = null,
                        Group_ST = null,
                        Bag = null,
                        Stock_Group = null,
                        S_Sub_Group_1 = null,
                        Grade_Item_Group = null,
                        Item_Name_Modified = null,
                        Date_Added = null,
                        POS_Group = null,
                        Active = null,
                        POS_Item_Name = null,
                        Item_Group_Id = null,
                    } = mappedRow;

                    if (!Stock_Item) {
                        results.push({
                            success: false,
                            message: "Missing Stock_Item",
                            row: mappedRow,
                        });
                        continue;
                    }

                    const retailerResult = await new sql.Request().input(
                        "productname",
                        sql.NVarChar,
                        Stock_Item
                    ).query(`
                        SELECT ERP_Id 
                        FROM tbl_Product_Master 
                        WHERE Product_Name = @productname
                    `);

                    if (!retailerResult.recordset.length) {
                        results.push({
                            success: false,
                            message: "Product not found in master table",
                            product: Stock_Item,
                        });
                        continue;
                    }

                    const erpId = retailerResult.recordset[0].ERP_Id;

                    const existingItem = await new sql.Request().input(
                        "productname",
                        sql.NVarChar,
                        Stock_Item
                    ).query(`
                        SELECT * FROM tbl_Stock_LOS 
                        WHERE Stock_Item = @productname
                    `);

                    if (!existingItem.recordset.length) {
                        results.push({
                            success: false,
                            message: "Item not found in stock table",
                            product: Stock_Item,
                        });
                        continue;
                    }

                    const currentData = existingItem.recordset[0];

                    const updateFields = {
                        Stock_Tally_Id: erpId,
                        Brand:
                            Brand !== null && Brand !== currentData.Brand
                                ? String(Brand)
                                : undefined,
                        Group_ST:
                            Group_ST !== null && Group_ST !== currentData.Group_ST
                                ? String(Group_ST)
                                : undefined,
                        Bag:
                            Bag !== null && Bag !== currentData.Bag ? String(Bag) : undefined,
                        Stock_Group:
                            Stock_Group !== null && Stock_Group !== currentData.Stock_Group
                                ? String(Stock_Group)
                                : undefined,
                        S_Sub_Group_1:
                            S_Sub_Group_1 !== null &&
                                S_Sub_Group_1 !== currentData.S_Sub_Group_1
                                ? String(S_Sub_Group_1)
                                : undefined,
                        Grade_Item_Group:
                            Grade_Item_Group !== null &&
                                Grade_Item_Group !== currentData.Grade_Item_Group
                                ? String(Grade_Item_Group)
                                : undefined,
                        Item_Name_Modified:
                            Item_Name_Modified !== null &&
                                Item_Name_Modified !== currentData.Item_Name_Modified
                                ? String(Item_Name_Modified)
                                : undefined,
                        Date_Added:
                            Date_Added !== null && Date_Added !== currentData.Date_Added
                                ? new Date(Date_Added)
                                : undefined,
                        POS_Group:
                            POS_Group !== null && POS_Group !== currentData.POS_Group
                                ? String(POS_Group)
                                : undefined,
                        Active:
                            Active !== null && Active !== currentData.Active
                                ? Boolean(Active)
                                : undefined,
                        POS_Item_Name:
                            POS_Item_Name !== null &&
                                POS_Item_Name !== currentData.POS_Item_Name
                                ? String(POS_Item_Name)
                                : undefined,
                        Item_Group_Id:
                            Item_Group_Id !== null &&
                                Item_Group_Id !== currentData.Item_Group_Id
                                ? parseInt(Item_Group_Id)
                                : undefined,
                    };

                    const filteredUpdates = Object.fromEntries(
                        Object.entries(updateFields).filter(([_, v]) => v !== undefined)
                    );

                    if (Object.keys(filteredUpdates).length === 0) {
                        results.push({
                            success: true,
                            message: "No changes needed",
                            product: Stock_Item,
                        });
                        continue;
                    }

                    const requestPrimary = new sql.Request();
                    let setClauses = [];

                    Object.entries(filteredUpdates).forEach(([key, value]) => {
                        const paramName = `param_${key}`;
                        setClauses.push(`${key} = @${paramName}`);
                        requestPrimary.input(paramName, sql.NVarChar, value);
                    });

                    requestPrimary.input("productname", sql.NVarChar, Stock_Item);

                    const updateQueryPrimary = `
                 UPDATE tbl_Stock_LOS 
                 SET ${setClauses.join(", ")}, IsUpdated = 1
                 WHERE Stock_Item = @productname
             `;

                    const updateQuerySecondary = `
                 UPDATE tbl_Stock_LOS 
                 SET ${setClauses.join(", ")}
                 WHERE Stock_Item = @productname
             `;

                    const updateResult = await requestPrimary.query(updateQueryPrimary);
                    if (updateResult.rowsAffected[0] === 0) {
                        throw new Error("No rows were updated in primary database");
                    }

                    const requestSecondary = new sql.Request(req.db);
                    Object.entries(filteredUpdates).forEach(([key, value]) => {
                        const paramName = `param_${key}`;
                        requestSecondary.input(paramName, sql.NVarChar, value);
                    });
                    requestSecondary.input("productname", sql.NVarChar, Stock_Item);

                    await requestSecondary.query(updateQuerySecondary);

                    successCount++;
                    results.push({
                        success: true,
                        message: "Successfully updated",

                    });
                } catch (rowError) {
                    results.push({
                        success: false,
                        message: rowError.message,
                    });
                }
            }

            return dataFound(res, "Data Updated Succesfully");
        } catch (error) {
            servError(error, res);
        }
    };

    return {
        loslist,
        displayLoSColumn,
        applyLosColumnChanges,
        dropDownLosColumn,
        updateLosData,
        excelUpload
    };
};

export default los();
