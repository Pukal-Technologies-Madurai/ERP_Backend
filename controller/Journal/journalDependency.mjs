import sql from 'mssql';
import { dataFound, servError } from '../../res.mjs';
import { toArray } from '../../helper_functions.mjs';


const getFilterValues = async (req, res) => {
    try {
        const request = new sql.Request()
            .query(`
            -- Voucher
                SELECT DISTINCT jgi.VoucherType AS value, v.Voucher_Type AS label
                FROM tbl_Journal_General_Info AS jgi
                LEFT JOIN tbl_Voucher_Type AS v
                ON v.Vocher_Type_Id = jgi.VoucherType
            -- Debit Account
                SELECT DISTINCT jei.Acc_Id AS value, a.Account_name AS label
                FROM tbl_Journal_Entries_Info AS jei
                LEFT JOIN tbl_Account_Master AS a ON a.Acc_Id = jei.Acc_Id
				WHERE jei.DrCr = 'Dr'
            -- Credit Account
                SELECT DISTINCT jei.Acc_Id AS value, a.Account_name AS label
                FROM tbl_Journal_Entries_Info AS jei
                LEFT JOIN tbl_Account_Master AS a ON a.Acc_Id = jei.Acc_Id
				WHERE jei.DrCr = 'Cr'
            -- Created By
                SELECT DISTINCT jgi.CreatedBy AS value, u.Name AS label
                FROM tbl_Journal_General_Info AS jgi
                LEFT JOIN tbl_Users AS u
                ON u.UserId = jgi.CreatedBy;`
            );

        const result = await request;

        dataFound(res, [], 'data found', {
            voucherType: toArray(result.recordsets[0]),
            debit_accounts: toArray(result.recordsets[1]),
            credit_accounts: toArray(result.recordsets[2]),
            created_by: toArray(result.recordsets[3])
        });
    } catch (e) {
        servError(e, res);
    }
}

export default {
    getFilterValues,
}