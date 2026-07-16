const express = require('express');
const controller = require('../controllers/tiktokShopController');

const adminRouter = express.Router();
adminRouter.get('/oauth/start', controller.startShopOauth);
adminRouter.get('/connections', controller.listShopConnections);
adminRouter.get('/shops', controller.listShops);
adminRouter.get('/shops/:shopId/analytics', controller.getShopAnalytics);
adminRouter.post('/shops/:shopId/analytics/sync', controller.syncShopAnalytics);
adminRouter.get('/shops/:shopId/affiliate/open-collaborations', controller.listOpenCollaborations);
adminRouter.get('/shops/:shopId/affiliate/target-collaborations', controller.listTargetCollaborations);
adminRouter.get('/shops/:shopId/affiliate/orders', controller.listAffiliateOrders);
adminRouter.get('/shops/:shopId/affiliate/creators', controller.listAffiliateCreators);
adminRouter.get('/shops/:shopId/affiliate/creator-content-details', controller.listCreatorContentDetails);
adminRouter.get('/shops/:shopId/creator-performance', controller.listCreatorPerformance);
adminRouter.post('/shops/:shopId/creator-performance/sync', controller.syncCreatorPerformance);
adminRouter.get('/shops/:shopId/affiliate/open-collaboration-settings', controller.showOpenCollaborationSettings);
adminRouter.delete('/connections/:authorizationId', controller.disconnectShopAuthorization);

module.exports = { adminRouter };
