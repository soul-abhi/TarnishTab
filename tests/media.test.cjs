const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const commonSource = fs.readFileSync(path.join(root, "js/media-common.js"), "utf8");
const backgroundSource = fs.readFileSync(path.join(root, "js/media-background.js"), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function harness({ fastTimeouts = false } = {}) {
  const permissions = new Set();
  const tabs = new Map();
  const storage = {};
  const rules = new Map();
  const calls = { queries: [], injected: [], controls: [], fetches: [], updates: [], created: [], rules: [], notifications: [] };
  let listener;
  let requestId = 0;
  let receiverReady = true;
  let holdControls = false;
  let permissionsRemoved;
  let fetchResponse = () => new Response(JSON.stringify({
    trackName: "Test song", artistName: "Test artist", duration: 180,
    plainLyrics: "A test line", syncedLyrics: "[00:00.00]A test line", instrumental: false
  }), { headers: { "Content-Type": "application/json" } });
  const api = {
    runtime: {
      id: "test-extension", getURL: (file) => `chrome-extension://test-extension/${file}`,
      getManifest: () => ({ version: "2.1.0" }),
      sendMessage: async (message) => { calls.notifications.push(plain(message)); },
      onMessage: { addListener: (callback) => { listener = callback; } }
    },
    permissions: {
      contains: async (request) => [...(request.permissions || []), ...(request.origins || [])].every((value) => permissions.has(value)),
      onRemoved: { addListener: (callback) => { permissionsRemoved = callback; } }
    },
    storage: { local: { get: async (key) => ({ [key]: storage[key] }), set: async (values) => Object.assign(storage, plain(values)) } },
    declarativeNetRequest: { updateSessionRules: async (options) => {
      calls.rules.push(plain(options));
      for (const id of options.removeRuleIds || []) rules.delete(id);
      for (const rule of options.addRules || []) rules.set(rule.id, plain(rule));
    } },
    tabs: {
      get: async (id) => { if (!tabs.has(id)) throw new Error("Missing tab"); return tabs.get(id); },
      query: async (query) => { calls.queries.push(plain(query)); return [...tabs.values()].filter((tab) => query.url.some((pattern) => tab.url.startsWith(pattern.replace("*", "")))); },
      sendMessage: async (id, message) => {
        if (!receiverReady) throw new Error("No receiver");
        if (message.type === "tarnishtab:media-action") {
          calls.controls.push({ id, message: plain(message) });
          if (holdControls) return new Promise(() => {});
          const track = tabs.get(id)?.track;
          if (track && message.action === "pause") track.playing = false;
          if (track && message.action === "play") track.playing = true;
          if (track && message.action === "seek") track.position = message.value;
        }
        return { ok: true, track: tabs.get(id)?.track || null };
      },
      update: async (id, options) => { calls.updates.push({ id, options: plain(options) }); },
      create: async (options) => { calls.created.push(plain(options)); return { id: 100 }; }
    },
    scripting: { executeScript: async (options) => { calls.injected.push(plain(options)); receiverReady = true; } },
    windows: { update: async (id, options) => { calls.updates.push({ windowId: id, options: plain(options) }); } }
  };
  const context = vm.createContext({
    browser: api, URL, clearTimeout, AbortController, Response,
    setTimeout: fastTimeouts ? (callback, delay) => setTimeout(callback, Math.min(delay, 10)) : setTimeout,
    fetch: async (url, options) => { calls.fetches.push({ url, options }); return fetchResponse(url, options); }
  });
  vm.runInContext(commonSource, context);
  vm.runInContext(backgroundSource, context);
  const common = context.TarnishMedia;
  return {
    common, context, permissions, tabs, calls, storage, rules,
    noReceiver: () => { receiverReady = false; },
    holdControls: () => { holdControls = true; },
    revoke: (origin) => { permissions.delete(origin); permissionsRemoved?.({ origins: [origin] }); },
    fetchWith: (callback) => { fetchResponse = callback; },
    message: (message, sender = { id: "test-extension", url: api.runtime.getURL("newtab.html") }) => new Promise((resolve, reject) => {
      try {
        const payload = message.type === "media:lyrics" ? { requestId: ++requestId, ...message } : message;
        const active = listener(payload, sender, (response) => resolve(plain(response)));
        if (!active) resolve(undefined);
      } catch (error) { reject(error); }
    })
  };
}

function youtube(h) {
  h.permissions.add("scripting");
  h.permissions.add("https://www.youtube.com/*");
  h.tabs.set(7, {
    id: 7, windowId: 3, url: "https://www.youtube.com/watch?v=abcdefghijk",
    track: { provider: "youtube", title: "Test song", artist: "Test artist", videoId: "abcdefghijk", position: 30, duration: 180, playing: true, artwork: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg", capabilities: { toggle: true, play: true, pause: true, seek: true } }
  });
}

test("provider detection accepts only the three HTTPS music hosts", () => {
  const { common } = harness();
  assert.equal(common.providerFor("https://music.youtube.com/watch?v=abc").id, "youtubeMusic");
  assert.equal(common.providerFor("https://www.youtube.com/watch?v=abc").id, "youtube");
  assert.equal(common.providerFor("https://open.spotify.com/track/abc").id, "spotify");
  for (const url of ["http://www.youtube.com/", "https://www.youtube.com.evil.test/", "https://evil.test/", "https://user:password@open.spotify.com/", "https://open.spotify.com:8443/", "javascript:alert(1)"]) {
    assert.equal(common.providerFor(url), null, url);
  }
});

test("artwork accepts public provider image CDNs, not arbitrary URLs", () => {
  const { common } = harness();
  assert.equal(common.artworkUrl("https://i.scdn.co/image/test"), "https://i.scdn.co/image/test");
  assert.equal(common.artworkUrl("https://image-cdn-ak.spotifycdn.com/image/test"), "https://image-cdn-ak.spotifycdn.com/image/test");
  for (const url of ["https://evil.test/private", "http://i.scdn.co/image/test", "https://i.scdn.co.evil.test/", "data:image/svg+xml,test", "https://user:password@i.scdn.co/image/test"]) assert.equal(common.artworkUrl(url), "");
});

test("time formatting and parsing handle unknown values and hours", () => {
  const { common } = harness();
  assert.equal(common.formatTime(0), "0:00");
  assert.equal(common.formatTime(125.9), "2:05");
  assert.equal(common.formatTime(3725), "1:02:05");
  for (const value of [null, undefined, NaN, Infinity, -1]) assert.equal(common.formatTime(value), "--:--");
  assert.equal(common.parseTime(" 1:02:05 "), 3725);
  assert.equal(common.parseTime("2:05"), 125);
  for (const value of ["2:90", "word", "-1:00", "1:2:3:4", "1:02.4", null]) assert.equal(common.parseTime(value), null);
});

test("LRC parsing supports offsets, multiple timestamps, ordering and blank pauses", () => {
  const { common } = harness();
  assert.deepEqual(plain(common.parseLrc("[ar:Test artist]\n[offset:-250]\n[00:10.50][00:20.00]Second line\n[00:00.10]First line\n[00:30.00]")), [
    { time: 0, text: "First line" }, { time: 10.25, text: "Second line" }, { time: 19.75, text: "Second line" }, { time: 29.75, text: "" }
  ]);
  assert.deepEqual(plain(common.parseLrc("Plain lyrics without timestamps")), []);
  assert.equal(common.parseLrc(Array.from({ length: 2200 }, () => "[00:01.00]Line").join("\n")).length, 2000);
});

test("YouTube lyric matching removes video labels and allows corrected metadata", () => {
  const { common } = harness();
  assert.deepEqual(plain(common.lyricDetails({ provider: "youtube", title: "Test artist - Test song (Official Music Video)", artist: "Channel" })), { artist: "Test artist", title: "Test song" });
  assert.deepEqual(plain(common.lyricDetails({ provider: "spotify", title: "Test song", artist: "Test artist" })), { artist: "Test artist", title: "Test song" });
});

test("idle detection uses tab metadata but never injects or reads pages before permission", async () => {
  const h = harness();
  const result = await h.message({ type: "media:get-state" });
  assert.deepEqual(result, { ok: true, providers: [], detected: [], tracks: [], unavailable: 0 });
  assert.deepEqual(h.calls.queries, [{ url: plain(h.common.providers.map((provider) => provider.origin)) }]);
  assert.equal(h.calls.injected.length, 0);
});

test("site discovery covers supported hosts while connector injection requires site consent", async () => {
  const h = harness();
  youtube(h);
  h.tabs.set(8, { id: 8, url: "https://open.spotify.com/track/test" });
  h.noReceiver();
  const result = await h.message({ type: "media:get-state" });
  assert.deepEqual(result.providers, ["youtube"]);
  assert.equal(result.tracks.length, 1);
  assert.equal(result.tracks[0].tabId, 7);
  assert.deepEqual(h.calls.queries, [{ url: plain(h.common.providers.map((provider) => provider.origin)) }]);
  assert.deepEqual(result.detected, [{ provider: "youtube", audible: false, count: 1 }, { provider: "spotify", audible: false, count: 1 }]);
  assert.deepEqual(h.calls.injected, [{ target: { tabId: 7 }, files: ["js/media-common.js", "js/media-content.js"] }]);
});

test("only the extension's New Tab page can request music data, controls or lyrics", async () => {
  const h = harness();
  youtube(h);
  for (const sender of [{ id: "other-extension", url: "chrome-extension://test-extension/newtab.html" }, { id: "test-extension", url: "https://www.youtube.com/" }, { id: "test-extension", url: "chrome-extension://test-extension/other.html" }]) {
    assert.equal(await h.message({ type: "media:get-state" }, sender), undefined);
    assert.equal(await h.message({ type: "media:control", tabId: 7, action: "toggle" }, sender), undefined);
    assert.equal(await h.message({ type: "media:lyrics", title: "Test song", artist: "Test artist" }, sender), undefined);
  }
  assert.equal(h.calls.queries.length + h.calls.controls.length + h.calls.fetches.length, 0);
});

test("controls reject unapproved hosts, closed tabs, unsupported actions and invalid values", async () => {
  const h = harness();
  youtube(h);
  h.tabs.set(9, { id: 9, url: "https://evil.test/" });
  for (const message of [
    { tabId: 9, action: "toggle" }, { tabId: 99, action: "toggle" }, { tabId: 7, action: "unknown" },
    { tabId: 7, action: "seek", value: -1 }, { tabId: 7, action: "seek", value: Infinity },
    { tabId: 7, action: "volume", value: 2 }, { tabId: 7, action: "volume", value: NaN }
  ]) assert.equal((await h.message({ type: "media:control", ...message })).ok, false);
  assert.equal(h.calls.controls.length, 0);
  h.permissions.delete("https://www.youtube.com/*");
  assert.equal((await h.message({ type: "media:control", tabId: 7, action: "toggle" })).ok, false);
});

test("approved controls are forwarded and Open music tab focuses the correct window", async () => {
  const h = harness();
  youtube(h);
  assert.equal((await h.message({ type: "media:control", tabId: 7, action: "seek", value: 75 })).ok, true);
  assert.deepEqual(h.calls.controls, [{ id: 7, message: { type: "tarnishtab:media-action", action: "seek", value: 75 } }]);
  assert.equal((await h.message({ type: "media:control", tabId: 7, action: "focus" })).ok, true);
  assert.deepEqual(h.calls.updates, [{ id: 7, options: { active: true } }, { windowId: 3, options: { focused: true } }]);
});

test("timed-out playback commands are never replayed or reinjected", async () => {
  const h = harness({ fastTimeouts: true });
  youtube(h);
  h.holdControls();
  const response = await h.message({ type: "media:control", tabId: 7, action: "toggle" });
  assert.equal(response.ok, false);
  assert.match(response.error, /did not respond/);
  assert.equal(h.calls.controls.length, 1);
  assert.equal(h.calls.injected.length, 0);
});

test("lyrics do not make external requests before separate consent", async () => {
  const h = harness();
  assert.equal((await h.message({ type: "media:lyrics", title: "Test song", artist: "Test artist" })).ok, false);
  assert.equal(h.calls.fetches.length, 0);
});

test("lyrics requests validate metadata, identify the client and omit credentials", async () => {
  const h = harness();
  h.permissions.add(h.common.lyricsOrigin);
  for (const title of ["", "x".repeat(201), 123]) assert.equal((await h.message({ type: "media:lyrics", title, artist: "Test artist" })).ok, false);
  assert.equal(h.calls.fetches.length, 0);
  const response = await h.message({ type: "media:lyrics", title: "Test song", artist: "Test artist", duration: 180 });
  assert.equal(response.ok, true);
  assert.equal(response.lyrics.syncedLyrics, "[00:00.00]A test line");
  const request = h.calls.fetches[0];
  const url = new URL(request.url);
  assert.equal(url.origin, "https://lrclib.net");
  assert.equal(url.pathname, "/api/get");
  assert.equal(url.searchParams.get("duration"), "180");
  assert.equal(request.options.credentials, "omit");
  assert.equal(request.options.referrerPolicy, "no-referrer");
  assert.equal(request.options.redirect, "error");
  assert.match(request.options.headers["Lrclib-Client"], /TarnishTab v2\.1\.0/);
  await h.message({ type: "media:lyrics", title: "test song", artist: "test artist", duration: 180 });
  assert.equal(h.calls.fetches.length, 1);
});

test("fallback search refuses wrong artists and mismatched versions", async () => {
  const h = harness();
  h.permissions.add(h.common.lyricsOrigin);
  h.fetchWith((url) => url.includes("/api/get") ? new Response("", { status: 404 }) : new Response(JSON.stringify([
    { trackName: "Test song", artistName: "Wrong artist", duration: 180, syncedLyrics: "[00:00.00]Wrong" },
    { trackName: "Test song", artistName: "Test artist", duration: 210, syncedLyrics: "[00:00.00]Wrong version" },
    { trackName: "Test song", artistName: "Test artist", duration: 181, syncedLyrics: "[00:00.00]Correct line" }
  ]), { headers: { "Content-Type": "application/json" } }));
  const response = await h.message({ type: "media:lyrics", title: "Test song", artist: "Test artist", duration: 180 });
  assert.equal(response.ok, true);
  assert.equal(response.lyrics.syncedLyrics, "[00:00.00]Correct line");
  assert.equal(h.calls.fetches.length, 2);
});

test("LRCLIB Retry-After is honored without repeated network requests", async () => {
  const h = harness();
  h.permissions.add(h.common.lyricsOrigin);
  h.fetchWith(() => new Response("Busy", { status: 429, headers: { "Retry-After": "600" } }));
  assert.equal((await h.message({ type: "media:lyrics", title: "Test song", artist: "Test artist" })).ok, false);
  assert.equal((await h.message({ type: "media:lyrics", title: "Another song", artist: "Test artist" })).ok, false);
  assert.equal(h.calls.fetches.length, 1);
});

test("lyrics access revoked during a lookup prevents the fallback request", async () => {
  const h = harness();
  h.permissions.add(h.common.lyricsOrigin);
  h.fetchWith(() => {
    h.permissions.delete(h.common.lyricsOrigin);
    return new Response("", { status: 404 });
  });
  assert.equal((await h.message({ type: "media:lyrics", title: "Test song", artist: "Test artist" })).ok, false);
  assert.equal(h.calls.fetches.length, 1);
});

test("lyrics cancellation aborts the matching request, not another tab or stale request", async () => {
  const h = harness();
  h.permissions.add(h.common.lyricsOrigin);
  const sender = { id: "test-extension", url: "chrome-extension://test-extension/newtab.html", tab: { id: 101 } };
  let started;
  const fetching = new Promise((resolve) => { started = resolve; });
  h.fetchWith((url, { signal }) => {
    started();
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true }));
  });
  const pending = h.message({ type: "media:lyrics", requestId: 41, title: "Test song", artist: "Test artist" }, sender);
  await fetching;
  await h.message({ type: "media:lyrics-cancel", requestId: 41 }, { ...sender, tab: { id: 102 } });
  await h.message({ type: "media:lyrics-cancel", requestId: 40 }, sender);
  assert.equal(h.calls.fetches[0].options.signal.aborted, false);
  assert.equal((await h.message({ type: "media:lyrics-cancel", requestId: 41 }, sender)).ok, true);
  const response = await pending;
  assert.equal(response.ok, false);
  assert.match(response.error, /cancelled/);
  assert.equal(h.calls.fetches[0].options.signal.aborted, true);
  assert.equal(h.calls.fetches.length, 1);
  assert.equal((await h.message({ type: "media:lyrics-cancel" }, sender)).ok, true);
});

