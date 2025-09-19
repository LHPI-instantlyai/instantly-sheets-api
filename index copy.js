const express = require("express");
const app = express();
const cors = require("cors");
const http = require('http')
const bodyParser = require("body-parser");
const { google } = require("googleapis");
const fs = require("fs").promises;
const { GoogleAuth } = require("google-auth-library");






const port = 3000


app.use(bodyParser.json())
// Load credentials
const credentials = await fs.readFile('credentials.json', 'utf-8')
const credentials_parsed = JSON.parse(credentials)

// Authenticate
const auth = new GoogleAuth({
  credentials: credentials_parsed,
  scopes: ['https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets']
})

const AuthClient = await auth.getClient()

const sheets = google.sheets({
  version: 'v4',
  auth: AuthClient
})

const drive = google.drive({
  version: 'v3',
  auth: AuthClient
})

// Default route
app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.get('/create-new-sheet', async (req, res) => {
  try {
    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: "Test-sheet-instantlyAi " + new Date().toISOString()
        },
        sheets: [
          {
            properties: {
              title: "Sheet1"
            }
          }
        ]
      }
    })

    const spreadsheetId = response.data.spreadsheetId
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`

    res.send(`✅ New Google Sheet created: <a href="${spreadsheetUrl}" target="_blank">${spreadsheetUrl}</a>`)
  } catch (error) {
    console.error("Error creating new sheet:", error.response?.data || error.message)
    res.status(500).send("Failed to create sheet: " + (error.response?.data?.error?.message || error.message))
  }
})

app.get('/create-drive-file', async (req, res) => {
  try {
    const response = await drive.files.create({
      requestBody: {
        name: "My Test File " + new Date().toISOString(),
        mimeType: "application/vnd.google-apps.document" // creates a Google Doc
      },
      fields: "id, name"
    })

    const fileId = response.data.id
    const fileUrl = `https://docs.google.com/document/d/${fileId}`

    res.send(`✅ Created file: <a href="${fileUrl}" target="_blank">${fileUrl}</a>`)
  } catch (error) {
    console.error("Error creating Drive file:", error.response?.data || error.message)
    res.status(500).send("❌ Failed to create Drive file: " + (error.response?.data?.error?.message || error.message))
  }
})


// Route to create a new Google Sheet
app.get('/create-sheet', async (req, res) => {
  try {
    // Create a new Google Sheet
    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: "Test Sheet " + new Date().toISOString()
        },
        sheets: [
          {
            properties: {
              title: "Sheet1"
            }
          }
        ]
      }
    })

    const spreadsheetId = response.data.spreadsheetId
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`

    res.send(`✅ New Sheet created: <a href="${spreadsheetUrl}" target="_blank">${spreadsheetUrl}</a>`)
  } catch (error) {
    console.error("Error creating sheet:", error)
    res.status(500).send("❌ Failed to create sheet: " + error.message)
  }
})

app.get('/test-create-file', async (req, res) => {
  try {
    const response = await drive.files.create({
      requestBody: {
        name: "Test File " + new Date().toISOString(),
        mimeType: "application/vnd.google-apps.spreadsheet"
      }
    })

    res.send(`✅ Created file with ID: ${response.data.id}`)
  } catch (error) {
    console.error("Error creating file:", error.message)
    res.status(500).send("❌ Cannot create file: " + error.message)
  }
})


app.get('/test-read-sheet/:spreadsheetId', async (req, res) => {
  try {
    const { spreadsheetId } = req.params

    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false // only metadata, no heavy data
    })

    res.send(`Can read sheet: ${response.data.properties.title}`)
  } catch (error) {
    console.error("Error reading sheet:", error.response?.data || error.message)
    res.status(500).send("Cannot read sheet: " + (error.response?.data?.error?.message || error.message))
  }
})


app.get('/test-add-sheet/:spreadsheetId', async (req, res) => {
  try {
    const { spreadsheetId } = req.params

    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: "Test_Sheet_" + Date.now() // unique name
              }
            }
          }
        ]
      }
    })

    const newSheet = response.data.replies[0].addSheet.properties
    res.send(`✅ Successfully added new sheet: "${newSheet.title}" (ID: ${newSheet.sheetId}) to spreadsheet: ${spreadsheetId}`)
  } catch (error) {
    console.error("Error adding sheet:", error.response?.data || error.message)
    res.status(500).send("❌ Failed to add sheet: " + (error.response?.data?.error?.message || error.message))
  }
})

app.get('/write-to-sheet/:spreadsheetId', async (req, res) => {
  try {
    const { spreadsheetId } = req.params

    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Sheet2!A1",  // 👈 target by sheet name
      valueInputOption: "RAW",
      requestBody: {
        values: [["Hello from Service Account!"]]
      }
    })

    res.json(response.data)
  } catch (error) {
    console.error("Error writing to sheet:", error.response?.data || error.message)
    res.status(500).send("❌ Failed to write: " + (error.response?.data?.error?.message || error.message))
  }
})

app.post('/add-data/:spreadsheetId', async (req, res) => {
  try {
    const { spreadsheetId } = req.params
    const { sheetName, columns, rows } = req.body

    if (!sheetName || !columns || !rows) {
      return res.status(400).send("❌ Please provide sheetName, columns, and rows in the request body")
    }

    // 1️⃣ Add column headers (if needed)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`, // start at first row
      valueInputOption: "RAW",
      requestBody: {
        values: [columns] // one row of headers
      }
    })

    // 2️⃣ Append rows below headers
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A2`, // start appending from row 2
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: rows
      }
    })

    res.json({
      message: "✅ Data inserted successfully",
      updates: response.data.updates
    })
  } catch (error) {
    console.error("Error adding data:", error.response?.data || error.message)
    res.status(500).send("❌ Failed to add data: " + (error.response?.data?.error?.message || error.message))
  }
})


app.get("/sheets/:spreadsheetId", async (req, res) => {
  try {
    const spreadsheetId = req.params.spreadsheetId

    const response = await sheets.spreadsheets.get({
      spreadsheetId
    })

    // Extract sheet names
    const sheetNames = response.data.sheets.map(
      (sheet) => sheet.properties.title
    )

    res.json({
      spreadsheetId,
      sheets: sheetNames
    })
  } catch (err) {
    console.error("Error fetching sheets:", err)
    res.status(500).json({ error: "Failed to fetch sheets", details: err.message })
  }
})

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000")
})

app.get('/whoami', async (req, res) => {
  const tokenInfo = await auth.getAccessToken()
  res.json(tokenInfo)
})




app.use('/api/', );


app.listen(port, () => {
  console.log(`Example app listening on http://localhost:${port}`)
})
