import express from 'express';
import tallyStockBased from '../controller/Inventory/tallyStockBased.mjs';
import stockJournals from '../controller/Inventory/stockJournals.mjs';
import stockProcessing from '../controller/Inventory/stockProcessing.mjs';
import dbconnect from '../middleware/otherDB.mjs';
import tripmaster from '../controller/Inventory/tripmaster.mjs';
import arrivalMaster from '../controller/Inventory/arrivalMaster.mjs';
import batchProcess from '../controller/Inventory/batchProcess.mjs';
import inventoryReport from '../controller/Inventory/reports.mjs';

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
inventoryRouter.put('/tripSheet', tripmaster.updateTripDetails);

inventoryRouter.get('/tripSheet/arrivalEntry', arrivalMaster.getArrivalEntry);
inventoryRouter.get('/tripSheet/arrivalEntry/filters', arrivalMaster.getArrivalFilters);
inventoryRouter.post('/tripSheet/arrivalEntry/bulk', arrivalMaster.addBulkArrivalEntry);
inventoryRouter.post('/tripSheet/arrivalEntry', arrivalMaster.addArrivalEntry);
inventoryRouter.put('/tripSheet/arrivalEntry', arrivalMaster.editArrivalEntry);
// inventoryRouter.put('/tripSheet/arrivalList', tripmaster.addArrivalDetails);
// inventoryRouter.delete('/tripSheet/arrivalList', tripmaster.addArrivalDetails);

inventoryRouter.post('/stockProcessing/getWithFilters', stockProcessing.getProcessingDetails);
inventoryRouter.get('/stockProcessing/itemsUsed', stockProcessing.getItemsUsedInProcessing);
inventoryRouter.post('/stockProcessing', stockProcessing.createStockProcessing);
inventoryRouter.put('/stockProcessing', stockProcessing.updateStockProcessing);
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

inventoryRouter.get('/batchMaster/stockBalance', batchProcess.getBatchStockBalance);

inventoryRouter.get('/trunoverRatio', inventoryReport.getInventoryReport);


export default inventoryRouter;