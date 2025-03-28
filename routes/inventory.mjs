import express from 'express';
import tallyStockBased from '../controller/Inventory/tallyStockBased.mjs';
import stockJournals from '../controller/Inventory/stockJournals.mjs';
import stockProcessing from '../controller/Inventory/stockProcessing.mjs';
import dbconnect from '../middleware/otherDB.mjs';
import tripmaster from '../controller/Inventory/tripmaster.mjs';
import arrivalMaster from '../controller/Inventory/arrivalMaster.mjs';

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
inventoryRouter.get('/tripSheet/arrivalList', tripmaster.getArrivalReport);

inventoryRouter.get('/tripSheet/arrivalEntry', arrivalMaster.getArrivalEntry);
inventoryRouter.post('/tripSheet/arrivalEntry', arrivalMaster.addArrivalEntry);
inventoryRouter.put('/tripSheet/arrivalEntry', arrivalMaster.editArrivalEntry);
// inventoryRouter.put('/tripSheet/arrivalList', tripmaster.addArrivalDetails);
// inventoryRouter.delete('/tripSheet/arrivalList', tripmaster.addArrivalDetails);

inventoryRouter.get('/stockProcessing', stockProcessing.getProcessingDetails);
inventoryRouter.post('/stockProcessing', stockProcessing.createStockProcessing);
inventoryRouter.put('/stockProcessing', stockProcessing.updateStockProcessing);
inventoryRouter.delete('/stockProcessing', stockProcessing.deleteStockProcessing);

export default inventoryRouter;