test("a cancelled queued lyrics lookup never starts an external request", async () => {
  const h = harness();
  h.permissions.add(h.common.lyricsOrigin);
  const sender = { id: "test-extension", url: "chrome-extension://test-extension/newtab.html", tab: { id: 101 } };
  let started;
  let finish;
  const fetching = new Promise((resolve) => { started = resolve; });
  h.fetchWith(() => {
    started();
    return new Promise((resolve) => { finish = resolve; });
  });
  const first = h.message({ type: "media:lyrics", requestId: 1, title: "Test song", artist: "Test artist" }, sender);
  await fetching;
  const other = { ...sender, tab: { id: 102 } };
  const queued = h.message({ type: "media:lyrics", requestId: 2, title: "Another song", artist: "Test artist" }, other);
  await Promise.resolve();
  await h.message({ type: "media:lyrics-cancel", requestId: 2 }, other);
  finish(new Response(JSON.stringify({ trackName: "Test song", artistName: "Test artist", plainLyrics: "A test line" }), { headers: { "Content-Type": "application/json" } }));
  assert.equal((await first).ok, true);
  const response = await queued;
  assert.equal(response.ok, false);
  assert.match(response.error, /cancelled/);
  assert.equal(h.calls.fetches.length, 1);
});

test("revoking lyrics permission aborts an in-flight request", async () => {
  const h = harness();
  h.permissions.add(h.common.lyricsOrigin);
  let started;
  const fetching = new Promise((resolve) => { started = resolve; });
  h.fetchWith((url, { signal }) => {
    started();
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true }));
  });
  const pending = h.message({ type: "media:lyrics", title: "Test song", artist: "Test artist" });
  await fetching;
  h.revoke(h.common.lyricsOrigin);
  assert.equal((await pending).ok, false);
  assert.equal(h.calls.fetches[0].options.signal.aborted, true);
  assert.equal(h.calls.fetches.length, 1);
});

