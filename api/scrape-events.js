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

module.exports = async (req, res) => {
  const { default: pLimit } = await import("p-limit");

  try {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };

    let seasonId = req.query.seasonId;
    let seasonName = "";

    if (seasonId) {
      const seasonRes = await axios.get(
        `https://api.competitionsuite.com/v3/seasons/${seasonId}`,
        { headers }
      );
      seasonName = seasonRes.data.name;
    } else {
      const mostRecent = await getMostRecentSeason(headers);
      seasonId = mostRecent.id;
      seasonName = mostRecent.name;
    }

    const events = await getEvents(seasonId, headers);
    const limit = pLimit(3);

    const results = await Promise.all(events.map(event =>
      limit(async () => {
        try {
          const detail = await getEventDetails(event.id, headers);
          const scheduleUrl = detail?.competitions?.[0]?.standardScheduleUrl;
          if (!scheduleUrl) throw new Error("Missing standardScheduleUrl");

          const groups = await scrapeGroupsFromSchedule(scheduleUrl);

          return {
            id: event.id,
            name: event.name,
            url: scheduleUrl,
            groups
          };
        } catch (err) {
          return {
            id: event.id,
            name: event.name,
            url: null,
            error: err.message
          };
        }
      })
    ));

    // Use season name for the filename
    const filename = `events-with-groups/${seasonName}.json`;
    const { url } = await put(filename, JSON.stringify(results), {
      access: "public"
    });

    res.status(200).json({ message: `Scraped ${seasonName}`, blobUrl: url });
  } catch (err) {
    console.error("Scrape error:", err.message);
    res.status(500).json({ error: "Scrape failed" });
  }
};
