import sql from 'mssql';
import { dataFound, failed, invalidInput, noData, servError, success } from '../../res.mjs'
import { checkIsNumber } from '../../helper_functions.mjs';
import { getNextId } from '../../middleware/miniAPIs.mjs';

const retailerRoutes = () => {

    const getRoutes = async (req, res) => {

        try {
            const result = await sql.query('SELECT * FROM tbl_Route_Master');

            if (result.recordset.length) {
                dataFound(res, result.recordset);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const addRoutes = async (req, res) => {
        const { Route_Name } = req.body;

        if (!Route_Name) {
            return invalidInput(res, 'Route_Name is required')
        }

        try {

            const getRouteId = await getNextId({ table: 'tbl_Route_Master', column: 'Route_Id' });

            if (!getRouteId || !getRouteId.status || !checkIsNumber(getRouteId.MaxId)) {
                return failed(res, 'error while creating route');
            };

            const Route_Id = getRouteId.MaxId;

            const request = new sql.Request()
                .input('Route_Id', Route_Id)
                .input('Route_Name', Route_Name)
                .query(`
                    INSERT INTO tbl_Route_Master(
                        Route_Id, Route_Name
                    ) VALUES (
                        @Route_Id, @Route_Name
                    )`)

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'new Route Created')
            } else {
                failed(res, 'Failed to create Route')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const editRoutes = async (req, res) => {
        const { Route_Id, Route_Name } = req.body;

        if (!checkIsNumber(Route_Id) || !Route_Name) {
            return invalidInput(res, 'Route_Id, Route_Name is required')
        }

        try {
            const request = new sql.Request()
                .input('Route_Id', Route_Id)
                .input('Route_Name', Route_Name)
                .query(`
                    UPDATE tbl_Route_Master
                    SET Route_Name = @Route_Name
                    WHERE Route_Id = @Route_Id;`
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

    const deleteRoute = async (req, res) => {
        const { Route_Id } = req.body;

        if (!checkIsNumber(Route_Id)) {
            return invalidInput(res, 'Route_Id is required')
        }

        try {

            const request = new sql.Request()
                .input('Route_Id', Route_Id)
                .query(`
                        DELETE 
                        FROM tbl_Route_Master 
                        WHERE Route_Id = @Route_Id;`
                )

            const result = await request;

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Route deleted')
            } else {
                failed(res, 'Failed to delete Route_Id')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    return {
        getRoutes,
        addRoutes,
        editRoutes,
        deleteRoute
    }
}

export default retailerRoutes();