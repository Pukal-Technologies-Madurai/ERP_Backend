import sql from 'mssql';
import { dataFound, servError } from '../../res.mjs';
import { toArray } from '../../helper_functions.mjs';


const getFilterValues = async (req, res) => {
    try {
        const request = new sql.Request()
            .query(`
                -- Voucher
                SELECT DISTINCT con.VoucherType AS value, v.Voucher_Type AS label
                FROM tbl_Contra_General_Info AS con
                LEFT JOIN tbl_Voucher_Type AS v
                ON v.Vocher_Type_Id = con.VoucherType
                -- Debit Account
                SELECT DISTINCT con.DebitAccount AS value, a.Account_name AS label
                FROM tbl_Contra_General_Info AS con
                LEFT JOIN tbl_Account_Master AS a
                ON a.Acc_Id = con.DebitAccount
                -- Credit Account
                SELECT DISTINCT con.CreditAccount AS value, a.Account_name AS label
                FROM tbl_Contra_General_Info AS con
                LEFT JOIN tbl_Account_Master AS a
                ON a.Acc_Id = con.CreditAccount
                -- Created By
                SELECT DISTINCT con.CreatedBy AS value, u.Name AS label
                FROM tbl_Contra_General_Info AS con
                LEFT JOIN tbl_Users AS u
                ON u.UserId = con.CreatedBy;
				-- Branch filter
				SELECT DISTINCT con.BranchId AS value, b.BranchName AS label
				FROM tbl_Contra_General_Info AS con
				LEFT JOIN tbl_Branch_Master AS b 
				ON b.BranchId = con.BranchId`
            );

        const result = await request;

        dataFound(res, [], 'data found', {
            voucherType: toArray(result.recordsets[0]),
            debit_accounts: toArray(result.recordsets[1]),
            credit_accounts: toArray(result.recordsets[2]),
            created_by: toArray(result.recordsets[3]),
            branch: toArray(result.recordsets[4])
        });
        
    } catch (e) {
        servError(e, res);
    }
}


export default {
    getFilterValues,
}