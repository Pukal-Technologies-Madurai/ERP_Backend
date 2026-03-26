import { servError, success, invalidInput, dataFound, noData, } from '../../res.mjs';
import { ISOString, checkIsNumber, createPadString, randomNumber, toArray } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
import sql from 'mssql';
import { isGuid, normGuid, zodToErrors, EditJournalSchema, CreateJournalSchema } from './journalValidation.mjs';

const getJournal = async (req, res) => {
    try {
        const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();
        const { voucher, debit, credit, createdBy, status } = req.query

        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .input('voucher', voucher)
            .input('debit', debit)
            .input('credit', credit)
            .input('createdBy', createdBy)
            .input('status', status)
            .query(`
            -- DECLARE @Fromdate DATE = '2025-05-01', @Todate DATE = '2025-09-01';
                DECLARE @journalID TABLE (JournalAutoId uniqueidentifier, JournalId bigint);
            -- FilterVarialbe
                INSERT INTO @journalID (JournalAutoId, JournalId)
                SELECT jgi.JournalAutoId, jgi.JournalId
                FROM tbl_Journal_General_Info AS jgi
                JOIN tbl_Journal_Entries_Info AS jei ON jei.JournalAutoId = jgi.JournalAutoId
                WHERE 
                    jgi.JournalDate BETWEEN @Fromdate AND @Todate
                    ${checkIsNumber(debit) ? ` AND jei.DrCr = 'Dr' AND jei.Acc_Id = @debit ` : ''}
                    ${checkIsNumber(credit) ? ` AND jei.DrCr = 'Cr' AND jei.Acc_Id = @credit ` : ''}
                    ${checkIsNumber(createdBy) ? ` AND jgi.CreatedBy = @createdBy ` : ''}
                    ${checkIsNumber(status) ? ` AND jgi.JournalStatus = @status ` : ''};
            -- General Info
                SELECT 
                    jgi.*,
                    v.Voucher_Type AS VoucherTypeGet,
                    b.BranchName AS BranchGet,
                    cb.Name AS CreatedByGet
                FROM tbl_Journal_General_Info AS jgi
                LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = jgi.VoucherType
                LEFT JOIN tbl_Branch_Master AS b ON b.BranchId = jgi.BranchId
                LEFT JOIN tbl_Users AS cb ON cb.UserId = jgi.CreatedBy
                WHERE jgi.JournalAutoId IN (SELECT DISTINCT JournalAutoId FROM @journalID);
            -- Entries Info
                SELECT 
                    jei.*,
                    am.Account_name AS AccountNameGet
                FROM tbl_Journal_Entries_Info AS jei
                LEFT JOIN tbl_Account_Master AS am ON am.Acc_Id = jei.Acc_Id
                WHERE jei.JournalAutoId IN (SELECT DISTINCT JournalAutoId FROM @journalID);
            -- Bill References Info
                SELECT 
                    jbi.*
                FROM tbl_Journal_Bill_Reference AS jbi
                WHERE jbi.JournalAutoId IN (SELECT DISTINCT JournalAutoId FROM @journalID);
            -- Alteration History
                SELECT ah.*, u.Name AS alterByGet 
                FROM tbl_Alteration_History AS ah
                LEFT JOIN tbl_Users AS u ON u.UserId = ah.alterBy
                WHERE 
                    alteredTable = 'tbl_Journal_General_Info' 
                    AND alteredRowId IN (SELECT DISTINCT JournalAutoId FROM @journalID);`
            );

        const result = await request;

        const [generalInfo, entriesInfo, billReferencesInfo, alterHistory] = result.recordsets;

        // const merged = generalInfo.map(journal => ({
        //     ...journal,
        //     Entries: entriesInfo.filter(entry => entry.JournalAutoId === journal.JournalAutoId)
        // }));

        if (generalInfo.length > 0) {
            dataFound(res, [], 'data found', { generalInfo, entriesInfo, billReferencesInfo, alterHistory })
        } else {
            noData(res)
        }

    } catch (e) {
        servError(e, res);
    }
}

