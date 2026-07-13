const express = require('express');
const controller = require('../controllers/tiktokShopController');

const adminRouter = express.Router();
adminRouter.get('/oauth/start', controller.startShopOauth);
adminRouter.get('/connections', controller.listShopConnections);
adminRouter.get('/shops', controller.listShops);
adminRouter.get('/shops/:shopId/analytics', controller.getShopAnalytics);
adminRouter.post('/shops/:shopId/analytics/sync', controller.syncShopAnalytics);
adminRouter.delete('/connections/:authorizationId', controller.disconnectShopAuthorization);

module.exports = { adminRouter };
