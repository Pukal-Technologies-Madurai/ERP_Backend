// import sql from 'mssql'
// import { servError, dataFound, noData, invalidInput, failed, success, sentData } from '../../res.mjs';
// import { checkIsNumber, decryptPasswordFun, encryptPasswordFun, randomString } from '../../helper_functions.mjs';
// import dotenv from 'dotenv';
// dotenv.config();

// const DB_Name = process.env.DATABASE;
// const COM_ID = Number(process.env.COMPANY);
// const userPortalDB = process.env.USERPORTALDB;

// if (!checkIsNumber(COM_ID)) {
//     throw new Error('COMPANY id is not specified in .env')
// }

// if (!DB_Name) {
//     throw new Error('Company DATABASE is not specified in .env')
// }

// const user = () => {

//     const getUsers = async (req, res) => {
//         try {
//             const { UserTypeId, BranchId, UserId, Cost_Center_Id, CostCenterTypeId } = req.query;
//             const request = new sql.Request()
//                 .input('UserTypeId', UserTypeId || null)
//                 .input('BranchId', BranchId || null)
//                 .input('UserId', UserId || null)
//                 .input('Cost_Center_Id', Cost_Center_Id || null)
//                 .input('CostCenterTypeId', CostCenterTypeId || null)
//                 .query(`
//                     SELECT
//                         u.UserTypeId,
//                         u.UserId,
//                         u.UserName,
//                         -- u.Password,
//                         u.BranchId,
//                         b.BranchName,
//                         u.Name,
//                         ut.UserType,
//                         -- u.Autheticate_Id,
//                         u.Company_Id AS Company_id,
//                         c.Company_Name,
// 			        	ec.Cost_Center_Id,
// 			        	ec.Cost_Center_Name,
// 			        	uct.UserType AS costcentertype,
// 			            ec.User_Type AS CostCenterTypeId 
//                     FROM tbl_Users AS u
//                     LEFT JOIN tbl_User_Type AS ut ON ut.Id = u.UserTypeId
//                     LEFT JOIN tbl_Company_Master AS c ON c.Company_id = u.Company_Id
// 			        LEFT JOIN tbl_ERP_Cost_Center AS ec ON ec.User_Id = u.UserId
// 			        LEFT JOIN tbl_User_Type AS uct ON uct.Id = ec.User_Type
// 			        LEFT JOIN tbl_Branch_Master AS b ON b.BranchId = u.BranchId
//                     WHERE 
//                         u.UDel_Flag = 0 
//                         AND u.UserId <> 0
//                         ${checkIsNumber(UserTypeId) ? ' AND u.UserTypeId = @UserTypeId ' : ''}
//                         ${checkIsNumber(BranchId) ? ' AND u.BranchId = @BranchId ' : ''}
//                         ${checkIsNumber(UserId) ? ' AND u.UserId = @UserId ' : ''}
//                         ${checkIsNumber(Cost_Center_Id) ? ' AND ec.Cost_Center_Id = @Cost_Center_Id ' : ''}
//                         ${checkIsNumber(CostCenterTypeId) ? ' AND ec.User_Type = @CostCenterTypeId ' : ''}
//                     ORDER BY u.Name `
//                 );

//             const result = await request;

//             if (result.recordset.length > 0) {
//                 // const encryptPassword = result.recordset.map(o => ({ ...o, Password: encryptPasswordFun(o.Password) }))
//                 // const sorted = encryptPassword.sort((a, b) => a.Name.localeCompare(b.Name));
//                 dataFound(res, result.recordset)
//             } else {
//                 noData(res)
//             }
//         } catch (e) {
//             servError(e, res)
//         }
//     };

//     // new api for create global user

//     const createUser = async (req, res) => {
//         const { Name, UserName, UserTypeId, Password, BranchId } = req.body;

//         if (!Name || !UserName || !checkIsNumber(UserTypeId) || !Password || !checkIsNumber(BranchId)) {
//             return invalidInput(res, 'Name, UserName, UserTypeId, Password and BranchId are required and must be valid.');
//         }

//         const transaction = new sql.Transaction();

//         try {
//             // Check if user already exists
//             const checkUserExistsResult = await new sql.Request()
//                 .input('UserName', UserName)
//                 .input('Company_id', COM_ID)
//                 .query(`
//                     SELECT COUNT(*) AS userCount 
//                     FROM [${userPortalDB}].[dbo].[tbl_Users] 
//                     WHERE UserName = @UserName AND Company_Id = @Company_id;
//                 `);

//             if (checkUserExistsResult.recordset[0].userCount > 0) {
//                 return invalidInput(res, 'User already exists');
//             }