test("invalid lyrics request identifiers are rejected without external access", async () => {
  const h = harness();
  h.permissions.add(h.common.lyricsOrigin);
  for (const requestId of [0, -1, 1.5, Infinity, "1", Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await h.message({ type: "media:lyrics", requestId, title: "Test song", artist: "Test artist" })).ok, false);
  }
  assert.equal(h.calls.fetches.length, 0);
});

test("unexpected lyrics responses fail safely without displaying HTML", async () => {
  const h = harness();
  h.permissions.add(h.common.lyricsOrigin);
  h.fetchWith(() => new Response("<html>Unexpected</html>", { headers: { "Content-Type": "text/html" } }));
  const response = await h.message({ type: "media:lyrics", title: "Test song", artist: "Test artist" });
  assert.equal(response.ok, false);
  assert.match(response.error, /unexpected response/);
});

test("the manifest keeps required access unchanged and player/site access optional", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.permissions, ["storage", "tabs"]);
  assert.deepEqual(manifest.optional_host_permissions, ["https://www.youtube.com/*", "https://music.youtube.com/*", "https://open.spotify.com/*", "https://lrclib.net/*"]);
  assert.deepEqual(manifest.optional_permissions, ["scripting", "declarativeNetRequestWithHostAccess", ...manifest.optional_host_permissions]);
  assert.equal(manifest.browser_specific_settings.gecko.strict_min_version, "121.0");
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.content_scripts, undefined);
  for (const file of manifest.background.scripts) assert.ok(fs.existsSync(path.join(root, file)));
});

