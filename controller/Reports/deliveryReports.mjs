import sql from "mssql";
import { sentData, servError, noData, invalidInput, success, dataFound } from "../../res.mjs";
import { checkIsNumber, ISOString, toArray, isEqualNumber, toNumber } from "../../helper_functions.mjs";

const getNonConvertedSales = async (req, res) => {
    try {
        const { Retailer_Id, Cancel_status = 0, Created_by, Sales_Person_Id, VoucherType, Branch_Id } = req.query;

        const Fromdate = req.query?.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query?.Todate ? ISOString(req.query.Todate) : ISOString();

        const request = new sql.Request()
            .input('Fromdate', Fromdate)
            .input('Todate', Todate)
            .input('retailer', Retailer_Id)
            .input('cancel', Cancel_status)
            .input('creater', Created_by)
            .input('salesPerson', Sales_Person_Id)
            .input('VoucherType', VoucherType)
            .input('Branch_Id', Branch_Id);

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
                ${checkIsNumber(VoucherType) ? ' AND so.VoucherType = @VoucherType ' : ''}
                ${checkIsNumber(Branch_Id) ? ' AND so.Branch_Id = @Branch_Id ' : ''};

            
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
            WHERE so.So_Id IN (SELECT So_Id FROM @FilteredOrders);

            
            SELECT 
                si.*,
                COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                COALESCE(pm.Short_Name, 'not available') AS Product_Short_Name,
                COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                COALESCE(u.Units, 'not available') AS UOM,
                COALESCE(b.Brand_Name, 'not available') AS BrandGet
            FROM tbl_Sales_Order_Stock_Info AS si
            LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = si.Item_Id
            LEFT JOIN tbl_UOM AS u ON u.Unit_Id = si.Unit_Id
            LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
            WHERE si.Sales_Order_Id IN (SELECT So_Id FROM @FilteredOrders);

           
            SELECT 
                sosi.So_Id, 
                sosi.Involved_Emp_Id,
                sosi.Cost_Center_Type_Id,
                c.Cost_Center_Name AS EmpName,
                cc.Cost_Category AS EmpType
            FROM tbl_Sales_Order_Staff_Info AS sosi
            LEFT JOIN tbl_ERP_Cost_Center AS c ON c.Cost_Center_Id = sosi.Involved_Emp_Id
            LEFT JOIN tbl_ERP_Cost_Category cc ON cc.Cost_Category_Id = sosi.Cost_Center_Type_Id
            WHERE sosi.So_Id IN (SELECT So_Id FROM @FilteredOrders);

            
            SELECT 
                dgi.*,
                rm.Retailer_Name AS Retailer_Name,
                bm.BranchName AS Branch_Name,
                st.Status AS DeliveryStatusName,
                COALESCE((
                    SELECT SUM(collected_amount)
                    FROM tbl_Sales_Receipt_Details_Info
                    WHERE bill_id = dgi.Do_Id
                ), 0) AS receiptsTotalAmount
            FROM tbl_Sales_Delivery_Gen_Info AS dgi
            LEFT JOIN tbl_Retailers_Master AS rm ON rm.Retailer_Id = dgi.Retailer_Id
            LEFT JOIN tbl_Branch_Master AS bm ON bm.BranchId = dgi.Branch_Id
            LEFT JOIN tbl_Status AS st ON st.Status_Id = dgi.Delivery_Status
            WHERE dgi.So_No IN (SELECT So_Id FROM @FilteredOrders);

           
            SELECT 
                oi.*,
                COALESCE(pm.Product_Name, 'not available') AS Product_Name,
                COALESCE(pm.Product_Image_Name, 'not available') AS Product_Image_Name,
                COALESCE(u.Units, 'not available') AS UOM,
                COALESCE(b.Brand_Name, 'not available') AS BrandGet
            FROM tbl_Sales_Delivery_Stock_Info AS oi
            LEFT JOIN tbl_Product_Master AS pm ON pm.Product_Id = oi.Item_Id
            LEFT JOIN tbl_UOM AS u ON u.Unit_Id = oi.Unit_Id
            LEFT JOIN tbl_Brand_Master AS b ON b.Brand_Id = pm.Brand
            WHERE oi.Delivery_Order_Id IN (
                SELECT Do_Id FROM tbl_Sales_Delivery_Gen_Info 
                WHERE So_No IN (SELECT So_Id FROM @FilteredOrders)
            );`
        );

        const [OrderData, ProductDetails, StaffInvolved, DeliveryData, DeliveryItems] = result.recordsets.map(toArray);

        if (OrderData.length > 0) {
            const pendingOrders = OrderData.filter(order => {
                const orderProducts = ProductDetails.filter(p =>
                    isEqualNumber(p.Sales_Order_Id, order.So_Id)
                );
                const deliveryList = DeliveryData.filter(d =>
                    isEqualNumber(d.So_No, order.So_Id)
                );

                const totalOrderedQty = orderProducts.reduce(
                    (sum, p) => sum + toNumber(p.Bill_Qty),
                    0
                );
                const totalDeliveredQty = deliveryList.reduce((sum, d) => {
                    const deliveredItems = DeliveryItems.filter(p =>
                        isEqualNumber(p.Delivery_Order_Id, d.Do_Id)
                    );
                    return sum + deliveredItems.reduce((s, p) => s + toNumber(p.Bill_Qty), 0);
                }, 0);

                return totalDeliveredQty < totalOrderedQty;
            });

            if (pendingOrders.length > 0) {
                const resData = pendingOrders.map(order => {
                    const orderProducts = ProductDetails.filter(p =>
                        isEqualNumber(p.Sales_Order_Id, order.So_Id)
                    );
                    const deliveryList = DeliveryData.filter(d =>
                        isEqualNumber(d.So_No, order.So_Id)
                    );

                    const totalOrderedQty = orderProducts.reduce(
                        (sum, p) => sum + toNumber(p.Bill_Qty),
                        0
                    );
                    const totalDeliveredQty = deliveryList.reduce((sum, d) => {
                        const deliveredItems = DeliveryItems.filter(p =>
                            isEqualNumber(p.Delivery_Order_Id, d.Do_Id)
                        );
                        return sum + deliveredItems.reduce((s, p) => s + toNumber(p.Bill_Qty), 0);
                    }, 0);

                    const pendingQty = totalOrderedQty - totalDeliveredQty;
                    const deliveryPercentage = totalOrderedQty > 0 ? (totalDeliveredQty / totalOrderedQty) * 100 : 0;

                    const mappedDeliveries = deliveryList.map(d => {
                        const invoiceProducts = DeliveryItems.filter(p =>
                            isEqualNumber(p.Delivery_Order_Id, d.Do_Id)
                        ).map(prod => ({
                            ...prod

                        }));

                        return {
                            ...d,
                            InvoicedProducts: invoiceProducts,
                        };
                    });

                    return {
                        ...order,
                        OrderStatus: "pending",
                        TotalOrderedQty: totalOrderedQty,
                        TotalDeliveredQty: totalDeliveredQty,
                        PendingQty: pendingQty,
                        DeliveryPercentage: Math.round(deliveryPercentage),
                        Products_List: orderProducts.map(p => ({
                            ...p
                        })),
                        Staff_Involved_List: StaffInvolved.filter(s =>
                            isEqualNumber(s.So_Id, order.So_Id)
                        ),
                        ConvertedInvoice: mappedDeliveries,
                    };
                });

                dataFound(res, resData);
            } else {
                noData(res, "No pending orders found");
            }
        } else {
            noData(res);
        }

    } catch (e) {
        servError(e, res);
    }
};


const closingReport = async (req, res) => {
    try {
        const { PassingDate } = req.query;
        if (!PassingDate) {
            return invalidInput(res, "PassingDate is required");
        }

        const spRequest = new sql.Request();
        spRequest.input("fromdate", sql.Date, PassingDate);
        spRequest.input("todate", sql.Date, PassingDate);

        const stockResult = await spRequest.query(`
      EXEC [dbo].[Stock_Summarry_Search_Godown_New]
        @fromdate = @fromdate,
        @todate = @todate,
        @Godown_Id = '',
        @Item_Id = '';
    `);

        const balanceMap = new Map();
        for (const row of stockResult.recordset || []) {
            const key = `${row.Product_Id}-${row.Godown_Id}`;
            balanceMap.set(key, row.Bal_Qty ?? row.Act_Bal_Qty ?? 0);
        }

        const mainRequest = new sql.Request();
        mainRequest.input("fromdate", sql.Date, PassingDate);
        mainRequest.input("todate", sql.Date, PassingDate);

        const mainQuery = `
     ;WITH GodownInfo AS (
        SELECT Godown_Id, Godown_Name FROM tbl_Godown_Master
    ),
    LastWeek AS (
        SELECT sdsi.Item_Id, sdsi.Godown_Id,
            AVG(CAST(sdsi.Total_Qty AS DECIMAL(18,2))) AS Avg_Week_Qty
        FROM tbl_Sales_Delivery_Stock_Info sdsi
        WHERE sdsi.Do_Date >= DATEADD(DAY, -7, @todate)
            AND sdsi.Do_Date < @todate
        GROUP BY sdsi.Item_Id, sdsi.Godown_Id
    ),
    Yesterday AS (
        SELECT sdsi.Item_Id, sdsi.Godown_Id,
            SUM(sdsi.Total_Qty) AS Yesterday_Qty
        FROM tbl_Sales_Delivery_Stock_Info sdsi
        WHERE sdsi.Do_Date = DATEADD(DAY, -1, @todate)
        GROUP BY sdsi.Item_Id, sdsi.Godown_Id
    ),
    ProductInfo AS (
        SELECT DISTINCT
            pm.Product_Id,
            pm.Pos_Brand_Id,
            bm.POS_Brand_Name,
            pm.Product_Name,
            pm.Product_Description,
            pm.Product_Rate,
            pm.Max_Rate,
            CASE
                WHEN pm.Product_Name LIKE '%1kg%' THEN '1kg'
                WHEN pm.Product_Name LIKE '%25kg%' THEN '25kg'
                WHEN pm.Product_Name LIKE '%26kg%' THEN '26kg'
                WHEN pm.Product_Name LIKE '%30kg%' THEN '30kg'
                WHEN pm.Product_Name LIKE '%46kg%' THEN '46kg'
                WHEN pm.Product_Name LIKE '%50kg%' THEN '50kg'
                WHEN pm.Product_Name LIKE '%60kg%' THEN '60kg'
                ELSE 'Other'
            END AS Product_Pack,
            LEFT(pm.Product_Name, CHARINDEX(' ', pm.Product_Name + ' ', CHARINDEX('-', pm.Product_Name) + 1) - 1) AS Base_Product
        FROM tbl_Stock_Los sl
        INNER JOIN tbl_Product_Master pm ON sl.Stock_Tally_Id = pm.ERP_ID
        LEFT JOIN tbl_POS_Brand bm ON bm.POS_Brand_Id = pm.Pos_Brand_Id
    ),
    SalesAgg AS (
        SELECT
            pi.Product_Id,
            pi.Pos_Brand_Id,
            pi.POS_Brand_Name,
            gi.Godown_Id,
            gi.Godown_Name,
            pi.Base_Product,
            pi.Product_Description,
            pi.Product_Rate,
            pi.Max_Rate,
            pi.Product_Pack,
            ISNULL(LW.Avg_Week_Qty, 0) AS Avg_Week_Qty,
            ISNULL(Yest.Yesterday_Qty, 0) AS Yesterday_Qty
        FROM ProductInfo pi
        CROSS JOIN GodownInfo gi
        LEFT JOIN LastWeek LW ON LW.Item_Id = pi.Product_Id AND LW.Godown_Id = gi.Godown_Id
        LEFT JOIN Yesterday Yest ON Yest.Item_Id = pi.Product_Id AND Yest.Godown_Id = gi.Godown_Id
    )
    SELECT * FROM SalesAgg WHERE Pos_Brand_Id IS NOT NULL ORDER BY POS_Brand_Name;
    `;

        const mainResult = await mainRequest.query(mainQuery);

        const brandsMap = new Map();

        for (const row of (mainResult.recordset || [])) {
            const key = `${row.Product_Id}-${row.Godown_Id}`;
            const balQty = balanceMap.get(key) || 0;


            if (balQty === 0 && row.Avg_Week_Qty === 0 && row.Yesterday_Qty === 0) {
                continue;
            }

            if (!brandsMap.has(row.Pos_Brand_Id)) {
                brandsMap.set(row.Pos_Brand_Id, {
                    brandId: row.Pos_Brand_Id,
                    brandName: row.POS_Brand_Name,
                    godowns: new Map(),
                });
            }

            const brand = brandsMap.get(row.Pos_Brand_Id);

            if (!brand.godowns.has(row.Godown_Id)) {
                brand.godowns.set(row.Godown_Id, {
                    godownId: row.Godown_Id,
                    godownName: row.Godown_Name,
                    products: new Map(),
                    totalBalanceQty: 0,
                    totalWeeklyQty: 0,
                    totalYesterdayQty: 0,
                });
            }

            const godown = brand.godowns.get(row.Godown_Id);

            const productKey = row.Base_Product || row.Product_Id;

            if (!godown.products.has(productKey)) {
                godown.products.set(productKey, {
                    baseProduct: row.Base_Product,
                    productDescription: row.Product_Description,
                    productRate: row.Product_Rate,
                    maxRate: row.Max_Rate,
                    packs: [],
                });
            }

            const product = godown.products.get(productKey);

            let pack = product.packs.find(p => p.packType === row.Product_Pack);
            if (pack) {
                pack.weeklyAverage += row.Avg_Week_Qty;
                pack.yesterdayQty += row.Yesterday_Qty;
                pack.balanceQty += balQty;
            } else {
                product.packs.push({
                    packType: row.Product_Pack,
                    weeklyAverage: row.Avg_Week_Qty,
                    yesterdayQty: row.Yesterday_Qty,
                    balanceQty: balQty,
                });
            }

            godown.totalBalanceQty += balQty;
            godown.totalWeeklyQty += row.Avg_Week_Qty;
            godown.totalYesterdayQty += row.Yesterday_Qty;
        }


        const processedData = [];
        for (const brand of brandsMap.values()) {
            const godowns = [];

            for (const godown of brand.godowns.values()) {

                for (const product of godown.products.values()) {
                    product.packs = product.packs.filter(pack =>
                        pack.balanceQty > 0 || pack.weeklyAverage > 0 || pack.yesterdayQty > 0
                    );
                }


                const productsArray = Array.from(godown.products.values()).filter(
                    product => product.packs.length > 0
                );


                if (productsArray.length > 0 && (
                    godown.totalBalanceQty > 0 ||
                    godown.totalWeeklyQty > 0 ||
                    godown.totalYesterdayQty > 0
                )) {
                    godowns.push({
                        godownId: godown.godownId,
                        godownName: godown.godownName,
                        totalBalanceQty: godown.totalBalanceQty,
                        totalWeeklyQty: godown.totalWeeklyQty,
                        totalYesterdayQty: godown.totalYesterdayQty,
                        products: productsArray,
                    });
                }
            }


            if (godowns.length > 0) {
                processedData.push({
                    brandId: brand.brandId,
                    brandName: brand.brandName,
                    godowns,
                });
            }
        }

        if (processedData.length > 0) {
            sentData(res, processedData);
        } else {
            sentData(res, []);
        }
    } catch (error) {
        servError(error, res);
    }
};



const SyncPosPending = async (req, res) => {
    const dataArray = Array.isArray(req.body) ? req.body : [];

    if (!Array.isArray(dataArray) || dataArray.length === 0) {
        return res.status(400).json({ success: false, message: "Invalid or empty data array" });
    }

    const transaction = new sql.Transaction();
    let transactionBegun = false;

    try {
        await transaction.begin();
        transactionBegun = true;

        for (const data of dataArray) {
            const retailerResult = await new sql.Request(transaction)
                .input("Acc_Id", data.Acc_Id)
                .query(`
          SELECT Retailer_Id 
          FROM tbl_Retailers_Master 
          WHERE AC_Id = @Acc_Id
        `);

            if (!retailerResult.recordset.length) {
                console.warn(`No Retailer found for Acc_Id: ${data.Acc_Id}`);
                continue;
            }

            const retailerId = retailerResult.recordSet[0].Retailer_Id;

            await new sql.Request(transaction)
                .input("Above_30Days", data.Above_30_Days_Pending_Amt || 0)
                .input("Total_Outstanding", data.Overall_Outstanding_Amt || 0)
                .input("Retailer_Id", retailerId)
                .query(`
          UPDATE tbl_ERP_POS_Master
          SET 
            Above_30Days = @Above_30Days,
            Total_Outstanding = @Total_Outstanding
          WHERE Retailer_Id = @Retailer_Id
        `);
        }

        await transaction.commit();
        success(res, `Data synced successfully updated)`);

    } catch (err) {
        if (transactionBegun) {
            try {
                await transaction.rollback();
            } catch (rollbackErr) {
                console.error('Rollback failed:', rollbackErr);
            }
        }
        servError(err, res, "Data sync error");
    }
};

const ReturnDelivery = async (req, res) => {
    try {
        const Fromdate = req.query.Fromdate ? ISOString(req.query.Fromdate) : ISOString();
        const Todate = req.query.Todate ? ISOString(req.query.Todate) : ISOString();
        const Branch_Id = req.query.Branch_Id;
        const Retailer_Id = req.query.Retailer_Id

        let query = `
           SELECT 
    sr.*,
    sdgi.*,
    p.Product_Name,
	bm.BranchName,
    gm.Godown_Name,
    b.Brand_Id,
	b.Brand_Name,
   	rm.Retailer_Name
FROM tbl_Sales_Return_Stock_Info sr
LEFT JOIN tbl_Product_Master p ON p.Product_Id = sr.Item_Id
LEFT JOIN tbl_Godown_Master gm ON gm.Godown_Id = sr.GoDown_Id
LEFT JOIN tbl_Brand_Master b ON b.Brand_Id=p.Brand
LEFT JOIN tbl_Sales_Delivery_Gen_Info sdgi ON sdgi.Do_Id = sr.Delivery_Order_Id
LEFT JOIN tbl_Retailers_Master rm ON rm.Retailer_Id= sdgi.Retailer_Id
LEFT JOIN tbl_Branch_Master bm ON bm.BranchId = sdgi.Branch_Id
WHERE CAST(sr.Ret_Date AS DATE) BETWEEN @fromDate AND @toDate
        `;

        const request = await new sql.Request()
            .input('fromDate', Fromdate)
            .input('toDate', Todate);

        if (Branch_Id) {
            query += ` AND sdgi.Branch_Id = @Branch_Id `;
            request.input('Branch_Id', Branch_Id);
        }
        if (Retailer_Id) {
            query += ` AND sdgi.Retailer_Id = @Retailer_Id `;
            request.input('Retailer_Id', Retailer_Id);
        }
        const result = await request.query(query);

        if (result.recordsets.length <= 0 || result.recordsets[0].length <= 0) {
            return noData(res, 'Record not found');
        }

        dataFound(res, result.recordsets[0]);
    } catch (error) {
        servError(error, res);
    }
}


export default {
    getNonConvertedSales,
    closingReport,
    SyncPosPending,
    ReturnDelivery
};
