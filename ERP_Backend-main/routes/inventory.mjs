import express from 'express';
import tallyStockBased from '../controller/Inventory/tallyStockBased.mjs';
import stockJournals from '../controller/Inventory/stockJournals.mjs';
import dbconnect from '../middleware/otherDB.mjs';
import tripmaster from '../controller/Inventory/tripmaster.mjs';

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

inventoryRouter.get('/tripSheet', tripmaster.getTripDetails);
inventoryRouter.post('/tripSheet', tripmaster.createTripDetails);
inventoryRouter.put('/tripSheet', tripmaster.updateTripDetails);

export default inventoryRouter;