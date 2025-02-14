import express from 'express';
import company from '../controller/Masters/company.mjs';
import branch from '../controller/Masters/branch.mjs';
import user from '../controller/Masters/user.mjs';
import userType from '../controller/Masters/userType.mjs';
import taskType from '../controller/Masters/taskType.mjs';
import baseGroup from '../controller/Masters/baseGroup.mjs';
import retailers from '../controller/Masters/retailers.mjs';
import products from '../controller/Masters/products.mjs';
import retailerArea from '../controller/Masters/retailerArea.mjs';
import salesAppMasters from '../controller/Masters/salesAppMasters.mjs';
import retailerRoutes from '../controller/Masters/retailerRoutes.mjs';
import retailerClosingStock from '../controller/Masters/retailerClosingStock.mjs';
import employeesTasks from '../controller/EmployeesInvolved/EmployeesTask.mjs';
import TallyMasters from '../controller/Masters/tallyMasters.mjs';
import voucherType from '../controller/Masters/voucherType.mjs';
import dbconnect from '../middleware/otherDB.mjs';

const MastersRouter = express.Router();

MastersRouter.get('/company', company.getCompany);
MastersRouter.post('/company', company.postCompany);
MastersRouter.put('/company', company.putCompany);
MastersRouter.delete('/company', company.deleteCompany);
MastersRouter.get('/company/dropDown', company.getCompanyDrowDown);


MastersRouter.get('/branch', branch.getBranch);
MastersRouter.post('/branch', branch.postBranch);
MastersRouter.put('/branch', branch.putBranch);
MastersRouter.delete('/branch', branch.deleteBranch);
MastersRouter.get('/branch/dropDown', branch.getBranchDrowDown);


MastersRouter.get('/users', user.getUsers);
MastersRouter.post('/users', user.createUser);
MastersRouter.put('/users', user.updateUser);
MastersRouter.delete('/users', user.newDeleteUser);
MastersRouter.get('/user/dropDown', user.userDropdown);
MastersRouter.get('/users/customUsers', user.customUserGet);
MastersRouter.get('/users/employee/dropDown', user.employeeDropDown);
MastersRouter.get('/users/employee/employeeAllDropDown', user.employeeAllDropDown);
MastersRouter.get('/users/employeeAndSalesPerson/dropDown', user.getSalesPersonAndEmployeeDropdown);
MastersRouter.get('/users/salesPerson/dropDown', user.getSalesPersonDropdown);
MastersRouter.put('/users/changePassword', user.changePassword);


MastersRouter.get('/userType', userType.getUserType);
MastersRouter.post('/userType', userType.postUserType);
MastersRouter.put('/userType', userType.editUserType);
MastersRouter.delete('/userType', userType.deleteUserType);


MastersRouter.get('/taskType', taskType.getTaskTyepe)
MastersRouter.get('/taskType/dropDown', taskType.TaskTypeDropDown)
MastersRouter.post('/taskType', taskType.postTaskType);
MastersRouter.put('/taskType', taskType.editTaskType);
MastersRouter.delete('/taskType', taskType.deleteTaskType);


MastersRouter.get('/baseGroup', baseGroup.getBaseGroup);
MastersRouter.post('/baseGroup', baseGroup.postBaseGroup);
MastersRouter.put('/baseGroup', baseGroup.editBaseGroup);
MastersRouter.delete('/baseGroup', baseGroup.deleteBaseGroup);


MastersRouter.get('/retailers', retailers.getSFCustomers);
MastersRouter.get('/retailers/dropDown', retailers.getRetailerDropDown);
MastersRouter.get('/retailers/areaRetailers', retailers.getAreaRetailers);
MastersRouter.get('/retailers/info', retailers.getRetailerInfo);
MastersRouter.post('/retailers', retailers.addRetailers);
MastersRouter.put('/retailers', retailers.putRetailers);
MastersRouter.post('/retailers/location', retailers.postLocationForCustomer);
MastersRouter.put('/retailers/location', retailers.verifyLocation);
MastersRouter.put('/retailers/visitLogToRetailer', retailers.convertVisitLogToRetailer);
MastersRouter.get('/retailers/closingStock', retailerClosingStock.getClosingStockValues);
MastersRouter.get('/retailers/closingStock/productBased', retailerClosingStock.getRetailerPreviousClosingStock);
MastersRouter.get('/retailers/closingStock/areaBased', retailerClosingStock.closingStockAreaBased);
MastersRouter.get('/retailers/closingStock/myEntry', retailerClosingStock.getSalesPersonEnteredClosingStock);
MastersRouter.post('/retailers/closingStock', retailerClosingStock.closeingStock);
MastersRouter.put('/retailers/closingStock', retailerClosingStock.closeingStockUpdate);
MastersRouter.post('/retailers/lolSync', retailers.syncTallyLOL);


