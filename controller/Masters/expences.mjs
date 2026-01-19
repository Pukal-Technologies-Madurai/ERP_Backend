import sql from 'mssql'
import { servError, sentData, invalidInput, success, dataFound } from '../../res.mjs';

const ExpencesMasterController = () => {

    const getExpences = async (req, res) => {
        try {
            const { fromDate, toDate } = req.query;

            if (!fromDate || !toDate) {
                return invalidInput(res, "Please provide fromDate and toDate");
            }

            const request = new sql.Request();
            request.input("fromDate", sql.Date, fromDate);
            request.input("toDate", sql.Date, toDate);

            const result = await request.query(`
            WITH groupCTE AS (
    SELECT 
        y.group_id, 
        y.group_name, 
        y.Parent_AC_id
    FROM tbl_Accounting_Group y
    WHERE y.group_id IN (26, 28)
    
    UNION ALL
    
    SELECT 
        child.group_id, 
        child.group_name, 
        child.Parent_AC_id
    FROM tbl_Accounting_Group child
    INNER JOIN groupCTE parent 
        ON child.Parent_AC_id = parent.group_id
),
allTransactions AS (
    SELECT 
        Debit_Ledger,
        Credit_Ledger,
        Debit_Amount,
        Credit_Amount,
        payment_date AS TranDate
    FROM tbl_Payment_General_Info
    
    UNION ALL
    
    SELECT 
        Debit_Ledger,
        Credit_Ledger,
        Debit_Amount,
        Credit_Amount,
        receipt_date AS TranDate
    FROM tbl_Receipt_General_Info
)
SELECT 
    g.group_id AS Group_Id,
    g.group_name AS Group_Name,
    g.Parent_AC_id,
    a.Acc_Id,
    a.Account_Name,
    ISNULL(SUM(CASE WHEN t.Debit_Ledger = a.Acc_Id THEN t.Debit_Amount ELSE 0 END), 0) AS Debit_Amount,
    ISNULL(SUM(CASE WHEN t.Credit_Ledger = a.Acc_Id THEN t.Credit_Amount ELSE 0 END), 0) AS Credit_Amount
FROM groupCTE g
LEFT JOIN tbl_Account_Master a 
    ON a.Group_Id = g.group_id
LEFT JOIN allTransactions t
    ON (
        t.Debit_Ledger = a.Acc_Id
        OR t.Credit_Ledger = a.Acc_Id
    )
    AND t.TranDate BETWEEN @fromDate AND @toDate
GROUP BY 
    g.group_id, 
    g.group_name, 
    g.Parent_AC_id,
    a.Acc_Id, 
    a.Account_Name
ORDER BY 
    g.group_name, 
    a.Account_Name
OPTION (MAXRECURSION 0);

            `);

            const flatData = result.recordset || [];

            function buildHierarchy(flatData) {
                const groupMap = new Map();

                flatData.forEach(row => {
                    const gid = row.Group_Id == null ? null : String(row.Group_Id);
                    const parentId = row.Parent_AC_id == null ? null : String(row.Parent_AC_id);

                    if (!groupMap.has(gid)) {
                        groupMap.set(gid, {
                            group_id: gid,
                            group_name: row.Group_Name || null,
                            Parent_AC_id: parentId,
                            accounts: [],
                            children: []
                        });
                    }

                    if (row.Acc_Id) {
                        const debit = Number(row.Debit_Amount || 0);
                        const credit = Number(row.Credit_Amount || 0);
                        if (debit !== 0 || credit !== 0) {
                            groupMap.get(gid).accounts.push({
                                Acc_Id: String(row.Acc_Id),
                                Account_Name: row.Account_Name || null,
                                Debit_Amount: debit,
                                Credit_Amount: credit
                            });
                        }
                    }
                });

                for (const group of Array.from(groupMap.values())) {
                    const pid = group.Parent_AC_id;
                    if (pid && !groupMap.has(pid)) {
                        groupMap.set(pid, {
                            group_id: pid,
                            group_name: null,
                            Parent_AC_id: null,
                            accounts: [],
                            children: []
                        });
                    }
                }

                const roots = [];
                groupMap.forEach(group => {
                    const pid = group.Parent_AC_id;
                    if (pid && groupMap.has(pid)) {
                        groupMap.get(pid).children.push(group);
                    } else {
                        roots.push(group);
                    }
                });

                const pruneEmpty = (node) => {
                    node.children = node.children
                        .map(pruneEmpty)
                        .filter(Boolean);
                    if ((node.accounts == null || node.accounts.length === 0) &&
                        (node.children == null || node.children.length === 0)) {
                        return null;
                    }
                    return node;
                };

                return roots.map(pruneEmpty).filter(Boolean);
            }

            const hierarchy = buildHierarchy(flatData);
            sentData(res, hierarchy);

        } catch (e) {
            servError(e, res);
        }
    };

    const expensesExpandable = async (req, res) => {
        const { fromDate, toDate, acc_id } = req.body
        try {
            const request = new sql.Request();
            request.input('fromDate', fromDate);

            request.input('ToDate', toDate);
            request.input('Acc_Id', sql.Int, Number(acc_id));

            const result = await request.execute('Transaction_Report_vw_By_Acc_Id');

            if (result.rowsAffected.length > 0) {
                dataFound(res, result.recordset);
            } else {
                failed(res, 'Failed to add company');
            }
        } catch (e) {
            servError(e, res)
        }
    };


    
    const itemsTransactionExpandable = async (req, res) => {
        const { fromDate, toDate, Product_Id } = req.query;
        try {
            const request = new sql.Request();
            request.input('fromDate', fromDate);

            request.input('ToDate', toDate);
            request.input('Product_Id', sql.Int, Number(Product_Id));

          

            const result = await request.execute('Transaction_Stock_Report_vw_By_Pro_Id');

            if (result.rowsAffected.length > 0) {
                dataFound(res, result.recordset);
            } else {
                failed(res, 'Failed to add company');
            }
        } catch (e) {
            servError(e, res)
        }
    };
    
    return {
        getExpences,
        expensesExpandable,
        itemsTransactionExpandable
    };
};

export default ExpencesMasterController();