//             const AuthString = randomString(50);
//             const getMaxUserIdResult = await new sql.Request()
//                 .query(`
//                     SELECT CASE WHEN COUNT(*) > 0 THEN MAX(UserId) ELSE 0 END AS MaxUserId 
//                     FROM [${DB_Name}].[dbo].[tbl_Users];
//                 `);
//             const UserMaxId = Number(getMaxUserIdResult.recordset[0].MaxUserId) + 1;
//             const getGlobalId = await new sql.Request()
//                 .query(`
//                 SELECT CASE WHEN COUNT(*) > 0 THEN MAX(Global_User_id) ELSE 0 END AS MaxUserId 
//                 FROM  [${userPortalDB}].[dbo].[tbl_Users];
//             `);

//             const globalIdMax = Number(getGlobalId.recordset[0].MaxUserId) + 1;

//             await transaction.begin();

//             const GlobalInsertionResult = await new sql.Request(transaction)
//                 .input('Company_id', COM_ID)
//                 .input('Global_User_ID', globalIdMax)
//                 .input('Local_User_ID', UserMaxId)
//                 .input('UserName', UserName)
//                 .input('Name', Name)
//                 .input('UserTypeId', UserTypeId)
//                 .input('Password', decryptPasswordFun(Password))
//                 .input('UDel_Flag', 0)
//                 .input('Autheticate_Id', AuthString)
//                 .query(`
//                     INSERT INTO [${userPortalDB}].[dbo].[tbl_Users] (
//                        Global_User_ID,Local_User_ID, Company_Id, Name, Password, UserTypeId, UserName, UDel_Flag, Autheticate_Id
//                     ) VALUES (
//                         @Global_User_ID,@Local_User_ID, @Company_Id, @Name, @Password, @UserTypeId, @UserName, @UDel_Flag, @Autheticate_Id
//                     );
//                     SELECT SCOPE_IDENTITY() AS GlobalId;
//                 `);

//             if (GlobalInsertionResult.rowsAffected[0] === 0) {
//                 throw new Error('Global insertion failed');
//             }
//             const GlobalUserId = GlobalInsertionResult.recordset[0].GlobalId;


//             const LocalInsertionResult = await new sql.Request(transaction)
//                 .input('COMPANY_DB', DB_Name)
//                 .input('UserId', UserMaxId)
//                 .input('Global_User_ID', globalIdMax)
//                 .input('UserTypeId', UserTypeId)
//                 .input('Name', Name)
//                 .input('UserName', UserName)
//                 .input('Password', decryptPasswordFun(Password))
//                 .input('Company_id', COM_ID)
//                 .input('BranchId', BranchId)
//                 .input('UDel_Flag', 0)
//                 .input('Autheticate_Id', AuthString)
//                 .query(`
//                     INSERT INTO [${DB_Name}].[dbo].[tbl_Users] (
//                         UserId, Global_User_ID, UserTypeId, Name, UserName, Password, Company_id, BranchId, UDel_Flag, Autheticate_Id
//                     ) VALUES (
//                         @UserId, @Global_User_ID, @UserTypeId, @Name, @UserName, @Password, @Company_id, @BranchId, @UDel_Flag, @Autheticate_Id
//                     );
//                 `);

//             if (LocalInsertionResult.rowsAffected[0] === 0) {
//                 throw new Error('Local insertion failed');
//             }

//             await transaction.commit();
//             success(res, 'User created successfully', [], {
//                 UserId: UserMaxId
//             });

//         } catch (e) {
//             await transaction.rollback();
//             servError(e, res);
//         }
//     };

//     // new api for update global user

//     const updateUser = async (req, res) => {
//         const {
//             UserId, Name, UserName, UserTypeId, Password, BranchId
//         } = req.body;

//         if (!UserId || !Name || !UserName || !checkIsNumber(UserTypeId) || !Password || !checkIsNumber(BranchId)) {
//             return invalidInput(res, 'UserId, Name, UserName, UserTypeId, Password and BranchId are required and must be valid.', {
//                 UserId, Name, UserName, UserTypeId, Password, BranchId
//             });
//         }

//         const transaction = new sql.Transaction();

//         try {
//             const checkUserExistsResult = await new sql.Request()
//                 .input('UserName', UserName)
//                 .input('UserId', UserId)
//                 .input('Company_id', COM_ID)
//                 .query(`
//                     SELECT COUNT(*) AS userCount 
//                     FROM [${userPortalDB}].[dbo].[tbl_Users] 
//                     WHERE UserName = @UserName AND Company_Id = @Company_id AND Local_User_ID <> @UserId;
//                 `);

//             if (checkUserExistsResult.recordset[0].userCount > 0) {
//                 return invalidInput(res, 'User already exists');
//             }

//             await transaction.begin();

//             const globalUpdateResult = await new sql.Request(transaction)
//                 .input('UserId', UserId)
//                 .input('Name', Name)
//                 .input('UserName', UserName)
//                 .input('UserTypeId', UserTypeId)
//                 .input('Password', decryptPasswordFun(Password))
//                 .input('Company_id', COM_ID)
//                 .query(`
//                     UPDATE [${userPortalDB}].[dbo].[tbl_Users]
//                     SET Name = @Name,
//                         UserName = @UserName,
//                         UserTypeId = @UserTypeId,
//                         Password = @Password
//                     WHERE Local_User_ID = @UserId
//                     AND Company_Id = @Company_id;
//                 `);

