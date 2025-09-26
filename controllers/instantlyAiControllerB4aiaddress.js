const { responseReturn } = require("../utils/response");
require("dotenv").config({ silent: true });
const axios = require("axios");
const { URL } = require("url");
const { spawn } = require("child_process");
const { initGoogleClients } = require("../services/googleClient.js");

const BASE_URL = "https://api.instantly.ai/api/v2/campaigns";
const BASE_URL_LEADS = "https://api.instantly.ai/api/v2/";

const PAGE_SIZE = 10;

const API_BASE = "https://api.instantly.ai";
const LEADS_LIST_PATH = "/api/v2/leads/list";
const EMAILS_PATH = "/api/v2/emails";
const CAMPAIGN_GET_PATH = "/api/v2/campaigns";
const testFile = require("../Data/sampleData-100-1.json");

const { patterns } = require("../Filters/addressRegexConfig.json");
const { colorize } = require("../utils/colorLogger");

const regexes = {};
for (const [key, { pattern, flags }] of Object.entries(patterns)) {
  regexes[key] = new RegExp(pattern, flags);
}

class instantlyAiController {
  normalizeRow(emailRow) {
    return {
      // "Column 1": "InstSheet-agent1",
      "For scheduling": emailRow["For scheduling"] || "",
      "sales person": emailRow["sales person"] || "",
      "sales person email": emailRow["sales person email"] || "",
      company: emailRow["company"] || "N/A",
      "company phone#":
        emailRow["company phone#"] ||
        emailRow["phone 1"] ||
        emailRow["phone2"] ||
        "",
      "phone#from email": emailRow["phone#from email"] || "",
      "lead first name": emailRow["lead first name"] || "",
      "lead last name": emailRow["lead last name"] || "",
      "lead email": emailRow["lead email"] || "",
      "Column 1": emailRow["Column 1"] || emailRow["lead email"] || "",
      "email reply": emailRow["email reply"] || "",
      "phone 1": emailRow["phone 1"] || "",
      phone2: emailRow.phone2 || "",
      address: emailRow.address || "",
      city: emailRow.city || "",
      state: emailRow.state || "",
      zip: emailRow.zip || "",
      details: emailRow.details || "",
      "Email Signature": emailRow["Email Signature"] || "",
      "linkedin link": "none",
      "2nd contact person linked": "none",
      "status after the call": "",
      "number of calls spoken with the leads ": "",
      "@dropdown": "",
      "number of calls spoken with the leads ": "",
    };
  }
  // New: process a single email row, must return a Promise<boolean>
  async processEmailRow({ emailRow, sheetName }) {
    console.log(colorize("Processing lead Email ...", "blue"));
    const spreadsheetId = process.env.SPREADSHEET_ID;

    try {
      const rowJson = this.normalizeRow(emailRow);

      // --- Step 1: Address present? ---
      if (rowJson.address || rowJson.city || rowJson.state || rowJson.zip) {
        const usAddress = await this.isAddressUsBased({
          city: rowJson.city,
          state: rowJson.state,
          address: rowJson.address,
          zip: rowJson.zip,
        });
        if (!usAddress) return true; // Skip but still return true

        const interested = await this.isActuallyInterested(
          rowJson["email reply"]
        );
        if (interested) {
          await this.encodeToSheet(spreadsheetId, sheetName, rowJson);
        }
        return true; // Continue flow regardless
      }
      // --- Step 2: Website present? ---
      if (rowJson.details) {
        const usWebsite = await this.isWebsiteUsBased(rowJson.details);
        if (!usWebsite) return true; // Skip but still return true

        const interested = await this.isActuallyInterested(
          rowJson["email reply"]
        );
        if (interested) {
          await this.encodeToSheet(spreadsheetId, sheetName, rowJson);
        }
        return true; // Continue flow regardless
      }

      return true;
    } catch (err) {
      console.error("processEmailRow failed:", err.message);
      return true; // Ensure main flow continues even on error
    }
  }