const createJournal = async (req, res) => {
    const tx = new sql.Transaction();

    try {
        const parsed = CreateJournalSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return invalidInput(res, "Enter Required Fields", { errors: zodToErrors(parsed.error) });
        }

        const {
            VoucherType,
            JournalDate,
            BranchId,
            Narration = null,
            JournalStatus,
            CreatedBy,
            Entries = [],
        } = parsed.data;

        const journalDate = JournalDate ? ISOString(JournalDate) : ISOString();

        const drTotal = Entries.filter((e) => e.DrCr === "Dr").reduce((t, e) => t + e.Amount, 0);
        const crTotal = Entries.filter((e) => e.DrCr === "Cr").reduce((t, e) => t + e.Amount, 0);

        // ----------------------------
        // Year_Id & Year_Desc
        // ----------------------------
        const yearQ = await new sql.Request()
            .input("JournalDate", journalDate)
            .query(`
                SELECT Id AS Year_Id, Year_Desc
                FROM tbl_Year_Master
                WHERE Fin_Start_Date <= @JournalDate AND Fin_End_Date >= @JournalDate`);

        if (yearQ.recordset.length === 0) throw new Error("Year_Id not found");
        const { Year_Id, Year_Desc } = yearQ.recordset[0];

        // ----------------------------
        // Voucher_Code
        // ----------------------------
        const vcodeQ = await new sql.Request()
            .input("Vocher_Type_Id", VoucherType)
            .query(`
                SELECT Voucher_Code
                FROM tbl_Voucher_Type
                WHERE Vocher_Type_Id = @Vocher_Type_Id`);

        if (vcodeQ.recordset.length === 0) throw new Error("Voucher_Code not found");
        const Voucher_Code = vcodeQ.recordset[0]?.Voucher_Code || "";

        // ----------------------------
        // JournalId & JournalNo
        // ----------------------------
        const journalIdGet = await getNextId({ table: "tbl_Journal_General_Info", column: "JournalId" });
        if (!journalIdGet?.status || !Number.isFinite(Number(journalIdGet.MaxId))) {
            throw new Error("Failed to get JournalId");
        }
        const JournalId = Number(journalIdGet.MaxId);

        const jnoQ = await new sql.Request()
            .input("Year_Id", Year_Id)
            .input("VoucherType", VoucherType)
            .query(`
                SELECT COALESCE(MAX(JournalNo), 0) AS JournalNo
                FROM tbl_Journal_General_Info
                WHERE Year_Id = @Year_Id AND VoucherType = @VoucherType`
            );

        const JournalNo = Number(jnoQ?.recordset?.[0]?.JournalNo || 0) + 1;

        const JournalVoucherNo = `${Voucher_Code}/${createPadString(JournalNo, 6)}/${Year_Desc}`;
        const AlterId = randomNumber(6, 8);

        // ----------------------------
        // Begin Transaction
        // ----------------------------
        await tx.begin();

        // Header insert
        const hdrIns = await new sql.Request(tx)
            .input("JournalId", JournalId)
            .input("Year_Id", Year_Id)
            .input("VoucherType", VoucherType)
            .input("JournalNo", JournalNo)
            .input("JournalVoucherNo", JournalVoucherNo)
            .input("JournalDate", journalDate)
            .input("BranchId", BranchId)
            .input("Narration", Narration)
            .input("JournalStatus", JournalStatus)
            .input("CreatedBy", CreatedBy)
            .input("AlterId", AlterId)
            .query(`
                INSERT INTO dbo.tbl_Journal_General_Info (
                  JournalAutoId, JournalId, Year_Id, VoucherType, JournalNo, JournalVoucherNo,
                  JournalDate, BranchId, Narration, JournalStatus,
                  CreatedBy, CreatedAt, UpdatedAt, AlterId
                )
                OUTPUT inserted.JournalAutoId
                VALUES (
                  DEFAULT, @JournalId, @Year_Id, @VoucherType, @JournalNo, @JournalVoucherNo,
                  @JournalDate, @BranchId, @Narration, @JournalStatus,
                  @CreatedBy, GETDATE(), NULL, @AlterId
                )`);

        const JournalAutoId = hdrIns?.recordset?.[0]?.JournalAutoId;
        if (!JournalAutoId) throw new Error("Failed to capture JournalAutoId");

        let lineCount = 0;
        let billCount = 0;

        for (let i = 0; i < Entries.length; i++) {
            const e = Entries[i];
            const lineNum = i + 1;

            const lineIns = await new sql.Request(tx)
                .input("LineNum", lineNum)
                .input("JournalAutoId", JournalAutoId)
                .input("JournalId", JournalId)
                .input("JournalVoucherNo", JournalVoucherNo)
                .input("JournalDate", journalDate)
                .input("Acc_Id", e.Acc_Id)
                .input("AccountGet", e.AccountGet ?? null)
                .input("isSundryParty", e.isSundryParty ?? 0)
                .input("DrCr", e.DrCr)
                .input("Amount", e.Amount)
                .input("Remarks", e.Remarks ?? null)
                .query(`
                    INSERT INTO dbo.tbl_Journal_Entries_Info (
                      LineId, LineNum, JournalAutoId, JournalId, JournalVoucherNo, JournalDate,
                      Acc_Id, AccountGet, isSundryParty, DrCr, Amount, Remarks
                    )
                    OUTPUT inserted.LineId, inserted.LineNum, inserted.Acc_Id, inserted.DrCr
                    VALUES (
                      DEFAULT, @LineNum, @JournalAutoId, @JournalId, @JournalVoucherNo, @JournalDate,
                      @Acc_Id, @AccountGet, @isSundryParty, @DrCr, @Amount, @Remarks
                    )`);

            const ins = lineIns?.recordset?.[0];
            if (!ins?.LineId) throw new Error("Failed to insert journal line");
            lineCount++;

            const bills = e.BillEntries || [];
            for (const b of bills) {
                billCount++;

                await new sql.Request(tx)
                    .input("LineId", ins.LineId)
                    .input("LineNum", ins.LineNum)
                    .input("JournalAutoId", JournalAutoId)
                    .input("JournalId", JournalId)
                    .input("JournalVoucherNo", JournalVoucherNo)
                    .input("JournalDate", journalDate)
                    .input("Acc_Id", ins.Acc_Id)
                    .input("DrCr", ins.DrCr)
                    .input("RefId", b.RefId ?? null)
                    .input("RefNo", b.RefNo ?? null)
                    .input("RefType", b.RefType ?? null)
                    .input("BillRefNo", b.BillRefNo ?? null)
                    .input("Amount", b.Amount)
                    .query(`
                        INSERT INTO dbo.tbl_Journal_Bill_Reference (
                          autoGenId, LineId, LineNum, JournalAutoId, JournalId, JournalVoucherNo, JournalDate,
                          Acc_Id, DrCr, RefId, RefNo, RefType, BillRefNo, Amount
                        )
                        VALUES (
                          DEFAULT, @LineId, @LineNum, @JournalAutoId, @JournalId, @JournalVoucherNo, @JournalDate,
                          @Acc_Id, @DrCr, @RefId, @RefNo, @RefType, @BillRefNo, @Amount
                        )`
                    );
            }
        }

        await tx.commit();

        return success(res, "Journal Created", {
            JournalAutoId,
            JournalId,
            Year_Id,
            VoucherType,
            JournalNo,
            JournalVoucherNo,
            JournalDate: journalDate,
            BranchId,
            Narration,
            JournalStatus,
            CreatedBy,
            DrTotal: Number(drTotal.toFixed(2)),
            CrTotal: Number(crTotal.toFixed(2)),
            Difference: Number((drTotal - crTotal).toFixed(2)),
            Lines: lineCount,
            BillReferences: billCount,
        });
    } catch (e) {
        try {
            if (tx._aborted !== true) await tx.rollback();
        } catch { }
        return servError(e, res);
    }
};

