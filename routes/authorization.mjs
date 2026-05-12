import express from 'express';
import LoginController from '../controller/Authorization/login.mjs';
import appMenu from '../controller/Authorization/appMenu.mjs';
import authenticateToken from '../middleware/auth.mjs';
import branchRight from '../controller/Authorization/branchRight.mjs';
import { getModuleRulesWithAccess, postModuleRules, putModuleRules, saveModuleRuleccess } from '../controller/Authorization/moduleConfiguration.mjs';

const AuthorizationRouter = express.Router();


AuthorizationRouter.post('/login', LoginController.login);
AuthorizationRouter.get('/userAuth', LoginController.getUserByAuth);
AuthorizationRouter.post('/userPortal/login', LoginController.globalLogin);
AuthorizationRouter.get('/userPortal/accounts', LoginController.getAccountsInUserPortal);
AuthorizationRouter.get('/userAuthmobile', LoginController.mobileApplogin);


AuthorizationRouter.get('/appMenu', authenticateToken, appMenu.newAppMenu);
AuthorizationRouter.get('/newAppMenu', authenticateToken, appMenu.newAppMenu)

AuthorizationRouter.get('/userRights/userBased', appMenu.getNewUserBasedRights);
AuthorizationRouter.get('/userRights', appMenu.getNewAuthBasedRights);
AuthorizationRouter.post('/userRights', appMenu.newModifyUserRights);

AuthorizationRouter.get('/userTypeRights', appMenu.getNewUserTypeBasedRights);
AuthorizationRouter.post('/userTypeRights', appMenu.newModifyUserTypeRights);

AuthorizationRouter.get('/menuMaster', appMenu.listMenu);
AuthorizationRouter.post('/menuMaster', appMenu.createNewMenu);
AuthorizationRouter.put('/menuMaster', appMenu.updateMenu);

// AuthorizationRouter.get('/companysAccess', companyAccess.getMYCompanyAccess);
// AuthorizationRouter.post('/companysAccess', companyAccess.postCompanyAccess);

AuthorizationRouter.get('/userBranches', branchRight.getUserBranches);
AuthorizationRouter.post('/userBranches', branchRight.modifyUserBranch)
AuthorizationRouter.post('/userBranches/saveAll', branchRight.saveAllUserBranches);

AuthorizationRouter.get('/moduleRules', getModuleRulesWithAccess);
AuthorizationRouter.post('/moduleRules', postModuleRules);
AuthorizationRouter.put('/moduleRules', putModuleRules);

AuthorizationRouter.post('/moduleRules/access', saveModuleRuleccess);


AuthorizationRouter.post('/getUserTypeAuth',LoginController.getUserTypeAuth)

export default AuthorizationRouter;