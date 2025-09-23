const { responseReturn } = require("../utils/response");
require("dotenv").config({ silent: true });
const axios = require("axios");

const BASE_URL = "https://api.instantly.ai/api/v2/campaigns";
const BASE_URL_LEADS = "https://api.instantly.ai/api/v2/";

const PAGE_SIZE = 10;


const API_BASE = "https://api.instantly.ai";
const LEADS_LIST_PATH = "/api/v2/leads/list";
const EMAILS_PATH = "/api/v2/emails";
const CAMPAIGN_GET_PATH = "/api/v2/campaigns";

class instantlyAiController {
  // New: process a single email row, must return a Promise<boolean>
  async processEmailRow(rowJson) {
    const row = typeof rowJson === 'string' ? JSON.parse(rowJson) : rowJson;
    console.log("Processing email row for lead:", row["lead email"]);
    console.log(row["email reply"]);
    // console.log(row);
    // TODO: Replace this with your actual logic
    // Return true if processed successfully, false otherwise
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


  getInterestedRepliesOnly_ = async (req, res) => {
    try {
      const { campaignId, opts = {} } = req.body;
      const apiKey = process.env.INSTANTLY_API_KEY;

      const pageLimit = opts.pageLimit || 10;
      const emailsPerLead = opts.emailsPerLead || 10;
      const concurrency = opts.concurrency || 4; 
      const maxEmails = typeof opts.maxEmails === "number" ? opts.maxEmails : 10;
      const maxPages = typeof opts.maxPages === "number" ? opts.maxPages : 10;
      const aiInterestThreshold = typeof opts.aiInterestThreshold === "number" ? opts.aiInterestThreshold : 1;

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
        if (Array.isArray(pageResp?.data) && !Array.isArray(pageResp.data.items)) return pageResp.data;
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
        const emailReply = emailBodyText || emailBodyHtml || email?.content_preview || "";
        let emailSignature = "";
        if (emailBodyText) {
          const parts = emailBodyText.split(/\r?\n\r?\n/);
          emailSignature = parts.slice(-2).join("\n\n");
        } else if (emailBodyHtml) {
          const stripped = emailBodyHtml.replace(/<\/?[^>]+(>|$)/g, "");
          const parts = stripped.split(/\r?\n\r?\n/);
          emailSignature = parts.slice(-2).join("\n\n");
        }
        const phoneFromEmailMatch = (emailBodyText || "").match(/(\+?\d{1,3}[-.\s]?)?(\(\d{2,4}\)|\d{2,4})[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
        const phoneFromEmail = phoneFromEmailMatch ? phoneFromEmailMatch[0] : "";
        const details = payload.details || lead?.details || lead?.website || "";
        return {
          "For scheduling": "",
          "sales person": "",
          "sales person email": "",
          company: company,
          "company phone#": companyPhone,
          "phone#from email": phoneFromEmail,
          "lead first name": leadFirst,
          "lead last name": leadLast,
          "lead email": leadEmail,
          "Column 1": column1,
          "email reply": emailReply,
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
          _timestamp_email: email?.timestamp_email || email?.timestamp_created || "",
        };
      };

      // Helper: Fetch a page of leads
      const fetchLeadsPage = async (startingAfter = null) => {
        const body = {
          filters: {
            campaign: campaignId,
            lt_interest_status: 1,
            email_reply_count: { gt: 0 },
          },
          limit: pageLimit,
        };
        if (startingAfter) body.starting_after = startingAfter;
        const r = await axios.post(`${API_BASE}${LEADS_LIST_PATH}`, body, { headers: authHeaders });
        return r.data;
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
            return axios.get(`${API_BASE}${EMAILS_PATH}`, { headers: authHeaders, params })
              .then((r) => ({ lead, emails: Array.isArray(r.data?.items) ? r.data.items : Array.isArray(r.data?.data) && !Array.isArray(r.data.data.items) ? r.data.data : Array.isArray(r.data) ? r.data : Array.isArray(r.data?.results) ? r.data.results : [] }))
              .catch((err) => ({ lead, emails: [], error: err?.message || String(err) }));
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
      let processedLeads = 0;
      let stoppedEarly = false;

      console.log("[interested-only] Starting: campaign=", campaignId, "maxPages=", maxPages);

      let cursor = null;
      while (!stoppedEarly && totalEmailsCollected < maxEmails && pagesFetched < maxPages) {
        const pageResp = await fetchLeadsPage(cursor);
        pagesFetched++;
        const leadsArray = normalizeLeadsArray(pageResp);
        console.log(`[interested-only] Fetched page ${pagesFetched} — leads on page: ${leadsArray.length}`);
        if (!leadsArray.length) break;

        // Batch process leads for replies in parallel, but limit concurrency for memory/CPU
        for (let i = 0; i < leadsArray.length; i += concurrency) {
          if (stoppedEarly) break;
          const batch = leadsArray.slice(i, i + concurrency);
          const remainingAllowed = Math.max(0, maxEmails - totalEmailsCollected);
          if (remainingAllowed <= 0) {
            stoppedEarly = true;
            break;
          }
          const perLeadLimit = Math.min(emailsPerLead, remainingAllowed);
          const batchResults = await fetchRepliesForLeadsBatch(batch, perLeadLimit);
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
              if (typeof e.i_status === "number" && e.i_status === 1) return true;
              if (typeof e.ai_interest_value === "number" && e.ai_interest_value >= aiInterestThreshold) return true;
              const ueTypeReceived = typeof e.ue_type === "number" ? e.ue_type === 2 : false;
              const emailIsReceived = e.email_type === "received" || ueTypeReceived;
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
                const done = await this.processEmailRow(JSON.stringify(row));
                if (done) {
                  rows.push(row);
                  processedRows.push(row);
                  totalEmailsCollected++;
                }
              }
            }
            processedLeads++;
            if (processedLeads % 25 === 0 || totalEmailsCollected >= maxEmails) {
              console.log(`[interested-only] Progress: processedLeads=${processedLeads}, pagesFetched=${pagesFetched}, emailsCollected=${totalEmailsCollected}/${maxEmails}`);
            }
          }
        }

        if (totalEmailsCollected >= maxEmails) {
          console.log("[interested-only] Reached global maxEmails cap — stopping.");
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

      console.log(`[interested-only] Done: pagesFetched=${pagesFetched}, leadsChecked=${leadIdsAll.size}, rows=${rows.length}, stoppedEarly=${stoppedEarly}`);

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
