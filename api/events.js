const axios = require("axios");

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
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }
  );
  return res.data.access_token;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "no-store");

  try {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };
    const seasonId = req.query.id;

    let seasons = [];

    if (seasonId) {
      // Use manually requested season
      const seasonRes = await axios.get(
        `https://api.competitionsuite.com/v3/seasons/${seasonId}`,
        { headers }
      );
      seasons = [seasonRes.data];
    } else {
      // Default: use most recent season
      const seasonsRes = await axios.get("https://api.competitionsuite.com/v3/seasons", { headers });
      seasons = seasonsRes.data.data
        .sort((a, b) => b.name.localeCompare(a.name))
        .slice(0, 1);
    }

    const eventsBySeason = await Promise.all(
      seasons.map(async season => {
        const evRes = await axios.get(
          `https://api.competitionsuite.com/v3/events?seasonId=${season.id}`,
          { headers }
        );
        const events = evRes.data.data;

        const enriched = await Promise.all(events.map(async e => {
          try {
            const eventDetailRes = await axios.get(
              `https://api.competitionsuite.com/v3/events/${e.id}`,
              { headers }
            );

            const eventDetail = eventDetailRes?.data;

            if (!eventDetail || !Array.isArray(eventDetail.competitions)) {
              throw new Error("Missing or malformed event.competitions");
            }

            const firstComp = eventDetail.competitions[0];
            const date = firstComp?.date ?? null;

            return {
              id: e.id,
              name: e.name,
              location: e.location,
              season: season.name,
              date
            };
          } catch (err) {
            console.warn(`Error loading event ${e.id}`, err.response?.data || err.message);
            return {
              id: e.id,
              name: e.name,
              location: e.location,
              season: season.name,
              date: null
            };
          }
        }));

        return enriched;
      })
    );

    const allEvents = eventsBySeason.flat();
    allEvents.sort((a, b) => {
      if (a.season !== b.season) return a.season.localeCompare(b.season);
      return (a.date || "").localeCompare(b.date || "");
    });

    res.status(200).json({ data: allEvents });
  } catch (err) {
    console.error("Error fetching events:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
    });

    res.status(500).json({ error: "Failed to fetch events" });
  }
};
