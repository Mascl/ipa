/*
This endpoint creates a single file (events-with-groups/all-seasons.json) with an array of season objects, where each season has:
  - id
  - name
  - an array of events, and each event contains:
     - id
     - name
     - scheduleUrl
     - recapUrl
     - groups (if parsed), each with name, class, and groupId
     - error (optional, if scraping failed)
*/

const axios = require("axios");
const cheerio = require("cheerio");
const { put } = require("@vercel/blob");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

function normalizeGroupName(name) {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
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

async function getGroupMapForSeason(seasonId, headers) {
  const res = await axios.get(`https://api.competitionsuite.com/v3/groups?seasonId=${seasonId}`, { headers });
  console.log(res.data.data);
  const map = {};
  for (const g of res.data.data) {
    map[normalizeGroupName(g.name)] = g.id;
  }
  return map;
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
    if (name && cls) groups.push({ name, class: cls, groupId });
  });

  return groups;
}

async function getRecapUrl(eventId) {
  const url = `https://recaps.competitionsuite.com/${eventId}.htm`;
  try {
    const res = await axios.get(url);
    if (res.data.includes("not available")) return "";
    return url;
  } catch (err) {
    return "";
  }
}

module.exports = async (req, res) => {
  const { default: pLimit } = await import("p-limit");
  const limit = pLimit(3);
  const seasonsOutput = [];

  try {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };
    const seasons = await getAllSeasons(headers);

    for (const season of seasons) {
      const { id: seasonId, name: seasonName } = season;
      try {
        const events = await getEvents(seasonId, headers);
        if (!Array.isArray(events) || events.length === 0) continue;

        const groupMap = await getGroupMapForSeason(seasonId, headers);

        const processed = await Promise.all(events.map(event =>
          limit(async () => {
            try {
              const detail = await getEventDetails(event.id, headers);
              const scheduleUrl = detail?.competitions?.[0]?.standardScheduleUrl || null;
              const recapUrl = await getRecapUrl(event.id);

              const groups = scheduleUrl
                ? await scrapeGroupsFromSchedule(scheduleUrl, groupMap)
                : [];

              return {
                id: event.id,
                name: event.name,
                scheduleUrl,
                recapUrl,
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

        seasonsOutput.push({
          id: seasonId,
          name: seasonName,
          events: processed
        });
      } catch (err) {
        console.warn(`❌ Failed to scrape season ${seasonName}:`, err.message);
      }
    }

    const blobHeader = `/*
This endpoint creates a single file (events-with-groups/all-seasons.json) with an array of season objects, where each season has:
  - id
  - name
  - an array of events, and each event contains:
     - id
     - name
     - scheduleUrl
     - recapUrl
     - groups (if parsed), each with name, class, and groupId
     - error (optional, if scraping failed)
*/\n`;

    await put("events-with-groups/all-seasons.json", JSON.stringify(seasonsOutput), {
      access: "public",
      allowOverwrite: true
    });

    res.status(200).json({ message: "Scrape complete", seasons: seasonsOutput.length });
  } catch (err) {
    console.error("Top-level error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
};
