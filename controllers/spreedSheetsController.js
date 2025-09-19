const { initGoogleClients } = require("../services/googleClient.js");
const { responseReturn } = require("../utils/response.js");

class cardController {
  getAllSheets = async (req, res) => {
    try {
      const { sheets } = await initGoogleClients();

      const spreadsheetId = req.params.spreadsheetId;
      const response = await sheets.spreadsheets.get({
        spreadsheetId,
      });

      // Extract sheet names
      const sheetNames = response.data.sheets.map(
        (sheet) => sheet.properties.title
      );

      responseReturn(res, 200, { spreadsheetId, sheets: sheetNames });
    } catch (err) {
      console.error("Error fetching sheets:", err);
      responseReturn(res, 500, { error: "Failed to fetch sheets" });
    }
  };

  AddNewSheetAndColumns = async (req, res) => {
    try {
      const { spreadsheetId } = req.params;
      const { sheetName, columns } = req.body;

      const { sheets } = await initGoogleClients();

      if (!sheetName || !columns) {
        return res
          .status(400)
          .json({ error: "sheetName and columns are required" });
      }

      // Step 1: Add a new sheet (tab)
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: sheetName,
                },
              },
            },
          ],
        },
      });

      // Step 2: Add column headers to the new sheet
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [columns], // first row = column headers
        },
      });

      res.json({
        message: "New sheet created and columns added successfully",
        sheetName,
        columns,
      });
    } catch (err) {
      console.error("Error adding sheet:", err);
      res
        .status(500)
        .json({ error: "Failed to add sheet", details: err.message });
    }
  };
}

module.exports = new cardController();
