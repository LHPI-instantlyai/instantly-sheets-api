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

const regexes = {};
for (const [key, { pattern, flags }] of Object.entries(patterns)) {
  regexes[key] = new RegExp(pattern, flags);
}

class instantlyAiController {
  normalizeRow(emailRow) {
    console.log("---------------------------------------------------")
    console.log(emailRow)
    console.log("---------------------------------------------------")
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
  async processEmailRow({emailRow, sheetName}) {
    console.log("Process Email Row");
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

      // --- Step 3: Neither address nor website ---
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
    console.log("isAddressUsBased");

    // 1. explicit country mentions
    if (regexes.countryUsa.test(fields.country)) {
      console.log("Matched country");
      return true;
    }

    // 2. two-letter state codes or full state names
    if (
      regexes.stateAbbreviations.test(fields.state) ||
      regexes.fullStateNames.test(fields.state)
    ) {
      console.log("Matched state");
      return true;
    }

    // 3. standalone ZIP code
    if (regexes.zip.test(fields.zip)) {
      console.log("Matched zip");
      return true;
    }

    // 4. well-known US city names
    if (regexes.usCities.test(fields.city)) {
      console.log("Matched city");
      return true;
    }

    // 5. city + state combos like "Boston, MA"
    if (regexes.cityStateCombo.test(fields.city)) {
      console.log("Matched city-state combo");
      return true;
    }

    // 6. fallback: catch ZIP / state embedded in address+city
    const combined = `${fields.address} ${fields.city}`;
    if (
      regexes.stateAbbreviations.test(combined) ||
      regexes.fullStateNames.test(combined) ||
      regexes.zip.test(combined)
    ) {
      console.log("Matched combined address");
      return true;
    }
    console.log("No address match");
    return false;
  }

  async isWebsiteUsBased(url) {
    if (!url) {
      throw new Error("URL is required");
    }
    console.log("isWebsiteUsBased");
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

  //   async isActuallyInterested(emailReply) {
  //   if (!emailReply?.trim()) return false;
  //   console.log("isActuallyInterested");
  //   try {
  //     const response = await fetch("http://localhost:11434/api/chat", {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({
  //         model: "deepseek-r1",
  //         messages: [
  //           {
  //             role: "SYSTEM",
  //             content: "Output format: true|false"
  //           },
  //           {
  //             role: "user",
  //             content: `True if interested in our service, false if promoting theirs. Email: ${emailReply}`
  //           }
  //         ],
  //         temperature: 0,
  //         num_predict: 1, // Absolute minimum
  //         stream: false,
  //       }),
  //     });

  //     const result = await response.json();
  //     const rawContent = result.message?.content || '';

  //     console.log("AI classification raw result:", rawContent);

  //     // Extract using regex - look for true/false surrounded by word boundaries
  //     const match = rawContent.match(/\b(true|false)\b/i);
  //     return match ? match[1].toLowerCase() === 'true' : false;

  //   } catch (err) {
  //     console.error("Error classifying email:", err);
  //     return false;
  //   }
  // }

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

      console.log("LLM classification:", modelOut);
      return modelOut === "true";
    } catch (err) {
      console.error("Classification error:", err);
      return false;
    }
  }