MastersRouter.get('/tallyMaster/ledger', dbconnect, TallyMasters.getTallyAndERPLOL);
MastersRouter.get('/tallyMaster/items', dbconnect, TallyMasters.getTallyAndERPLOS);


MastersRouter.get('/products', products.getProducts);
MastersRouter.get('/products/dropDown', products.productDropDown);
MastersRouter.post('/products', products.postProductsWithoutImage);
MastersRouter.put('/products', products.updateProduct);
MastersRouter.post('/products/withImage', products.postProductsWithImage);
MastersRouter.put('/products/productImage', products.updateProductImages);
MastersRouter.get('/products/grouped', products.getGroupedProducts);
MastersRouter.get('/products/productGroups', products.getProductGroups);
MastersRouter.get('/products/packs', products.getProductPacks);
MastersRouter.post('/products/losSync', products.syncTallyLOS);


MastersRouter.get('/routes', retailerRoutes.getRoutes);
MastersRouter.post('/routes', retailerRoutes.addRoutes);
MastersRouter.put('/routes', retailerRoutes.editRoutes);
MastersRouter.delete('/routes', retailerRoutes.deleteRoute);

MastersRouter.get('/areas', retailerArea.getAreaMaster);
MastersRouter.post('/areas', retailerArea.addArea);
MastersRouter.put('/areas', retailerArea.editArea);
MastersRouter.delete('/areas', retailerArea.deleteArea);


MastersRouter.get('/state', salesAppMasters.getStates);
MastersRouter.get('/district', salesAppMasters.getDistricts);
MastersRouter.get('/outlets', salesAppMasters.getOutlet);
MastersRouter.get('/distributors', salesAppMasters.getDistributors);
MastersRouter.get('/uom', salesAppMasters.getUOM);
MastersRouter.get('/brand', salesAppMasters.getBrand);


MastersRouter.get('/Employeedetails',employeesTasks.getEmployeeTasks)
MastersRouter.get('/Employeedetails/dropDown',employeesTasks.getusersDropDown)
MastersRouter.post('/Employeedetails/employeeAdd',employeesTasks.postEmployeesProjects)
MastersRouter.get('/Employeedetails/getusersproject',employeesTasks.getUsersProjectId)
MastersRouter.post('/employeedetails/assignTask',employeesTasks.assignTaskForEmployee)
MastersRouter.put('/employeedetails/updateTask',employeesTasks.modifyTaskAssignedForEmployee)
MastersRouter.get('/employeedetails/assignedTaskDetails',employeesTasks.getEmployeeAssignedInTheTask)
MastersRouter.delete('/employeedetails/deleteTask',employeesTasks.deleteAssignedTaskDetails)
MastersRouter.get('/routes/dropdown', salesAppMasters.getRoutes);
MastersRouter.get('/areas/dropdown', salesAppMasters.getareaRoutes);    


MastersRouter.delete('/employeedetails/deleteTask',employeesTasks.deleteAssignedTaskDetails)
MastersRouter.get('/employeedetails/selectedTaskDetails',employeesTasks.selectedTaskDetails)

MastersRouter.post('/users/costcenter', user.createUserForCostcenter);
MastersRouter.get('/userTypecostcenter', userType.userTypeforcostcenter);

MastersRouter.get('/voucher', voucherType.getVoucherType);
MastersRouter.post('/voucher', voucherType.addVoucherType);
MastersRouter.put('/voucher', voucherType.editVoucherType);
MastersRouter.delete('/voucher', voucherType.deleteVoucherType);

export default MastersRouter;