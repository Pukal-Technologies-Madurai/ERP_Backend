import sql from 'mssql';
import { dataFound, invalidInput, sentData, servError } from '../../res.mjs';
import { checkIsNumber, isEqualNumber, ISOString, toArray, toNumber } from '../../helper_functions.mjs';

import {
    purchaseReturnQuery,
    salesReturnQuery,
    salesInvFilterQuery,
    salesObFilterQuery,
    receiptFilterQuery,
    purchaseInvFilterQuery,
    purchaseObFilterQuery,
    paymentFilterQuery,
    journalFilterQuery,
    creditNoteFilterQuery,
    debitNoteFilterQuery,
    getSalesInvOutstanding,
    getSalesObOutstanding,
    getReceiptOutstanding,
    getPurchaseInvOutstanding,
    getPurchaseObOutstanding,
    getPaymentOutstanding,
    getJournalOutstanding,
    getCreditNoteOutstanding,
    getDebitNoteOutstanding
} from './journalOutstanding.mjs';

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

const getAccountPendingReference = async (req, res) => {
    try {
        const { Acc_Id, JournalAutoId } = req.query;
        if (!checkIsNumber(Acc_Id)) return invalidInput(res, 'Acc_Id is required');

        const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .input('Acc_Id', sql.BigInt, Acc_Id)
            .input('JournalAutoId', sql.NVarChar(200), JournalAutoId)
            .query(`
            	DECLARE @OB_Date DATE = (SELECT MAX(OB_Date) FROM tbl_OB_Date);
                -- invoice returns
                ${purchaseReturnQuery}
                ${salesReturnQuery}
                -- voucher filters
                ${salesInvFilterQuery}
                ${salesObFilterQuery}
                ${receiptFilterQuery}
                ${purchaseInvFilterQuery}
                ${purchaseObFilterQuery}
                ${paymentFilterQuery}
                ${journalFilterQuery}
                ${creditNoteFilterQuery}
                ${debitNoteFilterQuery}
                -- sales outstandings (DR)
                ${getSalesInvOutstanding(JournalAutoId)}
                UNION ALL
                -- opening balance (DR)
                ${getSalesObOutstanding(JournalAutoId)}
                UNION ALL
                -- receipt outstandings (CR)
                ${getReceiptOutstanding(JournalAutoId)}
                UNION ALL
                -- purchase outstandings (CR)
                ${getPurchaseInvOutstanding(JournalAutoId)}
                UNION ALL
                -- opening balance (CR)
                ${getPurchaseObOutstanding(JournalAutoId)}
                UNION ALL
                -- payment outstandings (Dr)
                ${getPaymentOutstanding(JournalAutoId)}
                UNION ALL
                -- journal outstandings (Dr and Cr)
                ${getJournalOutstanding(JournalAutoId)}
                UNION ALL
                -- credit note outstandings (Dr)
                ${getCreditNoteOutstanding(JournalAutoId)}
                UNION ALL
                -- debit note outstandings (Cr)
                ${getDebitNoteOutstanding(JournalAutoId)}
                ORDER BY eventDate ASC;
            `);

        const result = await request;

        sentData(res, result.recordset);

    } catch (e) {
        servError(e, res);
    }
}

const getJournalAccounts = async (req, res) => {
    try {
        const request = new sql.Request();

        const result = await request.query(`
            SELECT 
                Acc_Id AS value, 
                Account_name AS label,
                Group_Id
            FROM tbl_Account_Master
            ORDER BY Account_name;
            SELECT Group_Id, Group_Name, Parent_AC_id
            FROM tbl_Accounting_Group
            ORDER BY Group_Name;`
        );

        const accountsList = toArray(result.recordsets[0]);
        const accountGroupData = toArray(result.recordsets[1]);


        function getAllChildGroupIds(groupId, groupList, visited = new Set()) {
            if (visited.has(groupId)) return [];

            visited.add(groupId);
            let result = [groupId];

            const children = groupList.filter(group => isEqualNumber(group.Parent_AC_id, groupId));

            for (const child of children) {
                result = result.concat(getAllChildGroupIds(child.Group_Id, groupList, visited));
            }

            return result;
        }

        function filterAccountsByGroupIds(selectedGroupId, accountGroups, accountsList) {
            const validGroupIds = getAllChildGroupIds(selectedGroupId, accountGroups);
            return accountsList.filter(account => validGroupIds.includes(account.Group_Id));
        }

        const sundryDebtors = filterAccountsByGroupIds(20, accountGroupData, accountsList);
        const sundryCreditors = filterAccountsByGroupIds(16, accountGroupData, accountsList);

        const distinctPartyAccounts = new Set([
            ...sundryDebtors.map(acc => acc.value),
            ...sundryCreditors.map(acc => acc.value)
        ]);

        const resAccounts = accountsList.map(acc => ({
            value: toNumber(acc.value),
            label: acc.label,
            isSundryParty: distinctPartyAccounts.has(acc.value)
        }))

        sentData(res, resAccounts);
    } catch (e) {
        servError(e, res);
    }
}

const groupOutstandings = async (req, res) => {
    try {
        const Fromdate = req.query?.Fromdate ? req.query?.Fromdate : ISOString();
        const Todate = req.query?.Todate ? req.query?.Todate : ISOString();

        const request = new sql.Request()
            .input('Fromdate', sql.Date, Fromdate)
            .input('Todate', sql.Date, Todate)
            .execute(`Transaction_Group_Reort_VW`);

        const result = await request;

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
}

export default {
    getFilterValues,
    getAccountPendingReference,
    getJournalAccounts,
    groupOutstandings
}