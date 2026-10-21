// GET /api/dl?platform=<name>&url=<encoded>
// Same-origin proxy for downloader upstreams (avoids CORS issues and gives
// one normalized envelope). No API keys needed for any platform here.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function get(url, opts) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8500);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, ...(opts && opts.headers) },
      signal: ctrl.signal,
      redirect: "follow",
    });
    return r;
  } finally {
    clearTimeout(t);
  }
}
const ok = (title, thumbnail, media) => ({ ok: true, title, thumbnail, media });
const fail = (error) => ({ ok: false, error });
const unesc = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&#0?39;/g, "'").replace(/&quot;/g, '"');

async function tiktok(url) {
  const r = await get("https://www.tikwm.com/api/?url=" + encodeURIComponent(url) + "&hd=1");
  if (!r.ok) throw new Error("tiktok upstream " + r.status);
  const j = await r.json();
  if (j.code !== 0 || !j.data) throw new Error("video not found");
  const d = j.data;
  const media = [];
  const hd = d.hdplay;
  const play = hd || d.play || d.wmplay;
  // Photo posts: tikwm puts the MUSIC file in play/hdplay (same URL as
  // d.music, mime_type=audio_mpeg). Never offer it as a video.
  const playIsAudio = !!play && (play === d.music || /mime_type=audio/i.test(play));
  if (play && !playIsAudio) media.push({ url: play, label: hd ? "Video HD (no watermark)" : "Video (no watermark)", type: "video" });
  if (d.music) media.push({ url: d.music, label: "Audio (MP3)", type: "audio" });
  (d.images || []).forEach((src, i) => media.push({ url: src, label: "Photo " + (i + 1), type: "image" }));
  if (!media.length) throw new Error("no downloadable media found");
  const author = d.author && d.author.unique_id ? "@" + d.author.unique_id : "tiktok";
  const title = unesc(d.title) || (author + " video" + (d.id ? " " + d.id : ""));
  return ok(title, d.cover, media);
}

async function twitter(url) {
  const m = String(url).match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/i);
  if (!m) throw new Error("not a valid tweet URL");
  const r = await get("https://api.fxtwitter.com/status/" + m[1]);
  if (!r.ok) throw new Error("tweet not found");
  const j = await r.json();
  const tw = j.tweet;
  if (!tw) throw new Error("tweet not found");
  const media = [];
  (tw.media?.videos || []).forEach((v) => {
    const mp4s = (v.variants || []).filter((x) => (x.content_type || "").includes("mp4") && x.url);
    mp4s.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    if (mp4s[0]) media.push({ url: mp4s[0].url, label: "Video" + (mp4s[0].bitrate ? " (" + Math.round(mp4s[0].bitrate / 1000) + "k)" : ""), type: "video" });
  });
  (tw.media?.photos || []).forEach((p, i) => media.push({ url: p.url, label: "Photo " + (i + 1), type: "image" }));
  if (!media.length) throw new Error("no media in this tweet");
  return ok(unesc(tw.text || "X post").slice(0, 120), tw.media?.photos?.[0]?.url || null, media);
}

async function pinterest(url) {
  if (!/pinterest\./i.test(url)) throw new Error("not a Pinterest URL");
  const r = await get(url);
  if (!r.ok) throw new Error("pin not found");
  const h = await r.text();
  const img = h.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
  const ttl = h.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
  if (!img) throw new Error("image not found");
  return ok(unesc(ttl && ttl[1]) || "Pinterest pin", unesc(img[1]), [
    { url: unesc(img[1]), label: "Full image", type: "image" },
  ]);
}

