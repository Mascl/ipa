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

    const response = await axios.get("https://api.competitionsuite.com/v3/seasons", { headers });

    res.status(200).json({
      data: response.data.data // <- you always access .data.data for arrays
    });
  } catch (err) {
    console.error("Error fetching seasons:", err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json({
      error: "Failed to fetch seasons",
      details: err?.response?.data || err.message
    });
  }
};
