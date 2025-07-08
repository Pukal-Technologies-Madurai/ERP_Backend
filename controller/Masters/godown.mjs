import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput, sentData } from '../../res.mjs';
import { checkIsNumber, randomNumber } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';

const Godown = () => {

    const getGodown = async (req, res) => {

        try {

            const request = new sql.Request()
                .query(`
                    SELECT 
                     * from tbl_Godown_Master`
                );

            const result = await request;

            sentData(res, result.recordset);

        } catch (e) {
            servError(e, res)
        }
    }

    const createGodown = async (req, res) => {
        try {
            const { Godown_Name, Created_By } = req.body;

            if (!Godown_Name) {
                return failed(res, 'Godown name is required');
            }

            const checkExisting = await new sql.Request()
                .input('Godown_Name', Godown_Name)
                .query('SELECT 1 FROM tbl_Godown_Master WHERE Godown_Name = @Godown_Name');

            if (checkExisting.recordset.length > 0) {
                return failed(res, 'Godown_Name already exists');
            }

            const getMaxId = await getNextId({ table: 'tbl_Godown_Master', column: 'Godown_Id' });
            if (!checkIsNumber(getMaxId.MaxId)) {
                return failed(res, 'Error generating State ID');
            }

            const Godown_Id = getMaxId.MaxId;

            const Alter_Id = randomNumber();

            const request = new sql.Request();
            await request
                .input('Godown_Id', Godown_Id)
                .input('Godown_Name', Godown_Name)
                .input('Alter_Id', Alter_Id)
                .input('Created_By', Created_By)
                .input('Created_Time', new Date())
                .query(`
                INSERT INTO tbl_Godown_Master (Godown_Id, Godown_Name,Alter_Id,Created_By,Created_Time) 
                VALUES (@Godown_Id, @Godown_Name,@Alter_Id,@Created_By,@Created_Time)
            `);

            success(res, 'Godown created successfully.');

        } catch (e) {
            servError(e, res);
        }
    }

    const updateGodown = async (req, res) => {
        try {
            const { Godown_Id, Godown_Name, Alter_By } = req.body;

            if (!Godown_Id || !Godown_Name) {
                return invalidInput(res, "Godown_Name are required");
            }

            const checkExisting = await new sql.Request()
                .input('Godown_Name', Godown_Name)
                .query('SELECT 1 FROM tbl_Godown_Master WHERE Godown_Name = @Godown_Name');

            if (checkExisting.recordset.length > 0) {
                return failed(res, 'Godown_Name already exists');
            }

            const Alter_Id = randomNumber();
            const request = new sql.Request();
            await request
                .input('Godown_Id', Godown_Id)
                .input('Godown_Name', Godown_Name)
                .input('Alter_Id', Alter_Id)
                .input('Alter_By', Alter_By)
                .input('Alter_Time', new Date())
                .query(`
                UPDATE tbl_Godown_Master 
                SET Godown_Name = @Godown_Name,Alter_Id=@Alter_Id, Alter_By=@Alter_By,Alter_Time=@Alter_Time
                WHERE Godown_Id = @Godown_Id
            `);

            success(res, 'Godown updated successfully');

        } catch (e) {
            servError(e, res);
        }
    }

    const deleteGodown = async (req, res) => {
        try {
            const { Godown_Id } = req.body;

            if (!Godown_Id) {
                return invalidInput(res, "Godown_Id is Required");
            }

            const request = new sql.Request()
                .input('Godown_Id', Godown_Id);

            const result = await request.query(`
            DELETE FROM tbl_Godown_Master
            WHERE Godown_Id = @Godown_Id
        `);

            if (result.rowsAffected[0] === 0) {
                noData(res, 'No Data');
            }
            else {
                success(res, 'Godown Master deleted.');
            }
        } catch (error) {
            servError(error, res);
        }

    }

    return {
        getGodown,
        createGodown,
        updateGodown,
        deleteGodown,
        // updateState

    }
}

export default Godown()