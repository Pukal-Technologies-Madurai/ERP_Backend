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
                ON u.UserId = pigi.Created_by;
                -- Branch
                SELECT DISTINCT pigi.Branch_Id AS value, b.BranchName AS label
                FROM tbl_Purchase_Order_Inv_Gen_Info AS pigi
                LEFT JOIN tbl_Branch_Master AS b
                ON b.BranchId = pigi.Branch_Id
                -- Retailer
                SELECT DISTINCT pigi.Retailer_Id AS value, r.Retailer_Name AS label
                FROM tbl_Purchase_Order_Inv_Gen_Info AS pigi
                LEFT JOIN tbl_Retailers_Master AS r
                ON r.Retailer_Id = pigi.Retailer_Id;`
            );

        const result = await request;

        dataFound(res, [], 'data found', {
            voucherType: toArray(result.recordsets[0]),
            created_by: toArray(result.recordsets[1]),
            branch: toArray(result.recordsets[2]),
            retailer: toArray(result.recordsets[3])
        });
    } catch (e) {
        servError(e, res);
    }
}