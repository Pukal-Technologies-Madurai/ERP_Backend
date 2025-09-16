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
import branchPos from '../controller/Masters/pos.mjs';
import uom from '../controller/Masters/uom.mjs';
import posRateMaster from '../controller/Masters/posRateMaster.mjs';
import expenceMaster from '../controller/Masters/expences.mjs';
import accountMaster from '../controller/Masters/accountMaster.mjs';
import leaveType from '../controller/Masters/leaveType.mjs';
import leaveMaster from '../controller/Masters/leaveMaster.mjs';
import lom from '../controller/Masters/lom.mjs'
import dbconnect from '../middleware/otherDB.mjs';
import defaultAccountMaster from '../controller/Masters/defaultAccountMaster.mjs';
import lol from '../controller/Masters/lol.mjs';
import los from '../controller/Masters/los.mjs';
import upload from '../middleware/excelUpload.mjs';
import costCenter from '../controller/Masters/costCenter.mjs';

import accountGroup from '../controller/Masters/accountgroup.mjs';
import state from '../controller/Masters/state.mjs';
import godown from '../controller/Masters/godown.mjs';
import brand from '../controller/Masters/brand.mjs';
import district from '../controller/Masters/district.mjs';
import voucherGroup from '../controller/Masters/voucherGroup.mjs';
import prodGroup from '../controller/Masters/prodGroup.mjs';
import defaultBanks from '../controller/Masters/defaultBanks.mjs';

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
MastersRouter.get('/retailers/soldProducts', retailers.retailerSoldProduct);
MastersRouter.get('/retailers/whoHasClosingStock', retailers.getRetailersWhoHasClosingStock);


MastersRouter.get('/tallyMaster/ledger', dbconnect, TallyMasters.getTallyAndERPLOL);
MastersRouter.get('/tallyMaster/items', dbconnect, TallyMasters.getTallyAndERPLOS);


MastersRouter.get('/products/allProducts', products.getAllProducts);
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
MastersRouter.get('/products/withStock', products.getProductsWithStock);


MastersRouter.get('/routes', retailerRoutes.getRoutes);
MastersRouter.post('/routes', retailerRoutes.addRoutes);
MastersRouter.put('/routes', retailerRoutes.editRoutes);
MastersRouter.delete('/routes', retailerRoutes.deleteRoute);
MastersRouter.post('/setRoutes', retailerRoutes.setRoutes);
MastersRouter.get('/setRoutes', retailerRoutes.getSetRoutes);
MastersRouter.put('/setRoutes', retailerRoutes.updateSetRoutes)
MastersRouter.delete('/setRoutes', retailerRoutes.deletesetRoutes);

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


MastersRouter.get('/Employeedetails', employeesTasks.getEmployeeTasks)
MastersRouter.get('/Employeedetails/dropDown', employeesTasks.getusersDropDown)
MastersRouter.post('/Employeedetails/employeeAdd', employeesTasks.postEmployeesProjects)
MastersRouter.get('/Employeedetails/getusersproject', employeesTasks.getUsersProjectId)
MastersRouter.post('/employeedetails/assignTask', employeesTasks.assignTaskForEmployee)
MastersRouter.put('/employeedetails/updateTask', employeesTasks.modifyTaskAssignedForEmployee)
MastersRouter.get('/employeedetails/assignedTaskDetails', employeesTasks.getEmployeeAssignedInTheTask)
MastersRouter.delete('/employeedetails/deleteTask', employeesTasks.deleteAssignedTaskDetails)
MastersRouter.get('/routes/dropdown', salesAppMasters.getRoutes);
MastersRouter.get('/areas/dropdown', salesAppMasters.getareaRoutes);

MastersRouter.get('/EmployeedetailsfingerPrint/dropDown',employeesTasks.getusersDropDownForFingerPrint)

MastersRouter.delete('/employeedetails/deleteTask', employeesTasks.deleteAssignedTaskDetails)
MastersRouter.get('/employeedetails/selectedTaskDetails', employeesTasks.selectedTaskDetails)

MastersRouter.post('/users/costcenter', user.createUserForCostcenter);
MastersRouter.get('/userTypecostcenter', userType.userTypeforcostcenter);

MastersRouter.get('/voucher', voucherType.getVoucherType);
MastersRouter.post('/voucher', voucherType.addVoucherType);
MastersRouter.put('/voucher', voucherType.editVoucherType);
MastersRouter.delete('/voucher', voucherType.deleteVoucherType);


MastersRouter.get('/expences', expenceMaster.getExpences);



// 24-03-2025

MastersRouter.get('/posbranch/dropdown', branchPos.getPosDropDown);
MastersRouter.get('/posbranch', branchPos.getPosBranch);
MastersRouter.post('/posbranch', branchPos.postPosBranch);
MastersRouter.put('/posbranch', branchPos.putPosBranch);
MastersRouter.delete('/posbranch', branchPos.deleteBranch)

MastersRouter.get('/posbrand/productList', branchPos.getProductsList)

MastersRouter.get('/uom', uom.getUOM);
MastersRouter.post('/uom', uom.postUOM);
MastersRouter.put('/uom', uom.putUOM);
MastersRouter.delete('/uom', uom.deleteUOM)

MastersRouter.get('/posRateMaster', posRateMaster.getPosRateMaster);
MastersRouter.get('/product/dropdown', posRateMaster.getProductDropdown)
MastersRouter.post('/posRateMaster', posRateMaster.postPosRateMaster)
MastersRouter.put('/posRateMaster', posRateMaster.putPosRateMaster)
MastersRouter.delete('/posRateMaster', posRateMaster.deletePosRateMaster)