test("a playing YouTube Music tab is discovered before consent without reading its song", async () => {
  const h = harness();
  h.tabs.set(7, { id: 7, audible: true, url: "https://music.youtube.com/watch?v=abcdefghijk", track: { provider: "youtubeMusic", title: "Private song" } });
  h.noReceiver();
  const result = await h.message({ type: "media:get-state" });
  assert.deepEqual(result.detected, [{ provider: "youtubeMusic", audible: true, count: 1 }]);
  assert.deepEqual(result.tracks, []);
  assert.equal(h.calls.injected.length, 0);
  assert.equal(h.calls.controls.length, 0);
});

test("one-time YouTube Music site consent enables automatic snapshots and controls", async () => {
  const h = harness();
  await h.message({ type: "media:get-state" });
  h.permissions.add("scripting");
  h.permissions.add("https://music.youtube.com/*");
  h.tabs.set(7, { id: 7, audible: true, url: "https://music.youtube.com/watch?v=abcdefghijk", track: { provider: "youtubeMusic", title: "Detected song", artist: "Test artist", playing: true, duration: 180, position: 42, capabilities: { toggle: true, pause: true, play: true } } });
  assert.deepEqual((await h.message({ type: "media:get-state" })).tracks, []);
  assert.equal((await h.message({ type: "media:site-access", provider: "youtubeMusic", enabled: true })).ok, true);
  h.noReceiver();
  const result = await h.message({ type: "media:get-state" });
  assert.deepEqual(result.providers, ["youtubeMusic"]);
  assert.equal(result.tracks[0].title, "Detected song");
  assert.equal(result.tracks[0].playing, true);
  assert.equal(result.tracks[0].videoId, "abcdefghijk");
  assert.deepEqual(h.calls.injected[0].target, { tabId: 7 });
  assert.equal((await h.message({ type: "media:control", tabId: 7, action: "pause" })).track.playing, false);
  assert.equal((await h.message({ type: "media:site-access", provider: "youtubeMusic", enabled: false })).ok, true);
  assert.deepEqual((await h.message({ type: "media:get-state" })).tracks, []);
});