  async isAddressUsBased({
    address = "",
    city = "",
    state = "",
    zip = "",
    country = "",
  } = {}) {
    const fields = { address, city, state, zip, country };
    console.log(colorize("Analyzing Address if US based ...", "blue"));
    console.log(fields);

    // Make a unified array of all field values
    const allValues = Object.values(fields).filter(Boolean);

    // 1. explicit country mentions
    if (allValues.some((val) => regexes.countryUsa.test(val))) {
      console.log(colorize("Country is US based", "green"));
      return true;
    }

    // 2. state abbreviations or full names in any field
    if (
      allValues.some(
        (val) =>
          regexes.stateAbbreviations.test(val) ||
          regexes.fullStateNames.test(val)
      )
    ) {
      console.log(colorize("State is US based", "green"));
      return true;
    }

    // 3. ZIP code in any field
    if (allValues.some((val) => regexes.zip.test(val))) {
      console.log(colorize("ZIP is US based", "green"));
      return true;
    }

    // 4. well-known US city names in any field
    if (allValues.some((val) => regexes.usCities.test(val))) {
      console.log(colorize("City is US based", "green"));
      return true;
    }

    // 5. city+state combos (like "Boston, MA") in any field
    if (allValues.some((val) => regexes.cityStateCombo.test(val))) {
      console.log(colorize("City-State combo is US based", "green"));
      return true;
    }

    // 6. fallback: combine address + city + state
    const combined = `${address} ${city} ${state}`;
    if (
      regexes.stateAbbreviations.test(combined) ||
      regexes.fullStateNames.test(combined) ||
      regexes.zip.test(combined)
    ) {
      console.log(colorize("Combined address is US based", "green"));
      return true;
    }

    console.log(colorize("Address not US based", "red"));
    return false;
  }

