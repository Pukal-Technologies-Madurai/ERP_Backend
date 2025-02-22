import sql from 'mssql';
import { dataFound, failed, invalidInput, noData, servError, success } from '../../res.mjs';
import { checkIsNumber, isEqualNumber } from '../../helper_functions.mjs';
import { getUserBasedRights, getUserIdByAuth, getUserMenuRights, getUserTypeBasedRights, getUserTypeByAuth } from '../../middleware/miniAPIs.mjs';
import dotenv from 'dotenv';
dotenv.config();

const userPortalDB = process.env.USERPORTALDB;

const buildRoutesTree = (routes, parentId = null) => {
    return routes
        .filter(route => route.parent_id === parentId)
        .map(route => ({
            ...route,
            SubRoutes: buildRoutesTree(routes, route.id)
        }));
};

const appMenu = () => {

    const newAppMenu = async (req, res) => {
        const Auth = req.header('Authorization');

        try {
            const userRights = await getUserMenuRights(Auth);

            if (Array.isArray(userRights)) {
                const activeMenus = userRights.filter(menu => isEqualNumber(menu.is_active, 1));
                const mainMenu = activeMenus.filter(menu => isEqualNumber(menu.menu_type, 1)).sort((a, b) => a.display_order - b.display_order);
                const subMenu = activeMenus.filter(menu => isEqualNumber(menu.menu_type, 2)).sort((a, b) => a.display_order - b.display_order);
                const childMenu = activeMenus.filter(menu => isEqualNumber(menu.menu_type, 3)).sort((a, b) => a.display_order - b.display_order);

                const subRoutings = activeMenus
                    .filter(menu => isEqualNumber(menu.menu_type, 0))
                    .sort((a, b) => a.parent_id - b.parent_id);

                const nestedRoutes = buildRoutesTree(subRoutings);

                const menuStrucre = mainMenu.map(main => ({
                    ...main,
                    SubMenu: subMenu.filter(sub => isEqualNumber(sub.parent_id, main.id)).map(sub => ({
                        ...sub,
                        ChildMenu: childMenu.filter(child => isEqualNumber(child.parent_id, sub.id)).map(child => ({
                            ...child,
                            SubRoutes: buildRoutesTree(subRoutings, child.id)
                        })),
                        SubRoutes: buildRoutesTree(subRoutings, sub.id)
                    })),
                    SubRoutes: buildRoutesTree(subRoutings, main.id)
                }));

                dataFound(res, menuStrucre, 'data Found', { subRoutings, nestedRoutes })
            } else {
                failed(res);
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const getNewUserBasedRights = async (req, res) => {
        const Auth = req.header('Authorization');

        try {
            const userid = await getUserIdByAuth(Auth);
            const result = await getUserBasedRights(userid);

            if (Array.isArray(result)) {
                const mainMenu = result.filter(menu => isEqualNumber(menu.menu_type, 1)).sort((a, b) => a.display_order - b.display_order);
                const subMenu = result.filter(menu => isEqualNumber(menu.menu_type, 2)).sort((a, b) => a.display_order - b.display_order);
                const childMenu = result.filter(menu => isEqualNumber(menu.menu_type, 3)).sort((a, b) => a.display_order - b.display_order);
                const subRoutings = result
                    .filter(menu => isEqualNumber(menu.menu_type, 0))
                    .sort((a, b) => a.parent_id - b.parent_id);

                const nestedRoutes = buildRoutesTree(subRoutings);

                const menuStrucre = mainMenu.map(main => ({
                    ...main,
                    SubMenu: subMenu.filter(sub => isEqualNumber(sub.parent_id, main.id)).map(sub => ({
                        ...sub,
                        ChildMenu: childMenu.filter(child => isEqualNumber(child.parent_id, sub.id)).map(child => ({
                            ...child,
                            SubRoutes: buildRoutesTree(subRoutings, child.id)
                        })),
                        SubRoutes: buildRoutesTree(subRoutings, sub.id)
                    })),
                    SubRoutes: buildRoutesTree(subRoutings, main.id)
                }));

                dataFound(res, menuStrucre, 'data Found', { subRoutings, nestedRoutes })
            } else {
                failed(res);
            }
        } catch (e) {
            console.log(e)
            servError(e, res)
        }
    }

    const newModifyUserRights = async (req, res) => {
        const { MenuId, User, ReadRights, AddRights, EditRights, DeleteRights, PrintRights } = req.body;

        const transaction = new sql.Transaction();

        try {
            await transaction.begin();
            await new sql.Request(transaction)
                .input('UserId', User)
                .input('MenuId', MenuId)
                .query(`DELETE FROM tbl_AppMenu_UserRights WHERE UserId = @UserId AND MenuId = @MenuId`);

            const result = await new sql.Request(transaction)
                .input('UserId', User)
                .input('MenuId', MenuId)
                .input('ReadRights', ReadRights)
                .input('AddRights', AddRights)
                .input('EditRights', EditRights)
                .input('DeleteRights', DeleteRights)
                .input('PrintRights', PrintRights)
                .query(`
                    INSERT INTO tbl_AppMenu_UserRights 
                        (UserId, MenuId, Read_Rights, Add_Rights, Edit_Rights, Delete_Rights, Print_Rights) 
                    VALUES 
                        (@UserId, @MenuId, @ReadRights, @AddRights, @EditRights, @DeleteRights, @PrintRights)`
                );

            if (result.rowsAffected[0] > 0) {
                await transaction.commit();
                return success(res, 'Changes saved successfully.');
            } else {
                throw new Error('Failed to save changes.')
            }
        } catch (e) {
            await transaction.rollback();
            return servError(e, res)
        }
    }

    const getNewUserTypeBasedRights = async (req, res) => {
        const { UserType } = req.query;

        if (!UserType) {
            return invalidInput(res, 'UserType is required');
        }

        try {
            const result = await getUserTypeBasedRights(UserType);

            if (Array.isArray(result)) {
                const mainMenu = result.filter(menu => isEqualNumber(menu.menu_type, 1)).sort((a, b) => a.display_order - b.display_order);
                const subMenu = result.filter(menu => isEqualNumber(menu.menu_type, 2)).sort((a, b) => a.display_order - b.display_order);
                const childMenu = result.filter(menu => isEqualNumber(menu.menu_type, 3)).sort((a, b) => a.display_order - b.display_order);
                const subRoutings = result
                    .filter(menu => isEqualNumber(menu.menu_type, 0))
                    .sort((a, b) => a.parent_id - b.parent_id);

                const nestedRoutes = buildRoutesTree(subRoutings);

                const menuStrucre = mainMenu.map(main => ({
                    ...main,
                    SubMenu: subMenu.filter(sub => isEqualNumber(sub.parent_id, main.id)).map(sub => ({
                        ...sub,
                        ChildMenu: childMenu.filter(child => isEqualNumber(child.parent_id, sub.id)).map(child => ({
                            ...child,
                            SubRoutes: buildRoutesTree(subRoutings, child.id)
                        })),
                        SubRoutes: buildRoutesTree(subRoutings, sub.id)
                    })),
                    SubRoutes: buildRoutesTree(subRoutings, main.id)
                }));

                dataFound(res, menuStrucre, 'data Found', { subRoutings, nestedRoutes })
            } else {
                failed(res);
            }
        } catch (e) {
            console.log(e)
            servError(e, res)
        }
    }

    const newModifyUserTypeRights = async (req, res) => {
        const { MenuId, UserType, ReadRights, AddRights, EditRights, DeleteRights, PrintRights } = req.body;

        const transaction = new sql.Transaction();

        try {
            await transaction.begin();
            await new sql.Request(transaction)
                .input('UserType', UserType)
                .input('MenuId', MenuId)
                .query(`DELETE FROM tbl_AppMenu_UserTypeRights WHERE UserTypeId = @UserType AND MenuId = @MenuId`);

            const result = await new sql.Request(transaction)
                .input('UserType', UserType)
                .input('MenuId', MenuId)
                .input('ReadRights', ReadRights)
                .input('AddRights', AddRights)
                .input('EditRights', EditRights)
                .input('DeleteRights', DeleteRights)
                .input('PrintRights', PrintRights)
                .query(`
                    INSERT INTO tbl_AppMenu_UserTypeRights 
                        (UserTypeId, MenuId, Read_Rights, Add_Rights, Edit_Rights, Delete_Rights, Print_Rights) 
                    VALUES 
                        (@UserType, @MenuId, @ReadRights, @AddRights, @EditRights, @DeleteRights, @PrintRights)`
                );

            if (result.rowsAffected[0] > 0) {
                await transaction.commit();
                return success(res, 'Changes saved successfully.');
            } else {
                throw new Error('Failed to save changes.')
            }
        } catch (e) {
            await transaction.rollback();
            return servError(e, res)
        }
    }

    const createNewMenu = async (req, res) => {
        const {
            name, menu_type, parent_id, url, display_order
        } = req.body;

        try {
            const result = await new sql.Request()
                .input('name', name)
                .input('menu_type', menu_type)
                .input('parent_id', parent_id ? parent_id : null)
                .input('url', url)
                .input('display_order', display_order)
                .input('is_active', 1)
                .query(`
                    INSERT INTO [${userPortalDB}].[dbo].[tbl_AppMenu] (
                        name, menu_type, parent_id, url, display_order, is_active
                    ) VALUES (
                        @name, @menu_type, @parent_id, @url, @display_order, @is_active
                    );`
                );

            if (result.rowsAffected[0] > 0) {
                success(res, 'New Menu Added');
            } else {
                failed(res, 'Failed to save, try again')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const updateMenu = async (req, res) => {
        const {
            id, name, menu_type, parent_id, url, display_order, is_active
        } = req.body;

        try {
            const activeState = isEqualNumber(is_active, 1) || is_active == true;
            
            const result = await new sql.Request()
                .input('id', id)
                .input('name', name)
                .input('menu_type', menu_type)
                .input('parent_id', parent_id ? parent_id : null)
                .input('url', url)
                .input('display_order', display_order)
                .input('is_active', activeState ? 1 : 0)
                .query(`
                    UPDATE
                        [${userPortalDB}].[dbo].[tbl_AppMenu]
                    SET
                        name = @name,
                        menu_type = @menu_type,
                        parent_id = @parent_id,
                        url = @url,
                        display_order = @display_order,
                        is_active = @is_active
                    WHERE
                        id = @id`
                );

            if (result.rowsAffected[0] > 0) {
                success(res, 'Changes Saved');
            } else {
                failed(res, 'Failed to save, try again')
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const listMenu = async (req, res) => {
        try {
            const menuData = await sql.query(`
                SELECT 
                    m.*,
                    COALESCE((
                        SELECT 
                            p.*
                        FROM
                            [${userPortalDB}].[dbo].[tbl_AppMenu] AS p
                        WHERE
                            p.id = m.parent_id
                        FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
                    ), '{}') AS ParantData
                FROM 
                    [${userPortalDB}].[dbo].[tbl_AppMenu] AS m`);

            const result = menuData.recordset.map(data => ({
                ...data, 
                is_active: data.is_active ? 1 : 0, 
                ParantData: JSON.parse(data.ParantData)
            }));

            if (result.length > 0) {
                const mainMenu = result.filter(menu => isEqualNumber(menu.menu_type, 1)).sort((a, b) => a.display_order - b.display_order);
                const subMenu = result.filter(menu => isEqualNumber(menu.menu_type, 2)).sort((a, b) => a.display_order - b.display_order);
                const childMenu = result.filter(menu => isEqualNumber(menu.menu_type, 3)).sort((a, b) => a.display_order - b.display_order);
                const subRoutings = result
                    .filter(menu => isEqualNumber(menu.menu_type, 0))
                    .sort((a, b) => a.parent_id - b.parent_id);

                const menuStrucre = mainMenu.map(main => ({
                    ...main,
                    SubMenu: subMenu.filter(sub => isEqualNumber(sub.parent_id, main.id)).map(sub => ({
                        ...sub,
                        ChildMenu: childMenu.filter(child => isEqualNumber(child.parent_id, sub.id)).map(child => ({
                            ...child,
                            SubRoutes: buildRoutesTree(subRoutings, child.id)
                        })),
                        SubRoutes: buildRoutesTree(subRoutings, sub.id)
                    })),
                    SubRoutes: buildRoutesTree(subRoutings, main.id)
                }));

                dataFound(res, menuStrucre);
            } else {
                failed(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    return {
        newAppMenu,
        getNewUserBasedRights,
        newModifyUserRights,
        getNewUserTypeBasedRights,
        newModifyUserTypeRights,
        createNewMenu,
        updateMenu,
        listMenu
    }
}

export default appMenu();