test("site access changes are validated, serialized and require matching browser permission", async () => {
  const h = harness();
  for (const message of [{ provider: "evil", enabled: true }, { provider: "youtubeMusic", enabled: "true" }, { provider: "youtubeMusic", enabled: true }]) {
    assert.equal((await h.message({ type: "media:site-access", ...message })).ok, false);
  }
  await h.message({ type: "media:get-state" });
  for (const value of ["scripting", "https://www.youtube.com/*", "https://music.youtube.com/*"]) h.permissions.add(value);
  await Promise.all([h.message({ type: "media:site-access", provider: "youtube", enabled: true }), h.message({ type: "media:site-access", provider: "youtubeMusic", enabled: true })]);
  assert.deepEqual(h.storage.mediaSiteAccess.sort(), ["youtube", "youtubeMusic"]);
});

test("automatic selection prefers audible playing music over a paused preferred provider", () => {
  const { common } = harness();
  const paused = { tabId: 1, provider: "youtube", playing: false };
  const playing = { tabId: 2, provider: "youtubeMusic", playing: true, audible: true };
  const silent = { tabId: 3, provider: "spotify", playing: true, audible: false };
  assert.equal(common.automaticTrack([paused, silent, playing], "youtube"), playing);
  assert.equal(common.automaticTrack([silent, playing], "spotify"), playing);
  assert.equal(common.automaticTrack([paused], "youtube"), paused);
  assert.equal(common.automaticTrack([]), null);
});

