const { responseReturn } = require("../utils/response");
require("dotenv").config({ silent: true });
const axios = require("axios");

const BASE_URL = "https://api.instantly.ai/api/v2/campaigns";
const BASE_URL_LEADS = "https://api.instantly.ai/api/v2/";

const PAGE_SIZE = 10;

// const API_BASE = "https://api.instantly.ai";
// const LEADS_LIST_PATH = "/api/v2/leads/list";
// const EMAILS_PATH = "/api/v2/emails";

const API_BASE = "https://api.instantly.ai";
const LEADS_LIST_PATH = "/api/v2/leads/list";
const EMAILS_PATH = "/api/v2/emails";
const CAMPAIGN_GET_PATH = "/api/v2/campaigns";

class instantlyAiController {
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

  // getInterestedRepliesOnly_ = async (req, res) => {
  //   try {
  //     const { campaignId, opts = {} } = req.body;
  //     const apiKey = process.env.INSTANTLY_API_KEY;

  //     const pageLimit = opts.pageLimit || 20;
  //     const emailsPerLead = opts.emailsPerLead || 20;
  //     const concurrency = opts.concurrency || 4;
  //     const maxEmails = typeof opts.maxEmails === 'number' ? opts.maxEmails : 20; // global cap
  //     const maxPages = typeof opts.maxPages === 'number' ? opts.maxPages : 20;
  //     const maxLeads = typeof opts.maxLeads === 'number' ? opts.maxLeads : 20;
  //     const aiInterestThreshold = typeof opts.aiInterestThreshold === 'number' ? opts.aiInterestThreshold : 0.6;
  //     // The filter will accept an email as "interested" if either:
  //     // - email.i_status === 1 (explicit interest tag on the email), OR
  //     // - email.ai_interest_value >= aiInterestThreshold (AI scored interest)
  //     // Adjust aiInterestThreshold to be more/less strict.

  //     if (!apiKey) throw new Error('apiKey is required');
  //     if (!campaignId) throw new Error('campaignId is required');

  //     const authHeaders = {
  //       Authorization: `Bearer ${apiKey}`,
  //       'Content-Type': 'application/json',
  //     };

  //     async function fetchLeadsPage(startingAfter = null) {
  //       const body = {
  //         filters: {
  //           campaign: campaignId,
  //           lt_interest_status: 1, // Interested (lead-level)
  //           email_reply_count: { gt: 0 }, // has replies
  //         },
  //         limit: pageLimit,
  //       };
  //       if (startingAfter) body.starting_after = startingAfter;

  //       const r = await axios.post(`${API_BASE}${LEADS_LIST_PATH}`, body, {
  //         headers: authHeaders,
  //       });
  //       return r.data;
  //     }

  //     async function fetchRepliesForLead(leadId, leadEmail, limitOverride = emailsPerLead) {
  //       const params = {
  //         campaign_id: campaignId,
  //         email_type: 'received',
  //         limit: Math.min(limitOverride, emailsPerLead),
  //       };
  //       if (leadId) params.lead_id = leadId;
  //       else if (leadEmail) params.lead = leadEmail;

  //       const r = await axios.get(`${API_BASE}${EMAILS_PATH}`, {
  //         headers: authHeaders,
  //         params,
  //       });

  //       if (Array.isArray(r.data?.items)) return r.data.items;
  //       if (Array.isArray(r.data?.data)) return r.data.data;
  //       if (Array.isArray(r.data)) return r.data;
  //       return [];
  //     }

  //     async function runWithConcurrency(items, worker, concurrencyLimit) {
  //       const results = [];
  //       let idx = 0;
  //       const runners = new Array(Math.max(1, concurrencyLimit)).fill(null).map(async () => {
  //         while (true) {
  //           const i = idx++;
  //           if (i >= items.length) break;
  //           try {
  //             results[i] = await worker(items[i], i);
  //           } catch (err) {
  //             results[i] = { error: err };
  //           }
  //         }
  //       });
  //       await Promise.all(runners);
  //       return results;
  //     }

  //     const interestedEmails = [];
  //     const leadIdsAll = new Set();
  //     const interestedLeadIds = new Set();
  //     let totalEmailsCollected = 0;
  //     let pagesFetched = 0;
  //     let processedLeads = 0;
  //     let stoppedEarly = false;

