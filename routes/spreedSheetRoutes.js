const router = require("express").Router();
const spreedSheetsController = require("../controllers/spreedSheetsController");



router.get('/sheets/:spreadsheetId', spreedSheetsController.getAllSheets)
router.post('/sheets/:spreadsheetId/addSheet', spreedSheetsController.AddNewSheetAndColumns)

module.exports = router;