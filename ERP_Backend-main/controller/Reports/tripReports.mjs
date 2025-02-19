import sql from 'mssql';
import { servError, dataFound, noData } from '../../res.mjs';
import dotenv from 'dotenv';
dotenv.config();



const TripReports = () => {
    const getReports = async (req, res) => {
        const Fromdate = req.query.Fromdate;
        const UserId = req.query.UserId;

        try {
            let query = `
                        SELECT
                          te.Trip_Id,
                          um.UserId,
                          tm.Trip_Date,
                          MAX(um.Name) AS Name,  -- Aggregating um.Name
                          MAX(cc.Cost_Center_Id) AS Cost_Center_Id, -- Example aggregation for cc.* columns
                          COUNT(td.Trip_Id) AS Trip_Details_QTY,  -- Count of rows in tbl_Trip_Details
                          MAX(cct.Cost_Category) AS Cost_Center_Type,  -- Get the Cost Center Type name
                          ROW_NUMBER() OVER (PARTITION BY um.UserId, tm.Trip_Date ORDER BY te.Trip_Id) AS Trip_Count,  -- Sequential trip count for each user on the same day
                                ISNULL((
                         SELECT
                                  td.Trip_Id,      
                                  td.Delivery_Id,
                                  td.GST_Inclusive AS td_GST_Inclusive,
                                  sdgi.*,rm.Retailer_Name
                                  FROM tbl_Trip_Details td
                                  LEFT JOIN tbl_Sales_Delivery_Gen_Info sdgi ON sdgi.Do_No = td.Delivery_Id
                                  LEFT JOIN tbl_Sales_Delivery_Stock_Info sdsi ON sdsi.Delivery_Order_Id = sdgi.Do_Id
                                  LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id =sdgi.Retailer_Id
                                  WHERE td.Trip_Id = te.Trip_Id
                                  GROUP BY 
                                      td.Trip_Id, td.Delivery_Id, td.GST_Inclusive, sdgi.GST_Inclusive, sdgi.Do_No, sdgi.Do_Date, sdgi.Do_Id,sdgi.Retailer_Id  -- Added necessary columns to GROUP BY
                                sdgi.Delivery_Person_Id,sdgi.Branch_Id,sdgi.IS_IGST,sdgi.CSGT_Total,sdgi.SGST_Total,sdgi.IGST_Total,sdgi.Round_off,sdgi.Total_Before_Tax,sdgi.Total_Tax,sdgi.Total_Invoice_value,sdgi.Narration,sdgi.Cancel_Status,Sdgi.So_No,sdgi.Trans_Type,
                      		sdgi.Delivery_Status,sdgi.Delivery_Time,sdgi.Delivery_Location,sdgi.Delivery_Latitude,sdgi.Delivery_Longitude,sdgi.Collected_By,sdgi.Collected_Status,sdgi.Payment_Mode,sdgi.Payment_Ref_No,sdgi.Payment_Status,sdgi.Alter_Id,sdgi.Created_by,sdgi.Altered_by,sdgi.Created_on,sdgi.Alterd_on,rm.Retailer_Name FOR JSON PATH,INCLUDE_NULL_VALUES 
                              ), '[]') AS Trip_Details
                      FROM
                          tbl_Trip_Employees te
                      LEFT JOIN
                          tbl_Trip_Details td ON td.Trip_Id = te.Trip_Id
                      LEFT JOIN
                          tbl_Trip_Master tm ON tm.Trip_Id = td.Trip_Id
                      LEFT JOIN
                          tbl_ERP_Cost_Center cc ON cc.Cost_Center_Id = te.Involved_Emp_Id
                      LEFT JOIN
                          tbl_Users um ON um.UserId = cc.User_Id
                      LEFT JOIN
                          tbl_ERP_Cost_Category cct ON cct.Cost_Category_Id = cc.User_Type  -- Join with the Cost Center Type table
                            WHERE
                                tm.Trip_Date = @Fromdate  -- Filter for exact date match
                                AND um.UserId = @UserId
                              GROUP BY
                             te.Trip_Id, um.UserId, tm.Trip_Date;
                                      `;

            const request = new sql.Request();
            request.input('Fromdate', Fromdate)
            request.input('UserId', UserId)
            const result = await request.query(query);
            if (result.recordset.length > 0) {
                const parsed = result.recordset.map(o => ({
                    ...o,
                    Columns: JSON.parse(o?.Columns || '{}'),
                    Trip_Details: JSON.parse(o?.Trip_Details)
                }));
                dataFound(res, parsed || []);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    };

    return {
        getReports,
    };
};



export default TripReports();