//             if (globalUpdateResult.rowsAffected[0] === 0) {
//                 throw new Error('Global user update failed');
//             }

//             // Update local user record
//             const localUpdateResult = await new sql.Request(transaction)
//                 .input('UserId', UserId)
//                 .input('Name', Name)
//                 .input('UserName', UserName)
//                 .input('UserTypeId', UserTypeId)
//                 .input('Password', decryptPasswordFun(Password))
//                 .input('BranchId', BranchId)
//                 .input('Company_id', COM_ID)
//                 .query(`
//                     UPDATE [${DB_Name}].[dbo].[tbl_Users]
//                     SET Name = @Name,
//                         UserName = @UserName,
//                         UserTypeId = @UserTypeId,
//                         Password = @Password,
//                         BranchId = @BranchId
//                     WHERE UserId = @UserId
//                     AND Company_id = @Company_id;
//                 `);

//             if (localUpdateResult.rowsAffected[0] === 0) {
//                 throw new Error('Local user update failed');
//             }

//             await transaction.commit();
//             success(res, 'User updated successfully');

//         } catch (e) {
//             await transaction.rollback();
//             servError(e, res);
//         }
//     };

//     // new api for soft delete user
//     const newDeleteUser = async (req, res) => {
//         const { UserId } = req.body;

//         if (!checkIsNumber(UserId)) {
//             return invalidInput(res, 'UserId is required');
//         }

//         const transaction = new sql.Transaction();

//         try {
//             // const getDBNameResult = await getCompanyDBName(Company_id);
//             // if (!getDBNameResult.success) {
//             //     return invalidInput(res, 'Company is not available');
//             // }

//             await transaction.begin();

//             const globalUpdateResult = await new sql.Request(transaction)
//                 .input('UserId', UserId)
//                 .input('Company_id', COM_ID)
//                 .query(`
//                     UPDATE [${userPortalDB}].[dbo].[tbl_Users]
//                     SET UDel_Flag = 1
//                     WHERE Local_User_ID = @UserId
//                     AND Company_Id = @Company_id;
//                 `);

//             if (globalUpdateResult.rowsAffected[0] === 0) {
//                 throw new Error('Global user update failed');
//             }

//             // Update local user record
//             const localUpdateResult = await new sql.Request(transaction)
//                 .input('UserId', UserId)
//                 .input('Company_id', COM_ID)
//                 .query(`
//                     UPDATE [${DB_Name}].[dbo].[tbl_Users]
//                     SET UDel_Flag = 1
//                     WHERE UserId = @UserId
//                     AND Company_id = @Company_id;
//                 `);

//             if (localUpdateResult.rowsAffected[0] === 0) {
//                 throw new Error('Local user update failed');
//             }

//             await transaction.commit();
//             success(res, 'User deleted successfully')
//         } catch (e) {
//             await transaction.rollback();
//             servError(e, res);
//         }
//     };

//     const userDropdown = async (req, res) => {
//         try {
//             const { UserTypeId, BranchId, UserId, withAuth } = req.query;

//             const request = new sql.Request()
//                 .input('UserTypeId', UserTypeId || null)
//                 .input('BranchId', BranchId || null)
//                 .input('UserId', UserId || null)
//                 .query(`
//                     SELECT 
//                         UserId, 
//                         Name 
//                         ${Boolean(withAuth) ? ', Autheticate_Id ' : ''} 
//                     FROM tbl_Users
//                     WHERE 
//                         UDel_Flag = 0
//                         ${checkIsNumber(UserTypeId) ? ' AND UserTypeId = @UserTypeId ' : ''}
//                         ${checkIsNumber(BranchId) ? ' AND BranchId = @BranchId ' : ''}
//                         ${checkIsNumber(UserId) ? ' AND UserId = @UserId ' : ''}`
//                 );

//             const result = await request;

//             sentData(res, result.recordset)

//         } catch (e) {
//             return servError(e, res)
//         }
//     };

//     const employeeDropDown = async (req, res) => {
//         const { Company_id } = req.query;

//         if (!checkIsNumber(Company_id)) {
//             return invalidInput(res, 'Company_id is Required')
//         }

//         try {

//             const result = (await new sql.Request()
//                 .input('Comp', Company_id)
//                 .query(`
//                  						  SELECT 
//                         UserId, Name 
//                          FROM 
//                           tbl_Users 
//                       WHERE 
//                           UserTypeId IN (1, 2,3, 0)
//                       	AND UDel_Flag=0;

//                         `)
//                 // AND Company_id = @comp
//             ).recordset;

//             if (result.length > 0) {
//                 dataFound(res, result)
//             } else {
//                 noData(res)
//             }
//         } catch (e) {
//             servError(e, res);
//         }
//     }

//     const employeeAllDropDown = async (req, res) => {
//         const { Company_id } = req.query;

//         if (!checkIsNumber(Company_id)) {
//             return invalidInput(res, 'Company_id is Required')
//         }

