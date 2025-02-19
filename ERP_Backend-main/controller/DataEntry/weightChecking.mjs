import sql from 'mssql'
import { servError, dataFound, noData, success, failed, invalidInput } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';


const WGCheckController = () => {

    const getWGChecking = async (req, res) => {
        const { reqDate, reqLocation } = req.query;

        if (!reqLocation) {
            return invalidInput(res, 'reqLocation is required');
        }

        try {
            const request = new sql.Request()
                .input('reqDate', reqDate)
                .input('reqLocation', reqLocation)
                .query(`
                    SELECT
                    	ud.*
                    FROM 
                    	tbl_WeightCheckActivity AS ud
                    WHERE
                    	ud.EntryDate = @reqDate
                    	AND
                    	ud.LocationDetails = @reqLocation
                    ORDER BY
                        ud.EntryAt`)

            const result = await request;

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const addWGCheckActivity = async (req, res) => {
        const { EntryDate, LocationDetails, StockItem, StartTime, EndTime, InputKG, OutputKG, WeingtCheckedBy, ApproximateOutput, EntryBy } = req.body;

        if (!LocationDetails || !StockItem || !StartTime || !checkIsNumber(InputKG) || !checkIsNumber(EntryBy)) {
            return invalidInput(res, 'LocationDetails, StockItem, StartTime, InputKG, EntryBy is required')
        }

        try {
            const request = new sql.Request()
                .input('EntryDate', EntryDate ? EntryDate : new Date())
                .input('LocationDetails', LocationDetails)
                .input('StockItem', StockItem)
                .input('StartTime', StartTime)
                .input('EndTime', EndTime ? EndTime : '')
                .input('InputKG', InputKG ? InputKG : 0)
                .input('OutputKG', OutputKG ? OutputKG : 0)
                .input('WeingtCheckedBy', WeingtCheckedBy)
                .input('ApproximateOutput', ApproximateOutput ? ApproximateOutput : '0')
                .input('EntryBy', EntryBy)
                .query(`
                    INSERT INTO tbl_WeightCheckActivity
                        (EntryDate, LocationDetails, StockItem, StartTime, EndTime, InputKG, OutputKG, WeingtCheckedBy, ApproximateOutput, EntryBy)
                    VALUES
                        (@EntryDate, @LocationDetails, @StockItem, @StartTime, @EndTime, @InputKG, @OutputKG, @WeingtCheckedBy, @ApproximateOutput, @EntryBy)`)

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Records Saved')
            } else {
                failed(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const editWGCheckActivity = async (req, res) => {
        const { Id, EntryDate, LocationDetails, StockItem, StartTime, EndTime, InputKG, OutputKG, WeingtCheckedBy, ApproximateOutput, EntryBy } = req.body;

        if (!checkIsNumber(Id) || !LocationDetails || !StockItem || !StartTime || !checkIsNumber(InputKG) || !checkIsNumber(EntryBy)) {
            return invalidInput(res, 'Id, LocationDetails, StockItem, StartTime, InputKG, EntryBy is required')
        }

        try {
            const request = new sql.Request()
                .input('Id', Id)
                .input('EntryDate', EntryDate ? EntryDate : new Date())
                .input('LocationDetails', LocationDetails)
                .input('StockItem', StockItem)
                .input('StartTime', StartTime)
                .input('EndTime', EndTime ? EndTime : '')
                .input('InputKG', InputKG ? InputKG : 0)
                .input('OutputKG', OutputKG ? OutputKG : 0)
                .input('WeingtCheckedBy', WeingtCheckedBy)
                .input('ApproximateOutput', ApproximateOutput ? ApproximateOutput : '0')
                .input('EntryBy', EntryBy)
                .query(`
                    UPDATE
                        tbl_WeightCheckActivity
                    SET
                        EntryDate = @EntryDate,
                        LocationDetails = @LocationDetails,
                        StockItem = @StockItem,
                        StartTime = @StartTime,
                        EndTime = @EndTime,
                        InputKG = @InputKG,
                        OutputKG = @OutputKG,
                        WeingtCheckedBy = @WeingtCheckedBy,
                        ApproximateOutput = @ApproximateOutput,
                        EntryBy = @EntryBy
                    WHERE
                        Id = @Id
                    `)

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Changes Saved');
            } else {
                failed(res)
            }

        } catch (e) {
            servError(e, res);
        }
    }

    const getStaffs = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`SELECT DISTINCT WeingtCheckedBy FROM tbl_WeightCheckActivity`)
            
            const result = await request;

            if (result.recordset.length) {
                dataFound(res, result.recordset);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getItems = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`SELECT DISTINCT StockItem FROM tbl_WeightCheckActivity`)
            
            const result = await request;

            if (result.recordset.length) {
                dataFound(res, result.recordset);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getWGChecking,
        addWGCheckActivity,
        editWGCheckActivity,
        getStaffs,
        getItems,
    }

}

export default WGCheckController()