test("transfer video IDs accept only validated YouTube URL paths", () => {
  const { common } = harness();
  for (const url of ["https://music.youtube.com/watch?v=abcdefghijk", "https://www.youtube.com/shorts/abcdefghijk", "https://www.youtube.com/live/abcdefghijk"]) assert.equal(common.videoIdForUrl(url), "abcdefghijk");
  for (const value of ["bad", "../abcdefghijk", "abcdefghijk?x=1", null, 123]) assert.equal(common.videoId(value), "");
  for (const url of ["https://evil.test/watch?v=abcdefghijk", "https://open.spotify.com/watch?v=abcdefghijk", "https://www.youtube.com/embed/abcdefghijk", "https://www.youtube.com/watch?v=bad"]) assert.equal(common.videoIdForUrl(url), "");
});

test("snapshots sanitize ranges, capabilities and extra page data", async () => {
  const h = harness();
  youtube(h);
  Object.assign(h.tabs.get(7).track, { title: "x".repeat(400), artist: "y".repeat(300), volume: 9, position: -1, playbackRate: Infinity, password: "not forwarded", artwork: "https://evil.test/", capabilities: { toggle: true, seek: "true", execute: true } });
  const track = (await h.message({ type: "media:get-state" })).tracks[0];
  assert.equal(track.title.length, 300);
  assert.equal(track.artist.length, 200);
  assert.equal(track.volume, 1);
  assert.equal(track.position, 0);
  assert.equal(track.playbackRate, 1);
  assert.equal(track.artwork, "");
  assert.equal(track.password, undefined);
  assert.equal(track.capabilities.execute, undefined);
  assert.equal(track.capabilities.seek, false);
});

