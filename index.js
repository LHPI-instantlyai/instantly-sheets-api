import express from "express"
import { google } from "googleapis"
import fs from "fs/promises"
import { GoogleAuth } from "google-auth-library"

const app = express()
const port = 3000

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


app.get('/whoami', async (req, res) => {
  const tokenInfo = await auth.getAccessToken()
  res.json(tokenInfo)
})

app.listen(port, () => {
  console.log(`Example app listening on http://localhost:${port}`)
})
