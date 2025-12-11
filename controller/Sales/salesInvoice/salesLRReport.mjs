import sql from 'mssql';
import { isEqualNumber, ISOString, toArray } from '../../../helper_functions.mjs';
import { servError, sentData, success } from '../../../res.mjs';

export const getSalesInvoiceForAssignCostCenter = async (req, res) => {
    try {
        const reqDate = req.query.reqDate ? ISOString(req.query.reqDate) : ISOString();

        const getSalesInvoice = new sql.Request()
            .input('reqDate', sql.Date, reqDate)
            .query(`
                -- filtered invoices ids temp table
                -- DECLARE @reqDate DATE = '2025-11-11';
                DECLARE @FilteredInvoice TABLE (Do_Id BIGINT);
                -- inserting data to temp table
                INSERT INTO @FilteredInvoice (Do_Id)
                SELECT Do_Id
                FROM tbl_Sales_Delivery_Gen_Info
                WHERE 
                    Do_Date = @reqDate
                    AND ISNULL(staffInvolvedStatus, 0) <> 1;
                SELECT 
                    gen.Do_Id,
                    gen.Do_Inv_No,
                    gen.Voucher_Type,
                    vt.Voucher_Type AS voucherTypeGet,
                    gen.Do_Date,
                    gen.Retailer_Id,
                    r.Retailer_Name AS retailerNameGet,
                    gen.Branch_Id,
                    b.BranchName AS branchNameGet,
                    gen.Total_Invoice_value,
                    gen.Cancel_status,
                    gen.Created_by,
                    gen.Created_on,
                    gen.staffInvolvedStatus
                FROM tbl_Sales_Delivery_Gen_Info AS gen
                LEFT JOIN tbl_Voucher_Type AS vt ON vt.Vocher_Type_Id = gen.Voucher_Type
                LEFT JOIN tbl_Retailers_Master AS r ON r.Retailer_Id = gen.Retailer_Id
                LEFT JOIN tbl_Branch_Master AS b ON b.BranchId = gen.Branch_Id
                WHERE gen.Do_Id IN (SELECT Do_Id FROM @FilteredInvoice)
                ORDER BY Do_Id;
                -- involved staffs
                SELECT 
                    stf.*,
                    e.Cost_Center_Name AS Emp_Name,
                    cc.Cost_Category AS Involved_Emp_Type
                FROM tbl_Sales_Delivery_Staff_Info AS stf
                LEFT JOIN tbl_ERP_Cost_Center AS e
                    ON e.Cost_Center_Id = stf.Emp_Id
                LEFT JOIN tbl_ERP_Cost_Category AS cc
                    ON cc.Cost_Category_Id = stf.Emp_Type_Id
                WHERE stf.Do_Id IN (SELECT DISTINCT Do_Id FROM @FilteredInvoice)
                ORDER BY stf.Do_Id;
                -- Unique Cost Category IDs
                SELECT DISTINCT Emp_Type_Id
                FROM tbl_Sales_Delivery_Staff_Info
                WHERE Do_Id IN (SELECT Do_Id FROM @FilteredInvoice);
                -- Cost Types
                SELECT Cost_Category_Id, Cost_Category
                FROM tbl_ERP_Cost_Category
                ORDER BY Cost_Category;`);

        const result = await getSalesInvoice;

        const [invoices = [], staffs = [], uniqeInvolvedStaffs = [], costTypes = []] = result.recordsets;

        const invoicesWithStaffs = invoices.map(invoice => {
            const involvedStaffs = staffs.filter(staff => isEqualNumber(staff.Do_Id, invoice.Do_Id));
            return { ...invoice, involvedStaffs: involvedStaffs };
        });

        sentData(res, invoicesWithStaffs, {
            costTypes: toArray(costTypes),
            uniqeInvolvedStaffs: toArray(uniqeInvolvedStaffs).map(item => item.Emp_Type_Id)
        });
    } catch (e) {
        servError(e, res);
    }
}

export const postAssignCostCenterToSalesInvoice = async (req, res) => {
    const transaction = new sql.Transaction();

    try {
        const { Do_Id, involvedStaffs } = req.body;

        await transaction.begin();

        const request = new sql.Request(transaction);
        request
            .input('Do_Id', sql.BigInt, Do_Id)
            .input('involvedStaffs', sql.NVarChar, JSON.stringify(involvedStaffs));

        await request.query(`
            -- Delete old staff entries
            DELETE FROM tbl_Sales_Delivery_Staff_Info
            WHERE Do_Id = @Do_Id;
            -- Insert new staff entries
            INSERT INTO tbl_Sales_Delivery_Staff_Info (Do_Id, Emp_Type_Id, Emp_Id)
            SELECT 
                @Do_Id,
                JSON_VALUE(value, '$.Emp_Type_Id') AS Emp_Type_Id,
                JSON_VALUE(value, '$.Emp_Id') AS Emp_Id
            FROM OPENJSON(@involvedStaffs);
        `);

        await transaction.commit();

        success(res, 'Changes saved');
    } catch (e) {
        if (transaction._aborted === false) {
            await transaction.rollback();
        }
        servError(e, res);
    }
};
