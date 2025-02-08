import sql from 'mssql';
import { dataFound, invalidInput, noData, servError } from '../../res.mjs'
import { checkIsNumber } from '../../helper_functions.mjs';


const sfMasters = () => {

    const getStates = async (req, res) => {
        try {
            const result = await sql.query('SELECT * FROM tbl_State_Master WHERE State_Id != 0');

            if (result.recordset.length) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getDistricts = async (req, res) => {
        const { District_Id } = req.query;

        try {
            let query = `
            SELECT  
            	dm.*,
            	COALESCE(sm.State_Name, 'Unknown') AS State_Name
            FROM 
            	tbl_Distict_Master AS dm
            LEFT JOIN
            	tbl_State_Master AS sm
            	ON dm.District_Id = sm.State_Id
            `;
            if (checkIsNumber(District_Id)) {
                query += `
                WHERE District_Id = @District_Id
                `;
            }

            const result = await new sql.Request().input('District_Id', District_Id).query(query);

            if (result.recordset.length) {
                dataFound(res, result.recordset);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getAreas = async (req, res) => {
        const { Area_Id } = req.query;

        try {
            let query = `
            SELECT 
            	am.*,
            	COALESCE(dm.District_Name, 'District not found') AS District_Name,
            	COALESCE(sm.State_Id, 0) AS State_Id,
            	COALESCE(sm.State_Name, 'State not found') AS State_Name
            FROM 
            	tbl_Area_Master AS am
            LEFT JOIN
            	tbl_Distict_Master AS dm
            	ON dm.District_Id = am.District_Id
            LEFT JOIN
            	tbl_State_Master AS sm
            	ON dm.District_Id = sm.State_Id
            WHERE
                am.Area_Name != ''
            `;
            if (checkIsNumber(Area_Id)) {
                query += `
                WHERE Area_Id = @Area_Id
                `
            }

            const result = await new sql.Request().input('Area_Id', Area_Id).query(query);

            if (result.recordset.length) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getOutlet = async (req, res) => {
        try {
            const result = await sql.query('SELECT * FROM tbl_Outlet_Master');

            if (result.recordset.length) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getDistributors = async (req, res) => {

        try {
            const result = await sql.query('SELECT * FROM tbl_Distributor_Master');

            if (result.recordset.length) {
                dataFound(res, result.recordset);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getUOM = async (req, res) => {
        try {
            const result = await sql.query('SELECT * FROM tbl_UOM WHERE Unit_Id != 0');

            if (result.recordset.length) {
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
            const result = await sql.query('SELECT * FROM tbl_Brand_Master WHERE Brand_Id != 0');

            if (result.recordset.length) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const getRoutes = async (req, res) => {
        try {
            const result = (await new sql.Request()
                .query(`SELECT Route_Id, Route_Name FROM tbl_Route_Master WHERE Route_Id != 0`)
            ).recordset;

            if (result.length > 0) {
                dataFound(res, result)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getareaRoutes = async (req, res) => {
        try {
            const result = (await new sql.Request()
                .query(`SELECT * FROM tbl_Area_Master WHERE Area_Id != 1`)
            ).recordset;

            if (result.length > 0) {
                dataFound(res, result)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }


    return {
        getStates,
        getDistricts,
        getAreas,
        getOutlet,
        getDistributors,
        getUOM,
        getBrand,
        getRoutes,
        getareaRoutes
    }
}

export default sfMasters()