/*
This endpoint creates a single file (current-season.json) with an array containing the most recent season object. Each season has:
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
  const seasons = res.data.data.sort((a, b) => b.name.localeCompare(a.name));
  return seasons[0];
}

async function getGroupsForSeason(seasonId, headers) {
  const res = await axios.get(`https://api.competitionsuite.com/v3/groups?seasonId=${seasonId}`, { headers });
  const map = {};
  res.data.data.forEach(group => {
    const normalizedName = group.name.toLowerCase().replace(/\s+/g, " ").trim();
    map[normalizedName] = group.id;
  });
  return map;
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

async function checkRecapUrl(url) {
  try {
    const res = await axios.get(url);
    const isUnavailable = res.data.includes("not available");
    return isUnavailable ? "" : url;
  } catch (err) {
    return "";
  }
}

module.exports = async (req, res) => {
  const { default: pLimit } = await import("p-limit");
  const limit = pLimit(3);

  const updated = [];
  const skipped = [];

  try {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };

    const season = await getMostRecentSeason(headers);
    const seasonId = season.id;
    const seasonName = season.name;
    const allData = [];

    try {
      const events = await getEvents(seasonId, headers);
      if (!Array.isArray(events) || events.length === 0) {
        skipped.push(seasonName);
      } else {
        const groupMap = await getGroupsForSeason(seasonId, headers);

        const results = await Promise.all(events.map(event =>
          limit(async () => {
            try {
              const detail = await getEventDetails(event.id, headers);
              const scheduleUrl = detail?.competitions?.[0]?.standardScheduleUrl || null;
              const recapUrlRaw = detail?.competitions?.[0]?.recapUrl || null;
              const recapUrl = recapUrlRaw ? await checkRecapUrl(recapUrlRaw) : "";

              let groups = [];
              if (scheduleUrl) {
                const parsed = await scrapeGroupsFromSchedule(scheduleUrl);
                groups = parsed.map(g => {
                  const normalizedName = g.name.toLowerCase().replace(/\s+/g, " ").trim();
                  const groupId = groupMap[normalizedName] || null;
                  return { ...g, groupId };
                });
              }

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
                recapUrl: null,
                error: err.message
              };
            }
          })
        ));

        allData.push({ id: seasonId, name: seasonName, events: results });
        updated.push(seasonName);
      }
    } catch (err) {
      skipped.push(seasonName);
    }

    await put("current-season.json", JSON.stringify(allData), {
      access: "public",
      allowOverwrite: true
    });

    res.status(200).json({ updated, skipped });
  } catch (err) {
    res.status(500).json({ error: "Scraping failed", updated, skipped });
  }
};