async function reddit(url) {
  let u = String(url).split(/[?#]/)[0].replace(/\/$/, "");
  if (!/reddit\.com/i.test(u)) throw new Error("not a Reddit URL");
  const r = await get(u + ".json", { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error("post not found");
  const j = await r.json();
  const post = j?.[0]?.data?.children?.[0]?.data;
  if (!post) throw new Error("post not found");
  const media = [];
  if (post.is_video && post.media?.reddit_video?.fallback_url)
    media.push({ url: unesc(post.media.reddit_video.fallback_url), label: "Video (no audio)", type: "video" });
  const src = post.preview?.images?.[0]?.source;
  if (src?.url) media.push({ url: unesc(src.url), label: "Image (" + src.width + "x" + src.height + ")", type: "image" });
  if (post.url_overridden_by_dest && /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url_overridden_by_dest))
    media.push({ url: unesc(post.url_overridden_by_dest), label: "Direct image", type: "image" });
  if (!media.length) throw new Error("no media in this post");
  return ok(unesc(post.title) || "Reddit post", src ? unesc(src.url) : null, media);
}

async function streamable(url) {
  const m = String(url).match(/streamable\.com\/([a-z0-9]+)/i);
  if (!m) throw new Error("not a Streamable URL");
  const r = await get("https://api.streamable.com/videos/" + m[1].toLowerCase());
  if (!r.ok) throw new Error("video not found");
  const j = await r.json();
  const files = j.files || {};
  const media = [];
  if (files["mp4"]?.url) media.push({ url: "https:" + files["mp4"].url, label: "Video (MP4)", type: "video" });
  if (files["mp4-mobile"]?.url) media.push({ url: "https:" + files["mp4-mobile"].url, label: "Video (mobile)", type: "video" });
  if (!media.length) throw new Error("no downloadable file");
  return ok(unesc(j.title) || "Streamable video", j.thumbnail_url ? "https:" + j.thumbnail_url : null, media);
}

async function podcast(url) {
  const r = await get(url);
  if (!r.ok) throw new Error("feed not reachable");
  const xml = await r.text();
  if (!/<rss|<feed/i.test(xml)) throw new Error("not a valid podcast RSS feed");
  const chanTitle = (xml.match(/<channel>[\s\S]*?<title>([^<]+)<\/title>/i) || [])[1];
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && items.length < 50) {
    const body = m[1];
    const t = (body.match(/<title>([^<]+)<\/title>/i) || [])[1];
    const enc = body.match(/<enclosure[^>]+url="([^"]+)"/i);
    if (t && enc) items.push({ url: unesc(enc[1]), label: unesc(t).slice(0, 90), type: "audio" });
  }
  if (!items.length) throw new Error("no episodes found");
  return ok(unesc(chanTitle) || "Podcast", null, items);
}

async function wikimedia(url) {
  const m = String(url).match(/commons\.wikimedia\.org\/wiki\/File:([^?#]+)/i);
  if (!m) throw new Error("paste a Wikimedia Commons file page URL");
  const title = "File:" + decodeURIComponent(m[1]).replace(/_/g, " ");
  const api =
    "https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url%7Csize%7Cmime&titles=" +
    encodeURIComponent(title);
  const r = await get(api);
  if (!r.ok) throw new Error("wikimedia api error");
  const j = await r.json();
  const pages = j.query?.pages || {};
  const info = Object.values(pages)[0]?.imageinfo?.[0];
  if (!info?.url) throw new Error("file not found");
  return ok(title.replace(/^File:/, ""), info.thumburl || info.url, [
    { url: info.url, label: "Original (" + (info.width || "?") + "x" + (info.height || "?") + ")", type: info.mime?.startsWith("video") ? "video" : "image" },
  ]);
}

async function font(name) {
  const fam = String(name).trim().replace(/\s+/g, "+");
  if (!/^[A-Za-z0-9+ ]+$/.test(String(name).trim())) throw new Error("enter a font family name");
  const r = await get("https://fonts.googleapis.com/css2?family=" + encodeURIComponent(fam) + ":wght@400;700", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" },
  });
  if (!r.ok) throw new Error("font not found");
  const css = await r.text();
  const media = [];
  const blocks = css.split("/* ");
  for (const b of blocks) {
    const weight = (b.match(/font-weight:\s*(\d+)/) || [])[1];
    const src = (b.match(/url\((https:[^)]+\.woff2)\)/) || [])[1];
    if (weight && src && !media.some((x) => x.label.includes(weight)))
      media.push({ url: src, label: "Weight " + weight + " (WOFF2)", type: "font" });
  }
  if (!media.length) throw new Error("font not found");
  return ok("Google Font: " + String(name).trim(), null, media);
}

const HANDLERS = { tiktok, twitter, pinterest, reddit, streamable, podcast, wikimedia, font };

module.exports = async function handler(req, res) {
  const platform = String(req.query.platform || "").toLowerCase();
  const url = String(req.query.url || "").slice(0, 2000);
  const fn = HANDLERS[platform];
  if (!fn || !url) {
    res.status(400).json(fail("invalid platform or url"));
    return;
  }
  if (!/^https?:\/\//i.test(url) && platform !== "font") {
    res.status(400).json(fail("url must start with http(s)://"));
    return;
  }
  try {
    const data = await fn(url);
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    res.status(200).json(data);
  } catch (e) {
    res.status(200).json(fail(e.message || "fetch failed"));
  }
};
