import { servError, success, invalidInput, sentData, } from '../../res.mjs';
import { ISOString, checkIsNumber, createPadString, randomNumber, toNumber } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';
import sql from 'mssql'


const getContra = async (req, res) => {
    try {
        const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

        const { branch, voucher, status, createdBy, debit, credit } = req.query;

        const request = new sql.Request()
            .input("Fromdate", Fromdate)
            .input("Todate", Todate)
            .input("BranchId", branch)
            .input("VoucherType", voucher)
            .input("ContraStatus", status)
            .input("CreatedBy", createdBy)
            .input("DebitAccount", debit)
            .input("CreditAccount", credit)
            .query(`
                SELECT 
                	con.*,
                	COALESCE(deb.Account_name, 'Not found') AS DebitAccountGet,
                	COALESCE(cre.Account_name, 'Not found') AS CreditAccountGet,
                	COALESCE(br.BranchName , 'Not found') AS BranchGet,
                	COALESCE(vou.Voucher_Type, 'Not found') AS VoucherTypeGet
                FROM tbl_Contra_General_Info AS con
                LEFT JOIN tbl_Account_Master AS deb ON deb.Acc_Id = con.DebitAccount
                LEFT JOIN tbl_Account_Master AS cre ON cre.Acc_Id = con.CreditAccount
                LEFT JOIN tbl_Branch_Master AS br ON br.BranchId = con.BranchId
                LEFT JOIN tbl_Voucher_Type AS vou ON vou.Vocher_Type_Id = con.VoucherType
                WHERE 
                	ContraDate BETWEEN @Fromdate AND @Todate 
                    ${checkIsNumber(branch) ? ` AND con.BranchId = @BranchId ` : ''}
                    ${checkIsNumber(voucher) ? ` AND con.VoucherType = @VoucherType ` : ''}
                    ${checkIsNumber(status) ? ` AND con.ContraStatus = @ContraStatus ` : ''}
                    ${checkIsNumber(createdBy) ? ` AND con.CreatedBy = @CreatedBy ` : ''}
                    ${checkIsNumber(debit) ? ` AND con.DebitAccount = @DebitAccount ` : ''}
                    ${checkIsNumber(credit) ? ` AND con.CreditAccount = @CreditAccount ` : ''}
                ORDER BY con.ContraDate DESC;`
            );

        const result = await request;

        sentData(res, result.recordset)

    } catch (e) {
        servError(e, res);
    }
}

