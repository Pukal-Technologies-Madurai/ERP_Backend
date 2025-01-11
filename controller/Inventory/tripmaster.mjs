
import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput } from '../../res.mjs';
import { checkIsNumber, isEqualNumber, ISOString, Subraction, Multiplication, RoundNumber, createPadString } from '../../helper_functions.mjs'
import { getNextId, getProducts } from '../../middleware/miniAPIs.mjs';

const findProductDetails = (arr = [], productid) => arr.find(obj => isEqualNumber(obj.Product_Id, productid)) ?? {};

const taxCalc = (method = 1, amount = 0, percentage = 0) => {
    switch (method) {
        case 0:
            return RoundNumber(amount * (percentage / 100));
        case 1:
            return RoundNumber(amount - (amount * (100 / (100 + percentage))));
        case 2:
            return 0;
        default:
            return 0;
    }
}


const tripActivities = () => {

    const createTripDetails = async (req, res) => {
        const {
            Branch_Id,
            Vehicle_No,
            StartTime = '',
            EndTime = '',
            Trip_No = '',
            Trip_ST_KM = '',
            Trip_EN_KM = '',
            Created_by = '',
            Product_Array = [],
            EmployeesInvolved = [],
            GST_Inclusive = 1, IS_IGST = 0
        } = req.body;

        const Trip_Date = ISOString(req.query.Trip_Date)

        if (!checkIsNumber(Branch_Id) || Trip_Date === '' || Vehicle_No === '') {
            return invalidInput(res, 'Select Branch');
        }
        if (StartTime && EndTime && new Date(StartTime) > new Date(EndTime)) {
            return invalidInput(res, 'Start Time cannot be greater than End Time');
        }
        if (Trip_ST_KM && Trip_EN_KM && Number(Trip_ST_KM) > Number(Trip_EN_KM)) {
            return invalidInput(res, 'Vehicle Start KM cannot be greater than Vehicle End KM');
        }

        const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
        const isInclusive = isEqualNumber(GST_Inclusive, 1);
        const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
        const isIGST = isEqualNumber(IS_IGST, 1);
        const transaction = new sql.Transaction();

        try {
            const productsData = (await getProducts(1)).dataArray;
            const Trip_Id = Number((await new sql.Request().query(`
            SELECT COALESCE(MAX(Trip_Id), 0) AS MaxId
            FROM tbl_Trip_Master
        `))?.recordset[0]?.MaxId) + 1;

            if (!checkIsNumber(Trip_Id)) throw new Error('Failed to get Trip Id');
            const Challan_No = createPadString(Trip_Id, 4);
            const Trip_Tot_Kms = Number(Trip_ST_KM) + Number(Trip_EN_KM);

            await transaction.begin();

            const insertMaster = await new sql.Request(transaction)
                .input('Trip_Id', Trip_Id)
                .input('Challan_No', Challan_No)
                .input('Branch_Id', Branch_Id)
                .input('Trip_Date', Trip_Date)
                .input('Vehicle_No', Vehicle_No)
                .input('StartTime', StartTime)
                .input('EndTime', EndTime)
                .input('Trip_No', Trip_No)
                .input('Trip_ST_KM', Number(Trip_ST_KM))
                .input('Trip_EN_KM', Number(Trip_EN_KM))
                .input('Trip_Tot_Kms', Trip_Tot_Kms)
                .input('Created_by', Created_by)
                .query(`
                INSERT INTO tbl_Trip_Master (
                    Trip_Id, Challan_No, Branch_Id, Trip_Date, Vehicle_No,
                    StartTime, EndTime, Trip_No, Trip_ST_KM, Trip_Tot_Kms, Trip_EN_KM, Created_by
                ) VALUES (
                    @Trip_Id, @Challan_No, @Branch_Id, @Trip_Date, @Vehicle_No,
                    @StartTime, @EndTime, @Trip_No, @Trip_ST_KM, @Trip_EN_KM, @Trip_Tot_Kms, @Created_by
                );
            `);

            if (insertMaster.rowsAffected[0] === 0) {
                throw new Error('Failed to insert into Trip Master');
            }

            let Total_Invoice_value = 0;
            let totalValueBeforeTax = {
                TotalValue: 0,
                TotalTax: 0
            };




            for (let i = 0; i < Product_Array.length; i++) {

                const itemRate = RoundNumber(Product_Array[i]?.Item_Rate);
                const billQty = parseInt(Product_Array[i]?.QTY);
                const roundedAmount = RoundNumber(Multiplication(billQty, itemRate));

                if (isInclusive || isNotTaxableBill) {
                    Total_Invoice_value += Number(roundedAmount);
                }

                if (isExclusiveBill) {
                    const product = findProductDetails(productsData, Product_Array[i]?.Item_Id);
                    const gstPercentage = isEqualNumber(IS_IGST, 1) ? product.Igst_P : product.Gst_P;
                    const tax = taxCalc(0, itemRate, gstPercentage);
                    Total_Invoice_value += (roundedAmount + (tax * billQty));
                }


                let decimalPart = Total_Invoice_value - Math.floor(Total_Invoice_value);
                let roundOff = 0;
                let roundedTotal = 0;

                if (decimalPart >= 0.01 && decimalPart < 0.1) {
                    roundedTotal = Math.floor(Total_Invoice_value);
                    roundOff = (Total_Invoice_value - roundedTotal).toFixed(2);
                } else if (decimalPart >= 0.1 && decimalPart <= 0.5) {

                    roundedTotal = Math.round(Total_Invoice_value);
                    roundOff = (Total_Invoice_value - roundedTotal).toFixed(2);
                } else if (decimalPart > 0.5) {

                    roundedTotal = Math.ceil(Total_Invoice_value);
                    roundOff = (Total_Invoice_value - roundedTotal).toFixed(2);
                }



                const Round_off = Total_Invoice_value - (totalValueBeforeTax.TotalValue + totalValueBeforeTax.TotalTax);
                const product = Product_Array[i];
                const productDetails = findProductDetails(productsData, product.Product_Id);

                const Gst_Rate = productDetails.Gst_P || 0;
                const Amount = product.QTY * product.Item_Rate;
                const tax = (Amount * Gst_Rate) / 100;


                totalValueBeforeTax.TotalValue += Amount;
                totalValueBeforeTax.TotalTax += tax;

                const result = await new sql.Request(transaction)
                    .input('Trip_Id', Trip_Id)
                    .input('STJ_Id', product.STJ_Id)
                    .input('Batch_No', product.Batch_No)
                    .input('From_Location', product.From_Location)
                    .input('To_Location', product.To_Location)
                    .input('S_No', i + 1)
                    .input('Reason', product.Reason)
                    .input('Product_Id', product.Product_Id)
                    .input('HSN_Code', product.HSN_Code)
                    .input('QTY', product.QTY)
                    .input('KGS', product.KGS)
                    .input('GST_Inclusive', GST_Inclusive)
                    .input('IS_IGST', IS_IGST)
                    .input('Gst_Rate', Gst_Rate)
                    .input('Gst_P', productDetails?.Gst_P || 0)
                    .input('Cgst_P', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                    .input('Sgst_P', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                    .input('Igst_P', isIGST ? totalValueBeforeTax.TotalTax : 0)
                    .input('Taxable_Value', Amount)
                    .input('Round_off', roundOff)
                    .input('Total_Value', roundedTotal)
                    .input('Trip_From', product.Trip_From)
                    .input('Party_And_Branch_Id', product.Party_And_Branch_Id)
                    .input('Transporter_Id', product.Transporter_Id)
                    .input('Dispatch_Date', product.Dispatch_Date)
                    .input('Delivery_Date', product.Delivery_Date)
                    .input('Created_By', Created_by)
                    .query(`
                    INSERT INTO tbl_Trip_Details (
                        Trip_Id, STJ_Id,Batch_No,From_Location, To_Location, S_No, Reason, Product_Id,
                        HSN_Code, QTY, KGS, GST_Inclusive, IS_IGST, Gst_Rate, Gst_P, Cgst_P, Sgst_P, Igst_P, Taxable_Value,
                        Round_off, Total_Value, Trip_From, Party_And_Branch_Id, Transporter_Id,
                        Dispatch_Date, Delivery_Date, Created_By
                    ) VALUES (
                        @Trip_Id,@STJ_Id,@Batch_No, @From_Location, @To_Location, @S_No, @Reason, @Product_Id,
                        @HSN_Code, @QTY, @KGS, @GST_Inclusive, @IS_IGST, @Gst_Rate, @Gst_P, @Cgst_P, @Sgst_P, @Igst_P, @Taxable_Value,
                        @Round_off, @Total_Value, @Trip_From, @Party_And_Branch_Id, @Transporter_Id,
                        @Dispatch_Date, @Delivery_Date,  @Created_By
                    );
                `);

                if (result.rowsAffected[0] === 0) throw new Error('Failed to insert into Trip Details');
            }

            for (let i = 0; i < EmployeesInvolved.length; i++) {
                const employee = EmployeesInvolved[i];
                const employeeData = await new sql.Request(transaction)
                    .input('Trip_Id', Trip_Id)
                    .input('Involved_Emp_Id', employee.Involved_Emp_Id)
                    .input('Cost_Center_Type_Id', employee.Cost_Center_Type_Id)
                    .query(`
                    INSERT INTO tbl_Trip_Employees (Trip_Id, Involved_Emp_Id, Cost_Center_Type_Id)
                    VALUES (@Trip_Id, @Involved_Emp_Id, @Cost_Center_Type_Id);
                `);

                if (employeeData.rowsAffected[0] === 0) throw new Error('Failed to save employee data');
            }

            await transaction.commit();
            success(res, 'Trip Created!');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    };

    const updateTripDetails = async (req, res) => {
        const {
            Trip_Id,
            Branch_Id,
            Trip_Date,
            Vehicle_No,
            StartTime = '',
            EndTime = '',
            Trip_No = '',
            Trip_ST_KM = '',
            Trip_EN_KM = '',
            Updated_By = '',
            Product_Array = [],
            EmployeesInvolved = [],
            GST_Inclusive = 1, IS_IGST = 0
        } = req.body;

        if (!checkIsNumber(Branch_Id) || Trip_Date === '' || Vehicle_No === '' || Trip_Id == '' || Trip_Id == null) {
            return invalidInput(res, 'Check values ');
        }
        if (StartTime && EndTime && new Date(StartTime) > new Date(EndTime)) {
            return invalidInput(res, 'Start Time cannot be greater than End Time');
        }
        if (Trip_ST_KM && Trip_EN_KM && Number(Trip_ST_KM) > Number(Trip_EN_KM)) {
            return invalidInput(res, 'Vehicle Start KM cannot be greater than Vehicle End KM');
        }

        const isExclusiveBill = isEqualNumber(GST_Inclusive, 0);
        const isInclusive = isEqualNumber(GST_Inclusive, 1);
        const isNotTaxableBill = isEqualNumber(GST_Inclusive, 2);
        const isIGST = isEqualNumber(IS_IGST, 1);
        const transaction = new sql.Transaction();

        try {

            const tripCheck = await new sql.Request().query(`
            SELECT COUNT(*) AS TripCount FROM tbl_Trip_Master WHERE Trip_Id = ${Trip_Id}
        `);

            if (tripCheck.recordset[0].TripCount === 0) {
                return invalidInput(res, 'Trip does not exist');
            }

            const productsData = (await getProducts(1)).dataArray;
            const Trip_Tot_Kms = Number(Trip_ST_KM) + Number(Trip_EN_KM);

            await transaction.begin();

            // Update tbl_Trip_Master
            const updateMaster = await new sql.Request(transaction)
                .input('Trip_Id', Trip_Id)
                .input('Branch_Id', Branch_Id)
                .input('Trip_Date', Trip_Date)
                .input('Vehicle_No', Vehicle_No)
                .input('StartTime', StartTime)
                .input('EndTime', EndTime)
                .input('Trip_No', Trip_No)
                .input('Trip_ST_KM', Number(Trip_ST_KM))
                .input('Trip_EN_KM', Number(Trip_EN_KM))
                .input('Trip_Tot_Kms', Trip_Tot_Kms)
                .input('Updated_By', Updated_By)
                .query(`
                UPDATE tbl_Trip_Master
                SET 
                    Branch_Id = @Branch_Id,
                    Trip_Date = @Trip_Date,
                    Vehicle_No = @Vehicle_No,
                    StartTime = @StartTime,
                    EndTime = @EndTime,
                    Trip_No = @Trip_No,
                    Trip_ST_KM = @Trip_ST_KM,
                    Trip_EN_KM = @Trip_EN_KM,
                    Trip_Tot_Kms = @Trip_Tot_Kms,
                    Updated_By = @Updated_By
                WHERE Trip_Id = @Trip_Id
            `);

            if (updateMaster.rowsAffected[0] === 0) {
                throw new Error('Failed to update Trip Master');
            }

            const deleteTripDetailsQuery = `
            DELETE FROM tbl_Trip_Details WHERE Trip_Id = @Trip_Id
        `;
            const deleteResult = await new sql.Request(transaction)
                .input('Trip_Id', Trip_Id)
                .query(deleteTripDetailsQuery);

            if (deleteResult.rowsAffected[0] === 0) {
                throw new Error('Failed to delete existing trip details');
            }

            const deleteTripEmployeesQuery = `
            DELETE FROM tbl_Trip_Employees WHERE Trip_Id = @Trip_Id
        `;
            const deleteEmployeesResult = await new sql.Request(transaction)
                .input('Trip_Id', Trip_Id)
                .query(deleteTripEmployeesQuery);

            if (deleteEmployeesResult.rowsAffected[0] === 0) {
                throw new Error('Failed to delete existing trip employees');
            }

            let Total_Invoice_value = 0;
            let totalValueBeforeTax = {
                TotalValue: 0,
                TotalTax: 0
            };


            for (let i = 0; i < Product_Array.length; i++) {
                const itemRate = RoundNumber(Product_Array[i]?.Item_Rate);
                const billQty = parseInt(Product_Array[i]?.QTY);
                const roundedAmount = RoundNumber(Multiplication(billQty, itemRate));

                if (isInclusive || isNotTaxableBill) {
                    Total_Invoice_value += Number(roundedAmount);
                }

                if (isExclusiveBill) {
                    const product = findProductDetails(productsData, Product_Array[i]?.Item_Id);
                    const gstPercentage = isEqualNumber(IS_IGST, 1) ? product.Igst_P : product.Gst_P;
                    const tax = taxCalc(0, itemRate, gstPercentage);
                    Total_Invoice_value += (roundedAmount + (tax * billQty));
                }

                let decimalPart = Total_Invoice_value - Math.floor(Total_Invoice_value);
                let roundOff = 0;
                let roundedTotal = 0;

                if (decimalPart >= 0.01 && decimalPart < 0.1) {
                    roundedTotal = Math.floor(Total_Invoice_value);
                    roundOff = (Total_Invoice_value - roundedTotal).toFixed(2);
                } else if (decimalPart >= 0.1 && decimalPart <= 0.5) {
                    roundedTotal = Math.round(Total_Invoice_value);
                    roundOff = (Total_Invoice_value - roundedTotal).toFixed(2);
                } else if (decimalPart > 0.5) {
                    roundedTotal = Math.ceil(Total_Invoice_value);
                    roundOff = (Total_Invoice_value - roundedTotal).toFixed(2);
                }

                const Round_off = Total_Invoice_value - (totalValueBeforeTax.TotalValue + totalValueBeforeTax.TotalTax);
                const product = Product_Array[i];
                const productDetails = findProductDetails(productsData, product.Product_Id);

                if (!productDetails) {
                    console.error(`Missing product details for Product_Id: ${product.Product_Id}`);
                    continue;
                }

                const Gst_Rate = productDetails.Gst_P || 0;
                const Amount = product.QTY * product.Item_Rate;
                const tax = (Amount * Gst_Rate) / 100;

                totalValueBeforeTax.TotalValue += Amount;
                totalValueBeforeTax.TotalTax += tax;

                const result = await new sql.Request(transaction)
                    .input('Trip_Id', Trip_Id)
                    .input('STJ_Id', product.STJ_Id)
                    .input('Batch_No', product.Batch_No)
                    .input('From_Location', product.From_Location)
                    .input('To_Location', product.To_Location)
                    .input('S_No', i + 1)
                    .input('Reason', product.Reason)
                    .input('Product_Id', product.Product_Id)
                    .input('HSN_Code', product.HSN_Code)
                    .input('QTY', product.QTY)
                    .input('KGS', product.KGS)
                    .input('GST_Inclusive', GST_Inclusive)
                    .input('IS_IGST', IS_IGST)
                    .input('Gst_Rate', Gst_Rate)
                    .input('Gst_P', productDetails?.Gst_P || 0)
                    .input('Cgst_P', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                    .input('Sgst_P', isIGST ? 0 : totalValueBeforeTax.TotalTax / 2)
                    .input('Igst_P', isIGST ? totalValueBeforeTax.TotalTax : 0)
                    .input('Taxable_Value', Amount)
                    .input('Round_off', roundOff)
                    .input('Total_Value', roundedTotal)
                    .input('Trip_From', product.Trip_From)
                    .input('Party_And_Branch_Id', product.Party_And_Branch_Id)
                    .input('Transporter_Id', product.Transporter_Id)
                    .input('Dispatch_Date', product.Dispatch_Date)
                    .input('Delivery_Date', product.Delivery_Date)
                    .input('Updated_By', Updated_By)
                    .query(`
                    INSERT INTO tbl_Trip_Details
                    (Trip_Id,STJ_Id,Batch_No,From_Location, To_Location, S_No, Reason, Product_Id, HSN_Code, QTY, KGS, 
                    GST_Inclusive, IS_IGST, Gst_Rate, Gst_P, Cgst_P, Sgst_P, Igst_P, Taxable_Value, 
                    Round_off, Total_Value, Trip_From, Party_And_Branch_Id, Transporter_Id, Dispatch_Date, 
                    Delivery_Date, Updated_By)
                    VALUES
                    (@Trip_Id,@STJ_Id,@Batch_No, @From_Location, @To_Location, @S_No, @Reason, @Product_Id, @HSN_Code, 
                    @QTY, @KGS, @GST_Inclusive, @IS_IGST, @Gst_Rate, @Gst_P, @Cgst_P, @Sgst_P, @Igst_P, 
                    @Taxable_Value, @Round_off, @Total_Value, @Trip_From, @Party_And_Branch_Id, 
                    @Transporter_Id, @Dispatch_Date, @Delivery_Date, @Updated_By)
                `);

                if (result.rowsAffected[0] === 0) throw new Error('Failed to insert new Trip Details');
            }


            for (let i = 0; i < EmployeesInvolved.length; i++) {
                const employee = EmployeesInvolved[i];
                await new sql.Request(transaction)
                    .input('Trip_Id', Trip_Id)
                    .input('Involved_Emp_Id', employee.Involved_Emp_Id)
                    .input('Cost_Center_Type_Id', employee.Cost_Center_Type_Id)
                    .query(`
                    INSERT INTO tbl_Trip_Employees
                    (Trip_Id, Involved_Emp_Id, Cost_Center_Type_Id)
                    VALUES
                    (@Trip_Id, @Involved_Emp_Id, @Cost_Center_Type_Id)
                `);
            }

            await transaction.commit();
            success(res, 'Trip Updated!');
        } catch (e) {
            if (transaction._aborted === false) {
                await transaction.rollback();
            }
            servError(e, res);
        }
    };

    const getTripDetails = async (req, res) => {
        try {
            const FromDate = ISOString(req.query.FromDate), ToDate = ISOString(req.query.ToDate);

            if (!FromDate && !ToDate) {
                return invalidInput(res, 'Select StartDate & EndDate')
            }

            let query = `
 WITH TRIP_DETAILS AS (
    SELECT
        td.*,
        COALESCE(pm.Product_Name, 'unknown') AS Product_Name,
        COALESCE(gm_from.Godown_Name, 'Unknown') AS FromLocation,
        COALESCE(gm_to.Godown_Name, 'Unknown') AS ToLocation
    FROM
        tbl_Trip_Details AS td
    LEFT JOIN tbl_Product_Master AS pm
        ON pm.Product_Id = td.Product_Id
    LEFT JOIN tbl_Users AS us
        ON us.UserId = td.Created_By
    LEFT JOIN tbl_Godown_Master AS gm_from
        ON gm_from.Godown_Id = td.From_Location
    LEFT JOIN tbl_Godown_Master AS gm_to
        ON gm_to.Godown_Id = td.To_Location
)
SELECT
    tm.*,
    COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
    COALESCE(cb_created.Name, 'unknown') AS Created_By_User,
    COALESCE(cb_updated.Name, 'unknown') AS Updated_By_User,
    COALESCE((
        SELECT
            td.*,
			  COALESCE(cb_created.Name, 'unknown') AS Created_By_User,
    COALESCE(cb_updated.Name, 'unknown') AS Updated_By_User
        FROM
            TRIP_DETAILS AS td
			LEFT JOIN tbl_Users AS cb_created
    ON cb_created.UserId = tm.Created_By
LEFT JOIN tbl_Users AS cb_updated
    ON cb_updated.UserId = tm.Updated_By
        WHERE
            td.Trip_Id = tm.Trip_Id
        FOR JSON PATH
    ), '[]') AS Products_List
FROM
    tbl_Trip_Master AS tm
LEFT JOIN tbl_Branch_Master AS bm
    ON bm.BranchId = tm.Branch_Id
LEFT JOIN tbl_Users AS cb_created
    ON cb_created.UserId = tm.Created_By
LEFT JOIN tbl_Users AS cb_updated
    ON cb_updated.UserId = tm.Updated_By
WHERE
  CONVERT(DATE, tm.Trip_Date) >= CONVERT(DATE, @FromDate)
    AND CONVERT(DATE, tm.Trip_Date) <= CONVERT(DATE, @ToDate)
    `;



            const request = new sql.Request();
            request.input('FromDate', sql.Date, FromDate);
            request.input('ToDate', sql.Date, ToDate);
            const result = await request.query(query);

            if (result.recordset.length > 0) {

                const parsed = result.recordset.map(o => ({
                    ...o,
                    Products_List: JSON.parse(o?.Products_List)
                }));



                dataFound(res, parsed);
            } else {
                noData(res);
            }
        } catch (e) {

            servError(e, res);
        }
    };


    return {
        createTripDetails,
        updateTripDetails,
        getTripDetails
    }
}

export default tripActivities()
