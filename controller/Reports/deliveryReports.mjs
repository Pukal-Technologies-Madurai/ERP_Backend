import sql from "mssql";
import { sentData, servError, noData } from "../../res.mjs";
import { checkIsNumber, ISOString, toArray } from "../../helper_functions.mjs";

const getNonConvertedSales = async (req, res) => {
    try {
        const { Retailer_Id, Cancel_status = 0, Created_by, Sales_Person_Id, VoucherType } = req.query;
        const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .input('retailer', Retailer_Id)
            .input('cancel', Cancel_status)
            .input('creater', Created_by)
            .input('salesPerson', Sales_Person_Id)
            .input('VoucherType', VoucherType);

        const result = await request.query(`
          
            DECLARE @FilteredOrders TABLE (So_Id INT);
            INSERT INTO @FilteredOrders (So_Id)
            SELECT so.So_Id
            FROM tbl_Sales_Order_Gen_Info AS so
            WHERE 
                CONVERT(DATE, so.So_Date) BETWEEN CONVERT(DATE, @Fromdate) AND CONVERT(DATE, @Todate)
                ${checkIsNumber(Retailer_Id) ? ' AND so.Retailer_Id = @retailer ' : ''}
                ${checkIsNumber(Cancel_status) ? ' AND so.Cancel_status = @cancel ' : ''}
                ${checkIsNumber(Created_by) ? ' AND so.Created_by = @creater ' : ''}
                ${checkIsNumber(Sales_Person_Id) ? ' AND so.Sales_Person_Id = @salesPerson ' : ''}
                ${checkIsNumber(VoucherType) ? ' AND so.VoucherType = @VoucherType ' : ''};

            -- Step 2: Fetch orders WITHOUT deliveries
            SELECT 
                so.*, 
                COALESCE(rm.Retailer_Name, 'unknown') AS Retailer_Name,
                COALESCE(sp.Name, 'unknown') AS Sales_Person_Name,
                COALESCE(bm.BranchName, 'unknown') AS Branch_Name,
                COALESCE(cb.Name, 'unknown') AS Created_BY_Name,
                COALESCE(v.Voucher_Type, 'unknown') AS VoucherTypeGet
            FROM tbl_Sales_Order_Gen_Info AS so
            LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = so.Retailer_Id
            LEFT JOIN tbl_Users AS sp ON sp.UserId = so.Sales_Person_Id
            LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = so.Branch_Id
            LEFT JOIN tbl_Users AS cb ON cb.UserId = so.Created_by
            LEFT JOIN tbl_Voucher_Type AS v ON v.Vocher_Type_Id = so.VoucherType
            WHERE 
                so.So_Id IN (SELECT So_Id FROM @FilteredOrders)
                AND NOT EXISTS (
                    SELECT 1 
                    FROM tbl_Sales_Delivery_Gen_Info AS sdgi 
                    WHERE sdgi.So_No = so.So_Id
                )
            ORDER BY so.So_Date asc
        `);

        const [OrderData] = result.recordsets.map(toArray);
        OrderData.length > 0 ? sentData(res, OrderData) : noData(res);

    } catch (e) {
        servError(e, res);
    }
};

export default {
    getNonConvertedSales,
};
