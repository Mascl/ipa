const axios = require("axios");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

module.exports = async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing event ID" });
  }

  try {
    // 1. Get an access token
    const tokenResponse = await axios.post("https://api.competitionsuite.com/oauth/token", {
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    });

    const accessToken = tokenResponse.data.access_token;

    // 2. Fetch the event data
    const eventResponse = await axios.get(`https://api.competitionsuite.com/v3/events/${id}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    return res.status(200).json({ data: eventResponse.data });
  } catch (error) {
    console.error("Error fetching event:", error?.response?.data || error.message);

    return res.status(error?.response?.status || 500).json({
      error: error?.response?.data || "Failed to fetch event"
    });
  }
};
