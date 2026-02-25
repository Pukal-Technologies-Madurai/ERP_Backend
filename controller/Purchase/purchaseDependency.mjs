import sql from 'mssql';
import { servError, dataFound } from '../../res.mjs';
import { toArray } from '../../helper_functions.mjs';

export const getPurchaseFilterValues = async (req, res) => {
    try {
        const request = new sql.Request()
            .query(`
                -- Voucher
                SELECT DISTINCT pigi.Voucher_Type AS value, v.Voucher_Type AS label
                FROM tbl_Purchase_Order_Inv_Gen_Info AS pigi
                LEFT JOIN tbl_Voucher_Type AS v
                ON v.Vocher_Type_Id = pigi.Voucher_Type
                -- Created By
                SELECT DISTINCT pigi.Created_by AS value, u.Name AS label
                FROM tbl_Purchase_Order_Inv_Gen_Info AS pigi
                LEFT JOIN tbl_Users AS u
                ON u.UserId = pigi.Created_by;`
            );

        const result = await request;

        dataFound(res, [], 'data found', {
            voucherType: toArray(result.recordsets[0]),
            created_by: toArray(result.recordsets[1])
        });
    } catch (e) {
        servError(e, res);
    }
}