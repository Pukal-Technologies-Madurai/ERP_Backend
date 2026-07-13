import sql from 'mssql';
import { servError, success } from '../../res.mjs';
import { ISOString, toNumber, isEqualNumber, toArray } from '../../helper_functions.mjs';

export const getProcessingForAssignCostCenter = async (req, res) => {
    try {
        const reqDate = req.query.reqDate ? ISOString(req.query.reqDate) : ISOString();
        const status = req.query.staffStatus;

        const getProcessingQuery = new sql.Request()
            .input('reqDate', sql.Date, reqDate)
            .input('status', sql.Int, toNumber(status))
            .query(`
            -- filtered processing ids temp table
                DECLARE @FilteredProcessing TABLE (PR_Id BIGINT);
            -- inserting data to temp table
                INSERT INTO @FilteredProcessing (PR_Id)
                SELECT PR_Id
                FROM tbl_Processing_Gen_Info
                WHERE 
                    CONVERT(DATE, Process_date) = @reqDate
                    ${isEqualNumber(status, 0) ? ' AND ISNULL(staffInvolvedStatus, 0) = 0 ' : ''}

            -- general info
                SELECT 
                    gen.PR_Id,
                    gen.PR_Inv_Id,
                    gen.VoucherType,
                    vt.Voucher_Type AS voucherTypeGet,
                    gen.Process_date,
                    gen.Godownlocation,
                    g.Godown_Name AS godownNameGet,
                    gen.Branch_Id,
                    b.BranchName AS branchNameGet,
                    gen.PR_Status, 
                    gen.Narration,
                    gen.Created_By,
                    gen.Created_At,
                    ISNULL(gen.staffInvolvedStatus, 0) staffInvolvedStatus,
                    CONVERT(DATETIME, gen.Created_At) AS createdOn,
                    COALESCE(cb.Name, 'unknown') AS Created_BY_Name
                FROM tbl_Processing_Gen_Info AS gen
                LEFT JOIN tbl_Voucher_Type AS vt ON vt.Vocher_Type_Id = gen.VoucherType
                LEFT JOIN tbl_Godown_Master AS g ON g.Godown_Id = gen.Godownlocation
                LEFT JOIN tbl_Branch_Master AS b ON b.BranchId = gen.Branch_Id
                LEFT JOIN tbl_Users AS cb ON cb.UserId = gen.Created_By
                WHERE gen.PR_Id IN (SELECT PR_Id FROM @FilteredProcessing)
                ORDER BY gen.PR_Id DESC;

            -- involved staffs
                SELECT 
                    stf.PR_Id,
                    stf.Staff_Type_Id AS Emp_Type_Id,
                    stf.Staff_Id AS Emp_Id,
                    e.Cost_Center_Name AS Emp_Name,
                    cc.Cost_Category AS Involved_Emp_Type
                FROM tbl_Processing_Staff_Involved AS stf
                LEFT JOIN tbl_ERP_Cost_Center AS e
                    ON e.Cost_Center_Id = stf.Staff_Id
                LEFT JOIN tbl_ERP_Cost_Category AS cc
                    ON cc.Cost_Category_Id = stf.Staff_Type_Id
                WHERE stf.PR_Id IN (SELECT DISTINCT PR_Id FROM @FilteredProcessing)
                ORDER BY stf.PR_Id;

            -- Unique Cost Category IDs
                SELECT DISTINCT Staff_Type_Id AS Emp_Type_Id
                FROM tbl_Processing_Staff_Involved
                WHERE PR_Id IN (SELECT PR_Id FROM @FilteredProcessing);

            -- Cost Types
                SELECT Cost_Category_Id, Cost_Category
                FROM tbl_ERP_Cost_Category
                ORDER BY Cost_Category;

            -- Source details
                SELECT 
                    sdsi.PR_Id,
                    sdsi.Sour_Item_Id AS Item_Id,
                    COALESCE(sdsi.Sour_Qty, 0) AS Bill_Qty,
                    p.Product_Name AS itemNameGet,
                    'Source' AS detailType
                FROM tbl_Processing_Source_Details sdsi
                LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = sdsi.Sour_Item_Id
                WHERE sdsi.PR_Id IN (SELECT PR_Id FROM @FilteredProcessing)

            -- Destination details
                SELECT 
                    pdd.PR_Id,
                    pdd.Dest_Item_Id AS Item_Id,
                    COALESCE(pdd.Dest_Qty, 0) AS Bill_Qty,
                    p.Product_Name AS itemNameGet,
                    'Destination' AS detailType
                FROM tbl_Processing_Destin_Details pdd
                LEFT JOIN tbl_Product_Master AS p ON p.Product_Id = pdd.Dest_Item_Id
                WHERE pdd.PR_Id IN (SELECT PR_Id FROM @FilteredProcessing)
                ORDER BY pdd.PR_Id;
            `
            );

        const result = await getProcessingQuery;

        const [
            processingList = [], 
            staffs = [], 
            uniqeInvolvedStaffs = [], 
            costTypes = [], 
            sourceDetails = [],
            destDetails = []
        ] = result.recordsets;

        const allStockDetails = [...sourceDetails, ...destDetails];

        const processingWithStaffs = processingList.map(processing => {
            const involvedStaffs = staffs.filter(stf =>
                isEqualNumber(stf.PR_Id, processing.PR_Id)
            );

            const processingStockDetails = allStockDetails.filter(stk =>
                isEqualNumber(stk.PR_Id, processing.PR_Id)
            );

            return {
                ...processing,
                involvedStaffs,
                stockDetails: processingStockDetails
            };
        });

        res.status(200).json({
            success: true,
            data: processingWithStaffs,
            others: {
                costTypes: toArray(costTypes),
                uniqeInvolvedStaffs: toArray(uniqeInvolvedStaffs).map(i => i.Emp_Type_Id)
            }
        });

    } catch (e) {
        servError(e, res);
    }
};

