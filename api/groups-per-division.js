const axios = require("axios");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

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

    const groupsRes = await axios.get("https://api.competitionsuite.com/v3/groups", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const groups = groupsRes.data.data;

    // Group by division.name
    const grouped = {};
    for (const group of groups) {
      const divName = group.division?.name || "Uncategorized";
      if (!grouped[divName]) grouped[divName] = [];
      grouped[divName].push(group);
    }

    res.status(200).json({ grouped });
  } catch (err) {
    console.error("Error fetching groups:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data
    });
    res.status(500).json({ error: "Failed to fetch groups" });
  }
};
