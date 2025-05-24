import sql from 'mssql';
import { dataFound, failed, invalidInput, noData, sentData, servError, success } from '../../res.mjs'
import { checkIsNumber, filterableText, isEqualNumber } from '../../helper_functions.mjs';

const voucherType = () => {

    const getVoucherType = async (req, res) => {
        try {
            const { module } = req.query;

            const request = new sql.Request()
                .input('module', module)
                .query(`
                    SELECT vt.*,bm.BranchName 
                    FROM tbl_Voucher_Type vt
	                LEFT JOIN tbl_Branch_Master bm 
                        ON bm.BranchId = vt.Branch_Id
                    WHERE Vocher_Type_Id IS NOT NULL
                    ${module ? ' AND Type = @module ' : ''}`
                );

            const result = await request;

            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res)
        }
    }

    const addVoucherType = async (req, res) => {
        const { Voucher_Type, Voucher_Code, Branch_Id, Type } = req.body;

        if (!Voucher_Type || !checkIsNumber(Branch_Id) || !Type || !Voucher_Code) {
            return invalidInput(res, 'Voucher_Type and Branch_Id,Voucher_Code are required');
        }

        try {
            const voucherType = (await new sql.Request()
                .query(`SELECT Voucher_Type, Branch_Id FROM tbl_Voucher_Type`)).recordset;

            for (const voucher of voucherType) {
                if (
                    filterableText(voucher.Voucher_Type) === filterableText(Voucher_Type) &&
                    isEqualNumber(voucher.Branch_Id, Branch_Id)
                ) {
                    return failed(res, 'This Voucher Type already exists');
                }
            }


            const maxIdResult = await new sql.Request().query(`
                SELECT ISNULL(MAX(Vocher_Type_Id), 0) + 1 AS Vocher_Type_Id FROM tbl_Voucher_Type
            `);

            const Voucher_Type_Id = maxIdResult.recordset[0].Vocher_Type_Id;

            const request = new sql.Request()
                .input('Vocher_Type_Id', Voucher_Type_Id)
                .input('Voucher_Type', Voucher_Type)
                .input('Voucher_Code', Voucher_Code)
                .input('Branch_Id', Branch_Id)
                .input('Type', Type)
                .query(`
                    INSERT INTO tbl_Voucher_Type (Vocher_Type_Id, Voucher_Type,Voucher_Code, Branch_Id,Type)
                    VALUES (@Vocher_Type_Id, @Voucher_Type,@Voucher_Code, @Branch_Id,@Type)
                `);

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'New Voucher Type Added');
            } else {
                failed(res, 'Failed to Create Voucher Type');
            }

        } catch (e) {
            servError(e, res);
        }
    };

    const editVoucherType = async (req, res) => {
        const { Voucher_Type_Id, Voucher_Type, Voucher_Code, Branch_Id, Type } = req.body;

        if (!checkIsNumber(Voucher_Type_Id) || !Voucher_Type || !checkIsNumber(Branch_Id) || !Type || !Voucher_Code) {
            return invalidInput(res, 'Voucher_Type_Id, Voucher_Type, Branch_Id,Type is required')
        }

        try {
            const existVoucher = (await new sql.Request()
                .query(`SELECT Vocher_Type_Id, Voucher_Type,Voucher_Code, Branch_Id,Type FROM tbl_Voucher_Type`)).recordset;

            existVoucher.forEach(voucher => {
                if (
                    filterableText(voucher.Voucher_Type) === filterableText(Voucher_Type)
                    && isEqualNumber(voucher.Branch_Id, Branch_Id)
                    && !isEqualNumber(voucher.Vocher_Type_Id, Voucher_Type_Id)
                ) return failed(res, 'This voucher type is already exist');
            })

            const request = new sql.Request()
                .input('Voucher_Type_Id', Voucher_Type_Id)
                .input('Voucher_Type', Voucher_Type)
                .input('Voucher_Code', Voucher_Code)
                .input('Branch_Id', Branch_Id)
                .input('Type', Type)
                .query(`
                    UPDATE tbl_Voucher_Type 
                    SET 
                        Voucher_Type = @Voucher_Type, 
                        Branch_Id = @Branch_Id,
                        Voucher_Code=@Voucher_Code,
                        Type=@Type
                    WHERE
                        Vocher_Type_Id = @Voucher_Type_Id`
                )

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Changes Saved')
            } else {
                failed(res, 'Failed to save changes')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const deleteVoucherType = async (req, res) => {
        const { Vocher_Type_Id } = req.body;
        if (!checkIsNumber(Vocher_Type_Id)) {
            return invalidInput(res, 'Voucher_Type_Id is required')
        }

        try {

            const request = new sql.Request()
                .input('Vocher_Type_Id', Vocher_Type_Id)
                .query(`
                    DELETE 
                    FROM tbl_Voucher_Type 
                    WHERE Vocher_Type_Id = @Vocher_Type_Id`
                )

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Voucher_Type deleted')
            } else {
                failed(res, 'Failed to delete Voucher_Type')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    return {
        getVoucherType,
        addVoucherType,
        editVoucherType,
        deleteVoucherType
    }
}

export default voucherType();