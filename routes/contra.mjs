import express from 'express';
import contra from '../controller/Contra/contraMaster.mjs';
import dependency from '../controller/Contra/dependency.mjs';

const contraRouter = express.Router();

contraRouter.get('/master', contra.getContra);
contraRouter.post('/master', contra.createContra);
contraRouter.put('/master', contra.editContra);

contraRouter.get('/filtersValues', dependency.getFilterValues);


export default contraRouter;