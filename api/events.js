const axios = require("axios");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

module.exports = async (req, res) => {
  try {
    const tokenRes = await axios.post("https://api.competitionsuite.com/v3/oauth2/token", new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }));

    const token = tokenRes.data.access_token;

    const eventsRes = await axios.get("https://api.competitionsuite.com/v3/events", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    res.status(200).json(eventsRes.data);
  } catch (err) {
    console.error("Error fetching events:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
};
