import sql from 'mssql';
import { dataFound, failed, invalidInput, noData, sentData, servError, success } from '../../res.mjs'
import { checkIsNumber, filterableText, isEqualNumber, randomNumber } from '../../helper_functions.mjs';

const voucherType = () => {

    const getVoucherType = async (req, res) => {
        try {
            const { module, showDeleted = 0 } = req.query;

            const request = new sql.Request()
                .input('module', module)
                .query(`
                    SELECT 
                        vt.Vocher_Type_Id,
                        vt.Voucher_Type,
                        vt.Voucher_Code,
                        vt.Branch_Id,
                        vt.Type,
                        vt.tally_sync AS tallySync,   
                        bm.BranchName,
                        vt.Created_By,
				    	cb.Name createdByGet,
				    	vt.Created_Time,
				    	vt.Alter_By,
				    	ub.Name updatedByGet,
				    	vt.Alter_Time,
                        COALESCE(vt.deleteFlag, 0) AS isDeleted
                    FROM tbl_Voucher_Type vt
                    LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = vt.Branch_Id
				    LEFT JOIN tbl_Users AS cb ON cb.UserId = vt.Created_By
				    LEFT JOIN tbl_Users AS ub ON ub.UserId = vt.Alter_By
                    WHERE 
				    	vt.Vocher_Type_Id IS NOT NULL
				    	AND TRIM(COALESCE(vt.Voucher_Code, '')) <> ''
                    ${module ? ' AND vt.Type = @module ' : ''}
                    ${isEqualNumber(showDeleted, 1) ? '' : ' AND COALESCE(vt.deleteFlag, 0) = 0 '}
                    ORDER BY vt.Voucher_Type ASC;`
                );

            const result = await request;
            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    };

    const getVoucherTypeDropDown = async (req, res) => {
        try {
            const { module, showDeleted = 0 } = req.query;

            const request = new sql.Request()
                .input('module', module)
                .query(`
                    SELECT 
                        vt.Vocher_Type_Id value,
                        vt.Voucher_Type label,
                        vt.Voucher_Code code,
                        vt.Branch_Id branchId,
                        vt.Type type
                    FROM tbl_Voucher_Type vt
                    WHERE 
				    	vt.Vocher_Type_Id IS NOT NULL
				    	AND TRIM(COALESCE(vt.Voucher_Code, '')) <> ''
                    ${module ? ' AND vt.Type = @module ' : ''}
                    ${isEqualNumber(showDeleted, 1) ? '' : ' AND COALESCE(vt.deleteFlag, 0) = 0 '}
                    ORDER BY vt.Voucher_Type ASC;`
                );

            const result = await request;
            sentData(res, result.recordset);
        } catch (e) {
            servError(e, res);
        }
    };

    const addVoucherType = async (req, res) => {

        const { Voucher_Type, Voucher_Code, Branch_Id, Type, Created_By, tallySync,status } = req.body;

        if (!Voucher_Type || !checkIsNumber(Branch_Id) || !Type || !Voucher_Code) {
            return invalidInput(res, 'Voucher_Type and Branch_Id,Voucher_Code are required');
        }

        // Convert frontend boolean → DB value (0=Yes,1=No)
        const tally_sync = (tallySync == true || tallySync == "true") ? 0 : 1;

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

            const Alter_Id = randomNumber();
            const request = new sql.Request()
                .input('Vocher_Type_Id', Voucher_Type_Id)
                .input('Voucher_Type', Voucher_Type)
                .input('Voucher_Code', Voucher_Code)
                .input('Branch_Id', Branch_Id)
                .input('Type', Type)
                .input('Alter_Id', Alter_Id)
                .input('Created_By', Created_By)
                .input('Created_Time', new Date())
                .input('tally_sync', tally_sync)
                .input('status',status)
                .query(`
                    INSERT INTO tbl_Voucher_Type (
                        Vocher_Type_Id, Voucher_Type, Voucher_Code, Branch_Id, Type, Alter_Id, 
                        Created_By, Created_Time, tally_sync, deleteFlag
                    ) VALUES (
                        @Vocher_Type_Id, @Voucher_Type, @Voucher_Code, @Branch_Id, @Type, @Alter_Id, 
                        @Created_By, @Created_Time, @tally_sync,@status
                    );`
                );

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'New Voucher Type Added');
            } else {
                failed(res, 'Failed to Create Voucher Type');
            }

        } catch (e) {
            servError(e, res);
        }
    };

    const editVoucherType = async (req, res) => {

        const { Vocher_Type_Id, Voucher_Type, Voucher_Code, Branch_Id, Type, Alter_By, tallySync,status } = req.body;

        if (!checkIsNumber(Vocher_Type_Id) ||
            !Voucher_Type ||
            !checkIsNumber(Branch_Id) ||
            !Type ||
            !Voucher_Code
        ) {
            return invalidInput(res, 'All fields are required and must be valid');
        }


        try {
            const Alter_Id = randomNumber();
            const result = await new sql.Request()
                .input('Vocher_Type_Id', sql.Int, Vocher_Type_Id)
                .input('Voucher_Type', sql.NVarChar, Voucher_Type)
                .input('Voucher_Code', sql.NVarChar, Voucher_Code)
                .input('Branch_Id', sql.Int, Branch_Id)
                .input('Type', sql.NVarChar, Type)
                .input('Alter_Id', Alter_Id)
                .input('Alter_By', Alter_By)
                .input('Alter_Time', new Date())
                .input('tally_sync', tallySync)
                .input('deleteFlag', status)
                .query(`
                UPDATE tbl_Voucher_Type 
                SET 
                    Voucher_Type = @Voucher_Type, 
                    Branch_Id = @Branch_Id,
                    Voucher_Code = @Voucher_Code,
                    Type = @Type,
                    Alter_Id = @Alter_Id,
                    Alter_By = @Alter_By,
                    Alter_Time = @Alter_Time,
                    tally_sync = @tally_sync,
                    deleteFlag = @deleteFlag
                WHERE Vocher_Type_Id = @Vocher_Type_Id
            `);

            if (result.rowsAffected[0] > 0) {
                success(res, 'Voucher updated successfully');
            } else {
                failed(res, 'No voucher found with the provided ID');
            }

        } catch (e) {
            servError(e, res);
        }
    };

    const deleteVoucherType = async (req, res) => {
        const { Vocher_Type_Id } = req.body;
        if (!checkIsNumber(Vocher_Type_Id)) {
            return invalidInput(res, 'Vocher_Type_Id is required')
        }

        try {
            const request = new sql.Request()
                .input('Vocher_Type_Id', Vocher_Type_Id)
                .query(`
                    UPDATE tbl_Voucher_Type 
                    SET deleteFlag = 1
                    WHERE Vocher_Type_Id = @Vocher_Type_Id`
                )

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Voucher type deleted successfully');
            } else {
                failed(res, 'No voucher found with the provided ID');
            }

        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getVoucherType,
        addVoucherType,
        editVoucherType,
        deleteVoucherType,
        getVoucherTypeDropDown
    }
}

export default voucherType();