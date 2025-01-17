import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput } from '../../res.mjs';


const userTypeMaster = () => {

    const getUserType = async (req, res) => {

        try {
            const result = await sql.query('SELECT Id, UserType, Alias FROM tbl_User_Type WHERE IsActive = 1');

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }

    }

    const postUserType = async (req, res) => {
        const { UserType } = req.body;
        try {
            const request = new sql.Request()
            request.input('Mode', 1)
            request.input('Id', 0)
            request.input('UserType', UserType)
            const result = await request.execute('User_Type_SP');

            if (result.rowsAffected[0] > 0) {
                success(res, 'User Type Created')
            } else {
                failed(res, 'Failed to create')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const editUserType = async (req, res) => {
        const { Id, UserType } = req.body;

        if (!Id || !UserType) {
            return invalidInput(res, 'Id, UserType is required')
        }
        try {
            const request = new sql.Request();
            request.input('Mode', 2);
            request.input('Id', Id);
            request.input('UserType', UserType);
            const result = await request.execute('User_Type_SP');

            if (result.rowsAffected[0] > 0) {
                return success(res, 'Changes Saved')
            } else {
                return failed(res, 'Failed to Save!')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const deleteUserType = async (req, res) => {
        const { Id } = req.body;

        if (!Id) {
            return invalidInput(res, 'Id is required');
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 3);
            request.input('Id', Id);
            request.input('UserType', 0);
            const result = await request.execute('User_Type_SP');

            if (result.rowsAffected[0] > 0) {
                success(res, 'User Type Deleted')
            } else {
                failed(res, 'Failed to Delete')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const userTypeforcostcenter = async (req, res) => {

        try {
            const result = await sql.query(`
                SELECT 
                    Id AS UserTypeId, 
                    UserType, 
                    Alias 
                FROM tbl_User_Type 
                WHERE 
                    IsActive = 1 
                    AND Id NOT IN (0,1,4,6,7,8)
                `)

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(e, res)
        }

    }

    return {
        getUserType,
        postUserType,
        editUserType,
        deleteUserType,
        userTypeforcostcenter
    }
}

export default userTypeMaster()