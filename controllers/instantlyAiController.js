const { responseReturn } = require("../utils/response");
require("dotenv").config({ silent: true });
// const fetch = require("node-fetch");

const BASE_URL = "https://api.instantly.ai/api/v2/campaigns";
const BASE_URL_LEADS = "https://api.instantly.ai/api/v2/";
const PAGE_SIZE = 100;

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
  getRepliedInterestedLeads = async (req, res) => {
    try {
      const { campaignId } = req.body;

      if (!campaignId) {
        return responseReturn(res, 400, {
          error: "campaignId is required",
        });
      }

      const headers = {
        Authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`,
        "Content-Type": "application/json",
      };

      let emails = [];
      let cursor = null;

      do {
        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          "campaign_ids[]": campaignId,
          direction: "inbound", // only incoming mails
          is_reply: "true", // guaranteed replies
        });

        if (cursor) params.set("starting_after", cursor);

        const resp = await fetch(
          `https://api.instantly.ai/api/v2/emails?${params}`,
          { headers }
        );

        if (!resp.ok) {
          const text = await resp.text();
          return responseReturn(res, resp.status, {
            error: `Failed to fetch reply emails: ${resp.status} ${text}`,
          });
        }

        const { items = [], next_starting_after } = await resp.json();
        emails = emails.concat(items);
        cursor = next_starting_after || null;
      } while (cursor);

      responseReturn(res, 200, {
        total: emails.length,
        emails,
      });
    } catch (err) {
      console.error("Error fetching reply emails:", err.message);
      responseReturn(res, 500, { error: "Failed to fetch reply emails" });
    }
  };
}

module.exports = new instantlyAiController();
