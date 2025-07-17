/*
This endpoint creates a single file (events-with-groups/all-seasons.json) with an array of season objects, where each season has:
  - id
  - name
  - an array of events, and each event contains:
     - id
     - name
     - scheduleUrl
     - recapUrl
     - groups (if parsed), each with name, class, and optional groupId
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
  return res.data.data.sort((a, b) => b.name.localeCompare(a.name)); // most recent first
}

async function getEvents(seasonId, headers) {
  const res = await axios.get(`https://api.competitionsuite.com/v3/events?seasonId=${seasonId}`, { headers });
  return res.data.data;
}

async function getEventDetails(eventId, headers) {
  const res = await axios.get(`https://api.competitionsuite.com/v3/events/${eventId}`, { headers });
  return res.data;
}

async function getSeasonGroups(seasonId, headers) {
  const res = await axios.get(`https://api.competitionsuite.com/v3/groups?seasonId=${seasonId}`, { headers });
  return res.data.data;
}

async function scrapeGroupsFromSchedule(url, groupMap) {
  const res = await axios.get(url);
  const $ = cheerio.load(res.data);
  const rows = $(".schedule-row");
  const groups = [];

  rows.each((_, el) => {
    const nameRaw = $(el).find(".schedule-row__name").text().trim();
    const cls = $(el).find(".schedule-row__initials").text().trim();
    const normName = normalizeGroupName(nameRaw);
    const groupId = groupMap[normName];

    if (nameRaw && cls) {
      groups.push({ name: nameRaw, class: cls, ...(groupId && { groupId }) });
    }
  });

  return groups;
}

async function getRecapUrl(competitions = []) {
  const recapUrl = competitions[0]?.recapUrl;
  if (!recapUrl) return "";

  try {
    const res = await axios.get(recapUrl);
    if (res.data.includes("not available")) return "";
    return recapUrl;
  } catch {
    return "";
  }
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
        const events = await getEvents(seasonId, headers);
        if (!events.length) continue;

        const groupsFromApi = await getSeasonGroups(seasonId, headers);
        const groupMap = {};
        for (const g of groupsFromApi) {
          groupMap[normalizeGroupName(g.name)] = g.id;
        }

        const enriched = await Promise.all(events.map(event =>
          limit(async () => {
            try {
              const detail = await getEventDetails(event.id, headers);
              const scheduleUrl = detail?.competitions?.[0]?.standardScheduleUrl || null;
              const recapUrl = await getRecapUrl(detail?.competitions || []);
              const groups = scheduleUrl
                ? await scrapeGroupsFromSchedule(scheduleUrl, groupMap)
                : [];

              return {
                id: event.id,
                name: event.name,
                scheduleUrl,
                recapUrl,
                ...(groups.length ? { groups } : {})
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
          events: enriched
        });
      } catch (err) {
        console.warn(`Skipping ${seasonName}:`, err.message);
      }
    }

    await put("events-with-groups/all-seasons.json", JSON.stringify(allSeasons), {
      access: "public",
      allowOverwrite: true
    });

    res.status(200).json({ message: "Scraped all seasons and stored in blob", count: allSeasons.length });
  } catch (err) {
    console.error("Top-level error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
};
