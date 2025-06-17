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

    const seasonsRes = await axios.get("https://api.competitionsuite.com/v3/seasons", { headers });
    const seasons = seasonsRes.data.data.slice(0, 1);

    const eventsBySeason = await Promise.all(
      seasons.map(async season => {
        const evRes = await axios.get(
          `https://api.competitionsuite.com/v3/events?seasonId=${season.id}`,
          { headers }
        );
        const events = evRes.data.data;

        const enriched = await Promise.all(events.map(async e => {
          try {
            const compsRes = await axios.get(
              `https://api.competitionsuite.com/v3/events/${e.id}/competitions`,
              { headers }
            );
            const comps = compsRes.data;
            if (!Array.isArray(comps) || comps.length === 0) {
              return { id: e.id, name: e.name, location: e.location, season: season.name, date: null };
            }

            const comp = comps[0];
            const schedRes = await axios.get(
              `https://api.competitionsuite.com/v3/events/${e.id}/competitions/${comp.id}/schedule`,
              { headers }
            );

            console.log(`Event ${e.id} – comps: ${comps.length}`);
            console.log(`Schedule for comp ${comp.id}:`, schedRes.data);

            const times = schedRes.data.map(s => s.start_time);
            const date = times.length ? times.sort()[0] : null;

            return {
              id: e.id,
              name: e.name,
              location: e.location,
              season: season.name,
              date
            };
          } catch (err) {
            console.warn(`Error loading data for event ${e.id}: ${err.message}`);
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
