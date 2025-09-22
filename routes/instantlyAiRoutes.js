const router = require("express").Router();
const instantlyAiController = require("../controllers/instantlyAiController");


router.get('/campaign/get-all-campaigns', instantlyAiController.getAllCampaigns)
router.post('/campaign/get-all-campaigns-replies', instantlyAiController.getRepliedInterestedLeads)








module.exports = router;