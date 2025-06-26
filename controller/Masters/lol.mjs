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

const lol = () => {

    const lollist = async (req, res) => {
        try {
            const result = await sql.query("SELECT * FROM tbl_Ledger_LOL");

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

    return {
        lollist,
        displayColumn,
        applyColumnChanges,
        dropDownColumn,
        updateLolData
    };
};

export default lol();