MastersRouter.post('/exportRateMaster', posRateMaster.postbulkExport);
MastersRouter.get('/syncPOSData', posRateMaster.valuesSync)
MastersRouter.get('/posproductSync', posRateMaster.posProductSync);
MastersRouter.get('/posRetailersSync', retailers.posRetailesSync);
MastersRouter.get('/posProductList', posRateMaster.posProductList);

MastersRouter.get('/accounts', accountMaster.getAccounts);
MastersRouter.get('/accountGroups', accountMaster.getAccountGroups);

MastersRouter.post('/leaveType', leaveType.addLeaveType);
MastersRouter.get('/leaveType', leaveType.getLeaveType);
MastersRouter.put('/leaveType', leaveType.editLeaveType);
MastersRouter.delete('/leaveType', leaveType.deleteLeaveType);
MastersRouter.get('/leaveType/dropDown', leaveType.getLeaveTypeDropdown)


MastersRouter.get('/leave', leaveMaster.getLeaveList);
MastersRouter.post('/leave', leaveMaster.applyLeave);
MastersRouter.put('/leave', leaveMaster.editLeave);
MastersRouter.get('/leave', leaveMaster.deleteLeave)
MastersRouter.get('/approveData', leaveMaster.lisitingApproveData);

MastersRouter.post('/addLeave', leaveMaster.definedLeave)
MastersRouter.get('/defaultLeave', leaveMaster.getDefaultLeave)
MastersRouter.put('/defaultLeave', leaveMaster.updateDefaultLeave);

MastersRouter.get('/getDetails', lom.getDetailsData)
MastersRouter.get('/getTallyData', dbconnect, lom.getTallyDatabase);


MastersRouter.get('/defaultAccountMaster', defaultAccountMaster.getDefaultAccounts);
MastersRouter.post('/defaultAccountMaster', defaultAccountMaster.insertDefaultAccount);
MastersRouter.put('/defaultAccountMaster', defaultAccountMaster.updateDefaultAccount);


MastersRouter.get('/getlolDetails', lol.lollist)
MastersRouter.get('/displayColumn', lol.displayColumn)
MastersRouter.put('/updateColumnChanges', lol.applyColumnChanges);
MastersRouter.get('/columns/dropDown', lol.dropDownColumn)

MastersRouter.put('/updateDetails', dbconnect, lol.updateLolData)
MastersRouter.put('/updateLosDetails', dbconnect, los.updateLosData)

MastersRouter.get('/getlosDetails', los.loslist)
MastersRouter.get('/displayLosColumn', los.displayLoSColumn)
MastersRouter.put('/updateLosColumnChanges', los.applyLosColumnChanges);
MastersRouter.get('/columns/dropDownLos', los.dropDownLosColumn);

MastersRouter.post('/uploadExcel', dbconnect, upload.single('file'), lol.excelUpload)
MastersRouter.post('/uploadLosExcel', dbconnect, upload.single('file'), los.excelUpload)


MastersRouter.post('/accountMaster', accountMaster.createAccount)
MastersRouter.get('/accountMaster', accountMaster.getAccountDetails)
MastersRouter.get('/accountMaster/groupFilter', accountMaster.getAccountsByGroups)
MastersRouter.put('/accountMaster', accountMaster.updateAccountDetails)
MastersRouter.delete('/accountMaster', accountMaster.deleteAccountDetails)
MastersRouter.get('/account/dropDown', accountMaster.accountingGroupDropDown)


MastersRouter.get('/accountGroup', accountGroup.getAccountGroup);
MastersRouter.post('/accountGroup', accountGroup.createAccountGroup);
MastersRouter.put('/accountGroup', accountGroup.updateAccountGroup)
MastersRouter.delete('/accountGroup', accountGroup.deleteAccountGroup)


MastersRouter.get('/state', state.getState);
MastersRouter.post('/state', state.createState);
MastersRouter.delete('/state', state.deleteState)
MastersRouter.put('/state', state.updateState)
MastersRouter.get('/state/dropDown', state.stateDropDown)


MastersRouter.get('/godown', godown.getGodown);
MastersRouter.post('/godown', godown.createGodown)
MastersRouter.put('/godown', godown.updateGodown)
MastersRouter.delete('/godown', godown.deleteGodown)


MastersRouter.get('/brand', brand.getBrand);
MastersRouter.get('/brand/dropDown', brand.getBrandDropDown)
MastersRouter.post('/brand', brand.postBrand)
MastersRouter.delete('/brand', brand.deleteBrand)
MastersRouter.put('/brand', brand.putBrand)


MastersRouter.get('/district', district.getDistric);
MastersRouter.post('/district', district.createDistrict)
MastersRouter.put('/district', district.updateDistrict)
MastersRouter.delete('/district', district.deleteDistrict);

MastersRouter.get('/voucherGroup', voucherGroup.getVoucherGroupDropdown);

MastersRouter.get('/proGroup', prodGroup.getProductGroups);
MastersRouter.post('/proGroup', prodGroup.postProdGroup);
MastersRouter.put('/proGroup', prodGroup.putProdGroup);
MastersRouter.delete('/proGroup', prodGroup.deleteProGroup);

MastersRouter.get('/defaultBanks', defaultBanks.getdefaultBanks);

MastersRouter.get('/getCostCenter', costCenter.getCostCenter)
MastersRouter.get('/erpCostCenter/dropDown', costCenter.getCostDropDown)
MastersRouter.put('/costCenterupdate', costCenter.putCostcenter)

export default MastersRouter;