import sql from 'mssql';
import { servError } from '../../res.mjs';


const StockJournal = () => {

    const createStockJournal = async (req, res) => {
        try {
            const { val } = req.query;
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        createStockJournal
    }
}

export default StockJournal();