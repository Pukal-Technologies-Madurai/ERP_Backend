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

    const setRoutes = async (req, res) => {
        try {
            const { Route_Id, User_Id, date } = req.body;

            if (!Route_Id || !User_Id || !date) {
                return invalidInput(res, 'Route_Id, User_Id and Date are required');
            }

            const request = new sql.Request();


            await request
                .input('User_Id', sql.Int, User_Id)
                .input('Date', sql.Date, date)
                .query(`
                UPDATE tbl_Route_Setting
                SET IsActive = 0
                WHERE User_Id = @User_Id AND Date = @Date
            `);

            const getId = await getNextId({
                table: 'tbl_Route_Setting',
                column: 'Id'
            });

            await request
                .input('Id', getId.MaxId)
                .input('Route_Id', Route_Id)
                .input('IsActive', 1)
                .query(`
                INSERT INTO tbl_Route_Setting (Id, User_Id, Route_Id, Date, IsActive)
                VALUES (@Id, @User_Id, @Route_Id, @Date, @IsActive)
            `);


            success(res, 'New Route Set successfully');
        } catch (e) {

            servError(e, res);
        }
    };

    const getSetRoutes = async (req, res) => {
        try {
            const { date, User_Id } = req.query;


            const result = await new sql.Request()
                .input('date', date)
                .input('User_Id', User_Id)
                .query('select * from tbl_Route_setting where date=@date AND User_Id=@User_Id order by Id asc')
            if (result.recordset.length) {
                dataFound(res, result.recordset);
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    }

    const updateSetRoutes = async (req, res) => {
        try {
            const { Id, User_Id, date, Route_Id } = req.body;

            if (!checkIsNumber(Route_Id) || !User_Id || !date) {
                return invalidInput(res, 'Route_Id, User_Id, and date are required');
            }


            await new sql.Request()
                .input('User_Id', User_Id)
                .input('date', date)
                .input('currentId', Id)
                .query(`
                UPDATE tbl_Route_Setting
                SET IsActive = 0
                WHERE User_Id = @User_Id AND date = @date AND Id <> @currentId
            `);


            const result = await new sql.Request()
                .input('Id', Id)
                .input('User_Id', User_Id)
                .input('date', date)
                .input('Route_Id', Route_Id)
                .query(`
                UPDATE tbl_Route_Setting
                SET User_Id = @User_Id,
                    date = @date,
                    Route_Id = @Route_Id,
                    IsActive = 1
                WHERE Id = @Id
            `);

            if (result.rowsAffected[0] > 0) {
                success(res, 'Route setting updated successfully');
            } else {
                failed(res, 'Failed to update the route setting');
            }

        } catch (err) {
            servError(err, res);
        }
    };

    const deletesetRoutes = async (req, res) => {
        try {
            const { Id } = req.query;
            if (!checkIsNumber(Id)) {
                return invalidInput(res, 'Id is required')
            }

            const result = await new sql.Request()
                .input('Id', Id)
                .query(`
                    Delete tbl_Route_setting
                    WHERE Id=@Id`
                )

            if (result.rowsAffected[0] && result.rowsAffected[0] > 0) {
                success(res, 'Settings deleted')
            } else {
                failed(res, 'Failed to delete ')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    return {
        getRoutes,
        addRoutes,
        editRoutes,
        deleteRoute,
        setRoutes,
        getSetRoutes,
        updateSetRoutes,
        deletesetRoutes
    }
}

export default retailerRoutes();