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

const los = () => {

    const loslist = async (req, res) => {
        try {
            const result = await sql.query("SELECT * FROM tbl_Stock_LOS");

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

    return {
        loslist,
        displayLoSColumn,
        applyLosColumnChanges,
        dropDownLosColumn,
        updateLosData

    };
};

export default los();