const createContra = async (req, res) => {
    const tx = new sql.Transaction();
    try {
        const {
            VoucherType,
            BranchId,
            DebitAccount,
            DebitAccountName,
            CreditAccount,
            CreditAccountName,
            Amount,
            Narration = null,
            BankName = '',
            ContraStatus,
            CreatedBy,
            Chequeno,
            TransactionType,
        } = req.body || {};

        const BankDate = req.body?.BankDate ? ISOString(req.body.BankDate) : null;
        const ChequeDate = req.body?.ChequeDate ? ISOString(req.body.ChequeDate) : null;
        const ContraDate = req.body?.ContraDate ? ISOString(req.body.ContraDate) : ISOString();

        const errors = [];
        if (!VoucherType) errors.push("VoucherType");
        if (!TransactionType) errors.push("TransactionType");
        if (!BranchId) errors.push("BranchId");
        if (!DebitAccount) errors.push("DebitAccount");
        if (!CreditAccount) errors.push("CreditAccount");
        if (!(toNumber(Amount) > 0)) errors.push("Amount");
        if (!CreatedBy) errors.push("CreatedBy");
        if (ContraStatus === undefined || ContraStatus === null || ContraStatus === "") errors.push("ContraStatus");
        if (errors.length) return invalidInput(res, "Enter Required Fields", { errors });

        const yearQ = await new sql.Request()
            .input("ContraDate", ContraDate)
            .query(
                `SELECT Id AS Year_Id, Year_Desc
                FROM tbl_Year_Master
                WHERE Fin_Start_Date <= @ContraDate AND Fin_End_Date >= @ContraDate;`
            );
        if (yearQ.recordset.length === 0) throw new Error("Year_Id not found");
        const { Year_Id, Year_Desc } = yearQ.recordset[0];

        const vcodeQ = await new sql.Request()
            .input("Vocher_Type_Id", VoucherType)
            .query(
                `SELECT Voucher_Code
                FROM tbl_Voucher_Type
                WHERE Vocher_Type_Id = @Vocher_Type_Id;`
            );
        if (vcodeQ.recordset.length === 0) throw new Error("Voucher_Code not found");
        const Voucher_Code = vcodeQ.recordset[0]?.Voucher_Code || "";

        const contraIdGet = await getNextId({ table: "tbl_Contra_General_Info", column: "ContraId" });
        if (!contraIdGet?.status || !Number.isFinite(Number(contraIdGet.MaxId))) throw new Error("Failed to get ContraId");
        const ContraId = Number(contraIdGet.MaxId);

        const noQ = await new sql.Request()
            .input("Year_Id", Year_Id)
            .input("VoucherType", VoucherType)
            .query(
                `SELECT COALESCE(MAX(ContraNo),0) AS ContraNo
                FROM dbo.tbl_Contra_General_Info
                WHERE Year_Id = @Year_Id AND VoucherType = @VoucherType;`
            );
        const ContraNo = Number(noQ?.recordset?.[0]?.ContraNo || 0) + 1;

        const ContraVoucherNo = `${Voucher_Code}/${createPadString(ContraNo, 6)}/${Year_Desc}`;
        const AlterId = randomNumber(6, 8);

        await tx.begin();

        const ins = await new sql.Request(tx)
            .input("ContraId", ContraId)
            .input("Year_Id", Year_Id)
            .input("VoucherType", VoucherType)
            .input("ContraNo", ContraNo)
            .input("ContraVoucherNo", ContraVoucherNo)
            .input("ContraDate", ContraDate)
            .input("BranchId", BranchId)
            .input("DebitAccount", DebitAccount)
            .input("DebitAccountName", DebitAccountName || null)
            .input("CreditAccount", CreditAccount)
            .input("CreditAccountName", CreditAccountName || null)
            .input("Amount", Number(Amount))
            .input("Narration", Narration)
            .input("ContraStatus", ContraStatus)
            .input("BankName", BankName)
            .input("BankDate", BankDate)
            .input("Chequeno", Chequeno)
            .input("TransactionType", TransactionType)
            .input("ChequeDate", ChequeDate)
            .input("CreatedBy", CreatedBy)
            .input("AlterId", AlterId)
            .query(`
                INSERT INTO dbo.tbl_Contra_General_Info(
                    ContraAutoId, ContraId, Year_Id, VoucherType, ContraNo, ContraVoucherNo, ContraDate, 
                    BranchId, DebitAccount, DebitAccountName, CreditAccount, CreditAccountName, Amount, 
                    Narration, ContraStatus, BankName, BankDate, Chequeno, TransactionType, ChequeDate, 
                    CreatedBy, CreatedAt, UpdatedAt, AlterId
                ) OUTPUT inserted.ContraAutoId VALUES (
                    DEFAULT, @ContraId, @Year_Id, @VoucherType, @ContraNo, @ContraVoucherNo, @ContraDate, 
                    @BranchId, @DebitAccount, @DebitAccountName, @CreditAccount, @CreditAccountName, @Amount, 
                    @Narration, @ContraStatus, @BankName, @BankDate, @Chequeno, @TransactionType, @ChequeDate, 
                    @CreatedBy, GETDATE(), NULL, @AlterId
                );`
            );

        const ContraAutoId = ins?.recordset?.[0]?.ContraAutoId;
        if (!ContraAutoId) throw new Error("Failed to capture ContraAutoId");

        await tx.commit();

        return success(res, "Contra Created", {
            ContraAutoId,
            ContraId,
            Year_Id,
            VoucherType,
            ContraNo,
            ContraVoucherNo,
            ContraDate,
            BranchId,
            DebitAccount,
            DebitAccountName: DebitAccountName || null,
            CreditAccount,
            CreditAccountName: CreditAccountName || null,
            Amount: Number(Amount),
            Narration,
            ContraStatus,
            CreatedBy
        });

    } catch (e) {
        try { if (tx._aborted !== true) await tx.rollback(); } catch { }
        return servError(e, res);
    }
};

