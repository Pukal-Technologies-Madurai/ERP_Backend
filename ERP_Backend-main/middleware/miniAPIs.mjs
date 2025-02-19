import sql from 'mssql';
import { checkIsNumber, isEqualNumber } from '../helper_functions.mjs';

const miniResponse = ({ status = true, dataArray = [], dataObject = {}, others = {} }) => ({ status, dataArray, dataObject, ...others })

export const getUserType = async (UserId) => {
    if (!checkIsNumber(UserId)) {
        return false;
    }

    try {
        const userTypeDetails = (await new sql.Request()
            .input('UserId', UserId)
            .query(`
            SELECT 
                ut.Id
            FROM 
                tbl_Users AS u,
                tbl_User_Type AS ut
            WHERE 
                u.UserId =  @UserId
                AND
                u.UserTypeId = ut.Id
        `)
        ).recordset;

        if (userTypeDetails.length > 0 && Boolean(Number(userTypeDetails[0].Id))) {
            return Number(userTypeDetails[0].Id);
        } else {
            return false;
        }
    } catch (e) {
        console.error(e);
        return false
    }
}

export const getUserTypeByAuth = async (Auth) => {

    if (!Auth) {
        return false;
    }

    try {
        const userTypeDetails = (
            await new sql.Request()
                .input('Auth', Auth)
                .query(`
                SELECT ut.Id
                FROM 
                    tbl_Users AS u,
                    tbl_User_Type AS ut
                WHERE 
                    u.Autheticate_Id =  @Auth
                    AND
                    u.UserTypeId = ut.Id`
                )).recordset;

        if (userTypeDetails.length > 0) {
            return Number(userTypeDetails[0].Id);
        } else {
            return false;
        }
    } catch (e) {
        console.error(e);
        return false
    }
}

export const getCUstomerIdByUserId = async (UserId) => {

    if (!checkIsNumber(UserId)) {
        return false;
    }

    try {
        const CustIdGet = (
            await new sql.Request()
                .input('UserId', UserId)
                .query(`
                SELECT cm.Cust_Id
                FROM 
                    tbl_Users AS u,
                    tbl_Customer_Master AS cm
                WHERE 
                    cm.User_Mgt_Id =  @UserId
                    AND
                    u.UserId = cm.User_Mgt_Id`
                )).recordset;

        if (CustIdGet.length > 0 && Boolean(Number(CustIdGet[0].Cust_Id))) {
            return Number(CustIdGet[0].Cust_Id);
        } else {
            return false;
        }
    } catch (e) {
        console.error(e);
        return false
    }
}

export const getUserIdByAuth = async (Auth) => {
    if (!Auth) {
        return false;
    }

    try {
        const getUserId = (await new sql.Request()
            .input('Auth', Auth)
            .query(`
            SELECT 
                UserId
            FROM 
                tbl_Users
            WHERE 
                Autheticate_Id = @Auth
        `)
        ).recordset;

        if (getUserId.length > 0) {
            return Number(getUserId[0].UserId);
        } else {
            return false;
        }
    } catch (e) {
        console.error(e);
        return false
    }
}