export const postAssignCostCenterToProcessing = async (req, res) => {
    const transaction = new sql.Transaction();

    try {
        const { PR_Id, involvedStaffs, staffInvolvedStatus } = req.body;

        await transaction.begin();

        const updateStatusRequest = new sql.Request(transaction);
        await updateStatusRequest
            .input('PR_Id', sql.BigInt, PR_Id)
            .input('staffInvolvedStatus', sql.Int, staffInvolvedStatus)
            .query(`
                UPDATE tbl_Processing_Gen_Info
                SET staffInvolvedStatus = @staffInvolvedStatus
                WHERE PR_Id = @PR_Id;`
            );

        // Update involved staffs
        const request = new sql.Request(transaction);
        await request
            .input('PR_Id', sql.BigInt, PR_Id)
            .input('involvedStaffs', sql.NVarChar, JSON.stringify(involvedStaffs))
            .query(`
                -- Delete old staff entries
                DELETE FROM tbl_Processing_Staff_Involved
                WHERE PR_Id = @PR_Id;
                
                -- Insert new staff entries
                INSERT INTO tbl_Processing_Staff_Involved (PR_Id, Staff_Type_Id, Staff_Id)
                SELECT 
                    @PR_Id,
                    JSON_VALUE(value, '$.Emp_Type_Id') AS Staff_Type_Id,
                    JSON_VALUE(value, '$.Emp_Id') AS Staff_Id
                FROM OPENJSON(@involvedStaffs);`
            );

        await transaction.commit();

        success(res, 'Changes saved');
    } catch (e) {
        if (transaction._aborted === false) {
            await transaction.rollback();
        }
        servError(e, res);
    }
};

export const multipleProcessingStaffUpdate = async (req, res) => {
    const transaction = new sql.Transaction();
    try {
        const { CostCategory, PR_Id, involvedStaffs, staffInvolvedStatus, deliveryStatus = 5 } = req.body;
        const processingIdsStr = PR_Id.join(',');

        await transaction.begin();

        await new sql.Request(transaction)
            .input('processingIds', sql.NVarChar(sql.MAX), processingIdsStr)
            .input('staffInvolvedStatus', sql.Int, staffInvolvedStatus)
            .input('PR_Status', sql.NVarChar, deliveryStatus)
            .query(`
                UPDATE tbl_Processing_Gen_Info
                SET 
                    staffInvolvedStatus = @staffInvolvedStatus,
                    PR_Status = @PR_Status
                WHERE PR_Id IN (
                    SELECT CAST(value AS INT)
                    FROM STRING_SPLIT(@processingIds, ',')
                );`
            );

        if (PR_Id.length > 0 && CostCategory) {
            await new sql.Request(transaction)
                .input('processingIds', sql.NVarChar(sql.MAX), processingIdsStr)
                .input('Staff_Type_Id', sql.Int, CostCategory)
                .query(`
                    DELETE FROM tbl_Processing_Staff_Involved
                    WHERE 
                        PR_Id IN (
                            SELECT CAST(value AS INT)
                            FROM STRING_SPLIT(@processingIds, ',')
                        )
                        AND Staff_Type_Id = @Staff_Type_Id;`
                );
        }

        if (involvedStaffs.length > 0) {
            const values = [];
            PR_Id.forEach(prId => {
                involvedStaffs.forEach(staffId => {
                    values.push(`(${prId}, ${CostCategory}, ${staffId})`);
                });
            });

            if (values.length > 0) {
                const query = `
                    INSERT INTO tbl_Processing_Staff_Involved (PR_Id, Staff_Type_Id, Staff_Id)
                    VALUES ${values.join(',')};`;
                const request = new sql.Request(transaction);
                await request.query(query);
            }
        }

        await transaction.commit();
        success(res, 'Processing Staff Updated!');
    } catch (e) {
        if (transaction._aborted === false) {
            await transaction.rollback();
        }
        servError(e, res);
    }
}

export const multipleProcessingStaffDelete = async (req, res) => {
    const transaction = new sql.Transaction();
    try {
        if (!req.body.CostCategory || !req.body.PR_Id || !Array.isArray(req.body.PR_Id)) {
            return res.status(400).json({
                success: false,
                message: 'CostCategory and PR_Id (array) are required'
            });
        }

        const { CostCategory, PR_Id } = req.body;
        const processingIdsStr = PR_Id.join(',');

        await transaction.begin();

        await new sql.Request(transaction)
            .input('processingIds', sql.NVarChar(sql.MAX), processingIdsStr)
            .input('Staff_Type_Id', sql.Int, CostCategory)
            .query(`
                DELETE FROM tbl_Processing_Staff_Involved
                WHERE 
                    PR_Id IN (
                        SELECT CAST(value AS INT)
                        FROM STRING_SPLIT(@processingIds, ',')
                    )
                    AND Staff_Type_Id = @Staff_Type_Id;`
            );

        await transaction.commit();
        success(res, `Staff with CostCategory ${CostCategory} removed from ${PR_Id.length} records!`);
    } catch (e) {
        if (transaction._aborted === false) {
            await transaction.rollback();
        }
        servError(e, res);
    }
}
