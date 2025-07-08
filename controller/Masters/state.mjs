import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput, sentData } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';

import { getNextId } from '../../middleware/miniAPIs.mjs';

const stateMaster = () => {

    const getState = async (req, res) => {

        try {

            const request = new sql.Request()
                .query(`
                    SELECT 
                     * from tbl_State_Master`
                );

            const result = await request;

            sentData(res, result.recordset);

        } catch (e) {
            servError(e, res)
        }
    }

    const createState = async (req, res) => {
        try {
            const { State_Name } = req.body;

            if (!State_Name) {
                return invalidInput(res, 'State_Name is required');
            }

            const checkRequest = new sql.Request();
            const checkResult = await checkRequest
                .input('State_Name', State_Name)
                .query(`
                SELECT 1 FROM tbl_State_Master 
                WHERE LOWER(State_Name) = LOWER(@State_Name)
            `);

            if (checkResult.recordset.length > 0) {
                return failed(res, 'State name already exists');
            }

            const getMaxId = await getNextId({ table: 'tbl_State_Master', column: 'State_Id' });
            if (!checkIsNumber(getMaxId.MaxId)) {
                return failed(res, 'Error generating State ID');
            }

            const State_Id = getMaxId.MaxId;

            const request = new sql.Request();
            const result = await request
                .input('State_Id', State_Id)
                .input('State_Name', State_Name)
                .query(`
                INSERT INTO tbl_State_Master (State_Id, State_Name) 
                VALUES (@State_Id, @State_Name)
            `);

            if (result.rowsAffected[0] > 0) {
                success(res, 'State created successfully');
            } else {
                failed(res, 'Failed to create state');
            }

        } catch (e) {

            servError(e, res);
        }
    };
    
    const deleteState = async (req, res) => {
        try {
            const { State_Id } = req.body;

            if (!State_Id) {
                return invalidInput(res, "State_Id is Required");
            }

            const request = new sql.Request()
                .input('State_Id', State_Id);

            const result = await request.query(`
            DELETE FROM tbl_State_Master
            WHERE State_Id = @State_Id
        `);

            if (result.rowsAffected[0] === 0) {
                noData(res);
            }

            sentData(res, { message: 'Account Master deleted.' });

        } catch (error) {
            servError(error, res);
        }

    }

    const updateState = async (req, res) => {
        try {
            const { State_Id, State_Name } = req.body;

            if (!State_Id || !State_Name) {
                return invalidInput(res, "Both State_Id and State_Name are required");
            }

            const checkState = await new sql.Request()
                .input('State_Id', State_Id)
                .query('SELECT State_Name FROM tbl_State_Master WHERE State_Id = @State_Id');

            if (checkState.recordset.length === 0) {
                return notFound(res, "State not found");
            }

            const checkName = await new sql.Request()
                .input('State_Name', State_Name)
                .input('State_Id', State_Id)
                .query(`
                SELECT 1 FROM tbl_State_Master 
                WHERE LOWER(State_Name) = LOWER(@State_Name) 
                AND State_Id != @State_Id
            `);

            if (checkName.recordset.length > 0) {
                return failed(res, "State name already exists");
            }

            const request = new sql.Request();
            const result = await request
                .input('State_Id', State_Id)
                .input('State_Name', State_Name)
                .query(`
                UPDATE tbl_State_Master 
                SET State_Name = @State_Name
                WHERE State_Id = @State_Id
            `);

            if (result.rowsAffected[0] > 0) {
                success(res, 'State updated successfully');
            } else {
                failed(res, 'No changes made to state');
            }

        } catch (e) {

            servError(e, res);
        }
    };

    const stateDropDown = async (req, res) => {
        try {
            const brand = (await new sql.Request()
                .query(`
                       SELECT 
                           State_Id, 
                           State_Name 
                       FROM 
                           tbl_State_Master 
                           `)
            ).recordset;
            // AND
            // Company_id = @Comp

            if (brand.length > 0) {
                dataFound(res, brand)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    return {
        getState,
        createState,
        deleteState,
        updateState,
        stateDropDown

    }
}

export default stateMaster()