  async encodeToSheet(spreadsheetId, sheetName, rowJson) {
    console.log("encodeToSheet");
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

    console.log(`Row appended to ${sheetName}`);
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
    console.log("Sheet Name: ---------", sheetName);
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

  getInterestedRepliesOnly_ = async (req, res) => {
    try {
      const { campaignId, opts = {}, sheetName } = req.body;
      const apiKey = process.env.INSTANTLY_API_KEY;
      let processedLeads = 0;

      const pageLimit = opts.pageLimit || 30;
      const emailsPerLead = opts.emailsPerLead || 3;
      const concurrency = opts.concurrency || 4;
      const maxEmails =
        typeof opts.maxEmails === "number" ? opts.maxEmails : 50;
      const maxPages = typeof opts.maxPages === "number" ? opts.maxPages : 10;
      const aiInterestThreshold =
        typeof opts.aiInterestThreshold === "number"
          ? opts.aiInterestThreshold
          : 0;

      if (!apiKey) throw new Error("apiKey is required");
      if (!campaignId) throw new Error("campaignId is required");

      const authHeaders = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      // Helper: Normalize leads array from API response
      const normalizeLeadsArray = (pageResp) => {
        if (!pageResp) return [];
        if (Array.isArray(pageResp)) return pageResp;
        if (Array.isArray(pageResp?.items)) return pageResp.items;
        if (
          Array.isArray(pageResp?.data) &&
          !Array.isArray(pageResp.data.items)
        )
          return pageResp.data;
        if (Array.isArray(pageResp?.data?.items)) return pageResp.data.items;
        if (Array.isArray(pageResp?.results)) return pageResp.results;
        return [];
      };

      // Helper: Map lead/email to sheet row
      const mapToSheetRow = ({ lead, email }) => {
        const payload = lead?.payload || {};
        const leadFirst = lead?.first_name || "";
        const leadLast = lead?.last_name || "";
        const leadEmail = lead?.email || lead?.lead || email?.lead || "";
        const company = lead?.company_name || lead?.company || "";
        const companyPhone = lead?.phone || "";
        const address = payload.address || lead?.address || "";
        const city = payload.city || lead?.city || "";
        const state = payload.state || lead?.state || "";
        const zip = payload.zip || lead?.zip || "";
        const column1 = leadEmail;
        const emailBodyText = email?.body?.text || "";
        const emailBodyHtml = email?.body?.html || "";

        // 1. Extract only the received reply (exclude all quoted/sent emails)
        let actualReply = "";
        if (emailBodyText) {
          // Find the first occurrence of 'On' or 'From' at the start of a line
          const splitRegex = /^(On|From)\b.*$/gim;
          const match = splitRegex.exec(emailBodyText);
          if (match) {
            actualReply = emailBodyText.substring(0, match.index).trim();
          } else {
            actualReply = emailBodyText.trim();
          }
        }

        // 2. Extract sales person name/email from quoted section
        let salesPerson = "";
        let salesPersonEmail = "";
        let quotedSection = "";
        if (quotedMatch) {
          quotedSection = emailBodyText.substring(quotedMatch.index);
        }
        if (quotedSection) {
          const senderMatch = quotedSection.match(/([A-Za-z .'-]+)\s<([^>]+)>/);
          if (senderMatch) {
            salesPerson = senderMatch[1].trim();
            salesPersonEmail = senderMatch[2].trim();
          }
        }

        // Fallback: Try to extract from all quoted lines if not found
        if ((!salesPerson || !salesPersonEmail) && emailBodyText) {
          const allSenders = [
            ...emailBodyText.matchAll(/([A-Za-z .'-]+)\s<([^>]+)>/g),
          ];
          if (allSenders.length > 0) {
            salesPerson = allSenders[0][1].trim();
            salesPersonEmail = allSenders[0][2].trim();
          }
        }

        let emailSignature = "";
        if (actualReply) {
          const parts = actualReply.split(/\r?\n\r?\n/);
          emailSignature = parts.slice(-2).join("\n\n");
        } else if (emailBodyHtml) {
          const stripped = emailBodyHtml.replace(/<\/?[^>]+(>|$)/g, "");
          const parts = stripped.split(/\r?\n\r?\n/);
          emailSignature = parts.slice(-2).join("\n\n");
        }
        const phoneFromEmailMatch = (actualReply || "").match(
          /(\+?\d{1,3}[-.\s]?)?(\(\d{2,4}\)|\d{2,4})[-.\s]?\d{3,4}[-.\s]?\d{3,4}/
        );
        const phoneFromEmail = phoneFromEmailMatch
          ? phoneFromEmailMatch[0]
          : "";
        const details = payload.details || lead?.details || lead?.website || "";
        return {
          "For scheduling": "",
          "sales person": salesPerson,
          "sales person email": salesPersonEmail,
          company: company,
          "company phone#": companyPhone,
          "phone#from email": phoneFromEmail,
          "lead first name": leadFirst,
          "lead last name": leadLast,
          "lead email": leadEmail,
          "Column 1": column1,
          "email reply": actualReply,
          "phone 1": companyPhone || "",
          phone2: payload.phone2 || "",
          address: address,
          city: city,
          state: state,
          zip: zip,
          details: details,
          "Email Signature": emailSignature,
          _email_id: email?.id || email?.message_id || "",
          _lead_id: lead?.id || lead?.lead_id || "",
          _thread_id: email?.thread_id || "",
          _timestamp_email:
            email?.timestamp_email || email?.timestamp_created || "",
        };
      };

      const fetchLeadsPage = async (startingAfter = null) => {
        const body = {
          filters: {
            campaign: campaignId,
            lt_interest_status: 1,
            email_reply_count: { gt: 0 },
            ai_interest_value: { gte: aiInterestThreshold }, // ← new filter
          },
          limit: pageLimit,
        };
        if (startingAfter) body.starting_after = startingAfter;

        const resp = await axios.post(`${API_BASE}${LEADS_LIST_PATH}`, body, {
          headers: authHeaders,
        });
        return resp.data;
      };

      // Helper: Fetch replies for a batch of leads in parallel (batched for efficiency)
      const fetchRepliesForLeadsBatch = async (leads, perLeadLimit) => {
        // Use Promise.allSettled for resilience
        return await Promise.allSettled(
          leads.map((lead) => {
            const leadId = lead?.id || lead?.lead_id || null;
            const leadEmail = lead?.email || lead?.lead || null;
            const params = {
              campaign_id: campaignId,
              email_type: "received",
              limit: Math.min(perLeadLimit, emailsPerLead),
            };
            if (leadId) params.lead_id = leadId;
            else if (leadEmail) params.lead = leadEmail;
            return axios
              .get(`${API_BASE}${EMAILS_PATH}`, {
                headers: authHeaders,
                params,
              })
              .then((r) => ({
                lead,
                emails: Array.isArray(r.data?.items)
                  ? r.data.items
                  : Array.isArray(r.data?.data) &&
                    !Array.isArray(r.data.data.items)
                  ? r.data.data
                  : Array.isArray(r.data)
                  ? r.data
                  : Array.isArray(r.data?.results)
                  ? r.data.results
                  : [],
              }))
              .catch((err) => ({
                lead,
                emails: [],
                error: err?.message || String(err),
              }));
          })
        );
      };

      // State
      const rows = [];
      const processedRows = [];
      const leadIdsAll = new Set();
      const interestedLeadIds = new Set();
      let totalEmailsCollected = 0;
      let pagesFetched = 0;

      let stoppedEarly = false;

      console.log(
        "[interested-only] Starting: campaign=",
        campaignId,
        "maxPages=",
        maxPages,
        "SheetName : ",
        sheetName
      );

      let cursor = null;
      while (
        !stoppedEarly &&
        totalEmailsCollected < maxEmails &&
        pagesFetched < maxPages
      ) {
        const pageResp = await fetchLeadsPage(cursor);
        pagesFetched++;
        const leadsArray = normalizeLeadsArray(pageResp);
        console.log(
          `[interested-only] Fetched page ${pagesFetched} — leads on page: ${leadsArray.length}`
        );
        if (!leadsArray.length) break;

        // Batch process leads for replies in parallel, but limit concurrency for memory/CPU
        for (let i = 0; i < leadsArray.length; i += concurrency) {
          if (stoppedEarly) break;
          const batch = leadsArray.slice(i, i + concurrency);
          const remainingAllowed = Math.max(
            0,
            maxEmails - totalEmailsCollected
          );
          if (remainingAllowed <= 0) {
            stoppedEarly = true;
            break;
          }
          const perLeadLimit = Math.min(emailsPerLead, remainingAllowed);
          const batchResults = await fetchRepliesForLeadsBatch(
            batch,
            perLeadLimit
          );
          for (const result of batchResults) {
            const lead = result.value?.lead || result.lead;
            const emails = result.value?.emails || result.emails || [];
            const leadId = lead?.id || lead?.lead_id || null;
            const leadEmail = lead?.email || lead?.lead || null;
            if (leadId) leadIdsAll.add(leadId);
            else if (leadEmail) leadIdsAll.add(leadEmail);
            if (result.error) continue; // skip errored leads
            // Filter interested replies
            const interestedReplies = (emails || []).filter((e) => {
              if (!e) return false;
              if (typeof e.i_status === "number" && e.i_status === 1)
                return true;
              if (
                typeof e.ai_interest_value === "number" &&
                e.ai_interest_value >= aiInterestThreshold
              )
                return true;
              const ueTypeReceived =
                typeof e.ue_type === "number" ? e.ue_type === 2 : false;
              const emailIsReceived =
                e.email_type === "received" || ueTypeReceived;
              if (!emailIsReceived) return false;
              return false;
            });
            if (interestedReplies.length > 0) {
              interestedLeadIds.add(leadId || leadEmail);
              for (const em of interestedReplies) {
                if (totalEmailsCollected >= maxEmails) {
                  stoppedEarly = true;
                  break;
                }
                const row = mapToSheetRow({ lead, email: em });
                // Sequentially process each email row
                // eslint-disable-next-line no-await-in-loop
                // const done = await this.processEmailRow(row);
                const done = await this.processEmailRow({
                  emailRow: row,
                  sheetName,
                });
                if (done) {
                  rows.push(row);
                  processedRows.push(row);
                  totalEmailsCollected++;
                }
              }
            }
            processedLeads++;
            if (
              processedLeads % 25 === 0 ||
              totalEmailsCollected >= maxEmails
            ) {
              console.log(
                `[interested-only] Progress: processedLeads=${processedLeads}, pagesFetched=${pagesFetched}, emailsCollected=${totalEmailsCollected}/${maxEmails}`
              );
            }
          }
        }

        if (totalEmailsCollected >= maxEmails) {
          console.log(
            "[interested-only] Reached global maxEmails cap — stopping."
          );
          stoppedEarly = true;
          break;
        }

        // advance cursor or stop if no more pages
        if (pageResp?.next_starting_after)
          cursor = pageResp.next_starting_after;
        else if (pageResp?.data?.next_starting_after)
          cursor = pageResp.data.next_starting_after;
        else if (pageResp?.paging?.next_cursor)
          cursor = pageResp.paging.next_cursor;
        else if (pageResp?.pagination?.next_starting_after)
          cursor = pageResp.pagination.next_starting_after;
        else {
          break;
        }
      }

      console.log(
        `[interested-only] Done: pagesFetched=${pagesFetched}, leadsChecked=${leadIdsAll.size}, rows=${rows.length}, stoppedEarly=${stoppedEarly}`
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