const editContra = async (req, res) => {
    const tx = new sql.Transaction();
    try {
        const {
            ContraAutoId,
            BranchId,
            DebitAccount,
            DebitAccountName,
            CreditAccount,
            CreditAccountName,
            Amount,
            Narration = null,
            ContraStatus,
            BankName = '',
            Chequeno,
            TransactionType,
        } = req.body || {};

        const BankDate = req.body?.BankDate ? ISOString(req.body.BankDate) : null;
        const ChequeDate = req.body?.ChequeDate ? ISOString(req.body.ChequeDate) : null;
        const ContraDate = req.body?.ContraDate ? ISOString(req.body.ContraDate) : ISOString();

        const errors = [];
        if (!ContraAutoId) errors.push("ContraAutoId");
        if (!BranchId) errors.push("BranchId");
        if (!DebitAccount) errors.push("DebitAccount");
        if (!CreditAccount) errors.push("CreditAccount");
        if (!(Number(Amount) > 0)) errors.push("Amount");
        if (ContraStatus === undefined || ContraStatus === null || ContraStatus === "") errors.push("ContraStatus");
        if (errors.length) return invalidInput(res, "Enter Required Fields", { errors });

        const hdrQ = await new sql.Request()
            .input("ContraAutoId", ContraAutoId)
            .query(
                `SELECT TOP 1 ContraId, Year_Id, VoucherType, ContraNo, ContraVoucherNo
                FROM dbo.tbl_Contra_General_Info
                WHERE ContraAutoId = @ContraAutoId;`
            );
        if (hdrQ.recordset.length === 0) return invalidInput(res, "Contra not found", { ContraAutoId });

        const { ContraId, Year_Id, VoucherType, ContraNo, ContraVoucherNo } = hdrQ.recordset[0];

        await tx.begin();

        await new sql.Request(tx)
            .input("ContraAutoId", ContraAutoId)
            .input("ContraDate", ContraDate)
            .input("BranchId", BranchId)
            .input("DebitAccount", DebitAccount)
            .input("DebitAccountName", DebitAccountName || null)
            .input("CreditAccount", CreditAccount)
            .input("CreditAccountName", CreditAccountName || null)
            .input("Amount", Number(Amount))
            .input("BankName", BankName)
            .input("BankDate", BankDate)
            .input("Chequeno", Chequeno)
            .input("ChequeDate", ChequeDate)
            .input("TransactionType", TransactionType)
            .input("Narration", Narration)
            .input("ContraStatus", ContraStatus)
            .query(`
                UPDATE dbo.tbl_Contra_General_Info
                SET
                    ContraDate = @ContraDate,
                    BranchId = @BranchId,
                    DebitAccount = @DebitAccount,
                    DebitAccountName = @DebitAccountName,
                    CreditAccount = @CreditAccount,
                    CreditAccountName = @CreditAccountName,
                    Amount = @Amount,
                    Narration = @Narration,
                    ContraStatus = @ContraStatus,
                    BankName = @BankName,
                    BankDate = @BankDate,
                    Chequeno = @Chequeno,
                    ChequeDate = @ChequeDate,
                    TransactionType = @TransactionType,
                    UpdatedAt = GETDATE(),
                    AlterId = AlterId + 1
                WHERE ContraAutoId = @ContraAutoId;`
            );

        await tx.commit();

        return success(res, "Contra Updated", {
            ContraAutoId,
            ContraId,
            Year_Id,
            VoucherType,
            ContraNo,
            ContraVoucherNo,
            ContraDate,
            BranchId,
            DebitAccount,
            DebitAccountName: DebitAccountName || null,
            CreditAccount,
            CreditAccountName: CreditAccountName || null,
            Amount: Number(Amount),
            Narration,
            ContraStatus
        });
    } catch (e) {
        try { if (tx._aborted !== true) await tx.rollback(); } catch { }
        return servError(e, res);
    }
};


export default {
    getContra,
    createContra,
    editContra
}