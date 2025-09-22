const express = require("express");
const app = express();
const cors = require("cors");
const http = require('http')
const bodyParser = require("body-parser");
require('dotenv').config({ silent: true });

const { spawn } = require("child_process");

const port = process.env.PORT | 3000;
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


function checkIfUS(url) {
  return new Promise((resolve, reject) => {
    const py = spawn("python", ["isUsBased.py", url]);

    let result = "";
    py.stdout.on("data", (data) => {
      result += data.toString();
    });

    py.stderr.on("data", (data) => {
      console.error(`Python error: ${data}`);
    });

    py.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Python exited with code ${code}`));
      }
      resolve(result.trim());
    });
  });
}

// (async () => {
//   try {
//     const res = await checkIfUS("https://www.kroger.com");
//     console.log("Result from Python:", res); // "US" or "NOT_US"
//   } catch (err) {
//     console.error("Error:", err);
//   }
// })();




// Routes
app.use('/api', require('./routes/spreedSheetRoutes'));
app.use('/api', require('./routes/isUsBasedRoutes'));




server.listen(port, () => {
  // Log the configuration
  console.log(`Server is running on http://localhost:${port}`);
});
