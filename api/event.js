// /api/event.js

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
  const { id } = req.query;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Cache-Control", "no-store");

  if (!id) {
    return res.status(400).json({ error: "Missing event ID" });
  }

  try {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };

    const eventRes = await axios.get(
      `https://api.competitionsuite.com/v3/events/${id}`,
      { headers }
    );

    res.status(200).json({ data: eventRes.data });
  } catch (err) {
    console.error("Error fetching event:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
    });

    res.status(err.response?.status || 500).json({ error: "Failed to fetch event" });
  }
};
