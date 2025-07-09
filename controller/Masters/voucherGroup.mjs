import sql from 'mssql'
import { servError, sentData } from '../../res.mjs';


const voucherGroup = () => {

    const getVoucherGroupDropdown = async (req, res) => {

        try {
            const group = (await new sql.Request()
                .query(`
                    SELECT *
                    FROM tbl_Voucher_Group;`
                )
            ).recordset;

            sentData(res, group);

        } catch (e) {
            servError(e, res)
        }
    }

    return {
        getVoucherGroupDropdown

    }
}

export default voucherGroup();