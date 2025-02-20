import express from 'express';

import attendance from "../controller/DataEntry/attendance.mjs";
import deliveryActivity from "../controller/DataEntry/deliveryActivity.mjs";
import godownActivity from "../controller/DataEntry/godownActivity.mjs";
import weightChecking from "../controller/DataEntry/weightChecking.mjs";
import staffActivity from "../controller/DataEntry/staffActivity.mjs";
import driverActivity from "../controller/DataEntry/driverActivity.mjs";
import { getMachineOuternController, MachineOuternControll } from '../controller/DataEntry/machineOutern.mjs';
import { getInwardActivity, InwardActivityControll } from '../controller/DataEntry/inwardActivity.mjs';
import purchaseOrder from '../controller/DataEntry/purchaseOrder.mjs';
import costCenter from '../controller/DataEntry/costCenter.mjs';

const dataEntryRouter = express.Router();

dataEntryRouter.get('/driverActivities', driverActivity.optimizedQuery);
dataEntryRouter.get('/driverActivities/view2', driverActivity.newDriverActivity);
dataEntryRouter.get('/driverActivities/tripBased', driverActivity.TripBasedReport);
dataEntryRouter.get('/driverActivities/timeBased', driverActivity.timeBasedReport);
dataEntryRouter.get('/driverActivities/drivers', driverActivity.getDrivers);
dataEntryRouter.post('/driverActivities', driverActivity.addDriverActivities);
dataEntryRouter.put('/driverActivities', driverActivity.editDriverActivity);


// Godown Activities
dataEntryRouter.get('/godownActivities', godownActivity.getGodownActivity)
dataEntryRouter.get('/godownActivities/abstract', godownActivity.getGodownAbstract)
dataEntryRouter.post('/godownActivities', godownActivity.postGWActivity)
dataEntryRouter.put('/godownActivities', godownActivity.updateGWActivity)


// Delivery Activities
dataEntryRouter.get('/deliveryActivities', deliveryActivity.getDeliveryReport)
dataEntryRouter.get('/deliveryActivities/abstract', deliveryActivity.getLastDelivery)
dataEntryRouter.post('/deliveryActivities', deliveryActivity.addDeliveryReport)
dataEntryRouter.put('/deliveryActivities', deliveryActivity.updateDeliveryActivity)


// Staff Activities
dataEntryRouter.get('/staffActivities', staffActivity.getStaffActivityNew)
dataEntryRouter.get('/staffActivities/staffBased', staffActivity.getStaffBasedNew);
dataEntryRouter.get('/staffActivities/staffs', staffActivity.getUniqueStaff)
dataEntryRouter.post('/staffActivities', staffActivity.postStaffActivity)
dataEntryRouter.put('/staffActivities', staffActivity.editStaffActivity)


// Machine Outern Activities
dataEntryRouter.get('/machineOutern', getMachineOuternController)
dataEntryRouter.post('/machineOutern', MachineOuternControll)


// Inward Activity
dataEntryRouter.get('/inwardActivity', getInwardActivity)
dataEntryRouter.post('/inwardActivity', InwardActivityControll)


// Weight Check Activity
dataEntryRouter.get('/weightCheckActivity/getStaffs', weightChecking.getStaffs)
dataEntryRouter.get('/weightCheckActivity/getItems', weightChecking.getItems)
dataEntryRouter.get('/weightCheckActivity', weightChecking.getWGChecking)
dataEntryRouter.post('/weightCheckActivity', weightChecking.addWGCheckActivity)
dataEntryRouter.put('/weightCheckActivity', weightChecking.editWGCheckActivity)


// Data Entry Attendance
dataEntryRouter.get('/dataEntryAttendance', attendance.getAttendanceNew)
dataEntryRouter.post('/dataEntryAttendance', attendance.insertAttendance)
dataEntryRouter.put('/dataEntryAttendance', attendance.updateAttendance)


// Purchase Order
dataEntryRouter.get('/godownLocationMaster', purchaseOrder.godownLocation);
dataEntryRouter.get('/purchaseOrderEntry', purchaseOrder.getPurchaseOrder)
dataEntryRouter.post('/purchaseOrderEntry', purchaseOrder.createPurchaseOrder)
dataEntryRouter.put('/purchaseOrderEntry', purchaseOrder.updatePurchaseOrder)
dataEntryRouter.delete('/purchaseOrderEntry', purchaseOrder.deleteOrderPermanantly);
dataEntryRouter.get('/purchaseOrderEntry/delivery/partyBased', purchaseOrder.getDeliveryByPartyId);
dataEntryRouter.put('/purchaseOrderEntry/ArrivalUpdate', purchaseOrder.updateArrivalDetails);
dataEntryRouter.get('/pendingPartyInvoice', purchaseOrder.getPartyForInvoice);


dataEntryRouter.get('/costCenter', costCenter.getCostCenter);
dataEntryRouter.post('/costCenter', costCenter.createCostCenter);
dataEntryRouter.put('/costCenter', costCenter.updateCostCenter);

dataEntryRouter.get('/costCenter/category',costCenter.getCostCenterCategory)
dataEntryRouter.post('/costCategory',costCenter.createCostCategory)
dataEntryRouter.put('/costCategory',costCenter.updateCostCategory)
dataEntryRouter.delete('/costCategory',costCenter.deleteCostCategory)
dataEntryRouter.get('/costCategory/DropDown',costCenter.costCategoryDropDown)

dataEntryRouter.get('/costCenter/report',costCenter.costCenterInvolvedReports)
dataEntryRouter.get('/costCenter/report/employee',costCenter.costCenterEmployeeReports)

export default dataEntryRouter;