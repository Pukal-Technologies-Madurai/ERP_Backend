import express from 'express';
import tallyStockBased from '../controller/Inventory/tallyStockBased.mjs';
import stockJournals from '../controller/Inventory/stockJournals.mjs';
import stockProcessing from '../controller/Inventory/stockProcessing.mjs';
import dbconnect from '../middleware/otherDB.mjs';
import tripmaster from '../controller/Inventory/tripmaster.mjs';
import arrivalMaster from '../controller/Inventory/arrivalMaster.mjs';
import batchProcess from '../controller/Inventory/batchProcess.mjs';
import inventoryReport from '../controller/Inventory/reports.mjs';
import { alterHistory } from '../middleware/alterHistory.mjs';
import rateValues from '../controller/Inventory/rateValues.mjs';

const inventoryRouter = express.Router();


inventoryRouter.get('/getTallyStockJournal', dbconnect, tallyStockBased.getTallyStockJournalData);
inventoryRouter.get(
    '/getTallyStockJournal/sourceAndDestination',
    dbconnect,
    tallyStockBased.getTallyStockJournalDataExtended
);

inventoryRouter.get('/stockJournal', stockJournals.getJournalDetails);
inventoryRouter.post('/stockJournal', stockJournals.createStockJournal);
inventoryRouter.put('/stockJournal', stockJournals.updateStockJournal);
inventoryRouter.delete('/stockJournal', stockJournals.deleteJournalInfo);
inventoryRouter.get('/stockJournal/godownActivity', stockJournals.godownActivity);
inventoryRouter.get('/stockJournal/tallySync', stockJournals.syncTallyStockJournal);
inventoryRouter.get('/stockJournal/inwardsReport', stockJournals.getDestinationItemsOfInwards);

inventoryRouter.get('/tripSheet', tripmaster.getTripDetails);
inventoryRouter.post('/tripSheet', tripmaster.createTripDetails);
inventoryRouter.put(
    '/tripSheet', 
    alterHistory({
        alteredTable: 'tbl_Trip_Master',
        rowIdField: 'Trip_Id',
        userField: 'Updated_By',
        reason: 'Alter_Reason',
    }),
    tripmaster.updateTripDetails
);

inventoryRouter.get('/tripSheet/arrivalEntry', arrivalMaster.getArrivalEntry);
inventoryRouter.get('/tripSheet/arrivalEntry/filters', arrivalMaster.getArrivalFilters);
inventoryRouter.post('/tripSheet/arrivalEntry/bulk', arrivalMaster.addBulkArrivalEntry);
inventoryRouter.post('/tripSheet/arrivalEntry', arrivalMaster.addArrivalEntry);
inventoryRouter.put(
    '/tripSheet/arrivalEntry', 
    alterHistory({
        alteredTable: 'tbl_Trip_Arrival',
        rowIdField: 'Arr_Id',
        userField: 'Updated_By',
        reason: 'Alter_Reason',
    }),
    arrivalMaster.editArrivalEntry
);
// inventoryRouter.put('/tripSheet/arrivalList', tripmaster.addArrivalDetails);
// inventoryRouter.delete('/tripSheet/arrivalList', tripmaster.addArrivalDetails);

inventoryRouter.post('/stockProcessing/getWithFilters', stockProcessing.getProcessingDetails);
inventoryRouter.get('/stockProcessing/itemsUsed', stockProcessing.getItemsUsedInProcessing);
inventoryRouter.post('/stockProcessing', stockProcessing.createStockProcessing);
inventoryRouter.put(
    '/stockProcessing', 
    alterHistory({
        alteredTable: 'tbl_Processing_Gen_Info',
        rowIdField: 'PR_Id',
        userField: 'Updated_By',
        reason: 'Alter_Reason',
    }),
    stockProcessing.updateStockProcessing
);
inventoryRouter.delete('/stockProcessing', stockProcessing.deleteStockProcessing);

inventoryRouter.get('/batchMaster/materialInward', batchProcess.getUnAssignedBatchFromMaterialInward);
inventoryRouter.post('/batchMaster/materialInward', batchProcess.postBatchInMaterialInward);

