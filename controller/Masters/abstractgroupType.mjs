import sql from 'mssql';
import {
    servError,
    failed,
    success,
    invalidInput,
    sentData
} from '../../res.mjs';

const abstractGroup = () => {

    const getAbstractGroup = async (req, res) => {
        try {

            const request = new sql.Request();

            const result = await request.query(`
                SELECT
                    a.ABS_Group_Id,
                    a.ABS_Group,
                    a.Group_Type,
                    a.Voucher_Id,
                    b.Voucher_Type
                FROM tbl_Abstract_Group_Type a
                LEFT JOIN tbl_Voucher_Type b
                    ON a.Voucher_Id = b.Vocher_Type_Id
                ORDER BY a.ABS_Group_Id ASC
            `);

            sentData(res, result.recordset);

        } catch (error) {
            servError(error, res);
        }
    };

    const getVoucherDropdown = async (req, res) => {
        try {

            const request = new sql.Request();

            const result = await request.query(`
                SELECT
                    Vocher_Type_Id AS value,
                    Voucher_Type AS label
                FROM tbl_Voucher_Type
                ORDER BY Voucher_Type ASC
            `);

            sentData(res, result.recordset);

        } catch (error) {
            servError(error, res);
        }
    };

    const createAbstractGroup = async (req, res) => {
        try {

            const {
                ABS_Group,
                Group_Type,
                Voucher_Id
            } = req.body;

            if (!ABS_Group) {
                return invalidInput(res, 'ABS_Group');
            }

            if (!Group_Type) {
                return invalidInput(res, 'Group_Type');
            }

            if (!Voucher_Id) {
                return invalidInput(res, 'Voucher_Id');
            }

            const getMaxIdRequest = new sql.Request();

            const maxIdResult = await getMaxIdRequest.query(`
                SELECT ISNULL(MAX(ABS_Group_Id), 0) + 1 AS NextId
                FROM tbl_Abstract_Group_Type
            `);

            const ABS_Group_Id =
                maxIdResult.recordset[0].NextId;

            const insertRequest = new sql.Request()
                .input('ABS_Group_Id', ABS_Group_Id)
                .input('ABS_Group', ABS_Group)
                .input('Group_Type', Group_Type)
                .input('Voucher_Id', Voucher_Id);

            await insertRequest.query(`
                INSERT INTO tbl_Abstract_Group_Type (
                    ABS_Group_Id,
                    ABS_Group,
                    Group_Type,
                    Voucher_Id
                )
                VALUES (
                    @ABS_Group_Id,
                    @ABS_Group,
                    @Group_Type,
                    @Voucher_Id
                )
            `);

            success(res, 'Abstract Group created successfully.');

        } catch (error) {
            servError(error, res);
        }
    };

    const updateAbstractGroup = async (req, res) => {
        try {

            const {
                ABS_Group_Id,
                ABS_Group,
                Group_Type,
                Voucher_Id
            } = req.body;

            if (!ABS_Group_Id) {
                return invalidInput(res, 'ABS_Group_Id');
            }

            if (!ABS_Group) {
                return invalidInput(res, 'ABS_Group');
            }

            if (!Group_Type) {
                return invalidInput(res, 'Group_Type');
            }

            if (!Voucher_Id) {
                return invalidInput(res, 'Voucher_Id');
            }

            const request = new sql.Request()
                .input('ABS_Group_Id', ABS_Group_Id)
                .input('ABS_Group', ABS_Group)
                .input('Group_Type', Group_Type)
                .input('Voucher_Id', Voucher_Id);

            await request.query(`
                UPDATE tbl_Abstract_Group_Type
                SET
                    ABS_Group = @ABS_Group,
                    Group_Type = @Group_Type,
                    Voucher_Id = @Voucher_Id
                WHERE ABS_Group_Id = @ABS_Group_Id
            `);

            success(res, 'Abstract Group updated successfully.');

        } catch (error) {
            servError(error, res);
        }
    };

    const deleteAbstractGroup = async (req, res) => {
        try {

            const { ABS_Group_Id } = req.body;

            if (!ABS_Group_Id) {
                return invalidInput(
                    res,
                    'ABS_Group_Id is required'
                );
            }

            const request = new sql.Request()
                .input('ABS_Group_Id', ABS_Group_Id);

            const result = await request.query(`
                DELETE FROM tbl_Abstract_Group_Type
                WHERE ABS_Group_Id = @ABS_Group_Id
            `);

            if (result.rowsAffected[0] === 0) {
                return failed(res, 'No Data Found');
            }

            success(
                res,
                'Abstract Group deleted successfully.'
            );

        } catch (error) {
            servError(error, res);
        }
    };

    return {
        getAbstractGroup,
        getVoucherDropdown,
        createAbstractGroup,
        updateAbstractGroup,
        deleteAbstractGroup
    };
};

export default abstractGroup();