//         try {

//             const result = (await new sql.Request()
//                 .input('Comp', Company_id)
//                 .query(` SELECT 
//                         UserId, Name 
//                     FROM 
//                         tbl_Users 
//                     WHERE UDel_Flag = 0 
//                         `)
//                 // AND Company_id = @comp
//             ).recordset;

//             if (result.length > 0) {
//                 dataFound(res, result)
//             } else {
//                 noData(res)
//             }
//         } catch (e) {
//             servError(e, res);
//         }
//     }

//     const getSalesPersonDropdown = async (req, res) => {

//         try {
//             const result = (await new sql.Request()
//                 .query(`
//                     SELECT 
//                         UserId, Name 
//                     FROM 
//                         tbl_Users 
//                     WHERE 
//                         UserTypeId = 6 
//                         AND UDel_Flag = 0 
//                         `
//                 )
//                 // AND Company_id = @comp
//             ).recordset;

//             if (result.length > 0) {
//                 dataFound(res, result)
//             } else {
//                 noData(res)
//             }
//         } catch (e) {
//             servError(e, res);
//         }
//     }

//     const getSalesPersonAndEmployeeDropdown = async (req, res) => {
//         const { Company_id } = req.query;

//         if (!checkIsNumber(Company_id)) {
//             return invalidInput(res, 'Company_id is Required')
//         }

//         try {
//             const result = (await new sql.Request()
//                 .input('comp', Company_id)
//                 .query(`
//                     SELECT 
//                         UserId, Name 
//                     FROM 
//                         tbl_Users 
//                     WHERE 
//                         UserTypeId = 6 
//                         OR
//                         UserTypeId = 3 
//                         AND UDel_Flag = 0 
//                         `
//                 )
//                 // AND Company_id = @comp
//             ).recordset;

//             if (result.length > 0) {
//                 dataFound(res, result)
//             } else {
//                 noData(res)
//             }
//         } catch (e) {
//             servError(e, res);
//         }
//     }

//     const customUserGet = async (req, res) => {
//         const { Company_id } = req.query;

//         if (!checkIsNumber(Company_id)) {
//             return invalidInput(res, 'Company_id is required');
//         }

//         try {
//             const result = await new sql.Request()
//                 .input('Company_id', Company_id)
//                 .query(`
//                     SELECT
//                     	u.*,
//                     	b.BranchName,
//                     	c.Company_id,
//                     	c.Company_Name
//                     FROM
//                     	tbl_Users AS u
//                     	LEFT JOIN tbl_Branch_Master AS b
//                     	ON b.BranchId = u.BranchId
//                     	LEFT JOIN tbl_Company_Master AS c
//                     	ON c.Company_id = b.Company_id
//                     `);
//             // WHERE c.Company_id = @Company_id

//             if (result.recordset.length > 0) {
//                 dataFound(res, result.recordset)
//             } else {
//                 noData(res)
//             }
//         } catch (e) {
//             servError(e, res);
//         }
//     }

//     const changePassword = async (req, res) => {
//         const { oldPassword, newPassword, userId } = req.body;

//         if (!oldPassword || !newPassword || !checkIsNumber(userId)) {
//             return invalidInput(res, 'oldPassword, newPassword, userId are required');
//         }

//         try {
//             const checkPassword = `SELECT Password, UserName FROM tbl_Users WHERE UserId = @userId`;
//             const request = new sql.Request().input('userId', userId);
//             const result = await request.query(checkPassword);

//             if (result.recordset[0] && result.recordset[0].Password === decryptPasswordFun(oldPassword)) {
//                 const UserName = result.recordset[0].UserName;
//                 const changePassword = new sql.Request();

//                 changePassword.input('Mode', 2);
//                 changePassword.input('UserName', UserName)
//                 changePassword.input('password', decryptPasswordFun(newPassword));

//                 const changePasswordResult = await changePassword.execute('Change_Paswword_SP');

//                 if (changePasswordResult.rowsAffected && changePasswordResult.rowsAffected[0] > 0) {
//                     success(res, 'Password Updated')
//                 } else {
//                     failed(res, 'Failed To Change Password')
//                 }

//             } else {
//                 failed(res, 'Current password does not match');
//             }
//         } catch (e) {
//             servError(e, res);
//         }
//     }

//     const createUserForCostcenter = async (req, res) => {
//         const { UserId, Cost_Center_Id } = req.body;

//         if (!UserId || !Cost_Center_Id) {
//             return invalidInput(res, 'Cost_Center_Id and UserId are required and must be valid.');
//         }

//         const transaction = new sql.Transaction();
//         console.log("Request Body:", req.body);

//         try {
//             await transaction.begin();

//             const updateCostCenterResult = await new sql.Request()
//                 .input('Cost_Center_Id', sql.Int, Cost_Center_Id)
//                 .input('UserId', sql.Int, UserId)
//                 .query(`
//                     UPDATE tbl_ERP_Cost_Center
//                     SET Is_Converted_To_User = 1, User_Id = @UserId
//                     WHERE Cost_Center_Id = @Cost_Center_Id;
//                 `);