  async isWebsiteUsBased(url) {
    if (!url) {
      throw new Error("URL is required");
    }
    console.log(colorize("checking if website is US based ...", "blue"));
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

    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch (err) {
      console.error("Failed to parse JSON from Python:", err);
      throw new Error("Invalid JSON from Python script");
    }

    // ✅ Return only true or false
    return parsed.isUs === 1;
  }
  // FROM OPEN ROUTER
  async isActuallyInterested(emailReply) {
    if (!emailReply || typeof emailReply !== "string") {
      return false;
    }

    // 1. Normalize text
    const text = emailReply.trim().toLowerCase();

    // 2. Quick rule-based filters
    const autoReplyPatterns = [
      /out of office/,
      /auto-reply/,
      /thank you for your email/i,
      /i am currently/i,
    ];
    const promoPatterns = [
      /\bwe (offer|provide)\b/,
      /\bcheck out our\b/,
      /visit our website/,
      /our services include/,
    ];
    const interestPatterns = [
      /\bmore details\b/,
      /\bhow does\b/,
      /\blet['’]?s schedule\b/,
      /\bwhen can you\b/,
      /\bpricing\b/,
      /\bi would like\b/,
      /\bwe need\b/,
      /\bagree to\b/,
    ];

    if (
      autoReplyPatterns.some((rx) => rx.test(text)) ||
      promoPatterns.some((rx) => rx.test(text)) ||
      /no thanks|\bnot interested\b/.test(text)
    ) {
      return false;
    }

    if (interestPatterns.some((rx) => rx.test(text))) {
      return true;
    }

    // 3. LLM fallback with strict prompt
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const resp = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: "x-ai/grok-4-fast:free",
            messages: [
              {
                role: "system",
                content: [
                  "Classify whether the following email reply from a prospect shows genuine interest",
                  "—asking for pricing, next steps, scheduling, or more info.",
                  "Ignore promotional pitches and auto-replies.",
                  'Answer strictly "true" or "false".',
                ].join(" "),
              },
              { role: "user", content: text },
            ],
            temperature: 0,
          }),
        }
      );
      clearTimeout(timeout);

      const json = await resp.json();
      const modelOut = json.choices?.[0]?.message?.content
        ?.trim()
        .toLowerCase();

      if (modelOut === "true") {
        console.log(colorize("LLM classification True", "green"));
      } else {
        console.log(colorize("LLM classification False", "red"));
      }
      // console.log("LLM classification:", modelOut);
      return modelOut === "true";
    } catch (err) {
      console.error("Classification error:", err);
      return false;
    }
  }

  async encodeToSheet(spreadsheetId, sheetName, rowJson) {
    const { sheets } = await initGoogleClients();

    // Step 1: Get sheet list
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const existingSheetNames = spreadsheet.data.sheets.map(
      (s) => s.properties.title
    );

    // Step 2: If sheet doesn’t exist, create it and add headers
    if (!existingSheetNames.includes(sheetName)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        },
      });

      // Insert headers (keys of rowJson)
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: "RAW",
        requestBody: {
          values: [Object.keys(rowJson)],
        },
      });
    }

    // Step 3: Fetch existing rows
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
    });

    const existingValues = existing.data.values || [];
    const headers = existingValues[0] || [];

    // Find the index of "lead email" and "email reply"
    const leadEmailIndex = headers.indexOf("lead email");
    const emailReplyIndex = headers.indexOf("email reply");

    if (leadEmailIndex === -1 || emailReplyIndex === -1) {
      throw new Error(
        `"lead email" or "email reply" column not found in sheet: ${sheetName}`
      );
    }

    // Collect existing lead emails and replies
    const existingLeadEmails = new Set(
      existingValues
        .slice(1)
        .map((row) => row[leadEmailIndex]?.toLowerCase().trim())
        .filter(Boolean)
    );
    const existingEmailReplies = new Set(
      existingValues
        .slice(1)
        .map((row) => row[emailReplyIndex]?.toLowerCase().trim())
        .filter(Boolean)
    );

    const newLeadEmail = (rowJson["lead email"] || "").toLowerCase().trim();
    const newEmailReply = (rowJson["email reply"] || "").toLowerCase().trim();
    // Step 4: Skip if either lead email OR email reply already exists
    if (existingLeadEmails.has(newLeadEmail)) {
      console.log(
        `Lead email "${newLeadEmail}" already exists in ${sheetName}, skipping append.`
      );
      return false;
    }

    if (existingEmailReplies.has(newEmailReply)) {
      console.log(
        `Email reply already exists in ${sheetName}, skipping append.`
      );
      return false;
    }

    // Step 5: Append new row values (aligned with headers order)
    const values = [headers.map((h) => rowJson[h] ?? "")];
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: sheetName,
      valueInputOption: "RAW",
      requestBody: { values },
    });
    console.log(colorize(`Row appended to ${sheetName}`, "green"));
    return true;
  }

  getAllCampaigns = async (req, res) => {
    try {
      const headers = {
        Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`,
        "Content-Type": "application/json",
      };

      let campaigns = [];
      let cursor = null;

      do {
        // Build query string
        const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (cursor) params.set("starting_after", cursor);

        const resp = await fetch(`${BASE_URL}?${params}`, { headers });

        if (!resp.ok) {
          const errText = await resp.text();
          return responseReturn(res, resp.status, {
            error: `Failed to fetch campaigns: ${resp.status} ${errText}`,
          });
        }

        const { items = [], next_starting_after } = await resp.json();
        campaigns = campaigns.concat(items);
        cursor = next_starting_after || null;
      } while (cursor);

      responseReturn(res, 200, {
        total: campaigns.length,
        campaigns,
      });
    } catch (err) {
      console.error("Error fetching all campaigns:", err.message);
      responseReturn(res, 500, { error: "Failed to fetch all campaigns" });
    }
  };

  getCampaigns = async (req, res) => {
    try {
      const { limit = 10, starting_after, search, tag_ids } = req.query;

      const query = new URLSearchParams({
        limit: String(limit),
        ...(starting_after && { starting_after }),
        ...(search && { search }),
        ...(tag_ids && { tag_ids }),
      }).toString();

      const resp = await fetch(
        `https://api.instantly.ai/api/v2/campaigns?${query}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`,
          },
        }
      );

      if (!resp.ok) {
        return responseReturn(res, resp.status, {
          error: `API request failed: ${resp.status} ${resp.statusText}`,
        });
      }

      const data = await resp.json();

      responseReturn(res, 200, { campaigns: data });
    } catch (err) {
      console.error("Error fetching campaigns:", err.message);
      responseReturn(res, 500, { error: "Failed to fetch campaigns" });
    }
  };

  testRun = async (req, res) => {
    const rows = testFile.rows;
    const { sheetName } = req.body;

    const results = [];

    for (const row of rows) {
      try {
        // const done = await this.processEmailRow(row);
        const done = await this.processEmailRow({ emailRow: row, sheetName });

        if (!done) {
          console.warn("Skipped row:", row._lead_id);
          results.push({ leadId: row._lead_id, status: "skipped" });
          continue;
        }

        console.log("Processed row:", row._lead_id);
        results.push({ leadId: row._lead_id, status: "processed" });
      } catch (err) {
        console.error("Error processing row:", row._lead_id, err);
        results.push({
          leadId: row._lead_id,
          status: "error",
          error: err.message,
        });
      }
    }

    console.log("All rows processed sequentially.");

    // Send only once after loop finishes
    responseReturn(res, 200, {
      message: "Test run completed",
      total: rows.length,
      summary: results,
    });
  };

  extractReply = async (emailContent) => {
    try {
      const resp = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_SEC_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "x-ai/grok-4-fast:free",
            messages: [
              {
                role: "system",
                content: [
                  "You are an assistant that extracts structured data from email threads.",
                  "Given a raw email thread, separate it into four fields:",
                  "- reply: only the prospect’s direct response (remove signatures like 'Sent from my iPhone').",
                  "- original: the original quoted email content.",
                  "- salesPerson: the full name of the salesperson who sent the original email.",
                  "- salesPersonEmail: the email address of that salesperson.",
                  "Always output valid JSON with keys: reply, original, salesPerson, salesPersonEmail.",
                  "If any field is missing, return it as an empty string.",
                ].join(" "),
              },
              { role: "user", content: emailContent },
            ],
            temperature: 0,
          }),
        }
      );

      const json = await resp.json();
      const modelOut = json.choices?.[0]?.message?.content?.trim();

      try {
        return JSON.parse(modelOut);
      } catch {
        return {
          reply: "",
          original: "",
          salesPerson: "",
          salesPersonEmail: "",
          raw: modelOut,
        };
      }
    } catch (err) {
      console.error("Error calling OpenRouter:", err);
      return {
        reply: "",
        original: "",
        salesPerson: "",
        salesPersonEmail: "",
        error: err.message,
      };
    }
  };

  getInterestedRepliesOnly_ = async (req, res) => {
    try {
      const { campaignId, opts = {}, sheetName } = req.body;
      const {
        pageLimit = 30,
        emailsPerLead = 3,
        concurrency = 4,
        maxEmails = 50,
        maxPages = 10,
        aiInterestThreshold = 0,
      } = opts;

      const apiKey = process.env.INSTANTLY_API_KEY;
      if (!apiKey) throw new Error("apiKey is required");
      if (!campaignId) throw new Error("campaignId is required");

      const authHeaders = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      // ---------- Helpers ----------
      const normalizeLeadsArray = (resp) =>
        resp?.items ||
        resp?.data?.items ||
        resp?.data ||
        resp?.results ||
        resp ||
        [];

      const mapToSheetRow = async ({ lead, email }) => {
        const payload = lead?.payload || {};
        const leadEmail = lead?.email || lead?.lead || email?.lead || "";
        const emailBodyText = email?.body?.text || "";
        const emailBodyHtml = email?.body?.html || "";

        // Use AI-powered extraction
        const extracted = await this.extractReply(
          emailBodyText || emailBodyHtml || ""
        );

        const emailSignature = extracted.reply
          ? extracted.reply
              .split(/\r?\n\r?\n/)
              .slice(-2)
              .join("\n\n")
          : "";

        const phoneFromEmailMatch = (extracted.reply || "").match(
          /(\+?\d{1,3}[-.\s]?)?(\(\d{2,4}\)|\d{2,4})[-.\s]?\d{3,4}[-.\s]?\d{3,4}/
        );

        const phoneFromEmail = phoneFromEmailMatch
          ? phoneFromEmailMatch[0]
          : "";

        console.log(
          colorize("Extracted Email Content", "cyan"),
          extracted.reply
        );
        return {
          "For scheduling": "",
          "sales person": extracted.salesPerson || "",
          "sales person email": extracted.salesPersonEmail || "",
          company: lead?.company_name || lead?.company || "",
          "company phone#": lead?.phone || "",
          "phone#from email": phoneFromEmail,
          "lead first name": lead?.first_name || "",
          "lead last name": lead?.last_name || "",
          "lead email": leadEmail,
          "Column 1": leadEmail,
          "email reply": extracted.reply || "",
          "phone 1": lead?.phone || "",
          phone2: payload.phone2 || "",
          address: payload.address || lead?.address || "",
          city: payload.city || lead?.city || "",
          state: payload.state || lead?.state || "",
          zip: payload.zip || "",
          details: payload.details || lead?.details || lead?.website || "",
          "Email Signature": emailSignature,
          _email_id: email?.id || email?.message_id || "",
          _lead_id: lead?.id || lead?.lead_id || "",
          _thread_id: email?.thread_id || "",
          _timestamp_email:
            email?.timestamp_email || email?.timestamp_created || "",
        };
      };

      const isInterestedReply = (email) => {
        if (!email) return false;
        if (email.i_status === 1) return true;
        if (email.ai_interest_value >= aiInterestThreshold) return true;
        return email.email_type === "received" || email.ue_type === 2;
      };

      const getNextCursor = (resp) =>
        resp?.next_starting_after ||
        resp?.data?.next_starting_after ||
        resp?.paging?.next_cursor ||
        resp?.pagination?.next_starting_after ||
        null;

      // ---------- API Calls ----------
      const fetchLeadsPage = async (cursor = null) => {
        const body = {
          filters: {
            campaign: campaignId,
            lt_interest_status: 1,
            email_reply_count: { gt: 0 },
            ai_interest_value: { gte: aiInterestThreshold },
          },
          limit: pageLimit,
          ...(cursor && { starting_after: cursor }),
        };
        return (
          await axios.post(`${API_BASE}${LEADS_LIST_PATH}`, body, {
            headers: authHeaders,
          })
        ).data;
      };

      const fetchRepliesForLeadsBatch = async (leads, perLeadLimit) =>
        Promise.allSettled(
          leads.map(async (lead) => {
            const params = {
              campaign_id: campaignId,
              email_type: "received",
              limit: perLeadLimit,
              ...(lead?.id
                ? { lead_id: lead.id }
                : { lead: lead?.email || lead?.lead }),
            };
            try {
              const r = await axios.get(`${API_BASE}${EMAILS_PATH}`, {
                headers: authHeaders,
                params,
              });
              return { lead, emails: normalizeLeadsArray(r.data) };
            } catch (err) {
              return { lead, emails: [], error: err.message };
            }
          })
        );

      // ---------- State ----------
      const rows = [];
      const leadIdsAll = new Set();
      const interestedLeadIds = new Set();
      let totalEmailsCollected = 0,
        pagesFetched = 0,
        processedLeads = 0;
      let cursor = null,
        stoppedEarly = false;

      console.log(
        `[interested-only] Start: campaign=${campaignId}, maxPages=${maxPages}, sheetName=${sheetName}`
      );

      // ---------- Main Loop ----------
      while (
        !stoppedEarly &&
        totalEmailsCollected < maxEmails &&
        pagesFetched < maxPages
      ) {
        const pageResp = await fetchLeadsPage(cursor);
        const leads = normalizeLeadsArray(pageResp);
        pagesFetched++;

        if (!leads.length) break;
        console.log(
          `[interested-only] Page ${pagesFetched} — leads: ${leads.length}`
        );

        for (let i = 0; i < leads.length && !stoppedEarly; i += concurrency) {
          const batch = leads.slice(i, i + concurrency);
          const remaining = maxEmails - totalEmailsCollected;
          if (remaining <= 0) {
            stoppedEarly = true;
            break;
          }

          const perLeadLimit = Math.min(emailsPerLead, remaining);
          const batchResults = await fetchRepliesForLeadsBatch(
            batch,
            perLeadLimit
          );

          for (const r of batchResults) {
            const lead = r.value?.lead || r.lead;
            const emails = r.value?.emails || r.emails || [];
            const leadKey =
              lead?.id || lead?.lead_id || lead?.email || lead?.lead;
            if (leadKey) leadIdsAll.add(leadKey);

            if (r.error) continue;

            const interestedReplies = emails.filter(isInterestedReply);
            if (!interestedReplies.length) continue;

            interestedLeadIds.add(leadKey);

            for (const email of interestedReplies) {
              if (totalEmailsCollected >= maxEmails) {
                stoppedEarly = true;
                break;
              }

              // 👇 FIXED: await mapToSheetRow
              const row = await mapToSheetRow({ lead, email });

              if (await this.processEmailRow({ emailRow: row, sheetName })) {
                rows.push(row);
                totalEmailsCollected++;
              }
            }

            processedLeads++;
            if (
              processedLeads % 25 === 0 ||
              totalEmailsCollected >= maxEmails
            ) {
              console.log(
                `[interested-only] Progress: leads=${processedLeads}, pages=${pagesFetched}, collected=${totalEmailsCollected}/${maxEmails}`
              );
            }
          }
        }

        if (totalEmailsCollected >= maxEmails) stoppedEarly = true;
        cursor = getNextCursor(pageResp);
        if (!cursor) break;
      }

      console.log(
        `[interested-only] Done: pages=${pagesFetched}, leads=${leadIdsAll.size}, rows=${rows.length}, stoppedEarly=${stoppedEarly}`
      );

      return responseReturn(res, 200, {
        total: rows.length,
        rows,
        pagesFetched,
        distinctLeadsChecked: leadIdsAll.size,
        interestedLeadCount: interestedLeadIds.size,
        stoppedEarly,
        maxEmailsCap: maxEmails,
        maxPagesCap: maxPages,
        aiInterestThreshold,
      });
    } catch (err) {
      console.error("[interested-only] Error:", err);
      return responseReturn(res, 500, {
        error: "Failed to fetch interested reply emails",
        detail: err?.message || String(err),
      });
    }
  };
}

module.exports = new instantlyAiController();
