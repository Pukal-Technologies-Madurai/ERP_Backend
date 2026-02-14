import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput } from '../../res.mjs';
import { checkIsNumber, isEqualNumber, ISOString, toArray, toNumber } from '../../helper_functions.mjs'

const ArrivalMaster = () => {

    const getArrivalEntry = async (req, res) => {
        try {
            const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();
            const FromGodown = checkIsNumber(req?.query?.FromGodown) ? req?.query?.FromGodown : null;
            const ToGodown = checkIsNumber(req?.query?.ToGodown) ? req?.query?.ToGodown : null;
            const ProductId = checkIsNumber(req?.query?.ProductId) ? req?.query?.ProductId : null;
            const converted = isEqualNumber(req?.query?.convertedStatus, 1);
            const notConverted = isEqualNumber(req?.query?.convertedStatus, 0);

            const request = new sql.Request()
                .input('Fromdate', sql.Date, Fromdate)
                .input('Todate', sql.Date, Todate)
                .input('FromGodown', sql.Int, FromGodown)
                .input('ToGodown', sql.Int, ToGodown)
                .input('ProductId', sql.Int, ProductId)
                .query(`
                    SELECT 
    	                td.*,
		                pm.Product_Name,
                        COALESCE(gm_from.Godown_Name, 'Unknown') AS FromLocation,
                        COALESCE(gm_to.Godown_Name, 'Unknown') AS ToLocation,
                        ttc.Arrival_Id, 
                        COALESCE ((
                            SELECT TOP (1) 1
                            FROM tbl_PurchaseOrderDeliveryDetails 
                            WHERE Trip_Item_SNo = td.Arr_Id
                        ), 0) AS ConvertedAsOrder, 
                        COALESCE ((
                            SELECT TOP (1) 1
                            FROM tbl_Purchase_Order_Inv_Stock_Info 
                            WHERE DeliveryId = td.Arr_Id
                        ), 0) AS ConvertedAsInvoice
                    FROM tbl_Trip_Arrival AS td
                    LEFT JOIN tbl_Product_Master AS pm
                        ON pm.Product_Id = td.Product_Id
                    LEFT JOIN tbl_Godown_Master AS gm_from
                        ON gm_from.Godown_Id = td.From_Location
                    LEFT JOIN tbl_Godown_Master AS gm_to
                        ON gm_to.Godown_Id = td.To_Location
                    LEFT JOIN tbl_Trip_Details AS ttc
                        ON ttc.Arrival_Id =  td.Arr_Id
                    WHERE 
		                td.Arrival_Date BETWEEN @Fromdate AND @Todate
                        ${FromGodown ? ' AND td.From_Location = @FromGodown ' : ''}
                        ${ToGodown ? ' AND td.To_Location = @ToGodown ' : ''}
                        ${ProductId ? ' AND td.Product_Id = @ProductId ' : ''}
                        ${converted ? ' AND ttc.Arrival_Id IS NOT NULL ' : ''}
                        ${notConverted ? ' AND ttc.Arrival_Id IS NULL ' : ''}
                        `
                );

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

    const addArrivalEntry = async (req, res) => {
        try {
            const {
                Batch_No, From_Location, To_Location, Concern, BillNo, BatchLocation, Arrival_Date,
                Product_Id, HSN_Code, QTY, KGS, Gst_Rate, Unit_Id, Units, Total_Value,
                GST_Inclusive, IS_IGST, Gst_P, Cgst_P, Sgst_P, Igst_P, Taxable_Value, Round_off,
                Created_By
            } = req.body;

            if (!checkIsNumber(Product_Id)) {
                return invalidInput(res, 'Product is required');
            }

            const Arr_Id = Number((await new sql.Request()
                .query(`
                    SELECT COALESCE(MAX(Arr_Id), 0) AS Arr_Id
                    FROM tbl_Trip_Arrival`
                ))?.recordset[0]?.Arr_Id) + 1;

            if (!checkIsNumber(Arr_Id)) throw new Error('Failed to get Arr_Id');

            const request = new sql.Request()
                .input('Arr_Id', Arr_Id)
                .input('Arrival_Date', Arrival_Date ? ISOString(Arrival_Date) : ISOString())
                .input('Batch_No', Batch_No)
                .input('From_Location', toNumber(From_Location))
                .input('To_Location', toNumber(To_Location))
                .input('Concern', Concern)
                .input('BillNo', BillNo)
                .input('BatchLocation', BatchLocation)
                .input('Product_Id', toNumber(Product_Id))
                .input('HSN_Code', HSN_Code)
                .input('QTY', toNumber(QTY))
                .input('KGS', toNumber(KGS))
                .input('Gst_Rate', toNumber(Gst_Rate))
                .input('Unit_Id', toNumber(Unit_Id))
                .input('Units', Units)
                .input('Total_Value', toNumber(Total_Value))
                .input('GST_Inclusive', toNumber(GST_Inclusive))
                .input('IS_IGST', toNumber(IS_IGST))
                .input('Gst_P', toNumber(Gst_P))
                .input('Cgst_P', toNumber(Cgst_P))
                .input('Sgst_P', toNumber(Sgst_P))
                .input('Igst_P', toNumber(Igst_P))
                .input('Taxable_Value', toNumber(Taxable_Value))
                .input('Round_off', toNumber(Round_off))
                .input('Created_By', toNumber(Created_By))
                .query(`
                    INSERT INTO tbl_Trip_Arrival (
                        Arr_Id, Arrival_Date, From_Location, To_Location, Concern, BillNo, BatchLocation,
                        Product_Id, HSN_Code, QTY, KGS, Gst_Rate, Unit_Id, Units, Total_Value, 
                        GST_Inclusive, IS_IGST, Gst_P, Cgst_P, Sgst_P, Igst_P, Taxable_Value, Round_off,
                        Created_By
                    ) VALUES (
                        @Arr_Id, @Arrival_Date, @From_Location, @To_Location, @Concern, @BillNo, @BatchLocation,
                        @Product_Id, @HSN_Code, @QTY, @KGS, @Gst_Rate, @Unit_Id, @Units, @Total_Value, 
                        @GST_Inclusive, @IS_IGST, @Gst_P, @Cgst_P, @Sgst_P, @Igst_P, @Taxable_Value, @Round_off,
                        @Created_By
                    )`
                );

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Arrival Saved');
            } else {
                failed(res, 'Failed to save')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const editArrivalEntry = async (req, res) => {
        try {
            const {
                Arr_Id, Batch_No, From_Location, To_Location, Concern, BillNo, BatchLocation, Arrival_Date,
                Product_Id, HSN_Code, QTY, KGS, Gst_Rate, Unit_Id, Units, Total_Value,
                GST_Inclusive, IS_IGST, Gst_P, Cgst_P, Sgst_P, Igst_P, Taxable_Value, Round_off,
                Updated_By
            } = req.body;

            if (!checkIsNumber(Arr_Id) || !checkIsNumber(Product_Id)) {
                return invalidInput(res, 'Product is required');
            }

            const request = new sql.Request()
                .input('Arr_Id', Arr_Id)
                .input('Arrival_Date', Arrival_Date ? ISOString(Arrival_Date) : ISOString())
                // .input('Batch_No', Batch_No)
                .input('From_Location', toNumber(From_Location))
                .input('To_Location', toNumber(To_Location))
                .input('Concern', Concern)
                .input('BillNo', BillNo)
                .input('BatchLocation', BatchLocation)
                .input('Product_Id', toNumber(Product_Id))
                .input('HSN_Code', HSN_Code)
                .input('QTY', toNumber(QTY))
                .input('KGS', toNumber(KGS))
                .input('Gst_Rate', toNumber(Gst_Rate))
                .input('Unit_Id', toNumber(Unit_Id))
                .input('Units', Units)
                .input('Total_Value', toNumber(Total_Value))
                .input('GST_Inclusive', toNumber(GST_Inclusive))
                .input('IS_IGST', toNumber(IS_IGST))
                .input('Gst_P', toNumber(Gst_P))
                .input('Cgst_P', toNumber(Cgst_P))
                .input('Sgst_P', toNumber(Sgst_P))
                .input('Igst_P', toNumber(Igst_P))
                .input('Taxable_Value', toNumber(Taxable_Value))
                .input('Round_off', toNumber(Round_off))
                .input('Updated_By', toNumber(Updated_By))
                .query(`
                    UPDATE tbl_Trip_Arrival
                    SET 
                        Arrival_Date = @Arrival_Date, 
                        --Batch_No = @Batch_No, 
                        From_Location = @From_Location, 
                        To_Location = @To_Location, 
                        Concern = @Concern, 
                        BillNo = @BillNo, 
                        BatchLocation = @BatchLocation,
                        Product_Id = @Product_Id, 
                        HSN_Code = @HSN_Code, 
                        QTY = @QTY, 
                        KGS = @KGS, 
                        Gst_Rate = @Gst_Rate, 
                        Unit_Id = @Unit_Id, 
                        Units = @Units, 
                        Total_Value = @Total_Value, 
                        GST_Inclusive = @GST_Inclusive, 
                        IS_IGST = @IS_IGST, 
                        Gst_P = @Gst_P, 
                        Cgst_P = @Cgst_P, 
                        Sgst_P = @Sgst_P, 
                        Igst_P = @Igst_P, 
                        Taxable_Value = @Taxable_Value, 
                        Round_off = @Round_off,
                        Updated_By = @Updated_By
                    WHERE
                        Arr_Id = @Arr_Id;`
                );

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Arrival Saved');
            } else {
                failed(res, 'Failed to save')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const addBulkArrivalEntry = async (req, res) => {
        try {
            const body = req.body;

            if (!Array.isArray(body) || body.length === 0) {
                return invalidInput(res, 'Invalid Payload');
            }

            const request = new sql.Request()
                .input('json', sql.NVarChar(sql.MAX), JSON.stringify(body))
                .query(`
                    INSERT INTO tbl_Trip_Arrival (
                        Arr_Id, Arrival_Date, From_Location, To_Location, Concern, BillNo, BatchLocation,
                        Product_Id, HSN_Code, QTY, KGS, Gst_Rate, Unit_Id, Units, Total_Value, 
                        GST_Inclusive, IS_IGST, Gst_P, Cgst_P, Sgst_P, Igst_P, Taxable_Value, Round_off,
                        Created_By
                    ) 
                    SELECT 
                        (ISNULL((SELECT MAX(Arr_Id) FROM tbl_Trip_Arrival), 0) + ROW_NUMBER() OVER (ORDER BY (SELECT NULL))),
                        Arrival_Date, From_Location, To_Location, Concern, BillNo, BatchLocation,
                        Product_Id, HSN_Code, QTY, KGS, Gst_Rate, Unit_Id, Units, Total_Value, 
                        GST_Inclusive, IS_IGST, Gst_P, Cgst_P, Sgst_P, Igst_P, Taxable_Value, Round_off,
                        Created_By
                    FROM OPENJSON(@json) WITH (
                        Arrival_Date DATE, 
                        From_Location INT, 
                        To_Location INT, 
                        Concern NVARCHAR(MAX), 
                        BillNo NVARCHAR(MAX), 
                        BatchLocation NVARCHAR(MAX),
                        Product_Id INT, 
                        HSN_Code NVARCHAR(MAX), 
                        QTY DECIMAL(18, 3), 
                        KGS DECIMAL(18, 3), 
                        Gst_Rate DECIMAL(18, 2), 
                        Unit_Id INT, 
                        Units NVARCHAR(MAX), 
                        Total_Value DECIMAL(18, 2), 
                        GST_Inclusive BIT, 
                        IS_IGST BIT, 
                        Gst_P DECIMAL(18, 2), 
                        Cgst_P DECIMAL(18, 2), 
                        Sgst_P DECIMAL(18, 2), 
                        Igst_P DECIMAL(18, 2), 
                        Taxable_Value DECIMAL(18, 2), 
                        Round_off DECIMAL(18, 2),
                        Created_By INT
                    )`
                );

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Arrival Saved');
            } else {
                failed(res, 'Failed to save')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getArrivalFilters = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    SELECT DISTINCT td.Product_Id AS value, pm.Product_Name AS label
                    FROM tbl_Trip_Arrival AS td
                    LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = td.Product_Id;

                    SELECT DISTINCT td.From_Location AS value, gm.Godown_Name AS label
                    FROM tbl_Trip_Arrival AS td
                    LEFT JOIN tbl_Godown_Master AS gm ON gm.Godown_Id = td.From_Location;

                    SELECT DISTINCT td.To_Location AS value, gm.Godown_Name AS label
                    FROM tbl_Trip_Arrival AS td
                    LEFT JOIN tbl_Godown_Master AS gm ON gm.Godown_Id = td.To_Location;
                `);

            const result = await request;

            dataFound(res, [], 'data found', {
                products: toArray(result.recordsets[0]),
                fromLocations: toArray(result.recordsets[1]),
                toLocations: toArray(result.recordsets[2])
            });
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getArrivalEntry,
        addArrivalEntry,
        editArrivalEntry,
        addBulkArrivalEntry,
        getArrivalFilters
    }
}

export default ArrivalMaster();