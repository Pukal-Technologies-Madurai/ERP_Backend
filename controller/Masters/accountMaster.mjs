import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput, sentData } from '../../res.mjs';
import { checkIsNumber, isEqualNumber } from '../../helper_functions.mjs';


const accountMaster = () => {

    const getAccountGroups = async (req, res) => {
        try {
            const { excludeNotMaped = 0 } = req.query;
            const request = new sql.Request()
                .query(`
                    SELECT * 
                    FROM tbl_Accounting_Group
                    ${isEqualNumber(excludeNotMaped, 1) ? ' WHERE Group_Id IN (SELECT DISTINCT Group_Id FROM tbl_Account_Master) ' : ''}
                    ORDER BY Group_Name;`
                );

            const result = await request;

            sentData(res, result.recordset);

        } catch (e) {
            servError(res, e)
        }
    }

    const getAccounts = async (req, res) => {

        try {
            const { Acc_Id, Group_Id } = req.query;

            const request = new sql.Request()
                .input('Acc_Id', Acc_Id)
                .input('Group_Id', Group_Id)
                .query(`
                    SELECT 
                        a.Acc_Id,
                        a.Account_name,
                        a.Group_Id,
                        COALESCE(ag.Group_Name, 'Not found') AS Group_Name
                    FROM tbl_Account_Master AS a 
                    LEFT JOIN tbl_Accounting_Group AS ag
                        ON ag.Group_Id = a.Group_Id
                    WHERE Acc_Id IS NOT NULL
                    ${checkIsNumber(Acc_Id) ? ' AND a.Acc_Id = @Acc_Id ' : ''}
                    ${checkIsNumber(Group_Id) ? ' AND a.Group_Id = @Group_Id ' : ''}
                    ORDER BY a.Account_name;`
                );

            const result = await request;

            sentData(res, result.recordset);

        } catch (e) {
            servError(res, e)
        }
    }

    return {
        getAccountGroups,
        getAccounts,
    }
}

export default accountMaster()