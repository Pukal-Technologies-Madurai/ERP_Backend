import sql from 'mssql'
import { failed, servError } from '../res.mjs';

const authenticateToken = async (req, res, next) => {

    try {
        const clientToken = req.header('Authorization');

        if (!clientToken) {
            return failed(res, 'Failed to authorize');
        }

        const request = new sql.Request()
            .input('clientToken', clientToken)
            .query(`SELECT 1 FROM tbl_Users WHERE Autheticate_Id = @clientToken`)

        const result = await request;

        if (result.recordset.length > 0) {
            next();
        } else {
            return res.status(403).json({ data: [], message: 'Forbidden', success: false });
        }

    } catch (e) {
        return servError(e, res);
    }

};

export default authenticateToken;
