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

PosRouter.get('/retailerMasterOpt',pos.getRetailersOpt)

PosRouter.get('/brokersOpt',pos.getBrokersOpt)
PosRouter.get('/transportersOpt',pos.getTransporterOpt)
export default PosRouter;

