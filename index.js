const express = require("express");
const app = express();
const cors = require("cors");
const http = require('http')
const bodyParser = require("body-parser");
require('dotenv').config({ silent: true });

const port = process.env.PORT;
const server = http.createServer(app)

app.use(
  cors({
    origin: process.env.MODE === 'pro' ? [process.env.CLIENT,process.env.CLIENT1] : ['http://localhost:5173','http://localhost:5174'],
    credentials: true,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    allowedHeaders: "Content-Type,Authorization",
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);


app.use(bodyParser.json());


// Routes
app.use('/api', require('./routes/spreedSheetRoutes'));




server.listen(port, () => {
  // Log the configuration
  console.log(`Server is running on http://localhost:${port}`);
});
