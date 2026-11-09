/*! TarnishTab | (c) 2026 @soul-abhi | https://github.com/soul-abhi | MIT License */

(() => {
  if (globalThis.TarnishMedia?.version === 2) return;

  const providers = Object.freeze([
    Object.freeze({ id: "youtube", name: "YouTube", host: "www.youtube.com", origin: "https://www.youtube.com/*", url: "https://www.youtube.com/", color: "#ff6969" }),
    Object.freeze({ id: "youtubeMusic", name: "YouTube Music", host: "music.youtube.com", origin: "https://music.youtube.com/*", url: "https://music.youtube.com/", color: "#ff6969" }),
    Object.freeze({ id: "spotify", name: "Spotify", host: "open.spotify.com", origin: "https://open.spotify.com/*", url: "https://open.spotify.com/", color: "#70df9a" })
  ]);

  function providerFor(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return null;
      return providers.find((provider) => provider.host === parsed.hostname) ?? null;
    } catch {
      return null;
    }
  }

  function artworkUrl(value) {
    if (typeof value !== "string" || value.length > 2048) return "";
    try {
      const url = new URL(value);
      const host = url.hostname;
      const allowed = ["i.ytimg.com", "yt3.ggpht.com", "yt3.googleusercontent.com", "lh3.googleusercontent.com", "i.scdn.co", "mosaic.scdn.co"].includes(host)
        || host.endsWith(".spotifycdn.com");
      return allowed && url.protocol === "https:" && !url.username && !url.password && !url.port ? url.href : "";
    } catch {
      return "";
    }
  }

  function videoId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value) ? value : "";
  }

  function videoIdForUrl(value) {
    const provider = providerFor(value);
    if (!provider || provider.id === "spotify") return "";
    const url = new URL(value);
    if (url.pathname === "/watch") return videoId(url.searchParams.get("v"));
    return videoId(url.pathname.match(/^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})\/?$/)?.[1]);
  }

  function automaticTrack(tracks, preferredProvider = "") {
    const playing = tracks.filter((track) => track.playing);
    return playing.find((track) => track.audible && track.provider === preferredProvider)
      || playing.find((track) => track.audible)
      || playing.find((track) => track.provider === preferredProvider)
      || playing[0] || tracks.find((track) => track.provider === preferredProvider) || tracks[0] || null;
  }

  function formatTime(value) {
    if (!Number.isFinite(value) || value < 0) return "--:--";
    const total = Math.floor(value);
    const minutes = Math.floor(total / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
  }

  function parseTime(value) {
    if (typeof value !== "string") return null;
    const parts = value.trim().split(":");
    if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
    if (parts.slice(1).some((part) => Number(part) >= 60)) return null;
    return parts.reduce((seconds, part) => seconds * 60 + Number(part), 0);
  }

  function normalize(value) {
    return String(value || "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }

  function lyricDetails(track) {
    let title = String(track.title || "").replace(/\s*[\[(](?:official\s+)?(?:music\s+video|video|audio|lyrics?|visuali[sz]er|hd|4k)[\])]/gi, "").trim();
    let artist = String(track.artist || "").replace(/\s*-\s*Topic$/i, "").trim();
    if (track.provider === "youtube") {
      const split = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
      if (split) [, artist, title] = split;
    }
    return { title: title.slice(0, 200), artist: artist.slice(0, 200) };
  }

  function parseLrc(value) {
    if (typeof value !== "string" || value.length > 120000) return [];
    const offsetMatch = value.match(/\[offset:([+-]?\d+)\]/i);
    const offset = offsetMatch ? Math.max(-60000, Math.min(60000, Number(offsetMatch[1]))) / 1000 : 0;
    const lines = [];
    for (const raw of value.split(/\r?\n/)) {
      const timestamps = [...raw.matchAll(/\[(\d{1,3}):([0-5]?\d(?:\.\d{1,3})?)\]/g)];
      if (!timestamps.length) continue;
      const text = raw.replace(/\[(\d{1,3}):([0-5]?\d(?:\.\d{1,3})?)\]/g, "").trim();
      for (const match of timestamps) {
        lines.push({ time: Math.max(0, Number(match[1]) * 60 + Number(match[2]) + offset), text });
        if (lines.length >= 2000) return lines.sort((a, b) => a.time - b.time);
      }
    }
    return lines.sort((a, b) => a.time - b.time);
  }

  globalThis.TarnishMedia = Object.freeze({ version: 2, providers, providerFor, artworkUrl, videoId, videoIdForUrl, automaticTrack, formatTime, parseTime, normalize, lyricDetails, parseLrc, lyricsOrigin: "https://lrclib.net/*" });
})();