//             if (updateCostCenterResult.rowsAffected[0] === 0) {
//                 throw new Error('Cost Center update failed');
//             }

//             await transaction.commit();

//             return success(res, 'User created successfully', [], {
//                 UserId: UserId,
//             });
//         } catch (e) {

//             console.error("Error in createUserForCostcenter:", e);
//             return servError(e, res);
//         }
//     };

//     return {
//         getUsers,
//         createUser,
//         updateUser,
//         newDeleteUser,
//         userDropdown,
//         employeeDropDown,
//         getSalesPersonDropdown,
//         getSalesPersonAndEmployeeDropdown,
//         customUserGet,
//         changePassword,
//         employeeAllDropDown,
//         createUserForCostcenter
//     }
// }

// export default user();




import sql from 'mssql'
import { servError, dataFound, noData, invalidInput, failed, success, sentData } from '../../res.mjs';
import { checkIsNumber, decryptPasswordFun, encryptPasswordFun, randomString } from '../../helper_functions.mjs';
import dotenv from 'dotenv';
dotenv.config();

const DB_Name = process.env.DATABASE;
const COM_ID = Number(process.env.COMPANY);
const userPortalDB = process.env.USERPORTALDB;

if (!checkIsNumber(COM_ID)) {
    throw new Error('COMPANY id is not specified in .env')
}

if (!DB_Name) {
    throw new Error('Company DATABASE is not specified in .env')
}

