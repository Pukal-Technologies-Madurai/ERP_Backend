import sql from 'mssql';
import { servError, sentData } from '../../res.mjs'
import { ISOString } from '../../helper_functions.mjs';


const getStorageStockItemWise = async (req, res) => {
    try {
        const
            Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString(),
            Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();
            
        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .input('Stock_Group_Id', 0)
            .input('Item_Id', 0)
            .execute('Stock_Summarry_Search');

        const result = await request;

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
}

export default {
    getStorageStockItemWise,
}