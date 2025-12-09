import sql from 'mssql';
import { Addition, checkIsNumber, createPadString, isEqualNumber, ISOString, Multiplication, RoundNumber, stringCompare, toArray, toNumber } from '../../../helper_functions.mjs';
import { invalidInput, servError, dataFound, noData, sentData, success } from '../../../res.mjs';
import { getNextId, getProducts } from '../../../middleware/miniAPIs.mjs';
import { calculateGSTDetails } from '../../../middleware/taxCalculator.mjs';

const getSalesInvoiceForAssignCostCenter = async (req, res) => {
    try {
        const reqDate = req.query.reqDate ? ISOString(req.query.reqDate) : ISOString();

        const getSalesInvoice = new sql.Request()
            .input('reqDate', sql.Date, reqDate)
            .query(``);

        const result = await getSalesInvoice;

        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
}