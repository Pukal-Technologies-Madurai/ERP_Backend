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
                A1, A2, A3, A4, A5, GST_No, Route_Name
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
                .input('GST_No', GST_No || null)
                .input('Route_Name', Route_Name || null)
                .input('Auto_Id', sql.Int, Auto_Id)
                .query(`
                   UPDATE tbl_Ledger_LOL 
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
                       A5 = @A5,
                       GST_No=@GST_No,
                       Route_Name=@Route_Name
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
                .input('GST_No', GST_No || null)
                .input('Route_Name', Route_Name || null)
                .input('Auto_Id', sql.Int, Auto_Id)
                .query(`
                   UPDATE tbl_Ledger_LOL 
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
                       A5 = @A5,
                       GST_No=@GST_No,
                       Route_Name=@Route_Name
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
        const transaction = new sql.Transaction();

        try {
            if (!req.file) return invalidInput(res, "Excel file is required");

            const { company_id, Created_By, isRetailer } = req.body;
            if (!company_id || !Created_By || isRetailer === undefined)
                return invalidInput(res, "Company_id, Created_By, and isRetailer are required");

            if (!req.db) return invalidInput(res, "Secondary database connection not available");

            await transaction.begin();


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
                const aliasMapResult = await transaction.request().query(
                    `SELECT ColumnName, Alias_Name FROM tbl_Lol_Column`
                );
                for (const row of aliasMapResult.recordset) {
                    if (row.Alias_Name && row.ColumnName) {
                        aliasToColumnMap[row.Alias_Name.trim()] = row.ColumnName.trim();
                    }
                }
            } catch (error) {
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
                        mappedRow[realKey] = typeof value === "string" ? value.normalize() : value;
                    }

                    const {
                        Ledger_Name = null,
                        Ledger_Alias,
                        Actual_Party_Name_with_Brokers,
                        Party_Name,
                        Party_Location,
                        Party_Nature,
                        Party_Group,
                        Ref_Brokers,
                        Ref_Owners,
                        Party_Mobile_1,
                        Party_Mobile_2,
                        Party_District,
                        File_No,
                        Date_Added,
                        Payment_Mode,
                        Party_Mailing_Name,
                        Party_Mailing_Address,
                        A1,
                        A2,
                        A3,
                        A4,
                        A5,
                        Route_Name,
                        GST_No
                    } = mappedRow;

                    if (!Ledger_Name) {
                        results.push({ success: false, message: "Missing Ledger_Name", row: mappedRow });
                        continue;
                    }


                    const retailerRes = await transaction.request()
                        .input("Ledger_Name", sql.NVarChar, Ledger_Name)
                        .query("SELECT ERP_Id FROM tbl_Retailers_Master WHERE Retailer_Name = @Ledger_Name");
                    if (!retailerRes.recordset.length) {
                        results.push({ success: false, message: "Retailer not found", ledgerName: Ledger_Name });
                        continue;
                    }
                    const erpId = retailerRes.recordset[0].ERP_Id;


                    const ledgerRes = await transaction.request()
                        .input("Ledger_Name", sql.NVarChar, Ledger_Name)
                        .query("SELECT * FROM tbl_Ledger_LoL WHERE Ledger_Name = @Ledger_Name");
                    if (!ledgerRes.recordset.length) {
                        results.push({ success: false, message: "Ledger not found", ledgerName: Ledger_Name });
                        continue;
                    }
                    const currentData = ledgerRes.recordset[0];

                    const updateFields = {};
                    const changedFields = [];


                    const checkAndUpdateField = (fieldName, excelValue, dbValue) => {

                        const excelStr =
                            excelValue === undefined || excelValue === null || String(excelValue).trim() === ""
                                ? " "
                                : String(excelValue).trim();

                        const dbStr =
                            dbValue === undefined || dbValue === null || String(dbValue).trim() === ""
                                ? " "
                                : String(dbValue).trim();

                        if (excelStr !== dbStr) {
                            updateFields[fieldName] = excelStr;
                            changedFields.push(fieldName);
                        }
                    };

                    checkAndUpdateField("Ledger_Alias", Ledger_Alias, currentData.Ledger_Alias);
                    checkAndUpdateField("Actual_Party_Name_with_Brokers", Actual_Party_Name_with_Brokers, currentData.Actual_Party_Name_with_Brokers);
                    checkAndUpdateField("Party_Name", Party_Name, currentData.Party_Name);
                    checkAndUpdateField("Party_Location", Party_Location, currentData.Party_Location);
                    checkAndUpdateField("Party_Nature", Party_Nature, currentData.Party_Nature);
                    checkAndUpdateField("Party_Group", Party_Group, currentData.Party_Group);
                    checkAndUpdateField("Ref_Brokers", Ref_Brokers, currentData.Ref_Brokers);
                    checkAndUpdateField("Ref_Owners", Ref_Owners, currentData.Ref_Owners);
                    checkAndUpdateField("Party_Mobile_1", Party_Mobile_1, currentData.Party_Mobile_1);
                    checkAndUpdateField("Party_Mobile_2", Party_Mobile_2, currentData.Party_Mobile_2);
                    checkAndUpdateField("Party_District", Party_District, currentData.Party_District);
                    checkAndUpdateField("File_No", File_No, currentData.File_No);
                    checkAndUpdateField("Date_Added", Date_Added, currentData.Date_Added); // ✅ keep as varchar
                    checkAndUpdateField("Payment_Mode", Payment_Mode, currentData.Payment_Mode);
                    checkAndUpdateField("Party_Mailing_Name", Party_Mailing_Name, currentData.Party_Mailing_Name);
                    checkAndUpdateField("Party_Mailing_Address", Party_Mailing_Address, currentData.Party_Mailing_Address);
                    checkAndUpdateField("A1", A1, currentData.A1);
                    checkAndUpdateField("A2", A2, currentData.A2);
                    checkAndUpdateField("A3", A3, currentData.A3);
                    checkAndUpdateField("A4", A4, currentData.A4);
                    checkAndUpdateField("A5", A5, currentData.A5);
                    checkAndUpdateField("Route_Name", Route_Name, currentData.Route_Name);
                    checkAndUpdateField("GST_No", GST_No, currentData.GST_No);

                    if (erpId !== currentData.Ledger_Tally_Id) {
                        updateFields.Ledger_Tally_Id = erpId;
                        changedFields.push("Ledger_Tally_Id");
                    }

                    if (Object.keys(updateFields).length === 0) {
                        results.push({ success: true, message: "No changes needed", ledgerName: Ledger_Name });
                        continue;
                    }


                    const updateLedger = transaction.request().input("ledgerName", sql.NVarChar, Ledger_Name);
                    const setFields = [];

                    for (const [key, value] of Object.entries(updateFields)) {
                        const param = `param_${key}`;
                        setFields.push(`${key} = @${param}`);
                        updateLedger.input(param, value);
                    }
                    setFields.push("IsUpdated = 1");

                    await updateLedger.query(
                        `UPDATE tbl_Ledger_LoL SET ${setFields.join(", ")} WHERE Ledger_Name = @ledgerName`
                    );


                    const updateSecondary = new sql.Request(req.db).input("ledgerName", sql.NVarChar, Ledger_Name);
                    for (const [key, value] of Object.entries(updateFields)) {
                        const param = `param_${key}`;
                        updateSecondary.input(param, value);
                    }
                    await updateSecondary.query(
                        `UPDATE tbl_Ledger_LoL SET ${setFields.filter(f => f !== "IsUpdated = 1").join(", ")} WHERE Ledger_Name = @ledgerName`
                    );

                    successCount++;
                    results.push({
                        success: true,
                        message: "Successfully updated",
                        ledgerName: Ledger_Name,
                        updatedFields: changedFields
                    });
                } catch (err) {
                    results.push({
                        success: false,
                        message: `Error processing row: ${err.message}`
                    });
                    console.error(`Error processing row:`, err);
                }
            }

            await transaction.commit();
            return dataFound(res, `${successCount} record(s) processed successfully.`, {
                total: excelData.length,
                success: successCount,
                failed: excelData.length - successCount,
                details: results
            });
        } catch (error) {
            await transaction.rollback();
            servError(error, res);
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
