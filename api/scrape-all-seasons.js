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
  const limit = pLimit(3);

  const updated = [];
  const skipped = [];

  try {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };

    const seasons = await getAllSeasons(headers);

    for (const season of seasons) {
      const seasonId = season.id;
      const seasonName = season.name;

      try {
        const events = await getEvents(seasonId, headers);
        if (!Array.isArray(events) || events.length === 0) {
          console.log(`Skipping ${seasonName} — no events`);
          skipped.push(seasonName);
          continue;
        }

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

        const filename = `events-with-groups/${seasonName}.json`;
        await put(filename, JSON.stringify(results), {
          access: "public"
        });

        console.log(`✅ Scraped and saved: ${seasonName}`);
        updated.push(seasonName);
      } catch (err) {
        console.warn(`❌ Failed to scrape ${seasonName}:`, err.message);
        skipped.push(seasonName);
      }
    }

    res.status(200).json({ updated, skipped });
  } catch (err) {
    console.error("Top-level error:", err.message);
    res.status(500).json({ error: "Scraping failed", updated, skipped });
  }
};
