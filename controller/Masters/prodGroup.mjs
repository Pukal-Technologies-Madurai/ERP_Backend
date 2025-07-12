import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber, randomNumber } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';

const proGroup = () => {

    const getProductGroups = async (req, res) => {

        try {
            const request = new sql.Request()
                .query(`
                    SELECT *
                    FROM tbl_Product_Group`
                );

            const result = await request;

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }
    };

    const postProdGroup = async (req, res) => {
        const { Pro_Group, Created_By, Company_Id } = req.body;

        if (!Pro_Group) {
            return invalidInput(res, 'Pro_Group is required');
        }

        try {
            const checkExisting = await new sql.Request()
                .input('Pro_Group', Pro_Group)
                .query('SELECT 1 FROM tbl_Product_Group WHERE Pro_Group = @Pro_Group');

            if (checkExisting.recordset.length > 0) {
                return failed(res, 'Pro_Group already exists');
            }

            const getMaxId = await getNextId({ table: 'tbl_Product_Group', column: 'Pro_Group_Id' });

            if (!checkIsNumber(getMaxId.MaxId)) {
                return failed(res, 'Error generating Pro_Group ID');
            }

            const Pro_Group_Id = getMaxId.MaxId;
            const Alter_Id = randomNumber();
            const result = await new sql.Request()
                .input('Pro_Group_Id', Pro_Group_Id)
                .input('Pro_Group', Pro_Group)
                .input('Company_Id', Company_Id)
                .input('Alter_Id', Alter_Id)
                .input('Created_By', Created_By)
                .input('Created_Time', new Date())
                .query(`
                INSERT INTO tbl_Product_Group 
                (Pro_Group_Id, Pro_Group, Company_Id, Alter_Id, Created_By, Created_Time) 
                VALUES 
                (@Pro_Group_Id, @Pro_Group, @Company_Id, @Alter_Id, @Created_By, @Created_Time)
            `);

            if (result.rowsAffected && result.rowsAffected[0] > 0) {
                return success(res, 'Pro Group created successfully');
            } else {
                return failed(res, 'Failed to create Pro Group');
            }
        } catch (e) {
            return servError(e, res);
        }
    };

    const putProdGroup = async (req, res) => {
        const { Pro_Group_Id, Company_Id, Pro_Group, Alter_By } = req.body;

        if (!Pro_Group_Id || !Pro_Group) {
            return invalidInput(res, 'Pro_Group_Id, Pro_Group are required');
        }

        try {
            const Alter_Id = randomNumber();
            const Alter_Time = new Date();

            const result = await new sql.Request()
                .input('Pro_Group_Id', Pro_Group_Id)
                .input('Pro_Group', Pro_Group)
                .input('Company_Id', Company_Id)
                .input('Alter_Id', Alter_Id)
                .input('Alter_By', Alter_By)
                .input('Alter_Time', Alter_Time)
                .query(`
                UPDATE tbl_Product_Group
                SET 
                    Pro_Group = @Pro_Group,
                    Company_Id = @Company_Id,
                    Alter_Id = @Alter_Id,
                    Alter_By = @Alter_By,
                    Alter_Time = @Alter_Time
                WHERE Pro_Group_Id = @Pro_Group_Id
            `);

            if (result.rowsAffected && result.rowsAffected[0] > 0) {
                success(res, 'Pro_Group updated successfully');
            } else {
                failed(res, 'Failed to save changes');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const deleteProGroup = async (req, res) => {
        const { Pro_Group_Id } = req.body;

        if (!Pro_Group_Id) {
            return invalidInput(res, 'Pro_Group_Id is required');
        }

        try {
            const result = await new sql.Request()
                .input('Pro_Group_Id', Pro_Group_Id)
                .query('DELETE FROM tbl_Product_Group WHERE Pro_Group_Id = @Pro_Group_Id');

            if (result.rowsAffected && result.rowsAffected[0] > 0) {
                success(res, 'Pro Group deleted successfully');
            } else {
                failed(res, 'Failed to delete Pro Group');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    return {
        getProductGroups,
        postProdGroup,
        putProdGroup,
        deleteProGroup
    }
}

export default proGroup();