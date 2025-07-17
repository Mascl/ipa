/*
This endpoint creates a single file (events-with-groups/all-seasons.json) with an array of season objects, where each season has:
  - id
  - name
  - an array of events, and each event contains:
     - id
     - name
     - scheduleUrl
     - recapUrl
     - groups (if parsed), with groupId included where matched
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
      client_secret: CLIENT_SECRET,
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

async function getGroups(seasonId, headers) {
  const res = await axios.get(`https://api.competitionsuite.com/v3/groups?seasonId=${seasonId}`, { headers });
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
    const $ = cheerio.load(res.data);
    const bodyText = $("body").text();
    return bodyText.includes("not available") ? "" : url;
  } catch {
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
      try {
        const seasonId = season.id;
        const seasonName = season.name;

        const events = await getEvents(seasonId, headers);
        if (!Array.isArray(events) || events.length === 0) {
          console.log(`Skipping ${seasonName} — no events`);
          continue;
        }

        const groupList = await getGroups(seasonId, headers);
        const groupMap = new Map(
          groupList.map(g => [g.name.toLowerCase(), g.id])
        );

        const eventResults = await Promise.all(
          events.map(event =>
            limit(async () => {
              try {
                const detail = await getEventDetails(event.id, headers);
                const competition = detail?.competitions?.[0];
                const scheduleUrl = competition?.standardScheduleUrl || null;
                const recapUrlRaw = competition?.recapUrl || "";
                const recapUrl = recapUrlRaw ? await checkRecapUrl(recapUrlRaw) : "";

                let groups = [];

                if (scheduleUrl) {
                  const scrapedGroups = await scrapeGroupsFromSchedule(scheduleUrl);
                  groups = scrapedGroups.map(g => ({
                    ...g,
                    groupId: groupMap.get(g.name.toLowerCase()) || null,
                  }));
                }

                return {
                  id: event.id,
                  name: event.name,
                  scheduleUrl,
                  recapUrl,
                  groups,
                };
              } catch (err) {
                return {
                  id: event.id,
                  name: event.name,
                  scheduleUrl: null,
                  recapUrl: "",
                  error: err.message,
                };
              }
            })
          )
        );

        seasonsOutput.push({
          id: seasonId,
          name: seasonName,
          events: eventResults,
        });

        console.log(`✅ Scraped: ${seasonName}`);
      } catch (err) {
        console.warn(`❌ Failed to process season ${season.name}:`, err.message);
      }
    }

    const { url } = await put("events-with-groups/all-seasons.json", JSON.stringify(seasonsOutput), {
      access: "public",
      allowOverwrite: true
    });

    res.status(200).json({ message: "Scrape complete", blobUrl: url });
  } catch (err) {
    console.error("Top-level error:", err.message);
    res.status(500).json({ error: "Scraping failed" });
  }
};
