console.log("🟡 /api/events.js function triggered");

const axios = require("axios");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const CIRCUIT_ID = process.env.CIRCUIT_ID; // <-- Set this in Vercel's Environment Variables

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "no-store");

  if (!CIRCUIT_ID) {
    return res.status(500).json({ error: "Missing CIRCUIT_ID environment variable" });
  }

  try {
    const tokenRes = await axios.post(
      "https://api.competitionsuite.com/v3/oauth2/token",
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      })
    );

    const token = tokenRes.data.access_token;

    const eventsRes = await axios.get(
      `https://api.competitionsuite.com/v3/circuits/${CIRCUIT_ID}/events`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log("Fetched events:", eventsRes.data);
    res.status(200).json(eventsRes.data);
  } catch (err) {
    console.error("Error fetching events:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
    });
    res.status(500).json({ error: "Failed to fetch events" });
  }
};
