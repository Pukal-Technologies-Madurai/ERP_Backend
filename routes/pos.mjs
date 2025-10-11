import express from 'express';
import pos from '../controller/Pos/details.mjs';

const PosRouter = express.Router();

PosRouter.get('/posbrand', pos.getPosBrand);


PosRouter.get('/unitMaster', pos.getUnit);


PosRouter.get('/productMaster', pos.getProduct);

PosRouter.get('/retailerMaster', pos.getRetailers);

PosRouter.get('/rateMaster', pos.rateMaster);

PosRouter.get('/transporters',pos.transporters);

PosRouter.get('/brokers',pos.brokers)

export default PosRouter;

