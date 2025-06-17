const axios = require("axios");

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

module.exports = async (req, res) => {
  const token = await getToken();
  const headers = { Authorization: `Bearer ${token}` };

  const seasonsRes = await axios.get("https://api.competitionsuite.com/v3/seasons", { headers });
  const seasons = seasonsRes.data;

  const eventsBySeason = await Promise.all(
    seasons.map(async season => {
      const ev = await axios.get(
        `https://api.competitionsuite.com/v3/events?seasonId=${season.id}`,
        { headers }
      );
      const enriched = await Promise.all(ev.data.map(async e => {
        const compsRes = await axios.get(
          `https://api.competitionsuite.com/v3/events/${e.id}/competitions`,
          { headers }
        );
        const comp = compsRes.data[0]; // pick first competition
        const sched = await axios.get(
          `https://api.competitionsuite.com/v3/events/${e.id}/competitions/${comp.id}/schedule`,
          { headers }
        );
        const times = sched.data.map(s => s.start_time);
        const date = times.length ? times.sort()[0] : null;
        return { id: e.id, name: e.name, location: e.location, season: season.name, date };
      }));
      return enriched;
    })
  );

  const all = eventsBySeason.flat();
  all.sort((a, b) => a.date?.localeCompare(b.date) || 0);

  res.status(200).json(all);
};