test("handoff uses guarded idempotent pause and keeps the selected video identity", async () => {
  const h = harness();
  youtube(h);
  const message = { type: "media:handoff", tabId: 7, provider: "youtube", videoId: "abcdefghijk" };
  const result = await h.message(message);
  assert.equal(result.ok, true);
  assert.equal(result.track.playing, false);
  assert.deepEqual(h.calls.controls[0].message, { type: "tarnishtab:media-action", action: "pause", videoId: "abcdefghijk" });
  await h.message(message);
  assert.equal(h.calls.controls.length, 1);
});

test("handoff rejects changed songs, ads, Spotify and invalid IDs without pausing", async () => {
  const h = harness();
  youtube(h);
  for (const fields of [{ videoId: "lmnopqrstuv" }, { videoId: "invalid" }, { provider: "spotify" }, { tabId: -1 }]) {
    assert.equal((await h.message({ type: "media:handoff", tabId: 7, provider: "youtube", videoId: "abcdefghijk", ...fields })).ok, false);
  }
  h.tabs.get(7).track.ad = true;
  assert.equal((await h.message({ type: "media:handoff", tabId: 7, provider: "youtube", videoId: "abcdefghijk" })).ok, false);
  assert.equal(h.calls.controls.length, 0);
});

test("failed transfer rollback can resume only its own matching source song", async () => {
  const h = harness();
  youtube(h);
  const fields = { tabId: 7, provider: "youtube", videoId: "abcdefghijk" };
  const sender = { id: "test-extension", url: "chrome-extension://test-extension/newtab.html", tab: { id: 101 } };
  await h.message({ type: "media:handoff", ...fields }, sender);
  await h.message({ type: "media:handoff-cancel", ...fields }, { ...sender, tab: { id: 102 } });
  assert.equal(h.tabs.get(7).track.playing, false);
  await h.message({ type: "media:handoff-cancel", ...fields, videoId: "lmnopqrstuv" }, sender);
  assert.equal(h.tabs.get(7).track.playing, false);
  await h.message({ type: "media:handoff-cancel", ...fields }, sender);
  assert.equal(h.tabs.get(7).track.playing, true);
  await h.message({ type: "media:handoff-cancel", ...fields }, sender);
  assert.equal(h.calls.controls.length, 2);
});

test("repeating a handoff preserves the original playback state for rollback", async () => {
  const h = harness();
  youtube(h);
  const fields = { tabId: 7, provider: "youtube", videoId: "abcdefghijk" };
  await h.message({ type: "media:handoff", ...fields });
  await h.message({ type: "media:handoff", ...fields });
  await h.message({ type: "media:handoff-cancel", ...fields });
  assert.equal(h.tabs.get(7).track.playing, true);
  assert.deepEqual(h.calls.controls.map((call) => call.message.action), ["pause", "play"]);
});

