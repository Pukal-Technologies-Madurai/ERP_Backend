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

const lol = () => {

    const lollist = async (req, res) => {
        try {
            const result = await sql.query("SELECT * FROM tbl_Ledger_LOL ORDER BY Is_Tally_Updated desc");

            if (result.recordset.length) {
                dataFound(res, result.recordset);
            } else {
                noData(res);
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const displayColumn = async (req, res) => {
        const { company_id } = req.query;

        if (!company_id) {
            return invalidInput(res, "Company_Id is Required");
        }

        try {
            const request = new sql.Request().input("company_id", company_id)
                .query(`
                    SELECT *
                    FROM tbl_Lol_Column
                    WHERE "Company_Id" = $1 AND "Status" = 1;`
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

    const applyColumnChanges = async (req, res) => {
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
                    UPDATE tbl_Lol_Column 
                    SET Position=@Position,status = @status,Alias_Name=@Alias_Name
                    WHERE Id = @id;`
                );
            }

            return success(res, 'Changes Saved!');
        } catch (error) {
            return servError(error, res);
        }
    };

    const dropDownColumn = async (req, res) => {
        const { company_id } = req.query;

        if (!company_id) {
            return invalidInput(res, "Report Date is Required");
        }

        try {
            const request = new sql.Request().input("company_id", company_id)
                .query(`
                    SELECT *
                    FROM tbl_Lol_Column
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

    const updateLolData = async (req, res) => {
        const transaction = new sql.Transaction();

        try {
            const {
                Auto_Id, Ledger_Tally_Id, Ledger_Name, Ledger_Alias, Party_Name, Actual_Party_Name_with_Brokers, Party_Mailing_Name,
                Party_Mailing_Address, Party_Location, Party_District, Party_Mobile_1, Party_Mobile_2, Party_Nature,
                Party_Group, Payment_Mode, Ref_Brokers, Ref_Owners, File_No, Date_Added,
                A1, A2, A3, A4, A5
            } = req.body;

            if (!Auto_Id || !Ledger_Tally_Id || !Ledger_Name) {
                return invalidInput(res, "Id must be there");
            }

            await transaction.begin();

            const result = await new sql.Request(transaction)
                .input('Ledger_Tally_Id', Ledger_Tally_Id)
                .input('Ledger_Name', Ledger_Name)
                .input('Ledger_Alias', Ledger_Alias || null)
                .input('Party_Name', Party_Name || null)
                .input('Actual_Party_Name_with_Brokers', Actual_Party_Name_with_Brokers || null)
                .input('Party_Mailing_Name', Party_Mailing_Name || null)
                .input('Party_Mailing_Address', Party_Mailing_Address || null)
                .input('Party_Location', Party_Location || null)
                .input('Party_District', Party_District || null)
                .input('Party_Mobile_1', Party_Mobile_1 || null)
                .input('Party_Mobile_2', Party_Mobile_2 || null)
                .input('Party_Nature', Party_Nature || null)
                .input('Party_Group', Party_Group || null)
                .input('Payment_Mode', Payment_Mode || null)
                .input('Ref_Brokers', Ref_Brokers || null)
                .input('Ref_Owners', Ref_Owners || null)
                .input('File_No', File_No || null)
                .input('Date_Added', Date_Added)
                .input('A1', sql.VarChar, A1 || null)
                .input('A2', sql.VarChar, A2 || null)
                .input('A3', sql.VarChar, A3 || null)
                .input('A4', sql.VarChar, A4 || null)
                .input('A5', sql.VarChar, A5 || null)
                .input('Auto_Id', sql.Int, Auto_Id)
                .query(`
                   UPDATE tbl_Ledger_LoL 
                   SET 
                       Ledger_Tally_Id = @Ledger_Tally_Id,
                       Ledger_Name = @Ledger_Name,
                       Ledger_Alias = @Ledger_Alias,
                       Party_Name = @Party_Name,
                       Actual_Party_Name_with_Brokers = @Actual_Party_Name_with_Brokers,
                       Party_Mailing_Name = @Party_Mailing_Name,
                       Party_Mailing_Address = @Party_Mailing_Address,
                       Party_Location = @Party_Location,
                       Party_District = @Party_District,
                       Party_Mobile_1 = @Party_Mobile_1,
                       Party_Mobile_2 = @Party_Mobile_2,
                       Party_Nature = @Party_Nature,
                       Party_Group = @Party_Group,
                       Payment_Mode = @Payment_Mode,
                       Ref_Brokers = @Ref_Brokers,
                       Ref_Owners = @Ref_Owners,
                       File_No = @File_No,
                       Date_Added = @Date_Added,
                       A1 = @A1,
                       A2 = @A2,
                       A3 = @A3,
                       A4 = @A4,
                       A5 = @A5
                   WHERE Ledger_Tally_Id = @Ledger_Tally_Id`
                );

            if (result.rowsAffected[0] === 0) {
                throw new Error("Ledger record not found");
            }

            const result1 = await new sql.Request(req.db)
                .input('Ledger_Tally_Id', Ledger_Tally_Id)
                .input('Ledger_Name', Ledger_Name)
                .input('Ledger_Alias', Ledger_Alias || null)
                .input('Party_Name', Party_Name || null)
                .input('Actual_Party_Name_with_Brokers', Actual_Party_Name_with_Brokers || null)
                .input('Party_Mailing_Name', Party_Mailing_Name || null)
                .input('Party_Mailing_Address', Party_Mailing_Address || null)
                .input('Party_Location', Party_Location || null)
                .input('Party_District', Party_District || null)
                .input('Party_Mobile_1', Party_Mobile_1 || null)
                .input('Party_Mobile_2', Party_Mobile_2 || null)
                .input('Party_Nature', Party_Nature || null)
                .input('Party_Group', Party_Group || null)
                .input('Payment_Mode', Payment_Mode || null)
                .input('Ref_Brokers', Ref_Brokers || null)
                .input('Ref_Owners', Ref_Owners || null)
                .input('File_No', File_No || null)
                .input('Date_Added', Date_Added)
                .input('A1', sql.VarChar, A1 || null)
                .input('A2', sql.VarChar, A2 || null)
                .input('A3', sql.VarChar, A3 || null)
                .input('A4', sql.VarChar, A4 || null)
                .input('A5', sql.VarChar, A5 || null)
                .input('Auto_Id', sql.Int, Auto_Id)
                .query(`
                   UPDATE tbl_Ledger_LoL 
                   SET 
                       Ledger_Tally_Id = @Ledger_Tally_Id,
                       Ledger_Name = @Ledger_Name,
                       Ledger_Alias = @Ledger_Alias,
                       Party_Name = @Party_Name,
                       Actual_Party_Name_with_Brokers = @Actual_Party_Name_with_Brokers,
                       Party_Mailing_Name = @Party_Mailing_Name,
                       Party_Mailing_Address = @Party_Mailing_Address,
                       Party_Location = @Party_Location,
                       Party_District = @Party_District,
                       Party_Mobile_1 = @Party_Mobile_1,
                       Party_Mobile_2 = @Party_Mobile_2,
                       Party_Nature = @Party_Nature,
                       Party_Group = @Party_Group,
                       Payment_Mode = @Payment_Mode,
                       Ref_Brokers = @Ref_Brokers,
                       Ref_Owners = @Ref_Owners,
                       File_No = @File_No,
                       Date_Added = @Date_Added,
                       A1 = @A1,
                       A2 = @A2,
                       A3 = @A3,
                       A4 = @A4,
                       A5 = @A5
                   WHERE Ledger_Tally_Id = @Ledger_Tally_Id
               `);

            if (result1.rowsAffected[0] === 0) {
                throw new Error("Ledger record not found");
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
                return invalidInput(res, "Excel file is required");
            }

            const { company_id, Created_By, isRetailer } = req.body;
            if (!company_id || !Created_By || isRetailer === undefined) {
                return invalidInput(res, "Company_id, Created_By, and isRetailer are required");
            }

            if (!req.db) {
                return invalidInput(res, "Secondary database connection not available");
            }

            const workbook = XLSX.read(req.file.buffer, {
                type: "buffer",
                codepage: 65001,
                cellText: true,
                cellDates: true,
                raw: false
            });

            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const excelData = XLSX.utils.sheet_to_json(worksheet, { defval: null });

            let aliasToColumnMap = {};
            try {
                const aliasMapResult = await new sql.Request().query(`
                SELECT ColumnName, Alias_Name FROM tbl_Lol_Column
            `);

                for (const row of aliasMapResult.recordset) {
                    if (row.Alias_Name && row.ColumnName) {
                        aliasToColumnMap[row.Alias_Name.trim()] = row.ColumnName.trim();
                    }
                }
            } catch (error) {
                console.warn("Column mapping table not found, using direct column names");
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
                        mappedRow[realKey] = typeof value === 'string' ? value.normalize() : value;
                    }

                    const {
                        Ledger_Name = null,
                        Ledger_Alias = null,
                        Actual_Party_Name_with_Brokers = null,
                        Party_Name = null,
                        Party_Location = null,
                        Party_Nature = null,
                        Party_Group = null,
                        Ref_Brokers = null,
                        Ref_Owners = null,
                        Party_Mobile_1 = null,
                        Party_Mobile_2 = null,
                        Party_District = null,
                        File_No = null,
                        Date_Added = null,
                        Payment_Mode = null,
                        Party_Mailing_Name = null,
                        Party_Mailing_Address = null,
                        A1 = null,
                        A2 = null,
                        A3 = null,
                        A4 = null,
                        A5 = null,
                    } = mappedRow;

                    if (!Ledger_Name) {
                        results.push({
                            success: false,
                            message: "Missing Ledger_Name",
                            row: mappedRow
                        });
                        continue;
                    }

                    const retailerResult = await new sql.Request()
                        .input("retailerName", sql.NVarChar, Ledger_Name)
                        .query(`
                        SELECT ERP_Id 
                        FROM tbl_Retailers_Master 
                        WHERE Retailer_Name = @retailerName
                    `);

                    if (!retailerResult.recordset.length) {
                        results.push({
                            success: false,
                            message: "Retailer not found",
                            ledgerName: Ledger_Name
                        });
                        continue;
                    }

                    const erpId = retailerResult.recordset[0].ERP_Id;

                    const existingLedger = await new sql.Request()
                        .input("ledgerName", sql.NVarChar, Ledger_Name)
                        .query(`
                        SELECT * FROM tbl_Ledger_LoL 
                        WHERE Ledger_Name = @ledgerName
                    `);

                    if (!existingLedger.recordset.length) {
                        results.push({
                            success: false,
                            message: "Ledger not found",
                            ledgerName: Ledger_Name
                        });
                        continue;
                    }

                    const currentData = existingLedger.recordset[0];

                    const updateFields = {
                        Ledger_Tally_Id: erpId,
                        Ledger_Alias: Ledger_Alias !== null && Ledger_Alias !== currentData.Ledger_Alias ? String(Ledger_Alias) : undefined,
                        Actual_Party_Name_with_Brokers: Actual_Party_Name_with_Brokers !== null && Actual_Party_Name_with_Brokers !== currentData.Actual_Party_Name_with_Brokers ? String(Actual_Party_Name_with_Brokers) : undefined,
                        Party_Name: Party_Name !== null && Party_Name !== currentData.Party_Name ? String(Party_Name) : undefined,
                        Party_Location: Party_Location !== null && Party_Location !== currentData.Party_Location ? String(Party_Location) : undefined,
                        Party_Nature: Party_Nature !== null && Party_Nature !== currentData.Party_Nature ? String(Party_Nature) : undefined,
                        Party_Group: Party_Group !== null && Party_Group !== currentData.Party_Group ? String(Party_Group) : undefined,
                        Ref_Brokers: Ref_Brokers !== null && Ref_Brokers !== currentData.Ref_Brokers ? String(Ref_Brokers) : undefined,
                        Ref_Owners: Ref_Owners !== null && Ref_Owners !== currentData.Ref_Owners ? String(Ref_Owners) : undefined,
                        Party_Mobile_1: Party_Mobile_1 !== null && Party_Mobile_1 !== currentData.Party_Mobile_1 ? String(Party_Mobile_1) : undefined,
                        Party_Mobile_2: Party_Mobile_2 !== null && Party_Mobile_2 !== currentData.Party_Mobile_2 ? String(Party_Mobile_2) : undefined,
                        Party_District: Party_District !== null && Party_District !== currentData.Party_District ? String(Party_District) : undefined,
                        File_No: File_No !== null && File_No !== currentData.File_No ? String(File_No) : undefined,
                        Date_Added: Date_Added !== null && Date_Added !== currentData.Date_Added ? new Date(Date_Added) : undefined,
                        Payment_Mode: Payment_Mode !== null && Payment_Mode !== currentData.Payment_Mode ? String(Payment_Mode) : undefined,
                        Party_Mailing_Name: Party_Mailing_Name !== null && Party_Mailing_Name !== currentData.Party_Mailing_Name ? String(Party_Mailing_Name) : undefined,
                        Party_Mailing_Address: Party_Mailing_Address !== null && Party_Mailing_Address !== currentData.Party_Mailing_Address ? String(Party_Mailing_Address) : undefined,
                        A1: A1 !== null && A1 !== currentData.A1 ? String(A1) : undefined,
                        A2: A2 !== null && A2 !== currentData.A2 ? String(A2) : undefined,
                        A3: A3 !== null && A3 !== currentData.A3 ? String(A3) : undefined,
                        A4: A4 !== null && A4 !== currentData.A4 ? String(A4) : undefined,
                        A5: A5 !== null && A5 !== currentData.A5 ? String(A5) : undefined,
                    };

                    const filteredUpdates = Object.fromEntries(
                        Object.entries(updateFields).filter(([_, v]) => v !== undefined)
                    );

                    if (Object.keys(filteredUpdates).length === 0) {
                        results.push({
                            success: true,
                            message: "No changes needed",
                            ledgerName: Ledger_Name
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

                    requestPrimary.input('ledgerName', sql.NVarChar, Ledger_Name);

                    const updateQueryPrimary = `
                    UPDATE tbl_Ledger_LoL 
                    SET ${setClauses.join(', ')}, IsUpdated = 1
                    WHERE Ledger_Name = @ledgerName
                `;

                    const updateQuerySecondary = `
                    UPDATE tbl_Ledger_LoL 
                    SET ${setClauses.join(', ')}
                    WHERE Ledger_Name = @ledgerName
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
                    requestSecondary.input('ledgerName', sql.NVarChar, Ledger_Name);

                    await requestSecondary.query(updateQuerySecondary);

                    successCount++;
                    results.push({
                        success: true,
                        message: "Successfully updated",
                        ledgerName: Ledger_Name,
                        updatedFields: Object.keys(filteredUpdates)
                    });

                } catch (rowError) {

                    results.push({
                        success: false,
                        message: rowError.message,
                        ledgerName: Ledger_Name || 'Unknown'
                    });
                }
            }


            return dataFound(res, "Data Updated Succesfully");

        } catch (error) {
            servError(error, res)
        }
    };

    return {
        lollist,
        displayColumn,
        applyColumnChanges,
        dropDownColumn,
        updateLolData,
        excelUpload,
    };
};

export default lol();
