import express from 'express';
import tallyStockBased from '../controller/Inventory/tallyStockBased.mjs';


const inventoryRouter = express.Router();


inventoryRouter.get('/getTallyStockJournal', tallyStockBased.getTallyStockData);

export default inventoryRouter;