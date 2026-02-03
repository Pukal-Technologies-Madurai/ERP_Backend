import sql from 'mssql'
import { servError, dataFound, noData, success, failed, invalidInput, sentData } from '../../res.mjs';
import { Addition, checkIsNumber, ISOString, isValidDate } from '../../helper_functions.mjs';

const CostCenter = () => {

    const getCostCenter = async (req, res) => {
        try {
            const result = await sql.query(`
                SELECT 
                    c.Cost_Center_Id,
                    c.Cost_Center_Name,
                    c.User_Type,
                    CASE WHEN c.Allias_Name IS NULL THEN c.Cost_Center_Name ELSE c.Allias_Name END AS Allias_Name,
                    COALESCE(cc.Cost_Category, 'Not found') AS UserTypeGet,
                    COALESCE(u.Name, 'Not found') AS UserGet
                FROM tbl_ERP_Cost_Center AS c
                LEFT JOIN tbl_ERP_Cost_Category AS cc
                    ON cc.Cost_Category_Id = c.User_Type
                LEFT JOIN tbl_Users AS u
                    ON u.UserId = c.User_Id;

            `);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const createCostCenter = async (req, res) => {
        const { Cost_Center_Name, User_Type, Is_Converted_To_User, User_Id, Allias_Name } = req.body;

        if (!Cost_Center_Name || !User_Type) {
            return invalidInput(res, 'Cost_Center_Name, User_Type are required');
        }

        try {
            const getMaxIdResult = await new sql.Request()
                .query(`
                    SELECT CASE WHEN COUNT(*) > 0 THEN MAX(Cost_Center_Id) ELSE 0 END AS MaxUserId 
                    FROM tbl_ERP_Cost_Center;
                `);

            const newCostCenterId = Number(getMaxIdResult.recordset[0].MaxUserId) + 1;


            let finalIsConvertedToUser = (Is_Converted_To_User == '' || Is_Converted_To_User == null) ? 0 : 1;


            let finalUserId = (User_Id == '' || User_Id == null) ? 0 : User_Id;
            if (finalUserId !== '' || finalUserId !== null) {
                const request = new sql.Request()

                    .input('User_Type', User_Type)
                    .input('User_Id', finalUserId)

                    .query(`
                    UPDATE tbl_Users SET UserTypeId=@User_Type WHERE UserId=@User_Id
                `);

            }
            const request = new sql.Request()
                .input('Cost_Center_Id', newCostCenterId)
                .input('Cost_Center_Name', Cost_Center_Name)
                .input('User_Type', User_Type)
                .input('Is_Converted_To_User', finalIsConvertedToUser)
                .input('User_Id', finalUserId)
                .input('Allias_Name', Allias_Name)

                .query(`
                    INSERT INTO tbl_ERP_Cost_Center (
                        Cost_Center_Id, Cost_Center_Name, User_Type, Is_Converted_To_User, User_Id, Allias_Name
                    ) VALUES (
                        @Cost_Center_Id, @Cost_Center_Name, @User_Type, @Is_Converted_To_User, @User_Id, @Allias_Name
                    );
                `);

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'New Cost Center Created Successfully');
            } else {
                failed(res, 'Failed to create Cost Center');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const updateCostCenter = async (req, res) => {
        const { Cost_Center_Id, Cost_Center_Name, User_Type, Allias_Name } = req.body;

        if (!checkIsNumber(Cost_Center_Id) || !Cost_Center_Name || !User_Type) {
            return invalidInput(res, 'Cost_Center_Name, User_Type is required');
        }

        try {
            const request = new sql.Request()
                .input('Cost_Center_Id', Cost_Center_Id)
                .input('Cost_Center_Name', Cost_Center_Name)
                .input('User_Type', User_Type)
                .input('Is_Converted_To_User', 0)
                .input('Allias_Name', Allias_Name)
                .query(`
                    UPDATE tbl_ERP_Cost_Center
                    SET
                        Cost_Center_Name = @Cost_Center_Name,
                        User_Type = @User_Type,
                        Allias_Name = @Allias_Name
                    WHERE
                        Cost_Center_Id = @Cost_Center_Id;
                    `);

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Changes Saved');
            } else {
                failed(res, 'Failed to save changes')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getCostCenterCategory = async (req, res) => {
        try {
            const result = await sql.query(`
                SELECT *
                FROM tbl_ERP_Cost_Category
            `);

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res);
        }
    }

    const createCostCategory = async (req, res) => {
        const { Cost_Category } = req.body;

        if (!Cost_Category) {
            return invalidInput(res, 'Cost_Category are required');
        }

        try {
            const getMaxIdResult = await new sql.Request()
                .query(`
                    SELECT CASE WHEN COUNT(*) > 0 THEN MAX(Cost_Category_Id) ELSE 0 END AS MaxCategoryId 
                    FROM tbl_ERP_Cost_Category;
                `);

            const newCostCenterId = Number(getMaxIdResult.recordset[0].MaxCategoryId) + 1;

            const request = new sql.Request()
                .input('Cost_Category_Id', newCostCenterId)
                .input('Cost_Category', Cost_Category)
                .query(`
                    INSERT INTO tbl_ERP_Cost_Category (
                        Cost_Category_Id, Cost_Category
                    ) VALUES (
                        @Cost_Category_Id, @Cost_Category
                    );
                `);

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'New Cost Category Created Successfully');
            } else {
                failed(res, 'Failed to create Cost Category');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const deleteCostCategory = async (req, res) => {
        const { Cost_Category_Id } = req.body;

        if (!checkIsNumber(Cost_Category_Id)) {
            return invalidInput(res, 'Cost_Category_Id must be a valid number');
        }

        try {
            const request = new sql.Request();
            request.input('Cost_Category_Id', sql.Int, Cost_Category_Id);

            const result = await request.query(`
            DELETE FROM tbl_ERP_Cost_Category 
            WHERE Cost_Category_Id = @Cost_Category_Id;
        `);

            if (result.rowsAffected[0] > 0) {
                success(res, 'Cost_Category deleted successfully');
            } else {
                failed(res, 'No Cost_Category found to delete');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const updateCostCategory = async (req, res) => {
        const { Cost_Category_Id, Cost_Category } = req.body;

        if (!checkIsNumber(Cost_Category_Id)) {
            return invalidInput(res, 'Cost_Category_Id required');
        }

        try {
            const request = new sql.Request()
                .input('Cost_Category_Id', Cost_Category_Id)
                .input('Cost_Category', Cost_Category)
                .query(`
                UPDATE tbl_ERP_Cost_Category
                SET
                    Cost_Category = @Cost_Category
                WHERE
                    Cost_Category_Id = @Cost_Category_Id;
                `);

            const result = await request;

            if (result.rowsAffected[0] > 0) {
                success(res, 'Changes Saved');
            } else {
                failed(res, 'Failed to save changes')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const costCategoryDropDown = async (req, res) => {
        try {
            const result = await sql.query(`
             SELECT Cost_Category_Id as value, Cost_Category as label FROM tbl_ERP_Cost_Category
            `);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const costCenterInvolvedReports = async (req, res) => {
        const { Fromdate, Todate } = req.query;
        try {
            const validateion = {
                Fromdate: isValidDate(Fromdate),
                Todate: isValidDate(Todate)
            }
            const from = validateion.Fromdate ? ISOString(Fromdate) : ISOString();
            const to = validateion.Todate ? ISOString(Todate) : ISOString();
            const request = new sql.Request()
                .input('Fromdate', from)
                .input('Todate', to)
                .query(`
                    WITH STOCKJOURNAL AS (
                    	SELECT STJ_Id, Stock_Journal_date
                    	FROM tbl_Stock_Journal_Gen_Info
                    	WHERE Stock_Journal_date BETWEEN @Fromdate AND @Todate
                    ), TRIPSHEET AS (
                    	SELECT Trip_Id, Trip_Date
                    	FROM tbl_Trip_Master
                    	WHERE Trip_Date BETWEEN @Fromdate AND @Todate
                    ), DESTINATION AS (
                    	SELECT 
                    		d.STJ_Id, stj.Stock_Journal_date, SUM(d.Dest_Qty) AS TotalTonnage
                    	FROM tbl_Stock_Journal_Dest_Details AS d
                    	LEFT JOIN STOCKJOURNAL AS stj
                    	ON stj.STJ_Id = d.STJ_Id
                    	WHERE d.STJ_Id IN (SELECT STJ_Id FROM STOCKJOURNAL)
                    	GROUP BY d.STJ_Id, stj.Stock_Journal_date
                    ), TRIP_DETAILS AS (
                    	SELECT 
                    		td.Trip_Id, t.Trip_Date, SUM(trparr.QTY) AS TotalTonnage
                    	FROM tbl_Trip_Details AS td
                        LEFT JOIN tbl_Trip_Arrival AS trparr
                            ON trparr.Arr_Id = td.Arrival_Id
                    	LEFT JOIN TRIPSHEET AS t
                    	    ON td.Trip_Id = t.Trip_Id
                    	WHERE td.Trip_Id IN (SELECT Trip_Id FROM TRIPSHEET)
                    	GROUP BY td.Trip_Id, t.Trip_Date
                    ), ST_EMPLOYEES AS (
                    	SELECT 
                    		STE.STJ_Id AS InvoiceId, 
                    		STE.Staff_Id AS StaffId, 
                    		STE.Staff_Type_Id AS StaffType, 
                    		c.Cost_Center_Name AS CostName, 
                    		cc.Cost_Category AS CostType,  
                    		c.User_Id AS UserId,
                    		COALESCE(u.Name, 'Not mapped') AS Name,
                    		d.TotalTonnage,
                    		d.Stock_Journal_date AS EventDate,
                    		'Stock Journal' AS DataFrom
                    	FROM tbl_Stock_Journal_Staff_Involved AS STE
                    	LEFT JOIN tbl_ERP_Cost_Center AS c
                    	ON c.Cost_Center_Id = STE.Staff_Id
                    	LEFT JOIN tbl_ERP_Cost_Category AS cc
                    	ON cc.Cost_Category_Id = STE.Staff_Type_Id 
                    	LEFT JOIN tbl_Users AS u
                    	ON u.UserId = c.User_Id
                    	LEFT JOIN DESTINATION AS d
                    	ON d.STJ_Id = STE.STJ_Id
                    	WHERE STE.STJ_Id IN (SELECT STJ_Id FROM STOCKJOURNAL)
                    ),  TRIP_EMPLOYEES AS (
                    	SELECT 
                    		te.Trip_Id AS InvoiceId, 
                    		te.Involved_Emp_Id AS StaffId, 
                    		te.Cost_Center_Type_Id AS StaffType, 
                    		c.Cost_Center_Name AS CostName, 
                    		cc.Cost_Category AS CostType, 
                    		c.User_Id AS UserId,
                    		COALESCE(u.Name, 'Not mapped') AS Name,
                    		td.TotalTonnage,
                    		td.Trip_Date AS EventDate,
                    		'Trip Sheet' AS DataFrom
                    	FROM tbl_Trip_Employees AS te
                    	LEFT JOIN tbl_ERP_Cost_Center AS c
                    	ON c.Cost_Center_Id = te.Involved_Emp_Id
                    	LEFT JOIN tbl_ERP_Cost_Category AS cc
                    	ON cc.Cost_Category_Id = te.Cost_Center_Type_Id 
                    	LEFT JOIN tbl_Users AS u
                    	ON u.UserId = c.User_Id
                    	LEFT JOIN TRIP_DETAILS AS td
                    	ON te.Trip_Id = td.Trip_Id
                    	WHERE te.Trip_Id IN (SELECT Trip_Id FROM TRIP_DETAILS)
                    )
                    SELECT * FROM ST_EMPLOYEES
                    UNION ALL
                    SELECT * FROM TRIP_EMPLOYEES;`
                );

            const result = await request;

            sentData(res, result.recordset)
        } catch (e) {
            servError(e, res)
        }
    }

    const costCenterEmployeeReports = async (req, res) => {
        const { reqDate, userid } = req.query;

        try {
            const validateion = {
                reqDate: isValidDate(reqDate),
                userid: checkIsNumber(userid)
            }
            if (!validateion.userid) return invalidInput(res, 'userid is required');

            const filterDate = validateion.reqDate ? ISOString(reqDate) : ISOString();

            const emp = await new sql.Request()
                .input('user', userid)
                .query(`
                    SELECT Cost_Center_Id 
	                FROM tbl_ERP_Cost_Center
	                WHERE User_Id = @user`
                );

            if (emp.recordset.length === 0) {
                return noData(res, 'User Not mapped in cost center')
            }

            const request = new sql.Request()
                .input('reqDate', sql.Date, filterDate)
                .input('user', sql.Int, userid)
                .query(`
                    WITH STAFF AS (
                        SELECT 
                            c.*,
                            cc.Cost_Category AS ActualUserType,
                            u.Name AS ERPName
                        FROM tbl_ERP_Cost_Center AS c
                        LEFT JOIN tbl_ERP_Cost_Category AS cc ON cc.Cost_Category_Id = c.User_Type
                        LEFT JOIN tbl_Users AS u ON u.UserId = c.User_Id
                        WHERE c.User_Id = @user
                    ), STOCKJOURNAL AS (
                        SELECT 
                            DISTINCT sjs.Staff_Id AS SJ_StaffId,
                            sjs.STJ_Id AS SJ_InvoiceId,
                            SUM(sjd.Dest_Qty) AS SJTotalTonnage 
                        FROM 
                            tbl_Stock_Journal_Gen_Info AS sj
                    		LEFT JOIN tbl_Stock_Journal_Staff_Involved AS sjs ON sjs.STJ_Id = sj.STJ_Id
                    		LEFT JOIN tbl_Stock_Journal_Dest_Details AS sjd ON sjd.STJ_Id = sj.STJ_Id
                        WHERE 
                            sj.Stock_Journal_date = @reqDate
                            AND sjs.Staff_Id IN (SELECT Cost_Center_Id FROM STAFF)
                        GROUP BY sjs.Staff_Id, sjs.STJ_Id
                    ), TRIPSHEET AS (
                        SELECT 
                            DISTINCT ts.Involved_Emp_Id AS TS_StaffId,
                            t.Trip_Id AS TS_InvoiceId,
                            SUM(td.QTY) AS TSTotalTonnage 
                        FROM 
                            tbl_Trip_Master AS t
                    		LEFT JOIN tbl_Trip_Employees AS ts ON t.Trip_Id = ts.Trip_Id
                    		LEFT JOIN tbl_Trip_Details AS td ON td.Trip_Id = t.Trip_Id
                        WHERE 
                            t.Trip_Date = @reqDate
                            AND ts.Involved_Emp_Id IN (SELECT Cost_Center_Id FROM STAFF)
                        GROUP BY ts.Involved_Emp_Id, t.Trip_Id
                    )
                    SELECT 
                        stf.*,
                    	COALESCE((
                    		SELECT * 
                    		FROM STOCKJOURNAL 
                    		WHERE 
                    			SJ_StaffId = stf.Cost_Center_Id 
                    			AND SJ_InvoiceId IS NOT NULL
                    		FOR JSON PATH
                    	), '[]') AS Stock_Journals,
                    	COALESCE((
                    		SELECT * 
                    		FROM TRIPSHEET 
                    		WHERE 
                    			TS_StaffId = stf.Cost_Center_Id
                    			AND TS_InvoiceId IS NOT NULL
                    		FOR JSON PATH
                    	), '[]') AS Trip_Sheet
                    FROM 
                        STAFF AS stf;`
                );

            const result = await request;

            const parsed = result.recordset.map(staff => ({
                ...staff,
                Stock_Journals: JSON.parse(staff.Stock_Journals),
                Trip_Sheet: JSON.parse(staff.Trip_Sheet)
            }));

            const abstractData = parsed.map(staff => ({
                ...staff,
                StockJournalTotal: staff.Stock_Journals.reduce((acc, sj) => Addition(acc, sj.SJTotalTonnage), 0),
                TripSheetTotal: staff.Trip_Sheet.reduce((acc, ts) => Addition(acc, ts.TSTotalTonnage), 0)
            })).filter(staff => staff?.Stock_Journals?.length > 0 || staff?.Trip_Sheet?.length > 0);


            sentData(res, abstractData)
        } catch (e) {
            servError(e, res)
        }
    }

    return {
        getCostCenter,
        createCostCenter,
        updateCostCenter,
        getCostCenterCategory,
        createCostCategory,
        deleteCostCategory,
        updateCostCategory,
        costCategoryDropDown,
        costCenterInvolvedReports,
        costCenterEmployeeReports
    }
}


export default CostCenter()