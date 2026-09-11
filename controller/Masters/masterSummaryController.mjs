import sql from "mssql";
import {
    dataFound,
    failed,
    invalidInput,
    noData,
    sentData,
    servError,
    success,
} from "../../res.mjs";

const MASTER_TABLE_MAP = {
    accountingGroup: { table: 'tbl_Accounting_Group', idColumn: 'Group_Id' },
    accountMaster: { table: 'tbl_Account_Master', idColumn: 'Acc_Id' },
    stockGroup: { table: 'tbl_Stock_Group', idColumn: 'St_Group_Id' },
    stockItem: { table: 'tbl_Item_Group', idColumn: 'Item_Group_Id' },
    godown: { table: 'tbl_Godown_master', idColumn: 'Godown_Id' },
    voucher: { table: 'tbl_Voucher_Group', idColumn: 'Voucher_Group_Id' },
    unit: { table: 'tbl_UOM', idColumn: 'Unit_Id' },
    costcenter: { table: 'tbl_ERP_Cost_Center', idColumn: 'Cost_Center_Id' },
    costcategory: { table: 'tbl_ERP_Cost_Category', idColumn: 'Cost_Category_Id' },
};

const masterList = () => {
const getMasterCounts = async (req, res) => {
    try {
        const keys = Object.keys(MASTER_TABLE_MAP);

        const requests = keys.map((key) => {
            const { table } = MASTER_TABLE_MAP[key];
            return new sql.Request().query(`SELECT COUNT(*) AS total FROM ${table}`);
        });

        const results = await Promise.all(requests);

        const counts = {};
        keys.forEach((key, idx) => {
            counts[key] = results[idx].recordset[0].total;
        });

        dataFound(res, counts);
    } catch (e) {
        servError(e, res);
    }
};


const getMasterDetails = async (req, res) => {
    try {
        const { type } = req.query;
        const mapping = MASTER_TABLE_MAP[type];

        if (!mapping) {
            return res.status(400).json({
                success: false,
                message: `Unknown master type: ${type}`,
            });
        }

        const request = new sql.Request();
        const result = await request.query(
            `SELECT * FROM ${mapping.table} ORDER BY ${mapping.idColumn} DESC`
        );

        if (result.recordset.length) {
            dataFound(res, result.recordset);
        } else {
            noData(res);
        }
    } catch (e) {
        servError(e, res);
    }
};


const getAccountMasterDetails = async (req, res) => {
    try {
        const { section, mapped } = req.query;
        const isMapped = String(mapped) === "true";
        const request = new sql.Request();
        let result;

        if (section === "accounting") {
            const joinClause = isMapped
                ? `INNER JOIN tbl_Retailers_Master R ON A.Acc_Id = R.AC_Id`
                : `LEFT JOIN tbl_Retailers_Master R ON A.Acc_Id = R.AC_Id`;
            const mappedFilter = isMapped ? "" : "WHERE R.AC_Id IS NULL";

            result = await request.query(`
                SELECT
                    A.Acc_Id,
                    A.Account_name,
                    A.Account_Alias_name,
                    G.Group_Name
                FROM tbl_Account_Master A
                LEFT JOIN tbl_Accounting_Group G ON A.Group_Id = G.Group_Id
                ${joinClause}
                ${mappedFilter}
                ORDER BY A.Acc_Id DESC;
            `);

        } else if (section === "retailers") {
            const joinClause = isMapped
                ? `INNER JOIN tbl_Ledger_LOL L ON R.Retailer_Id = L.Ret_Id`
                : `LEFT JOIN tbl_Ledger_LOL L ON R.Retailer_Id = L.Ret_Id`;
            const mappedFilter = isMapped ? "" : "WHERE L.Ret_Id IS NULL";

            result = await request.query(`
                SELECT
                    R.Retailer_Id,
                    R.Retailer_Name,
                    R.Contact_Person,
                    R.Mobile_No,
                    L.Auto_Id,
                    L.Ledger_Name,
                    L.Ledger_Alias,
                    L.Party_Name,
                    L.Ret_Id
                FROM tbl_Retailers_Master R
                ${joinClause}
                ${mappedFilter}
                ORDER BY R.Retailer_Id DESC;
            `);

        } else if (section === "lol") {
    if (isMapped) {
     
        result = await request.query(`
            SELECT
                L.Auto_Id,
                L.Ledger_Name,
                L.Ledger_Alias,
                L.Party_Name,
                L.Ret_Id,
                R.Retailer_Id,
                R.Retailer_Name,
                R.AC_Id,
                A.Acc_Id,
                A.Account_name,
                A.Account_Alias_name
            FROM tbl_Ledger_LOL L
            INNER JOIN tbl_Retailers_Master R ON L.Ret_Id = R.Retailer_Id
            INNER JOIN tbl_Account_Master A ON LTRIM(RTRIM(R.AC_Id)) = LTRIM(RTRIM(A.Acc_Id))
            ORDER BY L.Auto_Id DESC;
        `);
    }
     else {
  
       result = await request.query(`
            SELECT
                A.Acc_Id,
                A.Account_name,
                A.Account_Alias_name,
                R.Retailer_Id,
                R.Retailer_Name,
                R.AC_Id
            FROM tbl_Account_Master A
            LEFT JOIN tbl_Retailers_Master R ON LTRIM(RTRIM(A.Acc_Id)) = LTRIM(RTRIM(R.AC_Id))
            WHERE R.Retailer_Id IS NULL
               OR NOT EXISTS (
                    SELECT 1 FROM tbl_Ledger_LOL L2 WHERE L2.Ret_Id = R.Retailer_Id
               )
            ORDER BY A.Acc_Id DESC;
        `);
    }
} 
else if (section === "loe") {
           
                result = await request.query(`
               SELECT
                A.Acc_Id,
                A.Account_name,
                A.Account_Alias_name,
                R.Retailer_Id,
                R.Retailer_Name,
                R.AC_Id
            FROM tbl_Account_Master A
            LEFT JOIN tbl_Retailers_Master R ON LTRIM(RTRIM(A.Acc_Id)) = LTRIM(RTRIM(R.AC_Id))
            WHERE R.Retailer_Id IS NULL
               OR NOT EXISTS (
                    SELECT 1 FROM tbl_Ledger_LOL L2 WHERE L2.Ret_Id = R.Retailer_Id
               )
            ORDER BY A.Acc_Id DESC;
            `);

        } 


else {
            return failed(res, `Section '${section}' not implemented yet`);
        }

        if (result.recordset.length) {
            dataFound(res, result.recordset);
        } else {
            noData(res);
        }
    } catch (e) {
        servError(e, res);
    }
};


const getAccountMasterSummary = async (req, res) => {
    try {
        const request = new sql.Request();
        const result = await request.query(`
            SELECT
                (SELECT COUNT(*) FROM tbl_Account_Master) AS total,

                (SELECT COUNT(*) FROM tbl_Account_Master A
                    INNER JOIN tbl_Retailers_Master R ON A.Acc_Id = R.AC_Id) AS accountingMapped,

                (SELECT COUNT(*) FROM tbl_Retailers_Master R
                    INNER JOIN tbl_Ledger_LOL L ON R.Retailer_Id = L.Ret_Id) AS retailersMapped,

                (SELECT COUNT(*) FROM tbl_Retailers_Master R
                    LEFT JOIN tbl_Ledger_LOL L ON R.Retailer_Id = L.Ret_Id
                    WHERE L.Ret_Id IS NULL) AS loeTotal
        `);

        if (result.recordset.length) {
            dataFound(res, result.recordset[0]);
        } else {
            noData(res);
        }
    } catch (e) {
        servError(e, res);
    }
};

const getStockItemDetails = async (req, res) => {
    try {
        const { mapped } = req.query;
        const isMapped = String(mapped) === "true";

        const joinClause = isMapped
            ? `INNER JOIN tbl_Stock_LOS L ON P.Product_Id = L.Pro_Id`
            : `LEFT JOIN tbl_Stock_LOS L ON P.Product_Id = L.Pro_Id`;
        const mappedFilter = isMapped ? "" : "WHERE L.Pro_Id IS NULL";

        const request = new sql.Request();
        const result = await request.query(`
            SELECT
                P.Product_Id,
                P.Product_Name,
                P.Short_Name,
                P.Product_Code,
                P.ERP_Id,
                L.Pro_Id,
                L.*
            FROM tbl_Product_Master P
            ${joinClause}
            ${mappedFilter}
            ORDER BY P.Product_Id DESC;
        `);

        if (result.recordset.length) {
            dataFound(res, result.recordset);
        } else {
            noData(res);
        }
    } catch (e) {
        servError(e, res);
    }
};


const getStockItemSummary = async (req, res) => {
    try {
        const request = new sql.Request();
        const result = await request.query(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN L.Pro_Id IS NOT NULL THEN 1 ELSE 0 END) AS mapped,
                SUM(CASE WHEN L.Pro_Id IS NULL THEN 1 ELSE 0 END) AS unmapped
            FROM tbl_Product_Master P
            LEFT JOIN tbl_Stock_LOS L ON P.Product_Id = L.Pro_Id
        `);

        if (result.recordset.length) {
            dataFound(res, result.recordset[0]);
        } else {
            noData(res);
        }
    } catch (e) {
        servError(e, res);
    }
};

 return {
        getMasterCounts,
        getMasterDetails,
        getAccountMasterDetails,
        getAccountMasterSummary,
        getStockItemDetails,
        getStockItemSummary
    };
}

export default masterList();