  //     console.log('[interested-only] Starting paged lead fetch / process for campaign:', campaignId);

  //     let cursor = null;
  //     while (pagesFetched < maxPages && totalEmailsCollected < maxEmails) {
  //       const pageResp = await fetchLeadsPage(cursor);
  //       pagesFetched++;

  //       const leadsArray =
  //         Array.isArray(pageResp?.data) && !Array.isArray(pageResp.data.items)
  //           ? pageResp.data
  //           : Array.isArray(pageResp?.items)
  //           ? pageResp.items
  //           : Array.isArray(pageResp?.data?.items)
  //           ? pageResp.data.items
  //           : Array.isArray(pageResp)
  //           ? pageResp
  //           : [];

  //       console.log(`[interested-only] Fetched page ${pagesFetched} — leads on page: ${leadsArray.length}`);

  //       if (!leadsArray.length) break;
  //       if (processedLeads >= maxLeads) {
  //         console.log(`[interested-only] Reached maxLeads (${maxLeads}); stopping.`);
  //         break;
  //       }

  //       const allowedLeadsRemaining = Math.max(0, maxLeads - processedLeads);
  //       const pageLeadsToProcess = allowedLeadsRemaining < leadsArray.length ? leadsArray.slice(0, allowedLeadsRemaining) : leadsArray;

  //       async function leadWorker(lead, idxInBatch) {
  //         if (stoppedEarly) return [];

  //         const leadId = lead.id || lead.lead_id || null;
  //         const leadEmail = lead.email || lead.lead || null;
  //         if (leadId) leadIdsAll.add(leadId);
  //         else if (leadEmail) leadIdsAll.add(leadEmail);

  //         const remainingAllowed = Math.max(0, maxEmails - totalEmailsCollected);
  //         if (remainingAllowed <= 0) {
  //           stoppedEarly = true;
  //           return [];
  //         }

  //         const perLeadLimit = Math.min(emailsPerLead, remainingAllowed);
  //         const replies = await fetchRepliesForLead(leadId, leadEmail, perLeadLimit);

  //         // NEW: Only accept emails that indicate interest.
  //         const filtered = (replies || []).filter((e) => {
  //           if (!e) return false;
  //           // Prefer explicit i_status === 1 (Interested)
  //           if (typeof e.i_status === 'number' && e.i_status === 1) return true;
  //           // Otherwise accept if AI interest score is high enough
  //           if (typeof e.ai_interest_value === 'number' && e.ai_interest_value >= aiInterestThreshold) return true;
  //           // Fallback: if there's no scoring fields but body looks present, skip — we only want "interested" replies
  //           return false;
  //         });

  //         if (filtered.length > 0) {
  //           interestedLeadIds.add(leadId || leadEmail);
  //           for (const em of filtered) {
  //             if (totalEmailsCollected >= maxEmails) {
  //               stoppedEarly = true;
  //               break;
  //             }
  //             interestedEmails.push({
  //               lead: { id: leadId, email: leadEmail },
  //               email: em,
  //             });
  //             totalEmailsCollected++;
  //           }
  //         }

  //         processedLeads++;
  //         if (processedLeads % 25 === 0 || processedLeads === maxLeads || totalEmailsCollected >= maxEmails) {
  //           console.log(
  //             `[interested-only] Progress: processedLeads=${processedLeads}, pagesFetched=${pagesFetched}, emailsCollected=${totalEmailsCollected}/${maxEmails}`
  //           );
  //         }

  //         if (totalEmailsCollected >= maxEmails) stoppedEarly = true;
  //         return filtered;
  //       }

  //       await runWithConcurrency(pageLeadsToProcess, leadWorker, concurrency);

  //       if (totalEmailsCollected >= maxEmails) {
  //         console.log('[interested-only] Reached maxEmails cap — stopping further page fetches.');
  //         break;
  //       }

  //       if (pageResp?.next_starting_after) {
  //         cursor = pageResp.next_starting_after;
  //       } else if (pageResp?.data?.next_starting_after) {
  //         cursor = pageResp.data.next_starting_after;
  //       } else if (pageResp?.paging?.next_cursor) {
  //         cursor = pageResp.paging.next_cursor;
  //       } else {
  //         break;
  //       }
  //     }

