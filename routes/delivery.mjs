import express from 'express';
import deliverOrder from '../controller/Delivery/deliveryOrder.mjs'
import deliveryOrder from '../controller/Delivery/deliveryOrder.mjs';

const DeliveryRouter = express.Router();

DeliveryRouter.get('/deliveryOrder', deliverOrder.getSaleOrder);
DeliveryRouter.post('/deliveryOrder', deliverOrder.salesDeliveryCreation);
DeliveryRouter.put('/deliveryOrder', deliverOrder.editDeliveryOrder);
DeliveryRouter.get('/deliveryOrderList', deliverOrder.getDeliveryorder);
DeliveryRouter.delete('/deliveryOrder', deliverOrder.deleteDeliveryOrder);
DeliveryRouter.put('/deliveryOrderMobile', deliverOrder.editmobileApi);

DeliveryRouter.post('/deliveryOrderTrip',deliverOrder.deliveryOrderTrip);
DeliveryRouter.get('/deliveryTripSheet',deliverOrder.deliveryTripsheetList)
DeliveryRouter.put('/deliveryOrderTrip',deliverOrder.updateDeliveryOrderTrip)


DeliveryRouter.post('/multipleDelivery',deliverOrder.salesMultipleDelivery)
DeliveryRouter.get('/deliveryDetails',deliverOrder.getDeliveryDetails)
DeliveryRouter.get('/deliveryDetailsList',deliverOrder.getDeliveryDetailsListing)

DeliveryRouter.delete('/tripDetails',deliveryOrder.tripDetails)

// DeliveryRouter.get('/deliveryOrder', deliverOrder.getSaleOrder);

export default DeliveryRouter;