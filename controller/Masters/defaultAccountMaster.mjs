import { checkIsNumber } from "../../helper_functions.mjs";
import { getNextId } from "../../middleware/miniAPIs.mjs";
import { failed, invalidInput, sentData, servError, success } from "../../res.mjs"
import sql from 'mssql';


const getDefaultAccounts = async (req, res) => {
    try {
        const { Type = '', AC_Reason = '' } = req.query;

        const request = new sql.Request()
            .input('Type', Type)
            .input('AC_Reason', AC_Reason)
            .query(`
                SELECT 
                    dc.Id,
                    dc.Acc_Id,
                    dc.AC_Reason,
                    dc.Type,
                    am.Account_Name,
                    am.Group_Id,
                    ag.Group_Name,
                    COALESCE(am.percentageValue, 0) AS percentageValue
                FROM tbl_Default_AC_Master AS dc
                JOIN tbl_Account_Master AS am
                    ON am.Acc_Id = dc.Acc_Id
                LEFT JOIN tbl_Accounting_Group AS ag
                    ON ag.Group_Id = am.Group_Id
                WHERE 
                    dc.Acc_Id IS NOT NULL
                    ${Type ? ' AND dc.Type = @Type ' : ''}
                    ${AC_Reason ? ' AND dc.AC_Reason = @AC_Reason ' : ''}`
            );

        const result = await request;

        sentData(res, result.recordset)
    } catch (e) {
        servError(e, res);
    }
}

const insertDefaultAccount = async (req, res) => {
    try {
        const { Acc_Id, AC_Reason = "", Type = 'UNKNOWN' } = req.body;

        if (!checkIsNumber(Acc_Id) || !AC_Reason || !Type) {
            return invalidInput(res, 'Acc_Id, AC_Reason, Type is required');
        }

        const getId = await getNextId({ table: 'tbl_Default_AC_Master', column: 'Id' });

        if (!getId.status || !checkIsNumber(getId.MaxId)) throw new Error('Failed to get Id in default master');

        const Id = getId.MaxId;

        const request = new sql.Request()
            .input('Id', Id)
            .input('Acc_Id', Acc_Id)
            .input('AC_Reason', AC_Reason)
            .input('Type', Type)
            .query(`
                INSERT INTO tbl_Default_AC_Master (
                    Id, Acc_Id, AC_Reason, Type
                ) VALUES (
                    @Id, @Acc_Id, @AC_Reason, @Type
                );`
            );

        const result = await request;

        if (result.rowsAffected[0] === 1) {
            success(res, 'Saved')
        } else {
            failed(res, 'Failed to save')
        }
    } catch (e) {
        servError(e, res);
    }
}

const updateDefaultAccount = async (req, res) => {
    try {
        const { Id, Acc_Id, AC_Reason = "", Type = 'UNKNOWN' } = req.body;

        const request = new sql.Request()
            .input('Id', Id)
            .input('Acc_Id', Acc_Id)
            .input('AC_Reason', AC_Reason)
            .input('Type', Type)
            .query(`
                UPDATE tbl_Default_AC_Master 
                SET 
                    Acc_Id = @Acc_Id, 
                    AC_Reason = @AC_Reason, 
                    Type = @Type
                WHERE Id = @Id;`
            );

        const result = await request;

        if (result.rowsAffected[0] === 1) {
            success(res, 'Saved')
        } else {
            failed(res, 'Failed to save')
        }
    } catch (e) {
        servError(e, res);
    }
}

export default {
    getDefaultAccounts,
    insertDefaultAccount,
    updateDefaultAccount,
}