const editJournal = async (req, res) => {
    const tx = req.transaction;

    try {
        const parsed = EditJournalSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return invalidInput(res, "Enter Required Fields", {
                errors: zodToErrors(parsed.error),
            });
        }

        const {
            JournalAutoId,
            JournalDate,
            Narration = null,
            JournalStatus,
            BranchId,
            Entries,
        } = parsed.data;

        const journalAutoId = normGuid(JournalAutoId);
        const journalDate = JournalDate ? ISOString(JournalDate) : ISOString();

        const drTotal = Entries.filter((e) => e.DrCr === "Dr").reduce((t, e) => t + e.Amount, 0);
        const crTotal = Entries.filter((e) => e.DrCr === "Cr").reduce((t, e) => t + e.Amount, 0);

        const hdrQ = await new sql.Request()
            .input("JournalAutoId", sql.UniqueIdentifier, journalAutoId)
            .query(`
                SELECT TOP 1 JournalId, VoucherType, JournalNo, JournalVoucherNo, BranchId
                FROM dbo.tbl_Journal_General_Info
                WHERE JournalAutoId = @JournalAutoId;
            `);

        if (!hdrQ.recordset?.length) {
            return invalidInput(res, "Journal not found", { JournalAutoId });
        }

        const {
            JournalId,
            VoucherType,
            JournalNo,
            JournalVoucherNo,
            BranchId: dbBranchId,
        } = hdrQ.recordset[0];
        
        await new sql.Request(tx)
            .input("JournalAutoId", sql.UniqueIdentifier, journalAutoId)
            .query(`
                SELECT 1
                FROM dbo.tbl_Journal_General_Info WITH (UPDLOCK, HOLDLOCK)
                WHERE JournalAutoId=@JournalAutoId;
            `);

        await new sql.Request(tx)
            .input("JournalAutoId", sql.UniqueIdentifier, journalAutoId)
            .input("JournalDate", journalDate)
            .input("Narration", Narration)
            .input("JournalStatus", JournalStatus)
            .input("BranchId", BranchId ?? dbBranchId)
            .query(`
                UPDATE dbo.tbl_Journal_General_Info
                SET
                  JournalDate=@JournalDate,
                  Narration=@Narration,
                  JournalStatus=@JournalStatus,
                  BranchId=@BranchId,
                  UpdatedAt=GETDATE(),
                  AlterId=AlterId+1
                WHERE JournalAutoId=@JournalAutoId;`);

        await new sql.Request(tx)
            .input("JournalAutoId", sql.UniqueIdentifier, journalAutoId)
            .query(`
                DELETE FROM dbo.tbl_Journal_Bill_Reference WHERE JournalAutoId = @JournalAutoId;
                DELETE FROM dbo.tbl_Journal_Entries_Info WHERE JournalAutoId = @JournalAutoId;`);

        const lineMap = new Map();

        for (let i = 0; i < Entries.length; i++) {
            const e = Entries[i];
            const lineNum = i + 1;

            const lineIns = await new sql.Request(tx)
                .input("LineNum", lineNum)
                .input("JournalAutoId", sql.UniqueIdentifier, journalAutoId)
                .input("JournalId", JournalId)
                .input("JournalVoucherNo", JournalVoucherNo)
                .input("JournalDate", journalDate)
                .input("Acc_Id", e.Acc_Id)
                .input("AccountGet", e.AccountGet ?? null)
                .input("isSundryParty", e.isSundryParty ?? 0)
                .input("DrCr", e.DrCr)
                .input("Amount", e.Amount)
                .input("Remarks", e.Remarks ?? null)
                .query(`
                    INSERT INTO dbo.tbl_Journal_Entries_Info (
                      LineId, LineNum, JournalAutoId, JournalId, JournalVoucherNo, JournalDate,
                      Acc_Id, AccountGet, isSundryParty, DrCr, Amount, Remarks
                    )
                    OUTPUT inserted.LineId, inserted.LineNum, inserted.Acc_Id, inserted.DrCr
                    VALUES (
                      DEFAULT, @LineNum, @JournalAutoId, @JournalId, @JournalVoucherNo, @JournalDate,
                      @Acc_Id, @AccountGet, @isSundryParty, @DrCr, @Amount, @Remarks
                    );`
                );

            const ins = lineIns.recordset?.[0];
            if (!ins?.LineId) throw new Error("Failed to insert journal line");

            lineMap.set(lineNum, {
                LineId: ins.LineId,
                LineNum: ins.LineNum,
                Acc_Id: ins.Acc_Id,
                DrCr: ins.DrCr,
            });
        }

        let billCount = 0;

        for (let i = 0; i < Entries.length; i++) {
            const e = Entries[i];
            const lineNum = e.LineNum ?? (i + 1);

            const map = lineMap.get(lineNum);
            if (!map) throw new Error(`Missing inserted line for LineNum ${lineNum}`);

            for (const b of e.BillEntries) {
                billCount++;

                await new sql.Request(tx)
                    .input("LineId", map.LineId)
                    .input("LineNum", map.LineNum)
                    .input("JournalAutoId", sql.UniqueIdentifier, journalAutoId)
                    .input("JournalId", JournalId)
                    .input("JournalVoucherNo", JournalVoucherNo)
                    .input("JournalDate", journalDate)
                    .input("Acc_Id", map.Acc_Id)
                    .input("DrCr", map.DrCr)
                    .input("RefId", b.RefId ?? null)
                    .input("RefNo", b.RefNo ?? null)
                    .input("RefType", b.RefType ?? null)
                    .input("BillRefNo", b.BillRefNo ?? null)
                    .input("Amount", b.Amount)
                    .query(`
                        INSERT INTO dbo.tbl_Journal_Bill_Reference (
                          autoGenId, LineId, LineNum, JournalAutoId, JournalId, JournalVoucherNo, JournalDate,
                          Acc_Id, DrCr, RefId, RefNo, RefType, BillRefNo, Amount
                        )
                        VALUES (
                          DEFAULT, @LineId, @LineNum, @JournalAutoId, @JournalId, @JournalVoucherNo, @JournalDate,
                          @Acc_Id, @DrCr, @RefId, @RefNo, @RefType, @BillRefNo, @Amount
                        );`
                    );
            }
        }

        await tx.commit();

        return success(res, "Journal Updated", {
            JournalAutoId: journalAutoId,
            JournalId,
            VoucherType,
            JournalNo,
            JournalVoucherNo,
            JournalDate: journalDate,
            Narration,
            JournalStatus,
            BranchId: BranchId ?? dbBranchId,
            DrTotal: Number(drTotal.toFixed(2)),
            CrTotal: Number(crTotal.toFixed(2)),
            Difference: Number((drTotal - crTotal).toFixed(2)),
            Lines: Entries.length,
            BillReferences: billCount,
        });
    } catch (e) {
        try {
            if (tx._aborted !== true) await tx.rollback();
        } catch { }
        return servError(e, res);
    }
};

export default {
    getJournal,
    createJournal,
    editJournal
}