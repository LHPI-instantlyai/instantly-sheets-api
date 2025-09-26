const router = require("express").Router();
const instantlyAiController = require("../controllers/instantlyAiController");


router.get('/campaign/get-all-campaigns', instantlyAiController.getAllCampaigns)
router.post('/campaign/get-all-campaigns-replies', instantlyAiController.getInterestedRepliesOnly_)


router.get('/insta-sheet/test', instantlyAiController.testRun)
router.post('/email-extractor', instantlyAiController.extractReply)








module.exports = router;