  //     console.log(
  //       `[interested-only] Finished: pagesFetched=${pagesFetched}, leadsChecked=${processedLeads}, emailsReturned=${totalEmailsCollected}, distinctInterestedLeads=${interestedLeadIds.size}, stoppedEarly=${stoppedEarly}`
  //     );

  //     return responseReturn(res, 200, {
  //       total: totalEmailsCollected,
  //       emails: interestedEmails,
  //       pagesFetched,
  //       distinctLeadsChecked: leadIdsAll.size,
  //       interestedLeadCount: interestedLeadIds.size,
  //       stoppedEarly,
  //       maxEmailsCap: maxEmails,
  //       aiInterestThreshold,
  //     });
  //   } catch (err) {
  //     console.error('[interested-only] Error:', err);
  //     return responseReturn(res, 500, {
  //       error: 'Failed to fetch interested reply emails',
  //       detail: err?.message || String(err),
  //     });
  //   }
  // }

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

  // cleanEmailAndSignature(raw) {
  //   const text = (raw || "").toString();

  //   // Remove BOM and stray backslashes
  //   let s = text.replace(/\uFEFF/g, "").replace(/\\+/g, "");

  //   // Normalize newlines
  //   s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  //   // Cut at common thread delimiters (keep earliest)
  //   const threadDelimiters = [
  //     /^\s*On .+wrote:\s*$/im,
  //     /^\s*From:\s.*$/im,
  //     /^-+Original Message-+$/im,
  //     /^\s*>/m,
  //   ];
  //   let cutIndex = s.length;
  //   for (const re of threadDelimiters) {
  //     const m = s.match(re);
  //     if (m && typeof m.index === "number" && m.index >= 0)
  //       cutIndex = Math.min(cutIndex, m.index);
  //   }
  //   s = s.slice(0, cutIndex).trim();

  //   // Remove remaining quoted lines starting with '>'
  //   s = s
  //     .split("\n")
  //     .filter((line) => !/^\s*>/.test(line))
  //     .join("\n");

  //   // Remove leftover metadata lines like "On ... wrote:" or dashed separators
  //   s = s
  //     .split("\n")
  //     .filter(
  //       (line) => !/On .*wrote:$/i.test(line) && !/^\s*[-]{3,}/.test(line)
  //     )
  //     .join("\n");

  //   // Collapse multiple blank lines
  //   s = s.replace(/\n{3,}/g, "\n\n").trim();

  //   // Heuristic signature detection
  //   const sigIndicators = [
  //     /^\s*--\s*$/,
  //     /^\s*thanks[,.!\s]*$/i,
  //     /^\s*thank you[,.!\s]*$/i,
  //     /^\s*regards[,.!\s]*$/i,
  //     /^\s*best[,.!\s]*$/i,
  //     /^\s*cheers[,.!\s]*$/i,
  //     /^\s*cordially[,.!\s]*$/i,
  //     /^\s*sent from my/i,
  //     /^\s*kind regards[,.!\s]*$/i,
  //   ];

  //   const lines = s.split("\n").map((l) =>
  //     l
  //       .replace(/\u00A0/g, " ")
  //       .replace(/\t/g, " ")
  //       .trimRight()
  //   );
  //   let sigStart = lines.length;
  //   for (let i = 0; i < lines.length; i++) {
  //     const L = lines[i].trim();
  //     if (!L) continue;
  //     if (sigIndicators.some((rx) => rx.test(L))) {
  //       sigStart = i;
  //       break;
  //     }
  //     if (
  //       i >= Math.max(0, lines.length - 6) &&
  //       /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)*$/.test(L)
  //     ) {
  //       sigStart = i;
  //       break;
  //     }
  //   }

  //   const replyLines = lines.slice(0, sigStart).map((l) => l.trim());
  //   const sigLines = lines.slice(sigStart).map((l) => l.trim());

