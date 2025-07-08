import sql from 'mssql'
import { servError, failed, success, invalidInput, sentData } from '../../res.mjs';
import { randomNumber } from '../../helper_functions.mjs';


const accountGroup = () => {

    const getAccountGroup = async (req, res) => {
        try {

            const request = new sql.Request()
                .query(`
                    SELECT  a.*, b.Group_Name AS Parent_Group_Name
                    FROM  tbl_Accounting_Group AS a LEFT JOIN tbl_Accounting_Group AS b ON b.Group_Id = a.Parent_AC_id
                    order by a.Group_Id ASC`
                );

            const result = await request;

            sentData(res, result.recordset);

        }
        catch (error) {
            servError(error, res)
        }
    }

    const createAccountGroup = async (req, res) => {
        try {
            const {
                Group_Name,
                Alias_name,
                Parent_AC_id,
                Created_By
            } = req.body;
            if (!Group_Name) {
                return invalidInput(res, 'Group_Name');
            }

            const getMaxIdRequest = new sql.Request();
            const maxIdResult = await getMaxIdRequest.query(`
            SELECT ISNULL(MAX(Group_Id), 0) + 1 AS NextGrpId FROM tbl_Accounting_Group
        `);

            const Group_Id = maxIdResult.recordset[0].NextGrpId;
            const Alter_Id = randomNumber();
            const Created_Time = new Date();
            const insertRequest = new sql.Request()
                .input('Group_Id', Group_Id)
                .input('Group_Name', Group_Name)
                .input('Alias_name', Alias_name)
                .input('Parent_AC_id', Parent_AC_id)
                .input('Alter_Id', Alter_Id)
                .input('Created_By', Created_By)
                .input('Created_Time', Created_Time)

            await insertRequest.query(`
            INSERT INTO tbl_Accounting_Group (
                Group_Id, Group_Name, Alias_name, Parent_AC_id,
                Alter_Id, Created_By, Created_Time
            ) VALUES (
                @Group_Id, @Group_Name, @Alias_name, @Parent_AC_id,
                @Alter_Id, @Created_By, @Created_Time
            )
        `);

            success(res, 'Account created successfully.');

        } catch (error) {
            servError(error, res);
        }
    };

    const updateAccountGroup = async (req, res) => {
        try {
            const {
                Group_Id,
                Group_Name,
                Alias_Name,
                Parent_AC_id,
                Alter_By
            } = req.body;


            if (!Group_Id || !Group_Name) {
                return invalidInput(res, 'Group_Id, Group_Name are required');
            }

            const Alter_Id = randomNumber();
            const request = new sql.Request()
                .input('Group_Id', Group_Id)
                .input('Group_Name', Group_Name)
                .input('Alias_name', Alias_Name)
                .input('Parent_AC_id', Parent_AC_id)
                .input('Alter_Id', Alter_Id)
                .input('Alter_By', Number(Alter_By))
                .input('Alter_Time', new Date());

            await request.query(`
            UPDATE tbl_Accounting_Group
            SET 
                Group_Name = @Group_Name,
                Alias_name = @Alias_name,
                Parent_AC_id = @Parent_AC_id,
                Alter_Id = @Alter_Id,
                Alter_By = @Alter_By,
                Alter_Time = @Alter_Time
            WHERE Group_Id = @Group_Id
        `);

            success(res, 'Account Master updated successfully');

        } catch (error) {

            servError(error, res);
        }
    };

    const deleteAccountGroup = async (req, res) => {
        try {
            const { Group_Id } = req.body;

            if (!Group_Id) {
                return invalidInput(res, "Group_Id is Required");
            }

            const request = new sql.Request()
                .input('Group_Id', Group_Id);

            const result = await request.query(`
            DELETE FROM tbl_Accounting_Group
            WHERE Group_Id = @Group_Id`
            );

            if (result.rowsAffected[0] === 0) {
                failed(res, 'No Data Found');
            }

            success(res, 'Account Master deleted.');

        } catch (error) {
            servError(error, res);
        }

    }

    return {

        getAccountGroup,
        updateAccountGroup,
        deleteAccountGroup,
        createAccountGroup
    }
}

export default accountGroup()