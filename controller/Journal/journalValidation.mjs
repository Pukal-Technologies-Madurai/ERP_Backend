import { z } from "zod";

export const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

export const isGuid = (v) => {
    if (!v) return false;
    const s = String(v).trim().replace(/^{|}$/g, "");
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
};

export const normGuid = (v) => String(v).trim().replace(/^{|}$/g, "");

export const zNumber = (field) =>
    z.coerce
        .number()
        .refine((v) => Number.isFinite(v), { message: `${field} must be a number` });

export const zPositive = (field) =>
    zNumber(field).refine((v) => v > 0, { message: `${field} must be > 0` });

export const zNullableString = () => z.string().trim().nullable().optional();

export const issuePath = (path) => {
    let s = "";
    for (const p of path) {
        if (typeof p === "number") s += `[${p}]`;
        else s += (s ? "." : "") + p;
    }
    return s || "body";
};

export const emptyToUndefined = (v) => (v === "" || v === null || v === undefined ? undefined : v);
export const emptyToNull = (v) => (v === "" || v === undefined ? null : v);

export const zOptionalPositive = (field) =>
    z.preprocess(emptyToUndefined, zPositive(field)).optional();

export const zOptionalNullableNumber = (field) =>
    z.preprocess(emptyToNull, zNumber(field)).nullable().optional();


export const zodToErrors = (zerr) => zerr.issues.map((i) => `${issuePath(i.path)}: ${i.message}`);

export const BillEntrySchema = z.object({
    autoGenId: z.string().optional(),
    Acc_Id: zNumber("Acc_Id").optional(),
    DrCr: z.enum(["Dr", "Cr"]).optional(),
    Amount: zPositive("Amount"),
    BillRefNo: zNullableString(),
    RefId: zOptionalNullableNumber("RefId"),
    RefNo: zNullableString(),
    RefType: zNullableString(),
    JournalId: z.any().optional(),
    JournalAutoId: z.any().optional(),
    JournalVoucherNo: z.any().optional(),
    JournalDate: z.any().optional(),
    LineId: z.any().optional(),
    LineNum: z.any().optional(),
});

export const EntrySchema = z.object({
    LineId: z.string().optional(),
    Acc_Id: zPositive("Acc_Id"),
    DrCr: z.enum(["Dr", "Cr"]),
    Amount: zPositive("Amount"),
    Remarks: zNullableString(),
    AccountGet: zNullableString(),
    isSundryParty: zNumber("isSundryParty").optional().default(0),
    BillEntries: z.array(BillEntrySchema).optional().default([]),
});

export const EditJournalSchema = z
    .object({
        JournalAutoId: z
            .string()
            .refine(isGuid, { message: "JournalAutoId must be a valid GUID" })
            .transform(normGuid),
        JournalDate: z
            .string()
            .nullable()
            .optional()
            .refine((v) => v == null || !Number.isNaN(Date.parse(v)), { message: "JournalDate must be a valid date" }),
        Narration: zNullableString(),
        JournalStatus: zNumber("JournalStatus"),
        BranchId: zNumber("BranchId").optional(),
        Entries: z.array(EntrySchema).min(1, { message: "Entries is required" }),
    })
    .superRefine((data, ctx) => {
        const hasDr = data.Entries.some((e) => e.DrCr === "Dr");
        const hasCr = data.Entries.some((e) => e.DrCr === "Cr");
        if (!hasDr) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Entries"], message: "Entries:MissingDebit" });
        if (!hasCr) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Entries"], message: "Entries:MissingCredit" });

        const drTotal = data.Entries.filter((e) => e.DrCr === "Dr").reduce((t, e) => t + e.Amount, 0);
        const crTotal = data.Entries.filter((e) => e.DrCr === "Cr").reduce((t, e) => t + e.Amount, 0);
        if (Math.round((drTotal - crTotal) * 100) !== 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Entries"], message: "NotBalanced" });
        }

        data.Entries.forEach((e, ei) => {
            if (!e.BillEntries?.length) return;

            e.BillEntries.forEach((b, bi) => {
                if (b.Acc_Id != null && Number(b.Acc_Id) !== Number(e.Acc_Id)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["Entries", ei, "BillEntries", bi, "Acc_Id"],
                        message: "BillEntry Acc_Id must match Entry Acc_Id",
                    });
                }
                if (b.DrCr != null && String(b.DrCr) !== String(e.DrCr)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["Entries", ei, "BillEntries", bi, "DrCr"],
                        message: "BillEntry DrCr must match Entry DrCr",
                    });
                }
            });
        });
    });

export const CreateJournalSchema = z
    .object({
        VoucherType: zPositive("VoucherType"),
        JournalDate: z
            .string()
            .nullable()
            .optional()
            .refine((v) => v == null || !Number.isNaN(Date.parse(v)), { message: "JournalDate must be a valid date" }),

        BranchId: zPositive("BranchId"),
        Narration: z.string().nullable().optional(),
        JournalStatus: zNumber("JournalStatus"),
        CreatedBy: zPositive("CreatedBy"),

        Entries: z.array(EntrySchema).min(1, { message: "Entries is required" }),
    })
    .superRefine((data, ctx) => {
        const hasDr = data.Entries.some((e) => e.DrCr === "Dr");
        const hasCr = data.Entries.some((e) => e.DrCr === "Cr");
        if (!hasDr) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Entries"], message: "Entries:MissingDebit" });
        if (!hasCr) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Entries"], message: "Entries:MissingCredit" });

        const drTotal = data.Entries.filter((e) => e.DrCr === "Dr").reduce((t, e) => t + e.Amount, 0);
        const crTotal = data.Entries.filter((e) => e.DrCr === "Cr").reduce((t, e) => t + e.Amount, 0);
        if (Math.round((drTotal - crTotal) * 100) !== 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Entries"], message: "NotBalanced" });
        }

        data.Entries.forEach((e, ei) => {
            if (!e.BillEntries?.length) return;

            e.BillEntries.forEach((b, bi) => {
                if (b.Acc_Id != null && Number(b.Acc_Id) !== Number(e.Acc_Id)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["Entries", ei, "BillEntries", bi, "Acc_Id"],
                        message: "BillEntry Acc_Id must match Entry Acc_Id",
                    });
                }
                if (b.DrCr != null && String(b.DrCr) !== String(e.DrCr)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["Entries", ei, "BillEntries", bi, "DrCr"],
                        message: "BillEntry DrCr must match Entry DrCr",
                    });
                }
            });
        });

        // data.Entries.forEach((e, ei) => {
        //     if (!e.BillEntries?.length) return;
        //     const sum = e.BillEntries.reduce((t, b) => t + (b.Amount || 0), 0);
        //     if (Math.round((sum - e.Amount) * 100) !== 0) {
        //         ctx.addIssue({
        //             code: z.ZodIssueCode.custom,
        //             path: ["Entries", ei, "BillEntries"],
        //             message: "BillEntries total must equal Entry Amount",
        //         });
        //     }
        // });
    });

