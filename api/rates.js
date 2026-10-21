// GET /api/rates?from=USD&to=IDR
// Same-origin proxy for frankfurter.dev (their API sends no CORS headers,
// so browsers block direct calls). 6h edge cache keeps it fast and cheap.
const UPSTREAM = "https://api.frankfurter.dev/v1/latest";
const CODE = /^[A-Z]{3}$/;

module.exports = async function handler(req, res) {
  const from = String(req.query.from || "").toUpperCase();
  const to = String(req.query.to || "").toUpperCase();
  if (!CODE.test(from) || !CODE.test(to)) {
    res.status(400).json({ error: "invalid currency pair" });
    return;
  }
  try {
    const r = await fetch(
      UPSTREAM + "?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to),
      { headers: { "User-Agent": "micro-tools-hub/1.0" } }
    );
    if (!r.ok) throw new Error("upstream " + r.status);
    const data = await r.json();
    res.setHeader("Cache-Control", "public, s-maxage=21600, max-age=3600");
    res.status(200).json(data);
  } catch (e) {
    res.status(502).json({ error: "rates unavailable" });
  }
};
