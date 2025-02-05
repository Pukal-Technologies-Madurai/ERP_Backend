import { ISOString } from '../../helper_functions.mjs';
import SPCall from '../../middleware/SPcall.mjs';
import { dataFound, noData, sentData, servError } from '../../res.mjs';

const SalesEntry = () => {

    const partyWiseSalesReport = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const result = await SPCall({
                spParamerters: {
                    Fromdate, Todate
                }, SPName: 'Party_Wise_Live_Sales_Report_1', spTransaction: req?.db
            });

            if (result.recordset.length > 0) {
                dataFound(res, result.recordsets[0], 'dataFound', { dataTypeInfo: result.recordsets[1] ?? [] })
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const partyDetailsReport = async (req, res) => {
        const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();
        const Party_Name = req.query.Party_Name ?? '';

        try {

            const result = await SPCall({
                spParamerters: {
                    Fromdate, Todate, Party_Name
                }, SPName: 'Party_Wise_Live_Sales_Report_2', spTransaction: req?.db
            });

            if (result.recordset.length > 0) {
                dataFound(res, result.recordsets[0], 'dataFound', { dataTypeInfo: result.recordsets[1] ?? [] })
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    return {
        partyWiseSalesReport,
        partyDetailsReport,
    }
}

export default SalesEntry();