import { z } from "zod";

export const toArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);
export const isGuid = (v) => {
  if (!v) return false;
  const s = String(v).trim().replace(/^{|}$/g, "");
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(s);
};

export const normGuid = (v) => String(v).trim().replace(/^{|}$/g, "");

export const zNumber = (field) =>
    z.union([z.number(), z.string()])
        .transform((v) => Number(v))
        .refine((v) => Number.isFinite(v), { message: `${field} must be a number` });

export const zPositive = (field) =>
    zNumber(field).refine((v) => v > 0, { message: `${field} must be > 0` });

export const issuePath = (path) => {
    // ['Entries', 0, 'Acc_Id'] -> 'Entries[0].Acc_Id'
    let s = "";
    for (const p of path) {
        if (typeof p === "number") s += `[${p}]`;
        else s += (s ? "." : "") + p;
    }
    return s || "body";
};

export const zodToErrors = (zerr) =>
    zerr.issues.map((i) => `${issuePath(i.path)}: ${i.message}`);

export const EntrySchema = z.object({
    ClientLineId: z.string().optional(),
    LineId: z.string().optional(),
    DbLineId: z.string().optional(),

    LineNum: zNumber("LineNum").optional(),
    Acc_Id: zPositive("Acc_Id"),
    DrCr: z.enum(["Dr", "Cr"]),
    Amount: zPositive("Amount"),

    Remarks: z.string().nullable().optional(),
    AccountGet: z.string().nullable().optional(),
    isSundryParty: zNumber("isSundryParty").optional().default(0),
});

export const BillRefSchema = z.object({
    autoGenId: z.string().optional(),
    ClientLineId: z.string().optional(),
    LineId: z.string().optional(),

    RefId: zNumber("RefId").nullable().optional(),
    RefNo: z.string().nullable().optional(),
    RefType: z.string().nullable().optional(),
    BillRefNo: z.string().nullable().optional(),

    Amount: zPositive("Amount"),
});

export const EditJournalSchema = z
    .object({
        JournalAutoId: z.string().refine(isGuid, { message: "JournalAutoId must be a valid GUID" }).transform(normGuid),
        JournalDate: z.string().nullable().optional(),
        Narration: z.string().nullable().optional(),
        JournalStatus: zNumber("JournalStatus"),
        BranchId: zNumber("BranchId").optional(),

        Entries: z.array(EntrySchema).min(1, { message: "Entries is required" }),
        BillReferences: z.array(BillRefSchema).optional().default([]),
    })
    .superRefine((data, ctx) => {
        const entryClientIds = new Set();
        data.Entries.forEach((e, idx) => {
            const clientId = e.ClientLineId || e.LineId;
            if (!clientId) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["Entries", idx, "ClientLineId"],
                    message: "ClientLineId or LineId is required for mapping",
                });
            } else {
                entryClientIds.add(String(clientId));
            }
        });

        const hasDr = data.Entries.some((e) => e.DrCr === "Dr");
        const hasCr = data.Entries.some((e) => e.DrCr === "Cr");
        if (!hasDr) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Entries"], message: "Entries:MissingDebit" });
        if (!hasCr) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Entries"], message: "Entries:MissingCredit" });

        const seen = new Set();
        data.Entries.forEach((e, idx) => {
            const k = `${e.DrCr}:${e.Acc_Id}`;
            if (seen.has(k)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["Entries", idx, "Acc_Id"],
                    message: `Duplicate_${k}`,
                });
            }
            seen.add(k);
        });

        const drTotal = data.Entries.filter((e) => e.DrCr === "Dr").reduce((t, e) => t + e.Amount, 0);
        const crTotal = data.Entries.filter((e) => e.DrCr === "Cr").reduce((t, e) => t + e.Amount, 0);
        if (Math.round((drTotal - crTotal) * 100) !== 0) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["Entries"], message: "NotBalanced" });
        }

        data.BillReferences.forEach((r, i) => {
            const clientId = r.ClientLineId || r.LineId;
            if (!clientId) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["BillReferences", i, "ClientLineId"],
                    message: "ClientLineId or LineId is required",
                });
                return;
            }
            if (!entryClientIds.has(String(clientId))) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ["BillReferences", i, "LineId"],
                    message: "LineId/ClientLineId(invalid)",
                });
            }
        });
    });