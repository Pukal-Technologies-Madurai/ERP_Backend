import { ISOString } from "../../helper_functions.mjs";
import { sentData, servError } from "../../res.mjs";
import sql from 'mssql';

const TallyStockBasedControll = () => {

    const getTallyStockData = async (req, res) => {
        
        try {
            const { db } = req;
            const Fromdate = ISOString(req?.query?.Fromdate);
            const Todate = ISOString(req?.query?.Todate);
            const request = new sql.Request(db)
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    SELECT 
                        * 
                    FROM 
                        stock_journal_geninfo_ob 
                    WHERE 
                        stock_journal_date >= @Fromdate 
                        AND stock_journal_date <= @Todate
                    `);

            const result = await request;

            sentData(res, result.recordset);

        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getTallyStockData,
    }
}

export default TallyStockBasedControll();