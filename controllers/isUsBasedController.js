const { spawn } = require("child_process");
const { responseReturn } = require("../utils/response");


class isUsBased {
  checkIfUSBased = async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return responseReturn(res, 400, { error: "URL is required" });
      }

      const { spawn } = require("child_process");

      const result = await new Promise((resolve, reject) => {
        const py = spawn("python", ["isUsBased.py", url]);

        let output = "";
        py.stdout.on("data", (data) => {
          output += data.toString();
        });

        py.stderr.on("data", (data) => {
          console.error(`Python error: ${data}`);
        });

        py.on("close", (code) => {
          if (code !== 0) {
            return reject(new Error(`Python exited with code ${code}`));
          }
          resolve(output.trim());
        });
      });

      responseReturn(res, 200, { url, isUS: result });
    } catch (err) {
      console.error("Error checking US location:", err);
      responseReturn(res, 500, { error: "Failed to check US location" });
    }
  };
}

module.exports = new isUsBased();
