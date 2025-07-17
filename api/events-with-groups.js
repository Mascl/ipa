const { get } = require("@vercel/blob");

module.exports = async (req, res) => {
  const seasonId = req.query.seasonId || "2025"; // Default to current

  const filename = `events-with-groups/${seasonId}.json`;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  try {
    const { url } = await get(filename);

    if (!url) {
      return res.status(404).json({ error: `No data found for season ${seasonId}` });
    }

    const blobRes = await fetch(url);
    const data = await blobRes.json();

    res.status(200).json(data);
  } catch (err) {
    console.error("Blob read error:", err.message);
    res.status(500).json({ error: `Failed to load cached data for season ${seasonId}` });
  }
};