export const getUserTypeBasedRights = async (usertype) => {

    try {
        const getUserTypeRights = new sql.Request()
            .input('usertype', usertype)
            .query(`
                SELECT 
                    m.*,
                    COALESCE(utr.Read_Rights, 0) AS Read_Rights,
                    COALESCE(utr.Add_Rights, 0) AS Add_Rights,
                    COALESCE(utr.Edit_Rights, 0) AS Edit_Rights,
                    COALESCE(utr.Delete_Rights, 0) AS Delete_Rights,
                    COALESCE(utr.Print_Rights, 0) AS Print_Rights
                FROM 
                    tbl_AppMenu m
                LEFT JOIN 
                    tbl_AppMenu_UserTypeRights utr ON utr.UserTypeId = @usertype AND utr.MenuId = m.id`
            )

        const result = await getUserTypeRights;

        return result.recordset;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export const getUserBasedRights = async (userid) => {
    if (!userid) {
        return false;
    }

    try {
        const getUserRights = new sql.Request()
            .input('userid', userid)
            .query(`
                SELECT 
                    m.*,
                    COALESCE(ur.Read_Rights, 0) AS Read_Rights,
                    COALESCE(ur.Add_Rights, 0) AS Add_Rights,
                    COALESCE(ur.Edit_Rights, 0) AS Edit_Rights,
                    COALESCE(ur.Delete_Rights, 0) AS Delete_Rights,
                    COALESCE(ur.Print_Rights, 0) AS Print_Rights
                FROM 
                    tbl_AppMenu m
                LEFT JOIN 
                    tbl_AppMenu_UserRights ur ON ur.UserId = @userid AND ur.MenuId = m.id`
            )

        const result = await getUserRights;

        return result.recordset;
    } catch (e) {
        console.error(e);
        return false;
    }
}

export const getUserMenuRights = async (Auth) => {
    try {
        const UserTypeId = await getUserTypeByAuth(Auth);

        // for admin and management user have all permissions
        if (isEqualNumber(UserTypeId, 0) || isEqualNumber(UserTypeId, 1)) {
            const request = new sql.Request().query(`
                SELECT 
                	*,
                    1 as Read_Rights,
	                1 as Add_Rights,
	                1 as Edit_Rights,
	                1 as Delete_Rights,
	                1 as Print_Rights
                FROM
                	tbl_AppMenu`
            );

            const result = await request;

            return result.recordset
        } else {
            const UserId = await getUserIdByAuth(Auth);

            const request = new sql.Request()
                .input('userid', UserId)
                .input('usertype', UserTypeId)
                .query(`
                    SELECT 
                        m.*,
                        COALESCE(ur.Read_Rights, utr.Read_Rights, 0) AS Read_Rights,
                        COALESCE(ur.Add_Rights, utr.Add_Rights, 0) AS Add_Rights,
                        COALESCE(ur.Edit_Rights, utr.Edit_Rights, 0) AS Edit_Rights,
                        COALESCE(ur.Delete_Rights, utr.Delete_Rights, 0) AS Delete_Rights,
                        COALESCE(ur.Print_Rights, utr.Print_Rights, 0) AS Print_Rights
                    FROM 
                        tbl_AppMenu m
                    LEFT JOIN 
                        tbl_AppMenu_UserRights ur ON ur.UserId = @userid AND ur.MenuId = m.id
                    LEFT JOIN 
                        tbl_AppMenu_UserTypeRights utr ON utr.UserTypeId = @usertype AND utr.MenuId = m.id`
                );

            const result = await request;
            return result.recordset;
        }
    } catch (e) {
        console.error(e);
        return false;
    }
}

export const getRetailerInfo = async (retailerId) => {

    try {
        if (!checkIsNumber(retailerId)) {
            throw new Error('Retailer id not received');
        }
        const request = new sql.Request()
            .input('retail', retailerId)
            .query(`
                SELECT 
                    rm.*,
                    COALESCE(rom.Route_Name, '') AS RouteGet,
                    COALESCE(am.Area_Name, '') AS AreaGet,
                    COALESCE(sm.State_Name, '') AS StateGet,
                    COALESCE(cm.Company_Name, '') AS Company_Name,
                    COALESCE(modify.Name, '') AS lastModifiedBy,
                    COALESCE(created.Name, '') AS createdBy,
                    COALESCE((
                        SELECT 
                            TOP (1) *
                        FROM 
                            tbl_Retailers_Locations
                        WHERE
                            Retailer_Id = rm.Retailer_Id
                            AND
                            isActiveLocation = 1
                        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
                    ), '{}') AS VERIFIED_LOCATION
                FROM
                    tbl_Retailers_Master AS rm
                
                LEFT JOIN
                    tbl_Route_Master AS rom
                    ON rom.Route_Id = rm.Route_Id
                LEFT JOIN
                    tbl_Area_Master AS am
                    ON am.Area_Id = rm.Area_Id
                LEFT JOIN
                    tbl_State_Master AS sm
                    ON sm.State_Id = rm.State_Id
                LEFT JOIN
                    tbl_Company_Master AS cm
                    ON cm.Company_id = rm.Company_Id
                LEFT JOIN
                    tbl_Users AS modify
                    ON modify.UserId = rm.Updated_By
                LEFT JOIN
                    tbl_Users AS created
                    ON created.UserId = rm.Created_By
                
                WHERE
                	rm.Retailer_Id = @retail
                `)

        const result = await request;

        if (result.recordset.length > 0) {
            return miniResponse({
                status: true,
                dataObject: (await request).recordset[0]
            })
        } else {
            throw new Error('Retailer not found')
        }
    } catch (e) {
        console.error(e);
        return miniResponse({
            status: false,
        });
    }
}

export const getProducts = async (IS_Sold = 1) => {
    try {
        const request = new sql.Request()
            .input('IS_Sold', IS_Sold)
            .query(`
            WITH UOM AS (
                SELECT *
                FROM tbl_UOM
            ),
            RATE AS (
                SELECT * 
                FROM tbl_Pro_Rate_Master
            ),
            BRAND AS (
                SELECT *
                FROM tbl_Brand_Master
            ),
            PRODUCTGROUP AS (
                SELECT *
                FROM tbl_Product_Group
            )
            SELECT 
                p.*,
                COALESCE(b.Brand_Name, 'NOT FOUND') AS Brand_Name,
                COALESCE(pg.Pro_Group, 'NOT FOUND') AS Pro_Group,
                COALESCE(u.Units, 'NOT FOUND') AS Units,
                COALESCE((
                    SELECT 
                        TOP (1) Product_Rate 
                    FROM 
                        RATE AS r
                    WHERE 
                        r.Product_Id = p.Product_Id
                    ORDER BY
                        CONVERT(DATETIME, r.Rate_Date) DESC
                ), 0) AS Item_Rate 
            FROM 
                tbl_Product_Master AS p
                LEFT JOIN BRAND AS b
                ON b.Brand_Id = p.Brand
                LEFT JOIN PRODUCTGROUP AS pg
                ON pg.Pro_Group_Id = p.Product_Group
                LEFT JOIN UOM AS u
                ON u.Unit_Id = p.UOM_Id
            `);
            // WHERE
            //     p.IS_Sold = @IS_Sold ;
        const result = await request;

        if (result.recordset.length > 0) {
            return miniResponse({
                status: true,
                dataArray: result.recordset
            })
        } else {
            throw new Error('No data')
        }
    } catch (e) {
        console.error(e);
        return miniResponse({
            status: false,
        });
    }
}

export const getNextId = async ({ table = '', column = '' }) => {
    try {

        if (!table || !column) {
            return miniResponse({
                status: false,
                others: {
                    error: 'Invalid Input'
                }
            })
        }

        const col = String(column), tab = String(table);
        const request = new sql.Request()
            .query(`SELECT COALESCE(MAX(${col}), 0) AS MaxId FROM ${tab}`);

        const result = await request;

        if (result.recordset.length) {
            return miniResponse({
                status: true,
                others: {
                    MaxId: Number(result.recordset[0].MaxId) + 1
                }
            })
        }

        throw new Error('failed to get max id');

    } catch (e) {
        console.log(e);
        return miniResponse({
            status: false,
            others: {
                error: e
            }
        })
    }
}

export const getLargeData = async (exeQuery, db) => {
    try {
        const requestInTallyDB = new sql.Request(db);
        const requestInMainDB = new sql.Request();
        const request = db ? requestInTallyDB : requestInMainDB;

        request.stream = true;

        request.query(exeQuery);

        return new Promise((resolve, reject) => {
            const rows = []; // Array to collect rows as they stream in

            // Handle each row
            request.on('row', (row) => {
                rows.push(row);
            });

            // Handle query errors
            request.on('error', (err) => {
                reject(err);
            });

            // When done, resolve with all collected rows
            request.on('done', () => {
                resolve(rows);
            });
        });
    } catch (e) {
        console.error('ERROR in middleware getLargeData: ', e)
        return [];
    }
}

export const getLOL = async (db) => {
    if (!db) return miniResponse({ status: false, others: { Err: 'db config is missing' } });

    try {
        const result = await getLargeData(
            `SELECT * FROM tbl_LOL_Excel`, db
        );

        if (result.recordset.length > 0) {
            return miniResponse({
                status: true,
                dataArray: result.recordset,
            })
        } else {
            return miniResponse({
                status: false,
                others: {
                    message: 'LOL data not found'
                }
            })
        }
    } catch (e) {
        console.log(e);
        return miniResponse({ status: false, others: { Err: 'Failed to fetch LOL' } })
    }
}

export const getLOS = async (db) => {
    if (!db) return miniResponse({ status: false, others: { Err: 'db config is missing' } });

    try {
        const result = await getLargeData(
            `SELECT * FROM tbl_LOS_Excel`, db
        );

        if (result.recordset.length > 0) {
            return miniResponse({
                status: true,
                dataArray: result.recordset,
            })
        } else {
            return miniResponse({
                status: false,
                others: {
                    message: 'LOL data not found'
                }
            })
        }
    } catch (e) {
        console.log(e);
        return miniResponse({ status: false, others: { Err: 'Failed to fetch LOL' } })
    }
}