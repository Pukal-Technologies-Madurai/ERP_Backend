import sql from "mssql";
import {
    servError,
    dataFound,
    noData,
    failed,
    success,
    invalidInput,
} from "../../res.mjs";
import { checkIsNumber, randomNumber } from "../../helper_functions.mjs";
import { getNextId } from "../../middleware/miniAPIs.mjs";


const District = () => {

    const getDistric = async (req, res) => {
        try {
            const request = new sql.Request();
            const result = await request.query(`
            SELECT 
                d.District_Id,
                d.District_Name,
                d.State_Id,
            sm.State_Name AS State_Name
            FROM tbl_Distict_Master d
             LEFT JOIN tbl_State_Master sm ON sm.State_Id = d.State_Id

        `);

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset);
            } else {
                noData(res, "No data");
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const createDistrict = async (req, res) => {
        try {
            const { District_Name, State_Id } = req.body;

            if (!District_Name || !State_Id) {
                return failed(res, "DistrictName & StateName is required");
            }

            const checkExisting = await new sql.Request()
                .input("District_Name", District_Name)
                .input("State_Id", State_Id)
                .query(
                    "SELECT 1 FROM tbl_Distict_Master WHERE District_Name = @District_Name"
                );

            if (checkExisting.recordset.length > 0) {
                failed(res, "DistrictName already exists");
            }

            const getMaxId = await getNextId({
                table: "tbl_Distict_Master",
                column: "District_Id",
            });
            if (!checkIsNumber(getMaxId.MaxId)) {
                failed(res, "Error generating District ID");
            }

            const District_Id = getMaxId.MaxId;

            const Alter_Id = randomNumber();

            const request = new sql.Request();
            await request
                .input("District_Id", District_Id)
                .input("District_Name", District_Name)
                .input("State_Id", State_Id).query(`
                INSERT INTO tbl_Distict_Master (District_Id, District_Name,State_Id) 
                VALUES (@District_Id, @District_Name,@State_Id)
            `);

            success(res, "District created successfully.");
        } catch (e) {
            servError(e, res);
        }
    };

    const updateDistrict = async (req, res) => {
        try {
            const { District_Id, District_Name, State_Id } = req.body;

            if (!District_Id || !District_Name || !State_Id) {
                return invalidInput(res, "All fields are required");
            }

            const request = new sql.Request();
            const result = await request
                .input("District_Id", sql.Int, District_Id)
                .input("District_Name", sql.NVarChar, District_Name)
                .input("State_Id", sql.Int, State_Id).query(`
                UPDATE tbl_Distict_Master 
                SET 
                    District_Name = @District_Name,
                    State_Id = @State_Id
                WHERE District_Id = @District_Id
            `);

            if (result.rowsAffected[0] === 0) {
                return noData(res);
            }

            success(res, "District updated successfully");
        } catch (e) {
            servError(e, res);
        }
    };

    const deleteDistrict = async (req, res) => {
        try {
            const { District_Id } = req.body;

            if (!District_Id) {
                return invalidInput(res, "District_Id is Required");
            }

            const request = new sql.Request().input("District_Id", District_Id);

            const result = await request.query(`
            DELETE FROM tbl_Distict_Master
            WHERE District_Id = @District_Id
        `);

            if (result.rowsAffected[0] === 0) {
                noData(res, "No Data");
            }

            success(res, "District Master deleted.");
        } catch (error) {
            servError(error, res);
        }
    };

    return {
        getDistric,
        createDistrict,
        updateDistrict,
        deleteDistrict,
    };
};

export default District();
