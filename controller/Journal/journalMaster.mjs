import { servError, success, failed, sentData, invalidInput, dataFound, noData, } from '../../res.mjs';
import { ISOString, checkIsNumber, createPadString, isArray, randomNumber, toArray, toNumber } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
import sql from 'mssql'

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
                WHERE jei.JournalAutoId IN (SELECT DISTINCT JournalAutoId FROM @journalID);`
            );

        const result = await request;

        const [generalInfo, entriesInfo] = result.recordsets;

        // const merged = generalInfo.map(journal => ({
        //     ...journal,
        //     Entries: entriesInfo.filter(entry => entry.JournalAutoId === journal.JournalAutoId)
        // }));

        if (generalInfo.length > 0) {
            dataFound(res, [], 'data found', { generalInfo, entriesInfo })
        } else {
            noData(res)
        }
        // sentData(res, merged, { generalInfo, entriesInfo });

    } catch (e) {
        servError(e, res);
    }
}

const createJournal = async (req, res) => {
    const tx = new sql.Transaction();
    try {
        const {
            VoucherType,
            JournalDate,
            BranchId,
            Narration = null,
            JournalStatus,
            CreatedBy,
            Entries = [],
            BillReferences = [],
        } = req.body || {};

        const journalDate = JournalDate ? ISOString(JournalDate) : ISOString();

        // ----------------------------
        // Validations (field names as-is)
        // ----------------------------
        const errors = [];
        if (!VoucherType) errors.push("VoucherType");
        if (!BranchId) errors.push("BranchId");
        if (!CreatedBy) errors.push("CreatedBy");
        if (JournalStatus === undefined || JournalStatus === null || JournalStatus === '') errors.push("JournalStatus");

        // carry client LineId + keep original index
        const raw = toArray(Entries).map((r, idx) => ({
            __idx: idx,
            __clientLineId: r?.LineId || null, // client-generated rid
            LineNum: r?.LineNum || null,
            Acc_Id: Number(r?.Acc_Id),
            DrCr: String(r?.DrCr || "").trim(),
            Amount: Number(r?.Amount || 0),
            Remarks: r?.Remarks ?? null,
            AccountGet: r?.AccountGet ?? null, // ignored in DB insert (no column)
        }));

        if (raw.length === 0) errors.push("Entries");

        raw.forEach((r, i) => {
            if (!r.Acc_Id) errors.push(`Entries[${i}].Acc_Id`);
            if (!(r.DrCr === "Dr" || r.DrCr === "Cr")) errors.push(`Entries[${i}].DrCr`);
            if (!(r.Amount > 0)) errors.push(`Entries[${i}].Amount`);
            if (!r.__clientLineId) errors.push(`Entries[${i}].LineId(missing)`);
        });

        // sort (if you need), but keep clientLineId for mapping
        const rows = raw.sort((a, b) => String(b.DrCr).localeCompare(a.DrCr));

        const hasDr = rows.some((r) => r.DrCr === "Dr");
        const hasCr = rows.some((r) => r.DrCr === "Cr");
        if (!hasDr) errors.push("Entries:MissingDebit");
        if (!hasCr) errors.push("Entries:MissingCredit");

        // no duplicate Acc_Id on the same side
        const seen = new Set();
        rows.forEach((r) => {
            const k = `${r.DrCr}:${r.Acc_Id}`;
            if (seen.has(k)) errors.push(`Duplicate_${k}`);
            seen.add(k);
        });

        const drTotal = rows.filter((r) => r.DrCr === "Dr").reduce((t, r) => t + r.Amount, 0);
        const crTotal = rows.filter((r) => r.DrCr === "Cr").reduce((t, r) => t + r.Amount, 0);
        if (Math.round((drTotal - crTotal) * 100) !== 0) errors.push("NotBalanced");

        // ---- BillReferences validations (flat) ----
        const refs = toArray(BillReferences).map((r, i) => ({
            __i: i,
            LineId: r?.LineId || null,       // must match a client line LineId
            RefId: r?.RefId ?? null,
            RefNo: r?.RefNo ?? null,
            RefType: r?.RefType ?? null,
            Amount: Number(r?.Amount || 0),
        }));

        // every ref must target a valid client line
        const clientLineIdSet = new Set(rows.map((r) => r.__clientLineId));
        refs.forEach((r) => {
            if (!r.LineId || !clientLineIdSet.has(r.LineId)) {
                errors.push(`BillReferences[${r.__i}].LineId(invalid)`);
            }
            if (!(r.Amount > 0)) {
                errors.push(`BillReferences[${r.__i}].Amount`);
            }
        });

        // for each line that HAS refs, refs sum must equal line Amount
        const sumByClientLineId = refs.reduce((m, r) => {
            if (!r.LineId) return m;
            m[r.LineId] = (m[r.LineId] || 0) + r.Amount;
            return m;
        }, {});
        rows.forEach((line) => {
            if (sumByClientLineId[line.__clientLineId] != null) {
                const lhs = Math.round(sumByClientLineId[line.__clientLineId] * 100);
                const rhs = Math.round(Number(line.Amount || 0) * 100);
                if (lhs !== rhs) {
                    errors.push(`Entries[${line.__idx}].BillReferencesNotBalanced`);
                }
            }
        });

        if (errors.length) {
            return invalidInput(res, "Enter Required Fields", { errors });
        }

        // ----------------------------
        // Year_Id & Year_Desc
        // ----------------------------
        const yearQ = await new sql.Request()
            .input("JournalDate", journalDate)
            .query(`
        SELECT Id AS Year_Id, Year_Desc
        FROM tbl_Year_Master
        WHERE Fin_Start_Date <= @JournalDate AND Fin_End_Date >= @JournalDate
      `);
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
        WHERE Vocher_Type_Id = @Vocher_Type_Id
      `);
        if (vcodeQ.recordset.length === 0) throw new Error("Voucher_Code not found");
        const Voucher_Code = vcodeQ.recordset[0]?.Voucher_Code || "";

        // ----------------------------
        // JournalId (global) & JournalNo (per Year/VoucherType)
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
        WHERE Year_Id = @Year_Id AND VoucherType = @VoucherType
      `);
        const JournalNo = Number(jnoQ?.recordset?.[0]?.JournalNo || 0) + 1;

        const JournalVoucherNo = `${Voucher_Code}/${createPadString(JournalNo, 6)}/${Year_Desc}`;
        const AlterId = randomNumber(6, 8);

        // ----------------------------
        // Begin Transaction
        // ----------------------------
        await tx.begin();

        // Header
        const hdrReq = new sql.Request(tx)
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
            .input("AlterId", AlterId);

        const hdrIns = await hdrReq.query(`
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
      )
    `);

        const JournalAutoId = hdrIns?.recordset?.[0]?.JournalAutoId;
        if (!JournalAutoId) throw new Error("Failed to capture JournalAutoId");

        // Lines: insert & build map from clientLineId -> DB line
        const lineMapByClientId = new Map(); // clientLineId => {LineId, LineNum, Acc_Id, DrCr}

        let LineNum = 1;
        for (const r of rows) {
            const lineReq = new sql.Request(tx)
                .input("LineNum", LineNum++)
                .input("JournalAutoId", JournalAutoId)
                .input("JournalId", JournalId)
                .input("JournalVoucherNo", JournalVoucherNo)
                .input("JournalDate", journalDate)
                .input("Acc_Id", r.Acc_Id)
                .input("DrCr", r.DrCr)
                .input("Amount", r.Amount)
                .input("Remarks", r.Remarks);

            const lineIns = await lineReq.query(`
        INSERT INTO dbo.tbl_Journal_Entries_Info (
          LineId, LineNum, JournalAutoId, JournalId, JournalVoucherNo, JournalDate,
          Acc_Id, DrCr, Amount, Remarks
        )
        OUTPUT inserted.LineId, inserted.LineNum, inserted.Acc_Id, inserted.DrCr
        VALUES (
          DEFAULT, @LineNum, @JournalAutoId, @JournalId, @JournalVoucherNo, @JournalDate,
          @Acc_Id, @DrCr, @Amount, @Remarks
        )
      `);

            const ins = lineIns?.recordset?.[0];
            if (!ins?.LineId) throw new Error("Failed to insert journal line");

            lineMapByClientId.set(r.__clientLineId, {
                LineId: ins.LineId,
                LineNum: ins.LineNum,
                Acc_Id: ins.Acc_Id,
                DrCr: ins.DrCr,
            });
        }

        // Bill References: use map to resolve each ref's DB LineId/LineNum + actual Acc_Id/DrCr
        for (const r of refs) {
            const map = lineMapByClientId.get(r.LineId);
            if (!map) {
                throw new Error(`BillReferences[${r.__i}] refers to unknown LineId`);
            }
            const refReq = new sql.Request(tx)
                .input("LineId", map.LineId)
                .input("LineNum", map.LineNum)
                .input("JournalAutoId", JournalAutoId)
                .input("JournalId", JournalId)
                .input("JournalVoucherNo", JournalVoucherNo)
                .input("JournalDate", journalDate)
                .input("Acc_Id", map.Acc_Id)
                .input("DrCr", map.DrCr)
                .input("RefId", r.RefId ?? null)
                .input("RefNo", r.RefNo ?? null)
                .input("RefType", r.RefType ?? null)
                .input("Amount", r.Amount);

            await refReq.query(`
        INSERT INTO dbo.tbl_Journal_Bill_Reference (
          autoGenId, LineId, LineNum, JournalAutoId, JournalId, JournalVoucherNo, JournalDate,
          Acc_Id, DrCr, RefId, RefNo, RefType, Amount
        )
        VALUES (
          DEFAULT, @LineId, @LineNum, @JournalAutoId, @JournalId, @JournalVoucherNo, @JournalDate,
          @Acc_Id, @DrCr, @RefId, @RefNo, @RefType, @Amount
        )
      `);
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
            Lines: rows.length,
            BillReferences: refs.length,
        });
    } catch (e) {
        try { if (tx._aborted !== true) await tx.rollback(); } catch { }
        return servError(e, res);
    }
};


const editJournal = async (req, res) => {
    const tx = new sql.Transaction();
    try {
        const {
            JournalAutoId,
            JournalDate,
            Narration = null,
            JournalStatus,
            Entries = [],
        } = req.body || {};

        const errors = [];

        if (!JournalAutoId) errors.push("JournalAutoId");
        if (JournalStatus === undefined || JournalStatus === null || JournalStatus === '') errors.push("JournalStatus");

        const rows = toArray(Entries).map((r, idx) => ({
            LineId: r?.LineId || null,
            LineNum: Number(r?.LineNum || idx + 1),
            Acc_Id: Number(r?.Acc_Id),
            DrCr: String(r?.DrCr || "").trim(),
            Amount: Number(r?.Amount || 0),
            Remarks: r?.Remarks ?? null,
        }));

        if (rows.length === 0) errors.push("Entries");

        rows.forEach((r, i) => {
            if (!r.Acc_Id) errors.push(`Entries[${i}].Acc_Id`);
            if (!(r.DrCr === "Dr" || r.DrCr === "Cr")) errors.push(`Entries[${i}].DrCr`);
            if (!(r.Amount > 0)) errors.push(`Entries[${i}].Amount`);
        });

        const hasDr = rows.some((r) => r.DrCr === "Dr");
        const hasCr = rows.some((r) => r.DrCr === "Cr");
        if (!hasDr) errors.push("Entries:MissingDebit");
        if (!hasCr) errors.push("Entries:MissingCredit");

        const seen = new Set();
        rows.forEach((r) => {
            const k = `${r.DrCr}:${r.Acc_Id}`;
            if (seen.has(k)) errors.push(`Duplicate_${k}`);
            seen.add(k);
        });

        const drTotal = rows.filter((r) => r.DrCr === "Dr").reduce((t, r) => t + r.Amount, 0);
        const crTotal = rows.filter((r) => r.DrCr === "Cr").reduce((t, r) => t + r.Amount, 0);
        if (Math.round((drTotal - crTotal) * 100) !== 0) errors.push("NotBalanced");

        if (errors.length) {
            return invalidInput(res, "Enter Required Fields", { errors });
        }

        const journalDate = JournalDate ? ISOString(JournalDate) : ISOString();


        const hdrQ = await new sql.Request()
            .input("JournalAutoId", JournalAutoId)
            .query(`
                SELECT TOP 1
                    JournalId, Year_Id, VoucherType, JournalNo, JournalVoucherNo
                FROM dbo.tbl_Journal_General_Info
                WHERE JournalAutoId = @JournalAutoId`
            );

        if (hdrQ.recordset.length === 0) {
            return invalidInput(res, "Journal not found", { JournalAutoId });
        }

        const {
            JournalId,
            Year_Id,
            VoucherType,
            JournalNo,
            JournalVoucherNo,
        } = hdrQ.recordset[0];

        await tx.begin();

        await new sql.Request(tx)
            .input("JournalAutoId", JournalAutoId)
            .input("JournalDate", journalDate)
            .input("Narration", Narration)
            .input("JournalStatus", JournalStatus)
            .query(`
                UPDATE dbo.tbl_Journal_General_Info
                SET
                    JournalDate   = @JournalDate,
                    Narration     = @Narration,
                    JournalStatus = @JournalStatus,
                    UpdatedAt     = GETDATE(),
                    AlterId       = AlterId + 1
                WHERE JournalAutoId = @JournalAutoId;`
            );

        const EntriesJson = JSON.stringify(rows);

        await new sql.Request(tx)
            .input("JournalAutoId", JournalAutoId)
            .input("JournalId", JournalId)
            .input("JournalVoucherNo", JournalVoucherNo)
            .input("JournalDate", journalDate)
            .input("EntriesJson", EntriesJson)
            .query(`
            -- Parse incoming entries JSON into a tabular source
                WITH Src AS (
                    SELECT
                        TRY_CONVERT(UNIQUEIDENTIFIER, JSON_VALUE(j.value,'$.LineId'))  AS LineId,
                        CAST(JSON_VALUE(j.value,'$.LineNum') AS INT)                   AS LineNum,
                        CAST(JSON_VALUE(j.value,'$.Acc_Id') AS INT)                    AS Acc_Id,
                        JSON_VALUE(j.value,'$.DrCr')                                   AS DrCr,
                        CAST(JSON_VALUE(j.value,'$.Amount') AS DECIMAL(18,2))          AS Amount,
                        JSON_VALUE(j.value,'$.Remarks')                                AS Remarks
                    FROM OPENJSON(@EntriesJson) AS j
                )
                MERGE dbo.tbl_Journal_Entries_Info AS tgt
                USING Src AS src
                    ON tgt.JournalAutoId = @JournalAutoId
                    AND tgt.LineId        = src.LineId
                WHEN MATCHED THEN
                    UPDATE SET
                        tgt.LineNum         = src.LineNum,
                        tgt.Acc_Id          = src.Acc_Id,
                        tgt.DrCr            = src.DrCr,
                        tgt.Amount          = src.Amount,
                        tgt.Remarks         = src.Remarks,
                        tgt.JournalDate     = @JournalDate,
                        tgt.JournalId       = @JournalId,
                        tgt.JournalVoucherNo= @JournalVoucherNo
                WHEN NOT MATCHED BY TARGET THEN
                    INSERT (
                        LineId, LineNum, JournalAutoId, JournalId, JournalVoucherNo, JournalDate,
                        Acc_Id, DrCr, Amount, Remarks
                    ) VALUES (
                        DEFAULT, src.LineNum, @JournalAutoId, @JournalId, @JournalVoucherNo, @JournalDate,
                        src.Acc_Id, src.DrCr, src.Amount, src.Remarks
                    )
                WHEN NOT MATCHED BY SOURCE
                    AND tgt.JournalAutoId = @JournalAutoId THEN
                    DELETE;`
            );

        await tx.commit();

        return success(res, "Journal Updated", {
            JournalAutoId,
            JournalId,
            Year_Id,
            VoucherType,
            JournalNo,
            JournalVoucherNo,
            JournalDate: journalDate,
            Narration,
            JournalStatus,
            DrTotal: Number(drTotal.toFixed(2)),
            CrTotal: Number(crTotal.toFixed(2)),
            Difference: Number((drTotal - crTotal).toFixed(2)),
            Lines: rows.length,
        });
    } catch (e) {
        try { if (tx._aborted !== true) await tx.rollback(); } catch { }
        return servError(e, res);
    }
};


export default {
    getJournal,
    createJournal,
    editJournal
}