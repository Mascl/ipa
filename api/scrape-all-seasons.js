/*
This endpoint creates a single file (events-with-groups/all-seasons.json) with an array of season objects, where each season has:
  - id
  - name
  - an array of events, and each event contains:
     - id
     - name
     - scheduleUrl
     - recapUrl
     - groups (if parsed), each with:
        - name
        - class
        - groupId (if matched)
     - error (optional, if scraping failed)
*/

const axios = require("axios");
const cheerio = require("cheerio");
const { put } = require("@vercel/blob");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

function normalizeGroupName(name) {
  return name.toLowerCase().replace(/\s*\([^)]*\)/g, "").trim();
}

async function getToken() {
  const res = await axios.post(
    "https://api.competitionsuite.com/v3/oauth2/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return res.data.access_token;
}

async function getAllSeasons(headers) {
  const res = await axios.get("https://api.competitionsuite.com/v3/seasons", { headers });
  return res.data.data.sort((a, b) => b.name.localeCompare(a.name));
}

async function getEvents(seasonId, headers) {
  const res = await axios.get(`https://api.competitionsuite.com/v3/events?seasonId=${seasonId}`, { headers });
  return res.data.data;
}

async function getEventDetails(eventId, headers) {
  const res = await axios.get(`https://api.competitionsuite.com/v3/events/${eventId}`, { headers });
  return res.data;
}

async function scrapeGroupsFromSchedule(url, groupMap) {
  const res = await axios.get(url);
  const $ = cheerio.load(res.data);
  const rows = $(".schedule-row");
  const groups = [];

  rows.each((_, el) => {
    const name = $(el).find(".schedule-row__name").text().trim();
    const cls = $(el).find(".schedule-row__initials").text().trim();
    const normalized = normalizeGroupName(name);
    const groupId = groupMap[normalized] || null;

    if (name && cls) {
      groups.push({ name, class: cls, groupId });
    }
  });

  return groups;
}

async function getGroupMapForSeason(seasonId, headers) {
  const res = await axios.get(`https://api.competitionsuite.com/v3/groups?seasonId=${seasonId}`, {
    headers
  });

  const map = {};
  for (const g of res.data) {
    map[normalizeGroupName(g.name)] = g.id;
  }
  return map;
}

module.exports = async (req, res) => {
  const { default: pLimit } = await import("p-limit");
  const limit = pLimit(3);

  try {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };

    const seasons = await getAllSeasons(headers);
    const allSeasons = [];

    for (const season of seasons) {
      const seasonId = season.id;
      const seasonName = season.name;

      try {
        const groupMap = await getGroupMapForSeason(seasonId, headers);
        const events = await getEvents(seasonId, headers);

        if (!Array.isArray(events) || events.length === 0) {
          console.log(`Skipping ${seasonName} — no events`);
          continue;
        }

        const eventData = await Promise.all(events.map(event =>
          limit(async () => {
            try {
              const detail = await getEventDetails(event.id, headers);
              const scheduleUrl = detail?.competitions?.[0]?.standardScheduleUrl || null;
              const recapUrl = detail?.competitions?.[0]?.recapUrl || null;

              let groups = [];

              if (scheduleUrl) {
                try {
                  groups = await scrapeGroupsFromSchedule(scheduleUrl, groupMap);
                } catch (err) {
                  console.warn(`❌ Error scraping schedule for event ${event.id}:`, err.message);
                }
              }

              let finalRecapUrl = recapUrl;

              if (recapUrl) {
                try {
                  const recapRes = await axios.get(recapUrl);
                  if (recapRes.data?.includes("not available")) {
                    finalRecapUrl = "";
                  }
                } catch (err) {
                  console.warn(`⚠️ Recap fetch failed for event ${event.id}:`, err.message);
                  finalRecapUrl = "";
                }
              }

              return {
                id: event.id,
                name: event.name,
                scheduleUrl,
                recapUrl: finalRecapUrl,
                groups
              };
            } catch (err) {
              return {
                id: event.id,
                name: event.name,
                scheduleUrl: null,
                recapUrl: "",
                error: err.message
              };
            }
          })
        ));

        allSeasons.push({
          id: seasonId,
          name: seasonName,
          events: eventData
        });

        console.log(`✅ Season ${seasonName} scraped`);
      } catch (err) {
        console.warn(`❌ Failed to scrape ${seasonName}:`, err.message);
      }
    }

    await put("events-with-groups/all-seasons.json", JSON.stringify(allSeasons), {
      access: "public",
      allowOverwrite: true
    });

    res.status(200).json({ message: "Scrape complete", seasons: allSeasons.length });
  } catch (err) {
    console.error("Top-level error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
};