inventoryRouter.get('/batchMaster/consumption', batchProcess.getUnAssignedBatchProcessingSource);
inventoryRouter.post('/batchMaster/consumption', batchProcess.postBatchInProcessingSource);

inventoryRouter.get('/batchMaster/production', batchProcess.getUnAssignedBatchProcessing);
inventoryRouter.post('/batchMaster/production', batchProcess.postBatchInProcessing);

inventoryRouter.get('/batchMaster/godownTransfer', batchProcess.getUnAssignedBatchFromGodownTransfer);
inventoryRouter.post('/batchMaster/godownTransfer', batchProcess.postOtherGodownTransfer);

inventoryRouter.get('/batchMaster/sales', batchProcess.getUnAssignedBatchSales);
inventoryRouter.post('/batchMaster/sales', batchProcess.postSalesUsage);

inventoryRouter.get('/batchMaster/purchase', batchProcess.getUnAssignedBatchPurchase);
inventoryRouter.post('/batchMaster/purchase', batchProcess.postPurchaseBatch);

inventoryRouter.get('/batchMaster/creditNote', batchProcess.getUnAssignedBatchCreditNote);
inventoryRouter.post('/batchMaster/creditNote', batchProcess.postCreditNoteBatch);

inventoryRouter.get('/batchMaster/debitNote', batchProcess.getUnAssignedBatchDebitNote);
inventoryRouter.post('/batchMaster/debitNote', batchProcess.postDebitNoteUsage);

inventoryRouter.get('/batchMaster/stockBalance', batchProcess.getBatchStockBalance);
inventoryRouter.get('/batchMaster/previousAndNextStages', batchProcess.previousAndNextStages);
inventoryRouter.get('/batchMaster/batchPreviousStage', batchProcess.previousBatchDetails);
inventoryRouter.get('/batchMaster/batchNextStage', batchProcess.nextBatchDetails);

inventoryRouter.get('/trunoverRatio', inventoryReport.getInventoryReport);


inventoryRouter.get('/getStockAdjustments',inventoryReport.getStockAdjustment)
inventoryRouter.post('/getStockAdjustments',inventoryReport.createStockJournalAdjustment)
inventoryRouter.put('/getStockAdjustments',inventoryReport.updateStockJournalAdjustment)




inventoryRouter.post('/stockGroup',rateValues.stockGroup);
inventoryRouter.post('/stockItemGroup',rateValues.stockItemGroup);
inventoryRouter.post('/stockItemGroupList',rateValues.stockItemGroupList)
inventoryRouter.put('/updateProcessingRates', rateValues.updateProcessingRates);
inventoryRouter.put('/updateOverAllGroupUpdate',rateValues.updateOverAllGroupUpdate);

inventoryRouter.get('/stockGroupGet',rateValues.stockGroupGet)
inventoryRouter.post('/arrivalList',rateValues.arrivalList)

inventoryRouter.put('/updateArrivalList',rateValues.updateArrivalList)
inventoryRouter.post('/stockValueSync',rateValues.getStockValueReport)
inventoryRouter.post('/stockValueErp',rateValues.getStockValueDetails)


inventoryRouter.post('/getStockValueSummaryAlt',rateValues.getStockValueSummaryAlt )
inventoryRouter.post('/uploadLedgerOpening',inventoryReport.createLedgerOpeningBalance)
inventoryRouter.post('/uploadStockOpening',inventoryReport.createStockOpeningBalance)

inventoryRouter.get('/getStockOpeningDetails',inventoryReport.stockOpeningDetails)
inventoryRouter.get('/getLastObDate',inventoryReport.getLastObDate)
inventoryRouter.get('/getStockAdjustment',inventoryReport.getStockAdjustmentPending)
inventoryRouter.delete('/getStockAdjustment',inventoryReport.deleteStockAdjustment)

inventoryRouter.post('/stockValueErpSync',rateValues.getStockValueErpReport)

export default inventoryRouter;