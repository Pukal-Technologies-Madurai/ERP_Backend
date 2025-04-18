import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success, sentData } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';

const ExpencesMasterController = () => {

    const getExpences = async (req, res) => {
        try {
            const request = new sql.Request()
                .query('SELECT * FROM tbl_ERP_Expence_Master');

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getExpences,
    }
}

export default ExpencesMasterController();