test("return-to-source seeks and resumes the same song or reopens a closed tab", async () => {
  const h = harness();
  youtube(h);
  const fields = { tabId: 7, provider: "youtube", videoId: "abcdefghijk", position: 65.5 };
  assert.equal((await h.message({ type: "media:return", ...fields })).ok, true);
  assert.deepEqual(h.calls.controls.map((call) => call.message.action), ["seek", "play"]);
  assert.equal(h.calls.controls[0].message.videoId, "abcdefghijk");
  h.tabs.delete(7);
  assert.equal((await h.message({ type: "media:return", ...fields })).opened, true);
  assert.deepEqual(h.calls.created, [{ url: "https://www.youtube.com/watch?v=abcdefghijk&t=65" }]);
});

test("player identification requires separate permission and affects only its New Tab iframe", async () => {
  const h = harness();
  const sender = { id: "test-extension", url: "chrome-extension://test-extension/newtab.html", tab: { id: 101 } };
  const message = { type: "media:player-prepare", videoId: "abcdefghijk" };
  assert.equal((await h.message(message, sender)).ok, false);
  h.permissions.add("declarativeNetRequestWithHostAccess");
  h.permissions.add("https://www.youtube.com/*");
  assert.equal((await h.message(message, { ...sender, url: "https://www.youtube.com/" })), undefined);
  assert.equal((await h.message(message, { ...sender, tab: undefined })).ok, false);
  const result = await h.message(message, sender);
  assert.equal(result.ok, true);
  assert.equal(result.identity, "https://tarnishtab.test-extension/");
  const rule = h.rules.get(102);
  assert.deepEqual(rule.condition.tabIds, [101]);
  assert.deepEqual(rule.condition.initiatorDomains, ["test-extension"]);
  assert.deepEqual(rule.condition.resourceTypes, ["sub_frame"]);
  assert.deepEqual(rule.condition.requestMethods, ["get"]);
  const matcher = new RegExp(rule.condition.regexFilter);
  assert.ok(matcher.test("https://www.youtube.com/embed/abcdefghijk?enablejsapi=1"));
  for (const url of ["https://www.youtube.com/watch?v=abcdefghijk", "https://www.youtube.com/embed/lmnopqrstuv", "https://evil.test/?url=https://www.youtube.com/embed/abcdefghijk", "https://www.youtube.com/embed/abcdefghijk/evil"]) assert.equal(matcher.test(url), false, url);
  assert.deepEqual(rule.action.requestHeaders, [{ header: "Referer", operation: "set", value: result.identity }]);
  await h.message({ type: "media:player-stop" }, sender);
  assert.equal(h.rules.size, 0);
});

test("player-only YouTube permission never opts the user into reading YouTube tabs", async () => {
  const h = harness();
  h.storage.mediaSiteAccess = ["youtubeMusic"];
  for (const value of ["scripting", "https://music.youtube.com/*", "https://www.youtube.com/*", "declarativeNetRequestWithHostAccess"]) h.permissions.add(value);
  h.tabs.set(7, { id: 7, audible: true, url: "https://www.youtube.com/watch?v=abcdefghijk" });
  h.noReceiver();
  const result = await h.message({ type: "media:get-state" });
  assert.deepEqual(result.providers, ["youtubeMusic"]);
  assert.equal(h.calls.injected.length, 0);
  assert.deepEqual(result.tracks, []);
  assert.equal((await h.message({ type: "media:control", tabId: 7, action: "play" })).ok, false);
});

test("new player markup has no stale Connect or lyrics-dialog bindings", () => {
  const html = fs.readFileSync(path.join(root, "newtab.html"), "utf8");
  const source = fs.readFileSync(path.join(root, "js/media.js"), "utf8");
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const bound = source.match(/const ids = \[([\s\S]*?)\];/)[1];
  for (const [, id] of bound.matchAll(/"([^"]+)"/g)) assert.ok(ids.has(id), `Missing player element: ${id}`);
  for (const id of ["mediaConnect", "mediaConnections", "mediaLyricsDialog"]) {
    assert.equal(ids.has(id), false);
    assert.equal(new RegExp(`\\bui\\.${id}\\b`).test(source), false);
  }
});
