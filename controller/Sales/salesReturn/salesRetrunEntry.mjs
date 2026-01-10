import sql from 'mssql';
import { Addition, checkIsNumber, createPadString, Division, isEqualNumber, ISOString, isValidNumber, Multiplication, RoundNumber, stringCompare, toArray, toNumber } from '../../../helper_functions.mjs';
import { invalidInput, servError, dataFound, noData, success, sentData } from '../../../res.mjs';
import { getNextId, getProducts } from '../../../middleware/miniAPIs.mjs';
import { calculateGSTDetails } from '../../../middleware/taxCalculator.mjs';

const salesReturn = () => {

    const getSalesReturn = async (req, res) => {
        try {
            const { retailerId, branchId, godownId } = req.query;
            const Fromdate = req.query?.Fromdate ? ISOString(req.query?.Fromdate) : ISOString();
            const Todate = req.query?.Todate ? ISOString(req.query?.Todate) : ISOString();

            const request = new sql.Request()
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .input('retailerId', retailerId)
                .input('branchId', branchId)
                .input('godownId', godownId)
                .query(`
                    DECLARE @filteredRows TABLE (id uniqueidentifier);
                    INSERT INTO @filteredRows
                    SELECT id 
                    FROM tbl_Sales_Return
                    WHERE 
                    	salesReturnDate BETWEEN @Fromdate AND @Todate
                    	${isValidNumber(retailerId) ? ' AND retailerId = @retailerId ' : ''}
                    	${isValidNumber(branchId) ? ' AND branchId = @branchId ' : ''}
                    	${isValidNumber(godownId) ? ' AND godownId = @godownId ' : ''}
                    SELECT 
                    	sr.*,
                    	COALESCE(r.Retailer_Name, 'Not found') retailerNameGet,
                    	COALESCE(b.BranchName, 'Not found') branchNameGet,
                    	COALESCE(g.Godown_Name, 'Not found') godownNameGet
                    FROM tbl_Sales_Return AS sr
                    LEFT JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = sr.retailerId
                    LEFT JOIN tbl_Branch_Master AS b ON b.BranchId = sr.branchId
                    LEFT JOIN tbl_Godown_Master AS g ON g.Godown_Id = sr.godownId
                    LEFT JOIN tbl_Users AS cb ON cb.UserId = sr.createdBy
                    WHERE id IN (SELECT id FROM @filteredRows);
                    SELECT
                    	srd.*,
                    	COALESCE(p.Product_Name, 'Not found') productNameGet,
                    	COALESCE(pu.Units, 'Not found') returnUnitGet,
                    	COALESCE(u.Units, 'Not found') productUnitGet,
                        p.UOM_Id productUnitId,
                        COALESCE(p.Product_Rate, 0) productRate
                    FROM tbl_Sales_Return_Details AS srd
                    LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = srd.productId
                    LEFT JOIN tbl_UOM AS pu ON pu.Unit_Id = p.UOM_Id
                    LEFT JOIN tbl_UOM AS u ON u.Unit_Id = srd.unitId
                    LEFT JOIN tbl_Sales_Return AS sr ON sr.id = srd.salesReturnId
                    WHERE salesReturnId IN (SELECT id FROM @filteredRows);`);

            const result = await request;

            const [returns, products] = result.recordsets;

            const salesReturns = toArray(returns).map(order => ({
                ...order,
                products: toArray(products).filter(product => product.salesReturnId === order.id)
            }))

            return sentData(res, salesReturns);
        } catch (e) {
            servError(e, res);
        }
    }

    const createSalesReturn = async (req, res) => {
        const transaction = new sql.Transaction();

        try {
            const {
                salesReturnDate,
                retailerId,
                branchId,
                godownId,
                reason,
                createdBy,
                details = []
            } = req.body;

            if (!salesReturnDate || !retailerId || !branchId || !createdBy) {
                return invalidInput(res, 'salesReturnDate, retailerId, branchId, createdBy');
            }

            if (!details.length) {
                return invalidInput(res, 'Sales Return Details required');
            }

            await transaction.begin();

            const headerId = crypto.randomUUID();
            console.log('here 1');

            /** INSERT HEADER */
            await new sql.Request(transaction)
                .input('id', headerId)
                .input('salesReturnDate', salesReturnDate)
                .input('retailerId', retailerId)
                .input('branchId', branchId)
                .input('godownId', godownId)
                .input('reason', reason)
                .input('createdBy', createdBy)
                .query(`
                    INSERT INTO tbl_Sales_Return (
                        id, salesReturnDate, retailerId,
                        branchId, godownId, reason,
                        totalAmount, createdBy, createdAt
                    )
                    VALUES (
                        @id, @salesReturnDate, @retailerId,
                        @branchId, @godownId, @reason,
                        0, @createdBy, GETDATE()
                    )
                `);

            console.log('here 2');

            let totalAmount = 0;

            /** INSERT DETAILS */
            for (const item of details) {
                const {
                    productId,
                    batch,
                    expireDate,
                    unitId,
                    returnQuantity,
                    itemRate,
                    Reason
                } = item;

                if (!productId || !unitId || !returnQuantity || !itemRate) {
                    throw new Error('Invalid product detail data');
                }

                const lineTotal = returnQuantity * itemRate;
                totalAmount += lineTotal;

                await new sql.Request(transaction)
                    .input('id', crypto.randomUUID())
                    .input('salesReturnId', headerId)
                    .input('productId', productId)
                    .input('batch', batch)
                    .input('expireDate', expireDate)
                    .input('unitId', unitId)
                    .input('returnQuantity', returnQuantity)
                    .input('itemRate', itemRate)
                    .input('Reason', Reason)
                    .query(`
                        INSERT INTO tbl_Sales_Return_Details (
                            id, salesReturnId, productId,
                            batch, expireDate, unitId,
                            returnQuantity, itemRate, Reason
                        )
                        VALUES (
                            @id, @salesReturnId, @productId,
                            @batch, @expireDate, @unitId,
                            @returnQuantity, @itemRate, @Reason
                        )
                    `);
            }

            console.log('here 3');

            await new sql.Request(transaction)
                .input('totalAmount', totalAmount)
                .input('id', headerId)
                .query(`
                    UPDATE tbl_Sales_Return
                    SET totalAmount = @totalAmount
                    WHERE id = @id
                `);

            await transaction.commit();

            success(res, 'Sales Return created successfully');

        } catch (error) {
            await transaction.rollback();
            servError(error, res);
        }
    };

    const updateSalesReturn = async (req, res) => {
        const transaction = new sql.Transaction();

        try {
            const {
                id,
                salesReturnDate,
                retailerId,
                branchId,
                godownId,
                reason,
                updatedBy,
                details = []
            } = req.body;

            if (!id || !salesReturnDate || !retailerId || !branchId || !updatedBy) {
                return invalidInput(
                    res,
                    'id, salesReturnDate, retailerId, branchId, updatedBy'
                );
            }

            if (!details.length) {
                return invalidInput(res, 'Sales Return Details required');
            }

            await transaction.begin();

            const check = await new sql.Request(transaction)
                .input('id', id)
                .query(`
                SELECT id
                FROM tbl_Sales_Return
                WHERE id = @id
            `);

            if (!check.recordset.length) {
                await transaction.rollback();
                return failed(res, 'Sales Return not found');
            }

            await new sql.Request(transaction)
                .input('id', id)
                .input('salesReturnDate', salesReturnDate)
                .input('retailerId', retailerId)
                .input('branchId', branchId)
                .input('godownId', godownId)
                .input('reason', reason)
                .input('updatedBy', updatedBy)
                .input('updatedAt', new Date())
                .query(`
                UPDATE tbl_Sales_Return
                SET
                    salesReturnDate = @salesReturnDate,
                    retailerId = @retailerId,
                    branchId = @branchId,
                    godownId = @godownId,
                    reason = @reason,
                    updatedBy = @updatedBy,
                    updatedAt = @updatedAt
                WHERE id = @id
            `);

            await new sql.Request(transaction)
                .input('id', id)
                .query(`
                DELETE FROM tbl_Sales_Return_Details
                WHERE salesReturnId = @id
            `);

            let totalAmount = 0;

            for (const item of details) {
                const {
                    productId,
                    batch,
                    expireDate,
                    unitId,
                    returnQuantity,
                    itemRate,
                    Reason
                } = item;

                if (!productId || !unitId || !returnQuantity || !itemRate) {
                    throw new Error('Invalid product detail data');
                }

                const lineTotal = returnQuantity * itemRate;
                totalAmount += lineTotal;

                await new sql.Request(transaction)
                    .input('id', crypto.randomUUID())
                    .input('salesReturnId', id)
                    .input('productId', productId)
                    .input('batch', batch)
                    .input('expireDate', expireDate)
                    .input('unitId', unitId)
                    .input('returnQuantity', returnQuantity)
                    .input('itemRate', itemRate)
                    .input('Reason', Reason)
                    .query(`
                    INSERT INTO tbl_Sales_Return_Details (
                        id, salesReturnId, productId,
                        batch, expireDate, unitId,
                        returnQuantity, itemRate, Reason
                    )
                    VALUES (
                        @id, @salesReturnId, @productId,
                        @batch, @expireDate, @unitId,
                        @returnQuantity, @itemRate, @Reason
                    )
                `);
            }

            await new sql.Request(transaction)
                .input('totalAmount', totalAmount)
                .input('id', id)
                .query(`
                UPDATE tbl_Sales_Return
                SET totalAmount = @totalAmount
                WHERE id = @id
            `);

            await transaction.commit();

            success(res, 'Sales Return updated successfully');

        } catch (error) {
            await transaction.rollback();
            servError(error, res);
        }
    };

    const deleteSalesReturn = async (req, res) => {
        try {
            const { id } = req.body;

            if (!id) {
                return invalidInput(res, 'id');
            }

            const result = await new sql.Request()
                .input('id', id)
                .query(`
                    DELETE FROM tbl_Sales_Return
                    WHERE id = @id
                `);

            if (result.rowsAffected[0] === 0) {
                return failed(res, 'No Data Found');
            }

            success(res, 'Sales Return deleted successfully');

        } catch (error) {
            servError(error, res);
        }
    };

    return {
        getSalesReturn,
        createSalesReturn,
        updateSalesReturn,
        deleteSalesReturn
    };
};

export default salesReturn();



// const getSalesReturn = async (req, res) => {
//     try {
//         const result = await new sql.Request().query(`
//             SELECT *
//             FROM tbl_Sales_Return
//             ORDER BY salesReturnDate DESC
//         `);

//         sentData(res, result.recordset);
//     } catch (error) {
//         servError(error, res);
//     }
// };

// const getSalesReturnById = async (req, res) => {
//     try {
//         const { id } = req.params;

//         if (!id) {
//             return invalidInput(res, 'id');
//         }

//         const header = await new sql.Request()
//             .input('id', id)
//             .query(`
//                 SELECT *
//                 FROM tbl_Sales_Return
//                 WHERE id = @id
//             `);

//         if (!header.recordset.length) {
//             return failed(res, 'Sales Return not found');
//         }

//         const details = await new sql.Request()
//             .input('id', id)
//             .query(`
//                 SELECT *
//                 FROM tbl_Sales_Return_Details
//                 WHERE salesReturnId = @id
//             `);

//         sentData(res, {
//             header: header.recordset[0],
//             details: details.recordset
//         });

//     } catch (error) {
//         servError(error, res);
//     }
// };

