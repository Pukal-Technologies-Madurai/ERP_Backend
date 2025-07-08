import sql from 'mssql'
import { servError, dataFound, noData, sentData, invalidInput, failed, success } from '../../res.mjs';
import { checkIsNumber, randomNumber } from '../../helper_functions.mjs';

import { getNextId } from '../../middleware/miniAPIs.mjs';

const brandController = () => {

    const getBrandDropDown = async (req, res) => {

        try {
            const brand = (await new sql.Request()
                .query(`
                    SELECT 
                        Brand_Id, 
                        Brand_Name 
                    FROM 
                        tbl_Brand_Master 
                        `)
            ).recordset;
            // AND
            // Company_id = @Comp

            if (brand.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getBrand = async (req, res) => {

        try {
            const request = new sql.Request()
                .query(`
                    SELECT 
                      *
                    FROM 
                        tbl_Brand_Master
                    `);
            // B.Company_id = CM.Company_id
            //     AND 

            const result = await request;

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res, [], 'No Data')
            }
        } catch (e) {
            servError(e, res)
        }
    };

    const postBrand = async (req, res) => {
        const { Brand_Name, Company_Id, Created_By } = req.body;

        if (!Brand_Name || !Created_By) {
            return invalidInput(res, 'Brand_Name and Created_By are required');
        }

        try {
            const checkRequest = new sql.Request();
            const checkResult = await checkRequest
                .input('Brand_Name', Brand_Name)
                .query('SELECT 1 FROM tbl_Brand_Master WHERE Brand_Name = @Brand_Name');

            if (checkResult.recordset.length > 0) {
                return failed(res, 'Brand name already exists');
            }

            const getMaxId = await getNextId({ table: 'tbl_Brand_Master', column: 'Brand_Id' });
            if (!checkIsNumber(getMaxId.MaxId)) {
                return failed(res, 'Error generating Brand ID');
            }

            const Brand_Id = getMaxId.MaxId;
            const Alter_Id = randomNumber();
            const Created_Time = new Date();

            const request = new sql.Request();
            const result = await request
                .input('Brand_Id', Brand_Id)
                .input('Brand_Name', Brand_Name)
                .input('Company_Id', Company_Id)
                .input('Alter_Id', Alter_Id)
                .input('Created_By', Created_By)
                .input('Created_Time', Created_Time)
                .query(`
                INSERT INTO tbl_Brand_Master 
                (Brand_Id, Brand_Name, Company_Id, Alter_Id, Created_By, Created_Time) 
                VALUES 
                (@Brand_Id, @Brand_Name, @Company_Id, @Alter_Id, @Created_By, @Created_Time)
            `);

            if (result.rowsAffected[0] > 0) {
                success(res, 'Brand created successfully');
            } else {
                failed(res, 'Failed to create brand');
            }
        } catch (e) {


            servError(e, res);
        }
    }

    const putBrand = async (req, res) => {
        const { Brand_Id, Brand_Name, Company_Id, Alter_By } = req.body;
        const Alter_Time = new Date();

        if (!Brand_Id || !Brand_Name) {
            return invalidInput(res, 'Brand_Id and Brand_Name are required');
        }

        try {
            const checkRequest = new sql.Request();
            const checkResult = await checkRequest
                .input('Brand_Id', sql.Int, Brand_Id)
                .query('SELECT Brand_Name FROM tbl_Brand_Master WHERE Brand_Id = @Brand_Id');

            if (checkResult.recordset.length === 0) {
                failed(res, 'Brand not found');
            }

            const nameCheckRequest = new sql.Request();
            const nameCheckResult = await nameCheckRequest
                .input('Brand_Name', Brand_Name)
                .input('Brand_Id', Brand_Id)
                .query('SELECT 1 FROM tbl_Brand_Master WHERE Brand_Name = @Brand_Name AND Brand_Id != @Brand_Id');

            if (nameCheckResult.recordset.length > 0) {
                failed(res, 'Brand name already exists');
            }

            const request = new sql.Request();
            const result = await request
                .input('Brand_Id', Brand_Id)
                .input('Brand_Name', Brand_Name)
                .input('Company_Id', Company_Id)
                .input('Alter_By', Alter_By)
                .input('Alter_Time', Alter_Time)
                .query(`
                UPDATE tbl_Brand_Master 
                SET 
                    Brand_Name = @Brand_Name,
                    Company_Id = @Company_Id,
                    Alter_By = @Alter_By,
                    Alter_Time = @Alter_Time
                WHERE Brand_Id = @Brand_Id
            `);

            if (result.rowsAffected[0] > 0) {
                success(res, 'Brand updated successfully');
            } else {
                failed(res, 'No changes made to brand');
            }
        } catch (e) {
            servError(e, res);
        }
    };

    const deleteBrand = async (req, res) => {
        try {
            const { Brand_Id } = req.body;
            if (!Brand_Id) {
                return invalidInput(res, "Brand_Id is Required");
            }

            const request = new sql.Request()
                .input('Brand_Id', Brand_Id);

            const result = await request.query(`
            DELETE FROM tbl_Brand_Master
            WHERE Brand_Id = @Brand_Id
        `);

            if (result.rowsAffected[0] === 0) {
                failed(res, 'No Data');
            }

            success(res, 'Brand Master deleted.');

        } catch (error) {
            servError(error, res);
        }

    }

    return {
        getBrandDropDown,
        getBrand,
        postBrand,
        putBrand,
        deleteBrand
    }
}

export default brandController();