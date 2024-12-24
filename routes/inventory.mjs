import express from 'express';
import tallyStockBased from '../controller/Inventory/tallyStockBased.mjs';
import dbconnect from '../middleware/otherDB.mjs';

const inventoryRouter = express.Router();


inventoryRouter.get('/getTallyStockJournal', dbconnect, tallyStockBased.getTallyStockJournalData);
inventoryRouter.get(
    '/getTallyStockJournal/sourceAndDestination', 
    dbconnect, 
    tallyStockBased.getTallyStockJournalDataExtended
);

export default inventoryRouter;