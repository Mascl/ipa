const axios = require("axios");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const groupId = req.query.id;
  if (!groupId) {
    return res.status(400).json({ error: "Missing group ID" });
  }

  try {
    const tokenRes = await axios.post("https://api.competitionsuite.com/v3/oauth2/token", new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }));

    const token = tokenRes.data.access_token;

    const eventsRes = await axios.get(`https://api.competitionsuite.com/v3/groups/${groupId}/events`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    res.status(200).json(eventsRes.data);
  } catch (err) {
    console.error("Error fetching group events:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
    });
    res.status(500).json({ error: "Failed to fetch group events" });
  }
};
