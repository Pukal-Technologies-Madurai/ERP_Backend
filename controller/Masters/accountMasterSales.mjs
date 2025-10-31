import { checkIsNumber } from "../../helper_functions.mjs";
import { getNextId } from "../../middleware/miniAPIs.mjs";
import { failed, invalidInput, sentData, servError, success } from "../../res.mjs";
import sql from "mssql";

//  * GET - Fetch all Account Master Sales mappings
const getAccountMasterSales = async (req, res) => {
    try {
        const request = new sql.Request();
        const query = `
      SELECT 
        map.Id,
        map.Acc_Id,
        am.Account_Name,
        map.User_Id AS Sales_Id,
        u.Name AS Sales_Person_Name,
        map.Type,
        map.Active_Status
      FROM tbl_Acc_User_Mapping AS map
      JOIN tbl_Account_Master AS am ON am.Acc_Id = map.Acc_Id
      JOIN tbl_Users AS u ON u.UserId = map.User_Id  -- ✅ FIXED HERE
      WHERE map.Active_Status = 0
      ORDER BY map.Id DESC;
    `;
        const result = await request.query(query);
        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
};

//  * POST - Insert new Account Master Sales record
const insertAccountMasterSales = async (req, res) => {
    try {
        const { Acc_Id, Sales_Id, Type = "" } = req.body;

        if (!checkIsNumber(Acc_Id) || !checkIsNumber(Sales_Id) || !Type) {
            return invalidInput(res, "Acc_Id, Sales_Id, and Type are required");
        }

        const getId = await getNextId({ table: "tbl_Acc_User_Mapping", column: "Id" });
        if (!getId.status || !checkIsNumber(getId.MaxId))
            throw new Error("Failed to get next Id");

        const Id = getId.MaxId;

        const request = new sql.Request()
            .input("Id", Id)
            .input("Acc_Id", Acc_Id)
            .input("User_Id", Sales_Id)
            .input("Type", Type)
            .query(`
        INSERT INTO tbl_Acc_User_Mapping (Id, Acc_Id, User_Id, Type, Active_Status)
        VALUES (@Id, @Acc_Id, @User_Id, @Type, 0);
      `);

        const result = await request;
        if (result.rowsAffected[0] === 1) {
            success(res, "Saved");
        } else {
            failed(res, "Failed to save");
        }
    } catch (e) {
        servError(e, res);
    }
};

//  * PUT - Update Account Master Sales record
const updateAccountMasterSales = async (req, res) => {
    try {
        const { Id, Acc_Id, Sales_Id, Type = "" } = req.body;

        if (!checkIsNumber(Id) || !checkIsNumber(Acc_Id) || !checkIsNumber(Sales_Id) || !Type.trim()) {
            return invalidInput(res, "Id, Acc_Id, Sales_Id, and Type are required");
        }

        const request = new sql.Request();
        const result = await request
            .input("Id", Id)
            .input("Acc_Id", Acc_Id)
            .input("User_Id", Sales_Id)
            .input("Type", Type)
            .query(`
        UPDATE tbl_Acc_User_Mapping
        SET 
          Acc_Id = @Acc_Id,
          User_Id = @User_Id,
          Type = @Type
        WHERE Id = @Id;
      `);

        if (result.rowsAffected[0] === 1) {
            success(res, "Updated");
        } else {
            failed(res, "Failed to update");
        }
    } catch (e) {
        servError(e, res);
    }
};

//  * DELETE 
const deleteAccountMasterSales = async (req, res) => {
    try {
        const { Id } = req.body;
        if (!checkIsNumber(Id)) return invalidInput(res, "Valid Id is required");

        const request = new sql.Request();
        const result = await request
            .input("Id", Id)
            .query(`
        UPDATE tbl_Acc_User_Mapping
        SET Active_Status = 1
        WHERE Id = @Id;
      `);

        if (result.rowsAffected[0] === 1) {
            success(res, "Deleted");
        } else {
            failed(res, "Failed to delete");
        }
    } catch (e) {
        servError(e, res);
    }
};

//  * GET - Dropdown for Accounts
const getAccountDropdown = async (req, res) => {
    try {
        const request = new sql.Request();
        const query = `
      SELECT 
        Acc_Id AS value, 
        Account_Name AS label
      FROM tbl_Account_Master
      ORDER BY Account_Name;
    `;
        const result = await request.query(query);
        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
};

//  * GET - Dropdown for Sales Persons 
const getSalesPersonDropdown = async (req, res) => {
    try {
        const request = new sql.Request();
        const query = `
    SELECT
      UserId AS Id, Name
      FROM tbl_Users
      WHERE UserTypeId = 6
      ORDER BY Name;
    `;
        const result = await request.query(query);
        sentData(res, result.recordset);
    } catch (e) {
        servError(e, res);
    }
};

export default {
    getAccountMasterSales,
    insertAccountMasterSales,
    updateAccountMasterSales,
    deleteAccountMasterSales,
    getAccountDropdown,
    getSalesPersonDropdown,
};
