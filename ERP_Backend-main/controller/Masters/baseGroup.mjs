import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';


const baseGroupMaster = () => {

    const getBaseGroup = async (req, res) => {

        try {
            const result = (await new sql.Request().execute('Base_Group_VW')).recordset

            if (result.length > 0) {
                dataFound(res, result)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(res, e)
        }
    }

    const postBaseGroup = async (req, res) => {
        const { Base_Group_Name } = req.body;

        if (!Base_Group_Name) {
            return invalidInput(res, 'Base_Group_Name is required')
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 1);
            request.input('Base_Group_Id', 0);
            request.input('Base_Group_Name', Base_Group_Name);

            const result = await request.execute('Base_Group_SP');

            if (result.recordset.length > 0) {
                success(res, 'Base Group Created')
            } else {
                failed(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const editBaseGroup = async (req, res) => {
        const { Base_Group_Id, Base_Group_Name } = req.body;

        if (!checkIsNumber(Base_Group_Id) || !Base_Group_Name) {
            return invalidInput(res, 'Base_Group_Id, Base_Group_Name is required')
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 2);
            request.input('Base_Group_Id', Base_Group_Id);
            request.input('Base_Group_Name', Base_Group_Name);

            const result = await request.execute('Base_Group_SP');

            if (result.rowsAffected[0] > 0) {
                success(res, 'Changes Saved!')
            } else {
                failed(res, 'Failed to save')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const deleteBaseGroup = async (req, res) => {
        const { Base_Group_Id } = req.body;

        if (!checkIsNumber(Base_Group_Id)) {
            return invalidInput(res, 'Base_Group_Id, is required')
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 3);
            request.input('Base_Group_Id', Base_Group_Id);
            request.input('Base_Group_Name', 0);

            const result = await request.execute('Base_Group_SP');

            if (result.rowsAffected[0] > 0) {
                success(res, 'Deleted')
            } else {
                failed(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    return {
        getBaseGroup,
        postBaseGroup,
        editBaseGroup,
        deleteBaseGroup
    }
}

export default baseGroupMaster()