  //   const cleanedReply = replyLines
  //     .join("\n")
  //     .replace(/^[\s\r\n]+|[\s\r\n]+$/g, "")
  //     .replace(/\n{2,}/g, "\n\n")
  //     .trim();
  //   const cleanedSignature = sigLines
  //     .join("\n")
  //     .replace(/^[\s\r\n]+|[\s\r\n]+$/g, "")
  //     .replace(/\n{2,}/g, "\n")
  //     .trim();

  //   return {
  //     cleanedReply: cleanedReply || "",
  //     cleanedSignature: cleanedSignature || "",
  //   };
  // }
//  getInterestedRepliesOnly_ = async (req, res) => {
//   try {
//     const { campaignId, opts = {} } = req.body;
//     const apiKey = process.env.INSTANTLY_API_KEY;

//     const pageLimit = opts.pageLimit || 30;
//     const emailsPerLead = opts.emailsPerLead || 30;
//     const concurrency = opts.concurrency || 2;
//     const maxEmails = typeof opts.maxEmails === 'number' ? opts.maxEmails : 30;
//     const maxPages = typeof opts.maxPages === 'number' ? opts.maxPages : 20;
//     const aiInterestThreshold = typeof opts.aiInterestThreshold === 'number' ? opts.aiInterestThreshold : 0.6;

//     if (!apiKey) throw new Error('apiKey is required');
//     if (!campaignId) throw new Error('campaignId is required');

//     const authHeaders = {
//       Authorization: `Bearer ${apiKey}`,
//       'Content-Type': 'application/json',
//       Accept: 'application/json',
//     };

//     async function fetchLeadsPage(startingAfter = null) {
//       const body = {
//         filters: {
//           campaign: campaignId,
//           lt_interest_status: 1,
//           email_reply_count: { gt: 0 },
//         },
//         limit: pageLimit,
//       };
//       if (startingAfter) body.starting_after = startingAfter;
//       const r = await axios.post(`${API_BASE}${LEADS_LIST_PATH}`, body, { headers: authHeaders });
//       return r.data;
//     }

//     async function fetchRepliesForLead(leadId, leadEmail, limitOverride = emailsPerLead) {
//       const params = {
//         campaign_id: campaignId,
//         email_type: 'received',
//         limit: Math.min(limitOverride, emailsPerLead),
//       };
//       if (leadId) params.lead_id = leadId;
//       else if (leadEmail) params.lead = leadEmail;

//       const r = await axios.get(`${API_BASE}${EMAILS_PATH}`, { headers: authHeaders, params });
//       if (Array.isArray(r.data?.items)) return r.data.items;
//       if (Array.isArray(r.data?.data) && !Array.isArray(r.data.data.items)) return r.data.data;
//       if (Array.isArray(r.data)) return r.data;
//       if (Array.isArray(r.data?.results)) return r.data.results;
//       return [];
//     }

//     function normalizeLeadsArray(pageResp) {
//       if (!pageResp) return [];
//       if (Array.isArray(pageResp)) return pageResp;
//       if (Array.isArray(pageResp?.items)) return pageResp.items;
//       if (Array.isArray(pageResp?.data) && !Array.isArray(pageResp.data.items)) return pageResp.data;
//       if (Array.isArray(pageResp?.data?.items)) return pageResp.data.items;
//       if (Array.isArray(pageResp?.results)) return pageResp.results;
//       return [];
//     }

//     async function runWithConcurrency(items, worker, concurrencyLimit) {
//       const results = [];
//       let idx = 0;
//       const runners = new Array(Math.max(1, concurrencyLimit)).fill(null).map(async () => {
//         while (true) {
//           const i = idx++;
//           if (i >= items.length) break;
//           try { results[i] = await worker(items[i], i); } catch (err) { results[i] = { error: err?.message || String(err) }; }
//         }
//       });
//       await Promise.all(runners);
//       return results;
//     }

//     function mapToSheetRow({ lead, email, cleanedReply, cleanedSignature }) {
//       const payload = lead?.payload || {};
//       const leadFirst = lead?.first_name || '';
//       const leadLast = lead?.last_name || '';
//       const leadEmail = lead?.email || lead?.lead || email?.lead || '';
//       const company = lead?.company_name || lead?.company || '';
//       const companyPhone = lead?.phone || '';
//       const address = payload.address || lead?.address || '';
//       const city = payload.city || lead?.city || '';
//       const state = payload.state || lead?.state || '';
//       const zip = payload.zip || lead?.zip || '';
//       const column1 = leadEmail;
//       const phoneFromEmailMatch = (cleanedReply || '').match(/(\+?\d{1,3}[-.\s]?)?(\(\d{2,4}\)|\d{2,4})[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
//       const phoneFromEmail = phoneFromEmailMatch ? phoneFromEmailMatch[0] : '';
//       const details = payload.details || lead?.details || lead?.website || '';

//       return {
//         'For scheduling': '',
//         'sales person': '',
//         'sales person email': '',
//         'company': company,
//         'company phone#': companyPhone,
//         'phone#from email': phoneFromEmail,
//         'lead first name': leadFirst,
//         'lead last name': leadLast,
//         'lead email': leadEmail,
//         'Column 1': column1,
//         'email reply': cleanedReply,
//         'phone 1': companyPhone || '',
//         'phone2': payload.phone2 || '',
//         'address': address,
//         'city': city,
//         'state': state,
//         'zip': zip,
//         'details': details,
//         'Email Signature': cleanedSignature,
//         '_email_id': email?.id || email?.message_id || '',
//         '_lead_id': lead?.id || lead?.lead_id || '',
//         '_thread_id': email?.thread_id || '',
//         '_timestamp_email': email?.timestamp_email || email?.timestamp_created || '',
//       };
//     }

//     // state
//     const rows = [];
//     const collectedReplies = []; // actual cleaned email replies returned to caller
//     const leadIdsAll = new Set();
//     const interestedLeadIds = new Set();
//     let totalEmailsCollected = 0;
//     let pagesFetched = 0;
//     let processedLeads = 0;
//     let stoppedEarly = false;

//     console.log('[interested-only] Starting: campaign=', campaignId, 'maxPages=', maxPages);

//     let cursor = null;
//     while (!stoppedEarly && totalEmailsCollected < maxEmails && pagesFetched < maxPages) {
//       const pageResp = await fetchLeadsPage(cursor);
//       pagesFetched++;

//       const leadsArray = normalizeLeadsArray(pageResp);
//       console.log(`[interested-only] Fetched page ${pagesFetched} — leads on page: ${leadsArray.length}`);

//       if (!leadsArray.length) break;

//       async function leadWorker(lead) {
//         if (stoppedEarly) return;
//         const leadId = lead?.id || lead?.lead_id || null;
//         const leadEmail = lead?.email || lead?.lead || null;
//         if (leadId) leadIdsAll.add(leadId); else if (leadEmail) leadIdsAll.add(leadEmail);

//         const remainingAllowed = Math.max(0, maxEmails - totalEmailsCollected);
//         if (remainingAllowed <= 0) { stoppedEarly = true; return; }
//         const perLeadLimit = Math.min(emailsPerLead, remainingAllowed);
//         const replies = await fetchRepliesForLead(leadId, leadEmail, perLeadLimit);

//         const interestedReplies = (replies || []).filter((e) => {
//           if (!e) return false;
//           if (typeof e.i_status === 'number' && e.i_status === 1) return true;
//           if (typeof e.ai_interest_value === 'number' && e.ai_interest_value >= aiInterestThreshold) return true;
//           const ueTypeReceived = typeof e.ue_type === 'number' ? e.ue_type === 2 : false;
//           const emailIsReceived = (e.email_type === 'received') || ueTypeReceived;
//           if (!emailIsReceived) return false;
//           return false;
//         });

//         if (interestedReplies.length > 0) {
//           interestedLeadIds.add(leadId || leadEmail);
//           for (const em of interestedReplies) {
//             if (totalEmailsCollected >= maxEmails) { stoppedEarly = true; break; }

//             // Build rawText (prefer text, fallback to stripped html/content_preview)
//             let rawText = '';
//             if (em?.body?.text) rawText = em.body.text;
//             else if (em?.body?.html) rawText = em.body.html.replace(/<\/?[^>]+(>|$)/g, '');
//             else rawText = em?.content_preview || '';

//             const { cleanedReply, cleanedSignature } = cleanEmailAndSignature(rawText);

//             // add row and collectedReplies entry
//             rows.push(mapToSheetRow({ lead, email: em, cleanedReply, cleanedSignature }));

//             collectedReplies.push({
//               _email_id: em?.id || em?.message_id || '',
//               _lead_id: lead?.id || lead?.lead_id || leadEmail || '',
//               lead_email: leadEmail || em?.lead || '',
//               thread_id: em?.thread_id || '',
//               timestamp_email: em?.timestamp_email || em?.timestamp_created || '',
//               i_status: em?.i_status ?? null,
//               ai_interest_value: em?.ai_interest_value ?? null,
//               cleanedReply,
//               cleanedSignature,
//               rawPreview: rawText,
//             });

//             totalEmailsCollected++;
//           }
//         }

//         processedLeads++;
//         if (processedLeads % 25 === 0 || totalEmailsCollected >= maxEmails) {
//           console.log(`[interested-only] Progress: processedLeads=${processedLeads}, pagesFetched=${pagesFetched}, emailsCollected=${totalEmailsCollected}/${maxEmails}`);
//         }
//       }

//       await runWithConcurrency(leadsArray, leadWorker, concurrency);

//       if (totalEmailsCollected >= maxEmails) {
//         console.log('[interested-only] Reached global maxEmails cap — stopping.');
//         stoppedEarly = true;
//         break;
//       }

//       // advance cursor or stop if no more pages
//       if (pageResp?.next_starting_after) cursor = pageResp.next_starting_after;
//       else if (pageResp?.data?.next_starting_after) cursor = pageResp.data.next_starting_after;
//       else if (pageResp?.paging?.next_cursor) cursor = pageResp.paging.next_cursor;
//       else if (pageResp?.pagination?.next_starting_after) cursor = pageResp.pagination.next_starting_after;
//       else {
//         break;
//       }
//     }

//     console.log(`[interested-only] Done: pagesFetched=${pagesFetched}, leadsChecked=${leadIdsAll.size}, rows=${rows.length}, stoppedEarly=${stoppedEarly}`);

//     return responseReturn(res, 200, {
//       total: rows.length,
//       rows,
//       emailReplies: collectedReplies, // new: actual cleaned replies returned
//       pagesFetched,
//       distinctLeadsChecked: leadIdsAll.size,
//       interestedLeadCount: interestedLeadIds.size,
//       stoppedEarly,
//       maxEmailsCap: maxEmails,
//       maxPagesCap: maxPages,
//       aiInterestThreshold,
//     });
//   } catch (err) {
//     console.error('[interested-only] Error:', err);
//     return responseReturn(res, 500, {
//       error: 'Failed to fetch interested reply emails',
//       detail: err?.message || String(err),
//     });
//   }
// };

