import sql from 'mssql';
import { Addition, checkIsNumber, createPadString, isEqualNumber, ISOString, Multiplication, RoundNumber, stringCompare, toArray, toNumber } from '../../helper_functions.mjs';
import { failed, invalidInput, servError, dataFound, noData, sentData, success } from '../../res.mjs';
import { getNextId, getProducts } from '../../middleware/miniAPIs.mjs';
import { calculateGSTDetails } from '../../middleware/taxCalculator.mjs';
import receiptMaster from '../Receipts/receiptMaster.mjs';

const findProductDetails = (arr = [], productid) => arr.find(obj => isEqualNumber(obj.Product_Id, productid)) ?? {};


const Reports = () => {


    const getLRreport = async (req, res) => {
        try {
            const { Fromdate, Todate } = req.query;

            if (!Fromdate || !Todate) {
                return invalidInput(res, 'Fromdate and Todate are required');
            }

            const parsedFromDate = new Date(Fromdate);
            const parsedToDate = new Date(Todate);

            if (isNaN(parsedFromDate.getTime()) || isNaN(parsedToDate.getTime())) {
                return invalidInput(res, 'Invalid date format. Use YYYY-MM-DD.');
            }

            const request = new sql.Request();
            request.input('FromDate', sql.DateTime, parsedFromDate);
            request.input('ToDate', sql.DateTime, parsedToDate);

            const query = `
      SELECT 
    tm.*,
    -- Take the first retailer name per trip
    (SELECT TOP 1 rm.Retailer_Name
     FROM tbl_Trip_Details td
     INNER JOIN tbl_Sales_Delivery_Gen_Info sd 
         ON td.Delivery_Id = sd.Do_Id
     INNER JOIN tbl_Retailers_Master rm 
         ON sd.Retailer_Id = rm.Retailer_Id
     WHERE td.Trip_Id = tm.Trip_Id
    ) AS Retailer_Name,

   (
    SELECT 
        te.Involved_Emp_Id,
        cc.Cost_Center_Name,      -- Get name from ERP_Cost_Center
        te.Cost_Center_Type_Id,
        cat.Cost_Category
    FROM tbl_Trip_Employees te
    LEFT JOIN tbl_ERP_Cost_Center cc 
        ON te.Involved_Emp_Id = cc.Cost_Center_Id
    LEFT JOIN tbl_ERP_Cost_Category cat 
        ON te.Cost_Center_Type_Id = cat.Cost_Category_Id
    WHERE te.Trip_Id = tm.Trip_Id
    FOR JSON PATH
) AS Employees,

    -- Retailers at outermost layer (as JSON array)
    (
        SELECT 
            rm.Retailer_Id,
            rm.Retailer_Name
        FROM tbl_Trip_Details td
        INNER JOIN tbl_Sales_Delivery_Gen_Info sd 
            ON td.Delivery_Id = sd.Do_Id
        INNER JOIN tbl_Retailers_Master rm 
            ON sd.Retailer_Id = rm.Retailer_Id
        WHERE td.Trip_Id = tm.Trip_Id
        FOR JSON PATH
    ) AS Retailers,

    -- Trip Details (Delivery Info + Stock Info collapsed)
    (
        SELECT 
            td.Id AS TripDetailId,
            td.Delivery_Id,
            sd.Do_Inv_No,
            sd.Do_Date,
            sd.Total_Invoice_value,
            sd.Retailer_Id,
            rm.Retailer_Name,
            (
                SELECT 
                    sds.Item_Id,
                    pm.Product_Name,
                    sds.Amount
                FROM tbl_Sales_Delivery_Stock_Info sds
                LEFT JOIN tbl_Product_Master pm 
                    ON sds.Item_Id = pm.Product_Id
                WHERE sds.Delivery_Order_Id = sd.Do_Id
                FOR JSON PATH
            ) AS StockDetails
        FROM tbl_Trip_Details td
        LEFT JOIN tbl_Sales_Delivery_Gen_Info sd 
            ON td.Delivery_Id = sd.Do_Id
        LEFT JOIN tbl_Retailers_Master rm
            ON rm.Retailer_Id = sd.Retailer_Id
        WHERE td.Delivery_Id IS NOT NULL
          AND td.Trip_Id = tm.Trip_Id
        FOR JSON PATH
    ) AS TripDetails

FROM tbl_Trip_Master tm
WHERE tm.Trip_Date BETWEEN @FromDate AND @ToDate
  AND EXISTS (
    SELECT 1
    FROM tbl_Trip_Details td
    WHERE td.Trip_Id = tm.Trip_Id
      AND td.Delivery_Id IS NOT NULL
)
ORDER BY tm.Trip_Id DESC;

        `;

            const result = await request.query(query);

            if (result.recordset.length > 0) {
                const parsed = result.recordset.map(o => ({
                    ...o,
                    Employees: JSON.parse(o?.Employees || '[]'),
                    TripDetails: JSON.parse(o?.TripDetails || '[]'),
                }));

                dataFound(res, parsed);
            } else {
                noData(res);
            }

        } catch (e) {
            servError(e, res);
        }
    };

    const costCenterUpdate = async (req, res) => {
        try {

            const tripId = req.body.tripId;
            const employeeCostCenters = req.body.employeeCostCenters;

            if (!tripId) {
                return invalidInput(res, 'Trip Id is required.');
            }

            if (!employeeCostCenters || !Array.isArray(employeeCostCenters)) {
                return invalidInput(res, 'Employee cost centers data is required ');
            }

            const request = new sql.Request();

            await request
                .input('tripId', sql.Int, parseInt(tripId))
                .query('DELETE FROM tbl_Trip_Employees WHERE Trip_Id = @tripId');

            for (let employee of employeeCostCenters) {

                await new sql.Request()
                    .input('Trip_Id', sql.Int, parseInt(tripId))
                    .input('Involved_Emp_Id', sql.Int, parseInt(employee.Involved_Emp_Id))
                    .input('Cost_Center_Type_Id', sql.Int, parseInt(employee.Cost_Center_Type_Id))
                    .query(`
                        INSERT INTO tbl_Trip_Employees (
                            Trip_Id, Involved_Emp_Id, Cost_Center_Type_Id
                        ) VALUES (
                            @Trip_Id, @Involved_Emp_Id, @Cost_Center_Type_Id
                        )`
                    );
            }

            success(res, `Cost centers updated successfully`);

        } catch (error) {
            servError(error, res);
        }
    };

    return {
        getLRreport,
        costCenterUpdate
    }

}
export default Reports();