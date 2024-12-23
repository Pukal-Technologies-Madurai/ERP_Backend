import express from 'express';
import tallyStockBased from '../controller/Inventory/tallyStockBased.mjs';
import dbconnect from '../middleware/otherDB.mjs';

const inventoryRouter = express.Router();


inventoryRouter.get('/getTallyStockJournal', dbconnect, tallyStockBased.getTallyStockData);

export default inventoryRouter;