  getInterestedRepliesOnly_ = async (req, res) => {
    try {
      const { campaignId, opts = {} } = req.body;
      const apiKey = process.env.INSTANTLY_API_KEY;

      const pageLimit = opts.pageLimit || 10;
      const emailsPerLead = opts.emailsPerLead || 10;
      const concurrency = opts.concurrency || 2;
      const maxEmails =
        typeof opts.maxEmails === "number" ? opts.maxEmails : 10;
      const maxPages = typeof opts.maxPages === "number" ? opts.maxPages : 10;
      const aiInterestThreshold =
        typeof opts.aiInterestThreshold === "number"
          ? opts.aiInterestThreshold
          : 0.6;

      if (!apiKey) throw new Error("apiKey is required");
      if (!campaignId) throw new Error("campaignId is required");

      const authHeaders = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      async function fetchLeadsPage(startingAfter = null) {
        const body = {
          filters: {
            campaign: campaignId,
            lt_interest_status: 1,
            email_reply_count: { gt: 0 },
          },
          limit: pageLimit,
        };
        if (startingAfter) body.starting_after = startingAfter;
        const r = await axios.post(`${API_BASE}${LEADS_LIST_PATH}`, body, {
          headers: authHeaders,
        });
        return r.data;
      }
      async function fetchRepliesForLead(
        leadId,
        leadEmail,
        limitOverride = emailsPerLead
      ) {
        const params = {
          campaign_id: campaignId,
          email_type: "received",
          limit: Math.min(limitOverride, emailsPerLead),
        };
        if (leadId) params.lead_id = leadId;
        else if (leadEmail) params.lead = leadEmail;

        const r = await axios.get(`${API_BASE}${EMAILS_PATH}`, {
          headers: authHeaders,
          params,
        });
        if (Array.isArray(r.data?.items)) return r.data.items;
        if (Array.isArray(r.data?.data) && !Array.isArray(r.data.data.items))
          return r.data.data;
        if (Array.isArray(r.data)) return r.data;
        if (Array.isArray(r.data?.results)) return r.data.results;
        return [];
      }
      function normalizeLeadsArray(pageResp) {
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
      }
      async function runWithConcurrency(items, worker, concurrencyLimit) {
        const results = [];
        let idx = 0;
        const runners = new Array(Math.max(1, concurrencyLimit))
          .fill(null)
          .map(async () => {
            while (true) {
              const i = idx++;
              if (i >= items.length) break;
              try {
                results[i] = await worker(items[i], i);
              } catch (err) {
                results[i] = { error: err?.message || String(err) };
              }
            }
          });
        await Promise.all(runners);
        return results;
      }

      function mapToSheetRow({ lead, email }) {
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
        const emailReply =
          emailBodyText || emailBodyHtml || email?.content_preview || "";
        let emailSignature = "";
        if (emailBodyText) {
          const parts = emailBodyText.split(/\r?\n\r?\n/);
          emailSignature = parts.slice(-2).join("\n\n");
        } else if (emailBodyHtml) {
          const stripped = emailBodyHtml.replace(/<\/?[^>]+(>|$)/g, "");
          const parts = stripped.split(/\r?\n\r?\n/);
          emailSignature = parts.slice(-2).join("\n\n");
        }
        const phoneFromEmailMatch = (emailBodyText || "").match(
          /(\+?\d{1,3}[-.\s]?)?(\(\d{2,4}\)|\d{2,4})[-.\s]?\d{3,4}[-.\s]?\d{3,4}/
        );
        const phoneFromEmail = phoneFromEmailMatch
          ? phoneFromEmailMatch[0]
          : "";
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
          _timestamp_email:
            email?.timestamp_email || email?.timestamp_created || "",
        };
      }

      // state
      const rows = [];
      const leadIdsAll = new Set();
      const interestedLeadIds = new Set();
      let totalEmailsCollected = 0;
      let pagesFetched = 0;
      let processedLeads = 0;
      let stoppedEarly = false;

      console.log(
        "[interested-only] Starting: campaign=",
        campaignId,
        "maxPages=",
        maxPages
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

        async function leadWorker(lead) {
          if (stoppedEarly) return;
          const leadId = lead?.id || lead?.lead_id || null;
          const leadEmail = lead?.email || lead?.lead || null;
          if (leadId) leadIdsAll.add(leadId);
          else if (leadEmail) leadIdsAll.add(leadEmail);

          const remainingAllowed = Math.max(
            0,
            maxEmails - totalEmailsCollected
          );
          if (remainingAllowed <= 0) {
            stoppedEarly = true;
            return;
          }
          const perLeadLimit = Math.min(emailsPerLead, remainingAllowed);
          const replies = await fetchRepliesForLead(
            leadId,
            leadEmail,
            perLeadLimit
          );

          const interestedReplies = (replies || []).filter((e) => {
            if (!e) return false;
            // i_status === 1 (Interested) OR ai_interest_value >= threshold
            if (typeof e.i_status === "number" && e.i_status === 1) return true;
            if (
              typeof e.ai_interest_value === "number" &&
              e.ai_interest_value >= aiInterestThreshold
            )
              return true;
            // fallback: prefer replies (ue_type === 2 or email_type === 'received')
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
              rows.push(mapToSheetRow({ lead, email: em }));
              totalEmailsCollected++;
            }
          }

          processedLeads++;
          if (processedLeads % 25 === 0 || totalEmailsCollected >= maxEmails) {
            console.log(
              `[interested-only] Progress: processedLeads=${processedLeads}, pagesFetched=${pagesFetched}, emailsCollected=${totalEmailsCollected}/${maxEmails}`
            );
          }
        }

        await runWithConcurrency(leadsArray, leadWorker, concurrency);

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
