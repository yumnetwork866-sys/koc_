const express = require('express');
const controller = require('../controllers/whatsappController');

const adminRouter = express.Router();
const publicRouter = express.Router();

adminRouter.get('/overview', controller.overview);
adminRouter.get('/conversations', controller.listConversations);
adminRouter.get('/messages', controller.listMessages);
adminRouter.post('/send', controller.sendMessage);
adminRouter.get('/orders', controller.listOrders);
adminRouter.patch('/orders/:id', controller.updateOrder);

publicRouter.get('/webhook/whatsapp', controller.verifyWebhook);
publicRouter.post('/webhook/whatsapp', controller.receiveWebhook);

module.exports = { adminRouter, publicRouter };
