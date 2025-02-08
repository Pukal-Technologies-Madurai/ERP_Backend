import sql from 'mssql';
import { dataFound, failed, invalidInput, noData, servError, success } from '../../res.mjs'
import { checkIsNumber, filterableText, isEqualNumber } from '../../helper_functions.mjs';

const retailerArea = () => {

    const getAreaMaster = async (req, res) => {
        try {
            const result = await sql.query('SELECT * FROM tbl_Area_Master');
            if (result.recordset.length) {
                dataFound(res, result.recordset);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const addArea = async (req, res) => {
        const { Area_Name, District_Id } = req.body;

        if (!Area_Name || !checkIsNumber(District_Id)) {
            return invalidInput(res, 'Area_Name, District_Id is required')
        }

        try {
            const existArea = (await new sql.Request()
                .query(`SELECT District_Id, Area_Name FROM tbl_Area_Master`)).recordset;

            existArea.forEach(area => {
                if (
                    filterableText(area.Area_Name) === filterableText(Area_Name) 
                    && isEqualNumber(area.District_Id, District_Id)
                ) return failed(res, 'This Area is already exist in the district');
            })

            const request = new sql.Request()
                .input('Area_Name', Area_Name)
                .input('District_Id', District_Id)
                .query(`
                    INSERT INTO tbl_Route_Master (
                        Area_Name, District_Id
                    ) VALUES (
                        @Area_Name, @District_Id
                    )`
                )

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'new Area Created')
            } else {
                failed(res, 'Failed to create Area')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const editArea = async (req, res) => {
        const { Area_Id, Area_Name, District_Id } = req.body;

        if (!checkIsNumber(Area_Id) || !Area_Name || !checkIsNumber(District_Id)) {
            return invalidInput(res, 'Area_Id, Area_Name, District_Id is required')
        }

        try {
            const existArea = (await new sql.Request()
                .query(`SELECT Area_Id, District_Id, Area_Name FROM tbl_Area_Master`)).recordset;

            existArea.forEach(area => {
                if (
                    filterableText(area.Route_Name) === filterableText(Area_Name) 
                    && isEqualNumber(area.District_Id, District_Id)
                    && !isEqualNumber(area.Area_Id, Area_Id)
                ) return failed(res, 'This Area is already exist in the district');
            })

            const request = new sql.Request()
                .input('Area_Id', Area_Id)
                .input('Area_Name', Area_Name)
                .input('District_Id', District_Id)
                .query(`
                    UPDATE tbl_Route_Master 
                    SET 
                        Area_Name = @Area_Name, 
                        District_Id = @District_Id,
                    WHERE
                        Area_Id = @Area_Id`
                )

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Changes Saved')
            } else {
                failed(res, 'Failed to save changes')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const deleteArea = async (req, res) => {
        const { Area_Id } = req.body;

        if (!checkIsNumber(Area_Id)) {
            return invalidInput(res, 'Area_Id is required')
        }

        try {

            const request = new sql.Request()
                .input('Area_Id', Area_Id)
                .query(`
                    DELETE 
                    FROM tbl_Route_Master 
                    WHERE Area_Id = @Area_Id;`
                )

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Area deleted')
            } else {
                failed(res, 'Failed to delete area')
            }

        } catch (e) {
            servError(e, res)
        }
    }


    return {
        getAreaMaster,
        addArea,
        editArea,
        deleteArea
    }
}

export default retailerArea();