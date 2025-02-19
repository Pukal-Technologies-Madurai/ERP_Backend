import sql from 'mssql'
import { servError, dataFound, noData, success, failed, invalidInput } from '../../res.mjs';
import { LocalDateTime } from '../../helper_functions.mjs';


const GodownActivity = () => {

    const getGodownActivity = async (req, res) => {

        const { Fromdate, Todate, LocationDetails } = req.query;

        if (!LocationDetails) {
            return invalidInput(res, 'LocationDetails is required');
        }

        try {
            const request = new sql.Request()
                .input('Fromdate', Fromdate ? Fromdate : new Date())
                .input('Todate', Todate ? Todate : new Date())
                .input('LocationDetails', LocationDetails)
                .query(`
                    SELECT 
                        DISTINCT ud.EntryDate AS EntryDate,

                        COALESCE((
                            SELECT 
                                *,
                                (Purchase + OtherGodown + PurchaseTransfer) AS PurchaseTotal,
                                (LorryShed + VandiVarum + DDSales + SalesTransfer + SalesOtherGodown) AS SalesTotal,
                                (LorryShed + VandiVarum + DDSales) AS SalesOnlyTotal
                            FROM
                                tbl_GodownActivity
                            WHERE
                                EntryDate = ud.EntryDate
                                AND
                                CONVERT(DATE, EntryDate) >= CONVERT(DATE, @Fromdate)
                                AND
                                CONVERT(DATE, EntryDate) <= CONVERT(DATE, @Todate)
                                AND
                                LocationDetails = @LocationDetails
                            ORDER BY
                                CONVERT(DATETIME, EntryAt) DESC
                            FOR JSON PATH
                        ), '[]') AS DayEntries

                    FROM 
                        tbl_GodownActivity as ud
                    WHERE 
                        CONVERT(DATE, ud.EntryDate) >= CONVERT(DATE, @Fromdate)
                        AND
                        CONVERT(DATE, ud.EntryDate) <= CONVERT(DATE, @Todate)
                        AND
                        ud.LocationDetails = @LocationDetails
                    ORDER BY
                        CONVERT(DATE, ud.EntryDate) DESC
                    `)

            const result = await request;

            if (result.recordset.length) {
                const levelOneParse = result.recordset?.map(o => ({
                    ...o,
                    DayEntries: JSON.parse(o?.DayEntries)
                }))
                dataFound(res, levelOneParse)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const postGWActivity = async (req, res) => {

        const { 
            EntryDate, LocationDetails, Purchase, OtherGodown, PurchaseTransfer, 
            Handle, WGChecking, LorryShed, VandiVarum, DDSales, SalesTransfer, SalesOtherGodown, EntryBy 
        } = req.body;

        try {
            const request = new sql.Request()
                .input('EntryDate', EntryDate ? EntryDate : LocalDateTime())
                .input('LocationDetails', LocationDetails)
                .input('Purchase', Purchase ? Purchase : 0)
                .input('OtherGodown', OtherGodown ? OtherGodown : 0)
                .input('PurchaseTransfer', PurchaseTransfer ? PurchaseTransfer : 0)
                .input('Handle', Handle ? Handle : 0)
                .input('WGChecking', WGChecking ? WGChecking : 0)
                .input('LorryShed', LorryShed ? LorryShed : 0)
                .input('VandiVarum', VandiVarum ? VandiVarum : 0)
                .input('DDSales', DDSales ? DDSales : 0)
                .input('SalesTransfer', SalesTransfer ? SalesTransfer : 0)
                .input('SalesOtherGodown', SalesOtherGodown ? SalesOtherGodown : 0)
                .input('EntryAt', LocalDateTime())
                .input('EntryBy', EntryBy)
                .query(
                    `INSERT INTO tbl_GodownActivity (
                        EntryDate, LocationDetails, Purchase, OtherGodown, PurchaseTransfer, Handle, 
                        WGChecking, LorryShed, VandiVarum, DDSales, SalesTransfer, SalesOtherGodown, EntryAt, EntryBy
                    )
                    VALUES (
                        @EntryDate, @LocationDetails, @Purchase, @OtherGodown, @PurchaseTransfer, @Handle, 
                        @WGChecking, @LorryShed, @VandiVarum, @DDSales, @SalesTransfer, @SalesOtherGodown, @EntryAt, @EntryBy
                    )`
                )

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Success')
            } else {
                failed(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const updateGWActivity = async (req, res) => {
        const { 
            Id, EntryDate, LocationDetails, Purchase, OtherGodown, PurchaseTransfer, 
            Handle, WGChecking, LorryShed, VandiVarum, DDSales, SalesTransfer, SalesOtherGodown, EntryBy
        } = req.body;

        try {
            const request = new sql.Request()
                .input('Id', Id)
                .input('EntryDate', EntryDate)
                .input('LocationDetails', LocationDetails)
                .input('Purchase', Purchase ? Purchase : 0)
                .input('OtherGodown', OtherGodown ? OtherGodown : 0)
                .input('PurchaseTransfer', PurchaseTransfer ? PurchaseTransfer : 0)
                .input('Handle', Handle ? Handle : 0)
                .input('WGChecking', WGChecking ? WGChecking : 0)
                .input('LorryShed', LorryShed ? LorryShed : 0)
                .input('VandiVarum', VandiVarum ? VandiVarum : 0)
                .input('DDSales', DDSales ? DDSales : 0)
                .input('SalesTransfer', SalesTransfer ? SalesTransfer : 0)
                .input('SalesOtherGodown', SalesOtherGodown ? SalesOtherGodown : 0)
                .input('EntryAt', LocalDateTime())
                .input('EntryBy', EntryBy)
                .query(
                    `UPDATE 
                        tbl_GodownActivity
                    SET
                        EntryDate = @EntryDate,
                        LocationDetails = @LocationDetails,
                        Purchase = @Purchase,
                        OtherGodown = @OtherGodown,
                        PurchaseTransfer = @PurchaseTransfer,
                        Handle = @Handle,
                        WGChecking = @WGChecking,
                        LorryShed = @LorryShed,
                        VandiVarum = @VandiVarum,
                        DDSales = @DDSales,
                        SalesTransfer = @SalesTransfer,
                        SalesOtherGodown = @SalesOtherGodown,
                        EntryAt = @EntryAt,
                        EntryBy = @EntryBy
                    WHERE 
                        Id = @Id
                    `
                )

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

    const getDayAbstract = async (req, res) => {
        const { Fromdate, Todate, LocationDetails } = req.query;

        if (!LocationDetails) {
            return invalidInput(res, 'LocationDetails is required');
        }

        try {
            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .input('LocationDetails', LocationDetails)
                .query(`
                    SELECT
                        EntryDate,
                        (Sum(Purchase) + Sum(OtherGodown) + Sum(PurchaseTransfer)) AS PurchaseTotal,
                        (Sum(LorryShed) + Sum(VandiVarum) + Sum(DDSales) + Sum(SalesTransfer) + Sum(SalesOtherGodown)) AS SalesTotal,
                        (Sum(LorryShed) + Sum(VandiVarum) + Sum(DDSales) + Sum(SalesTransfer)) AS SalesOnlyTotal,
                        Sum(Purchase) AS Purchase,
                        Sum(OtherGodown) AS OtherGodown,
                        Sum(PurchaseTransfer) AS PurchaseTransfer,
                        Sum(LorryShed) AS LorryShed,
                        Sum(VandiVarum) AS VandiVarum,
                        Sum(DDSales) AS DDSales,
                        Sum(SalesTransfer) AS SalesTransfer,
                        Sum(Handle) AS Handle,
                        Sum(WGChecking) AS WGChecking,
                        (Sum(Handle) + Sum(WGChecking)) AS HandlingTotal
                    FROM
                        tbl_GodownActivity
                    WHERE
                    	CONVERT(DATE, EntryDate) >= CONVERT(DATE, @Fromdate)
                        AND
                        CONVERT(DATE, EntryDate) <= CONVERT(DATE, @Todate)
                        AND
                        LocationDetails = @LocationDetails
                    GROUP BY
                        EntryDate
                    `)

            const result = await request;

            if (result.recordset.length) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getGodownAbstract = async (req, res) => {

        const { reqDate, reqLocation } = req.query;

        if (!reqLocation) {
            return invalidInput(res, 'LocationDetails is required');
        }

        try {
            const request = new sql.Request()
                .input('reqDate', reqDate ? reqDate : new Date())
                .input('reqLocation', reqLocation)
                .query(`
                    SELECT 
                        TOP (1) 
                        EntryDate,                        
                        (Purchase + OtherGodown + PurchaseTransfer) AS PurchaseTotal,
                        (LorryShed + VandiVarum + DDSales + SalesTransfer + SalesOtherGodown) AS SalesTotal,
                        (Handle + WGChecking) AS ManagementTotal,
                        EntryAt
                    FROM 
                        tbl_GodownActivity
                    WHERE 
                        CONVERT(DATE, EntryDate) = CONVERT(DATE, @reqDate)
                        AND
                        LocationDetails = @reqLocation
                    ORDER BY
                        CONVERT(DATETIME, EntryAt) DESC
                    `)

            const result = await request;

            if (result.recordset.length) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }


    return {
        getGodownActivity,
        postGWActivity,
        updateGWActivity,
        getDayAbstract,
        getGodownAbstract,
    }

}


export default GodownActivity();