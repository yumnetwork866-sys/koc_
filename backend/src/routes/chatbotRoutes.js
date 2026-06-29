const express = require('express');
const controller = require('../controllers/chatbotController');

const adminRouter = express.Router();
const publicRouter = express.Router();

adminRouter.get('/facebook/start', controller.startFacebookOAuth);
adminRouter.post('/facebook/logout', controller.facebookLogout);
adminRouter.get('/facebook/me', controller.getFacebookMe);
adminRouter.get('/facebook/me/pages', controller.getManagedPages);
adminRouter.post('/pages/:id/connect', controller.connectPage);
adminRouter.delete('/pages/:id', controller.disconnectPage);
adminRouter.get('/pages', controller.listPages);
adminRouter.get('/stats', controller.stats);
adminRouter.get('/conversations', controller.listConversations);
adminRouter.get('/messages', controller.listMessages);
adminRouter.post('/send', controller.sendManualMessage);
adminRouter.get('/orders', controller.listOrders);
adminRouter.patch('/orders/:id', controller.updateOrder);
adminRouter.get('/kb', controller.listKnowledgeDocs);
adminRouter.post('/kb', controller.createKnowledgeDoc);
adminRouter.delete('/kb/:id', controller.deleteKnowledgeDoc);
adminRouter.get('/settings', controller.getSettings);
adminRouter.get('/ollama/models', controller.listOllamaModels);
adminRouter.put('/settings', controller.updateSettings);

publicRouter.get('/api/chatbot/facebook/callback', controller.facebookCallback);
publicRouter.get('/webhook', controller.verifyWebhook);
publicRouter.post('/webhook', controller.receiveWebhook);

module.exports = { adminRouter, publicRouter };