const user = () => {

    const getUsers = async (req, res) => {
        try {
            const { UserTypeId, BranchId, UserId, Cost_Center_Id, CostCenterTypeId } = req.query;
            const request = new sql.Request()
                .input('UserTypeId', UserTypeId || null)
                .input('BranchId', BranchId || null)
                .input('UserId', UserId || null)
                .input('Cost_Center_Id', Cost_Center_Id || null)
                .input('CostCenterTypeId', CostCenterTypeId || null)
                .query(`
                    SELECT
                        u.UserTypeId,
                        u.UserId,
                        u.UserName,
                        -- u.Password,
                        u.BranchId,
                        b.BranchName,
                        u.Name,
                        ut.UserType,
                        -- u.Autheticate_Id,
                        u.Company_Id AS Company_id,
                        c.Company_Name,
			        	ec.Cost_Center_Id,
			        	ec.Cost_Center_Name,
			        	uct.UserType AS costcentertype,
			            ec.User_Type AS CostCenterTypeId 
                    FROM tbl_Users AS u
                    LEFT JOIN tbl_User_Type AS ut ON ut.Id = u.UserTypeId
                    LEFT JOIN tbl_Company_Master AS c ON c.Company_id = u.Company_Id
			        LEFT JOIN tbl_ERP_Cost_Center AS ec ON ec.User_Id = u.UserId
			        LEFT JOIN tbl_User_Type AS uct ON uct.Id = ec.User_Type
			        LEFT JOIN tbl_Branch_Master AS b ON b.BranchId = u.BranchId
                    WHERE 
                        u.UDel_Flag = 0 
                        AND u.UserId <> 0
                        ${checkIsNumber(UserTypeId) ? ' AND u.UserTypeId = @UserTypeId ' : ''}
                        ${checkIsNumber(BranchId) ? ' AND u.BranchId = @BranchId ' : ''}
                        ${checkIsNumber(UserId) ? ' AND u.UserId = @UserId ' : ''}
                        ${checkIsNumber(Cost_Center_Id) ? ' AND ec.Cost_Center_Id = @Cost_Center_Id ' : ''}
                        ${checkIsNumber(CostCenterTypeId) ? ' AND ec.User_Type = @CostCenterTypeId ' : ''}
                    ORDER BY u.Name `
                );

            const result = await request;

            if (result.recordset.length > 0) {
                // const encryptPassword = result.recordset.map(o => ({ ...o, Password: encryptPasswordFun(o.Password) }))
                // const sorted = encryptPassword.sort((a, b) => a.Name.localeCompare(b.Name));
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res)
        }
    };

    // new api for create global user

    const createUser = async (req, res) => {
        const { Name, UserName, UserTypeId, Password, BranchId, Company_id } = req.body;
        const currentCompanyId = checkIsNumber(Company_id) ? Number(Company_id) : COM_ID;

        if (!Name || !UserName || !checkIsNumber(UserTypeId) || !Password || !checkIsNumber(BranchId)) {
            return invalidInput(res, 'Name, UserName, UserTypeId, Password and BranchId are required and must be valid.');
        }

        const transaction = new sql.Transaction();

        try {
            // Check if user already exists
            const checkUserExistsResult = await new sql.Request()
                .input('UserName', UserName)
                .input('Company_id', currentCompanyId)
                .query(`
                    SELECT COUNT(*) AS userCount 
                    FROM [${userPortalDB}].[dbo].[tbl_Users] 
                    WHERE UserName = @UserName AND Company_Id = @Company_id AND UDel_Flag = 0;
                `);

            if (checkUserExistsResult.recordset[0].userCount > 0) {
                return invalidInput(res, 'User already exists');
            }

            const AuthString = randomString(50);
            const getMaxUserIdResult = await new sql.Request()
                .query(`
                    SELECT CASE WHEN COUNT(*) > 0 THEN MAX(UserId) ELSE 0 END AS MaxUserId 
                    FROM [${DB_Name}].[dbo].[tbl_Users];
                `);
            const UserMaxId = Number(getMaxUserIdResult.recordset[0].MaxUserId) + 1;
            const getGlobalId = await new sql.Request()
                .query(`
                SELECT CASE WHEN COUNT(*) > 0 THEN MAX(Global_User_id) ELSE 0 END AS MaxUserId 
                FROM  [${userPortalDB}].[dbo].[tbl_Users];
            `);

            const globalIdMax = Number(getGlobalId.recordset[0].MaxUserId) + 1;

            await transaction.begin();

            const GlobalInsertionResult = await new sql.Request(transaction)
                .input('Company_id', currentCompanyId)
                .input('Global_User_ID', globalIdMax)
                .input('Local_User_ID', UserMaxId)
                .input('UserName', UserName)
                .input('Name', Name)
                .input('UserTypeId', UserTypeId)
                .input('Password', decryptPasswordFun(Password))
                .input('UDel_Flag', 0)
                .input('Autheticate_Id', AuthString)
                .query(`
                    INSERT INTO [${userPortalDB}].[dbo].[tbl_Users] (
                       Global_User_ID,Local_User_ID, Company_Id, Name, Password, UserTypeId, UserName, UDel_Flag, Autheticate_Id
                    ) VALUES (
                        @Global_User_ID,@Local_User_ID, @Company_Id, @Name, @Password, @UserTypeId, @UserName, @UDel_Flag, @Autheticate_Id
                    );
                    SELECT SCOPE_IDENTITY() AS GlobalId;
                `);

            if (GlobalInsertionResult.rowsAffected[0] === 0) {
                throw new Error('Global insertion failed');
            }
            const GlobalUserId = GlobalInsertionResult.recordset[0].GlobalId;


            const LocalInsertionResult = await new sql.Request(transaction)
                .input('COMPANY_DB', DB_Name)
                .input('UserId', UserMaxId)
                .input('Global_User_ID', globalIdMax)
                .input('UserTypeId', UserTypeId)
                .input('Name', Name)
                .input('UserName', UserName)
                .input('Password', decryptPasswordFun(Password))
                .input('Company_id', currentCompanyId)
                .input('BranchId', BranchId)
                .input('UDel_Flag', 0)
                .input('Autheticate_Id', AuthString)
                .query(`
                    INSERT INTO [${DB_Name}].[dbo].[tbl_Users] (
                        UserId, Global_User_ID, UserTypeId, Name, UserName, Password, Company_id, BranchId, UDel_Flag, Autheticate_Id
                    ) VALUES (
                        @UserId, @Global_User_ID, @UserTypeId, @Name, @UserName, @Password, @Company_id, @BranchId, @UDel_Flag, @Autheticate_Id
                    );
                `);

            if (LocalInsertionResult.rowsAffected[0] === 0) {
                throw new Error('Local insertion failed');
            }

            await transaction.commit();
            success(res, 'User created successfully', [], {
                UserId: UserMaxId
            });

        } catch (e) {
            await transaction.rollback();
            servError(e, res);
        }
    };

    // new api for update global user

    const updateUser = async (req, res) => {
        const {
            UserId, Name, UserName, UserTypeId, Password, BranchId, Company_id
        } = req.body;
        const currentCompanyId = checkIsNumber(Company_id) ? Number(Company_id) : COM_ID;

        if (!UserId || !Name || !UserName || !checkIsNumber(UserTypeId)  || !checkIsNumber(BranchId)) {
            return invalidInput(res, 'UserId, Name, UserName, UserTypeId and BranchId are required and must be valid.', {
                UserId, Name, UserName, UserTypeId, BranchId
            });
        }

        const transaction = new sql.Transaction();

        try {
            const checkUserExistsResult = await new sql.Request()
                .input('UserName', UserName)
                .input('UserId', UserId)
                .input('Company_id', currentCompanyId)
                .query(`
                    SELECT COUNT(*) AS userCount 
                    FROM [${userPortalDB}].[dbo].[tbl_Users] 
                    WHERE UserName = @UserName AND Company_Id = @Company_id AND Local_User_ID <> @UserId;
                `);

            if (checkUserExistsResult.recordset[0].userCount > 0) {
                return invalidInput(res, 'User already exists');
            }

            await transaction.begin();

            const globalUpdateResult = await new sql.Request(transaction)
                .input('UserId', UserId)
                .input('Name', Name)
                .input('UserName', UserName)
                .input('UserTypeId', UserTypeId)
                // .input('Password', decryptPasswordFun(Password))
                .input('Company_id', currentCompanyId)
                .query(`
                    UPDATE [${userPortalDB}].[dbo].[tbl_Users]
                    SET Name = @Name,
                        UserName = @UserName,
                        UserTypeId = @UserTypeId
                       -- Password = @Password
                    WHERE Local_User_ID = @UserId
                    AND Company_Id = @Company_id;
                `);

            if (globalUpdateResult.rowsAffected[0] === 0) {
                throw new Error('Global user update failed');
            }

            // Update local user record
            const localUpdateResult = await new sql.Request(transaction)
                .input('UserId', UserId)
                .input('Name', Name)
                .input('UserName', UserName)
                .input('UserTypeId', UserTypeId)
                // .input('Password', decryptPasswordFun(Password))
                .input('BranchId', BranchId)
                .input('Company_id', currentCompanyId)
                .query(`
                    UPDATE [${DB_Name}].[dbo].[tbl_Users]
                    SET Name = @Name,
                        UserName = @UserName,
                        UserTypeId = @UserTypeId,
                        
                        BranchId = @BranchId
                    WHERE UserId = @UserId
                    AND Company_id = @Company_id;
                `);

            if (localUpdateResult.rowsAffected[0] === 0) {
                throw new Error('Local user update failed');
            }

            await transaction.commit();
            success(res, 'User updated successfully');

        } catch (e) {
            await transaction.rollback();
            servError(e, res);
        }
    };

    // new api for soft delete user
    const newDeleteUser = async (req, res) => {
        const { UserId } = req.body;

        if (!checkIsNumber(UserId)) {
            return invalidInput(res, 'UserId is required');
        }

        const transaction = new sql.Transaction();

        try {
            // const getDBNameResult = await getCompanyDBName(Company_id);
            // if (!getDBNameResult.success) {
            //     return invalidInput(res, 'Company is not available');
            // }

            await transaction.begin();

            const globalUpdateResult = await new sql.Request(transaction)
                .input('UserId', UserId)
                .input('Company_id', COM_ID)
                .query(`
                    UPDATE [${userPortalDB}].[dbo].[tbl_Users]
                    SET UDel_Flag = 1
                    WHERE Local_User_ID = @UserId
                    AND Company_Id = @Company_id;
                `);

            if (globalUpdateResult.rowsAffected[0] === 0) {
                throw new Error('Global user update failed');
            }

            // Update local user record
            const localUpdateResult = await new sql.Request(transaction)
                .input('UserId', UserId)
                .input('Company_id', COM_ID)
                .query(`
                    UPDATE [${DB_Name}].[dbo].[tbl_Users]
                    SET UDel_Flag = 1
                    WHERE UserId = @UserId
                    AND Company_id = @Company_id;
                `);

            if (localUpdateResult.rowsAffected[0] === 0) {
                throw new Error('Local user update failed');
            }

            await transaction.commit();
            success(res, 'User deleted successfully')
        } catch (e) {
            await transaction.rollback();
            servError(e, res);
        }
    };

    const userDropdown = async (req, res) => {
        try {
            const { UserTypeId, BranchId, UserId, withAuth } = req.query;

            const request = new sql.Request()
                .input('UserTypeId', UserTypeId || null)
                .input('BranchId', BranchId || null)
                .input('UserId', UserId || null)
                .query(`
                    SELECT 
                        UserId, 
                        Name 
                        ${Boolean(withAuth) ? ', Autheticate_Id ' : ''} 
                    FROM tbl_Users
                    WHERE 
                        ISNULL(UDel_Flag, 0) = 0
                        ${checkIsNumber(UserTypeId) ? ' AND UserTypeId = @UserTypeId ' : ''}
                        ${checkIsNumber(BranchId) ? ' AND BranchId = @BranchId ' : ''}
                        ${checkIsNumber(UserId) ? ' AND UserId = @UserId ' : ''}`
                );

            const result = await request;

            sentData(res, result.recordset)

        } catch (e) {
            return servError(e, res)
        }
    };

    const userPortalDropdown = async (req, res) => {
        try {
            const request = new sql.Request()
                .query(`
                    SELECT 
                        Local_User_ID AS UserId, 
                        Name 
                    FROM [${userPortalDB}].[dbo].[tbl_Users];
                    WHERE Local_User_ID IS NOT NULL
                `);

            const result = await request;
            sentData(res, result.recordset);
        } catch (e) {
            return servError(e, res);
        }
    };

    const employeeDropDown = async (req, res) => {
        const { Company_id } = req.query;

        if (!checkIsNumber(Company_id)) {
            return invalidInput(res, 'Company_id is Required')
        }

        try {

            const result = (await new sql.Request()
                .input('Comp', Company_id)
                .query(`
                 						  SELECT 
                        UserId, Name 
                         FROM 
                          tbl_Users 
                      WHERE 
                          UserTypeId IN (1, 2,3, 0)
                      	AND UDel_Flag=0;

                        `)
                // AND Company_id = @comp
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

    const employeeAllDropDown = async (req, res) => {
        const { Company_id } = req.query;

        if (!checkIsNumber(Company_id)) {
            return invalidInput(res, 'Company_id is Required')
        }

        try {

            const result = (await new sql.Request()
                .input('Comp', Company_id)
                .query(` SELECT 
                        UserId, Name 
                    FROM 
                        tbl_Users 
                    WHERE UDel_Flag = 0 
                        `)
                // AND Company_id = @comp
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

    const getSalesPersonDropdown = async (req, res) => {

        try {
            const result = (await new sql.Request()
                .query(`
                    SELECT 
                        UserId, Name 
                    FROM 
                        tbl_Users 
                    WHERE 
                        UserTypeId = 6 
                        AND UDel_Flag = 0 
                        `
                )
                // AND Company_id = @comp
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

    const getSalesPersonAndEmployeeDropdown = async (req, res) => {
        const { Company_id } = req.query;

        if (!checkIsNumber(Company_id)) {
            return invalidInput(res, 'Company_id is Required')
        }

        try {
            const result = (await new sql.Request()
                .input('comp', Company_id)
                .query(`
                    SELECT 
                        UserId, Name 
                    FROM 
                        tbl_Users 
                    WHERE 
                        UserTypeId = 6 
                        OR
                        UserTypeId = 3 
                        AND UDel_Flag = 0 
                        `
                )
                // AND Company_id = @comp
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

    const customUserGet = async (req, res) => {
        const { Company_id } = req.query;

        if (!checkIsNumber(Company_id)) {
            return invalidInput(res, 'Company_id is required');
        }

        try {
            const result = await new sql.Request()
                .input('Company_id', Company_id)
                .query(`
                    SELECT
                    	u.*,
                    	b.BranchName,
                    	c.Company_id,
                    	c.Company_Name
                    FROM
                    	tbl_Users AS u
                    	LEFT JOIN tbl_Branch_Master AS b
                    	ON b.BranchId = u.BranchId
                    	LEFT JOIN tbl_Company_Master AS c
                    	ON c.Company_id = b.Company_id
                    `);
            // WHERE c.Company_id = @Company_id

            if (result.recordset.length > 0) {
                dataFound(res, result.recordset)
            } else {
                noData(res)
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const changePassword = async (req, res) => {
        const { oldPassword, newPassword, userId } = req.body;

        if (!oldPassword || !newPassword || !checkIsNumber(userId)) {
            return invalidInput(res, 'oldPassword, newPassword, userId are required');
        }

        try {
            const checkPassword = `SELECT Password, UserName FROM tbl_Users WHERE UserId = @userId`;
            const request = new sql.Request().input('userId', userId);
            const result = await request.query(checkPassword);

            if (result.recordset[0] && result.recordset[0].Password === decryptPasswordFun(oldPassword)) {
                const UserName = result.recordset[0].UserName;
                const changePassword = new sql.Request();

                changePassword.input('Mode', 2);
                changePassword.input('UserName', UserName)
                changePassword.input('password', decryptPasswordFun(newPassword));

                const changePasswordResult = await changePassword.execute('Change_Paswword_SP');

                if (changePasswordResult.rowsAffected && changePasswordResult.rowsAffected[0] > 0) {
                    success(res, 'Password Updated')
                } else {
                    failed(res, 'Failed To Change Password')
                }

            } else {
                failed(res, 'Current password does not match');
            }
        } catch (e) {
            servError(e, res);
        }
    }

    const createUserForCostcenter = async (req, res) => {
        const { UserId, Cost_Center_Id, Emp_Id } = req.body;

        if (!UserId || !Cost_Center_Id) {
            return invalidInput(res, 'Cost_Center_Id and UserId are required and must be valid.');
        }

        const transaction = new sql.Transaction();
   

        try {
            await transaction.begin();

            const updateCostCenterResult = await new sql.Request()
                .input('Cost_Center_Id', sql.Int, Cost_Center_Id)
                .input('UserId', sql.Int, UserId)
                .input('Emp_Id', sql.Int, Emp_Id ? Emp_Id : null)
                .query(`
                    UPDATE tbl_ERP_Cost_Center
                    SET Is_Converted_To_User = @Emp_Id, User_Id = @UserId
                    WHERE Cost_Center_Id = @Cost_Center_Id;
                `);

            if (updateCostCenterResult.rowsAffected[0] === 0) {
                throw new Error('Cost Center update failed');
            }

            await transaction.commit();

            return success(res, 'User created successfully', [], {
                UserId: UserId,
            });
        } catch (e) {

            console.error("Error in createUserForCostcenter:", e);
            return servError(e, res);
        }
    };

    return {
        getUsers,
        createUser,
        updateUser,
        newDeleteUser,
        userDropdown,
        userPortalDropdown,
        employeeDropDown,
        getSalesPersonDropdown,
        getSalesPersonAndEmployeeDropdown,
        customUserGet,
        changePassword,
        employeeAllDropDown,
        createUserForCostcenter
    }
}

export default user();