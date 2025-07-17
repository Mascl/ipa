const axios = require("axios");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

function normalizeGroupName(name) {
  return name.toLowerCase().replace(/\s*\([^)]*\)/g, "").trim();
}

module.exports = async (req, res) => {
  const seasonId = req.query.seasonId;
  if (!seasonId) {
    return res.status(400).json({ error: "Missing seasonId query param" });
  }

  try {
    // Get token
    const tokenRes = await axios.post(
      "https://api.competitionsuite.com/v3/oauth2/token",
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    const token = tokenRes.data.access_token;

    // Get groups
    const groupRes = await axios.get(
      `https://api.competitionsuite.com/v3/groups?seasonId=${seasonId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const groupMap = {};
    for (const g of groupRes.data.data) {
      groupMap[normalizeGroupName(g.name)] = g.id;
    }

    res.status(200).json(groupMap);
  } catch (err) {
    console.error("Debug group map error:", {
      message: err.message,
      status: err.response?.status,
      data: err.response?.data,
    });
    res.status(500).json({ error: "Failed to load group map" });
  }
};
