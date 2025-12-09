import sql from 'mssql';
import { ISOString, toArray, toNumber } from '../../../helper_functions.mjs';
import { servError, dataFound, sentData } from '../../../res.mjs';


export const getFilterValues = async (req, res) => {
    try {
        const request = new sql.Request()
            .query(`
                -- Voucher
                SELECT DISTINCT rec.Voucher_Type AS value, v.Voucher_Type AS label
                FROM tbl_Sales_Delivery_Gen_Info AS rec
                LEFT JOIN tbl_Voucher_Type AS v
                ON v.Vocher_Type_Id = rec.Voucher_Type
                -- Retailer
                SELECT DISTINCT rec.Retailer_Id AS value, r.Retailer_Name AS label
                FROM tbl_Sales_Delivery_Gen_Info AS rec
                LEFT JOIN tbl_Retailers_Master AS r
                ON r.Retailer_Id = rec.Retailer_Id
                -- Created By
                SELECT DISTINCT rec.Created_by AS value, u.Name AS label
                FROM tbl_Sales_Delivery_Gen_Info AS rec
                LEFT JOIN tbl_Users AS u
                ON u.UserId = rec.Created_by;`
            );

        const result = await request;

        dataFound(res, [], 'data found', {
            voucherType: toArray(result.recordsets[0]),
            retailers: toArray(result.recordsets[1]),
            createdBy: toArray(result.recordsets[2])
        });
    } catch (e) {
        servError(e, res);
    }
}

export const getStockInHandGodownWise = async (req, res) => {
    try {
        const { Godown_Id, Item_Id } = req.query;
        const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('Godown_Id', sql.Int, toNumber(Godown_Id))
            .input('Item_Id', sql.Int, toNumber(Item_Id))
            .execute('Stock_Summarry_Search_Godown_New');

        const result = await request;

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
}

export const getSalesExpenceAccount = async (req, res) => {
    try {
        const request = new sql.Request()
            .query(`
                WITH GroupHierarchy AS (
                    SELECT 
                        AG.Group_Id,
                        AG.ERP_Id,
                        AG.Group_Name,
                        AG.Alias_name,
                        AG.Parent_AC_id
                    FROM dbo.tbl_Accounting_Group AS AG
                    LEFT JOIN tbl_Account_Master AS A ON 
                        A.Group_Id = AG.Group_Id
                    WHERE AG.Group_Id IN (14, 633) 
                    UNION ALL
                    SELECT 
                        ag.Group_Id,
                        ag.ERP_Id,
                        ag.Group_Name,
                        ag.Alias_name,
                        ag.Parent_AC_id
                    FROM dbo.tbl_Accounting_Group ag
                    INNER JOIN GroupHierarchy gh ON 
                        ag.Parent_AC_id = gh.Group_Id
                )
                SELECT 
                    am.Acc_Id AS Id,
                    am.Account_name AS Expence_Name
                FROM dbo.tbl_Account_Master am
                WHERE 
                    am.Group_Id IN (
                        SELECT DISTINCT Group_Id 
                        FROM GroupHierarchy
                    ) OR am.Acc_Id IN (8056)`
            );

        const result = await request;

        sentData(res, result.recordset)
    } catch (e) {
        servError(e, res);
    }
}