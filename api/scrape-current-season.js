/*
This endpoint creates a single file (current-season.json) with one season object, where each season has:
  - id
  - name
  - an array of events, and each event contains:
     - id
     - name
     - scheduleUrl
     - recapUrl
     - groups (if parsed)
     - error (optional, if scraping failed)
*/

const axios = require("axios");
const cheerio = require("cheerio");
const { put } = require("@vercel/blob");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

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

async function getMostRecentSeason(headers) {
  const res = await axios.get("https://api.competitionsuite.com/v3/seasons", { headers });
  return res.data.data.sort((a, b) => b.name.localeCompare(a.name))[0];
}

async function getEvents(seasonId, headers) {
  const res = await axios.get(`https://api.competitionsuite.com/v3/events?seasonId=${seasonId}`, { headers });
  return res.data.data;
}

async function getEventDetails(eventId, headers) {
  const res = await axios.get(`https://api.competitionsuite.com/v3/events/${eventId}`, { headers });
  return res.data;
}

async function scrapeGroupsFromSchedule(url) {
  const res = await axios.get(url);
  const $ = cheerio.load(res.data);
  const rows = $(".schedule-row");
  const groups = [];

  rows.each((_, el) => {
    const name = $(el).find(".schedule-row__name").text().trim();
    const cls = $(el).find(".schedule-row__initials").text().trim();
    if (name && cls) groups.push({ name, class: cls });
  });

  return groups;
}

async function getGroupMapForSeason(seasonId, headers) {
  const res = await axios.get(`https://api.competitionsuite.com/v3/groups?seasonId=${seasonId}`, { headers });
  const map = {};
  for (const group of res.data.data) {
    map[group.name.trim().toLowerCase()] = group.id;
  }
  return map;
}

async function checkRecapUrl(url) {
  try {
    const res = await axios.get(url);
    return res.data.includes("not available") ? "" : url;
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

    const season = await getMostRecentSeason(headers);
    const events = await getEvents(season.id, headers);
    const groupMap = await getGroupMapForSeason(season.id, headers);

    const eventResults = await Promise.all(events.map(event =>
      limit(async () => {
        try {
          const detail = await getEventDetails(event.id, headers);
          const scheduleUrl = detail?.competitions?.[0]?.standardScheduleUrl;
          const recapUrlRaw = detail?.competitions?.[0]?.recapUrl || "";
          const recapUrl = recapUrlRaw ? await checkRecapUrl(recapUrlRaw) : "";

          if (!scheduleUrl) throw new Error("Missing standardScheduleUrl");

          const groups = await scrapeGroupsFromSchedule(scheduleUrl);
          const enrichedGroups = groups.map(g => ({
            ...g,
            groupId: groupMap[g.name.toLowerCase().replace(/ \(.*\)$/, "")] || null
          }));

          return {
            id: event.id,
            name: event.name,
            scheduleUrl,
            recapUrl,
            groups: enrichedGroups
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

    const payload = [
      {
        id: season.id,
        name: season.name,
        events: eventResults
      }
    ];

    const { url } = await put("current-season.json", JSON.stringify(payload), {
      access: "public",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      allowOverwrite: true
    });

    res.status(200).json({ message: "Scraped current season", blobUrl: url });
  } catch (err) {
    console.error("Top-level error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
};
