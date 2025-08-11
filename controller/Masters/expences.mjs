import sql from 'mssql'
import { servError, sentData } from '../../res.mjs';

const ExpencesMasterController = () => {

    const getExpences = async (req, res) => {
        try {
            const request = new sql.Request();
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
                )
                SELECT 
                    g.group_id AS Group_Id,
                    g.group_name AS Group_Name,
                    g.Parent_AC_id,
                    a.Acc_Id,
                    a.Account_Name,
                    ISNULL(SUM(CASE WHEN pgi.Debit_Ledger = a.Acc_Id THEN pgi.Debit_Amount ELSE 0 END),0) AS Debit_Amount,
                    ISNULL(SUM(CASE WHEN pgi.Credit_Ledger = a.Acc_Id THEN pgi.Credit_Amount ELSE 0 END),0) AS Credit_Amount
                FROM groupCTE g
                LEFT JOIN tbl_Account_Master a 
                    ON a.Group_Id = g.group_id
                LEFT JOIN tbl_Payment_General_Info pgi
                    ON pgi.Debit_Ledger = a.Acc_Id
                    OR pgi.Credit_Ledger = a.Acc_Id
                GROUP BY 
                    g.group_id, 
                    g.group_name, 
                    g.Parent_AC_id,
                    a.Acc_Id, 
                    a.Account_Name
                ORDER BY 
                    g.group_name, 
                    a.Account_Name
                OPTION (MAXRECURSION 0);`);

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

                const prunedRoots = roots
                    .map(pruneEmpty)
                    .filter(Boolean);

                return prunedRoots;
            }

            const hierarchy = buildHierarchy(flatData);

            sentData(res, hierarchy);

        } catch (e) {
            servError(e, res);
        }
    };

    return {
        getExpences,
    };
};

export default ExpencesMasterController();