/*! TarnishTab | (c) 2026 @soul-abhi | https://github.com/soul-abhi | MIT License */

(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const common = globalThis.TarnishMedia;
  const newTabUrl = api.runtime.getURL("newtab.html");
  const actions = new Set(["toggle", "play", "pause", "previous", "next", "seek", "volume", "mute", "focus"]);
  const lyricsCache = new Map();
  const lyricsRequests = new Map();
  const handoffs = new Map();
  let lyricsQueue = Promise.resolve();
  let lastLyricsRequest = 0;
  let lyricsRetryAt = 0;
  let siteAccessInitialization = null;
  let siteAccessQueue = Promise.resolve();

  async function timedMessage(tabId, message) {
    let timer;
    try {
      return await Promise.race([
        api.tabs.sendMessage(tabId, message),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("The music tab did not respond.")), 4000); })
      ]);
    } finally { clearTimeout(timer); }
  }

  async function approvedSites() {
    const stored = (await api.storage.local.get("mediaSiteAccess")).mediaSiteAccess;
    if (Array.isArray(stored)) return stored.filter((id) => common.providers.some((provider) => provider.id === id));
    // Preserve site grants from the earlier controller without treating player-only access as site consent.
    if (!siteAccessInitialization) siteAccessInitialization = (async () => {
      const results = await Promise.all(common.providers.map(async (provider) =>
        await api.permissions.contains({ permissions: ["scripting"], origins: [provider.origin] }) ? provider.id : null));
      const sites = results.filter(Boolean);
      await api.storage.local.set({ mediaSiteAccess: sites });
      return sites;
    })();
    return siteAccessInitialization;
  }

  async function enabledProviders() {
    const sites = await approvedSites();
    const results = await Promise.all(common.providers.map(async (provider) => {
      if (!sites.includes(provider.id)) return null;
      const allowed = await api.permissions.contains({ permissions: ["scripting"], origins: [provider.origin] });
      return allowed ? provider : null;
    }));
    return results.filter(Boolean);
  }

  async function permittedTab(tabId) {
    if (!Number.isSafeInteger(tabId) || tabId < 0) throw new Error("Choose an open music tab.");
    let tab;
    try { tab = await api.tabs.get(tabId); }
    catch { throw new Error("The music tab was closed. Start another song and it will appear automatically."); }
    const provider = common.providerFor(tab.url);
    if (!provider || !(await approvedSites()).includes(provider.id)
      || !(await api.permissions.contains({ permissions: ["scripting"], origins: [provider.origin] }))) {
      throw new Error("Allow access to this music site once before using its controls.");
    }
    return tab;
  }

  function changeSiteAccess(message) {
    const provider = common.providers.find((value) => value.id === message.provider);
    if (!provider || typeof message.enabled !== "boolean") return Promise.reject(new Error("Invalid music-site access request."));
    const work = siteAccessQueue.then(async () => {
      const sites = await approvedSites();
      if (message.enabled && !(await api.permissions.contains({ permissions: ["scripting"], origins: [provider.origin] }))) {
        throw new Error("Allow browser access to this music site first.");
      }
      const next = sites.filter((id) => id !== provider.id);
      if (message.enabled) next.push(provider.id);
      await api.storage.local.set({ mediaSiteAccess: next });
      notifyViews();
      return {};
    });
    siteAccessQueue = work.catch(() => {});
    return work;
  }

  async function tabMessage(tabId, message) {
    await permittedTab(tabId);
    try {
      return await timedMessage(tabId, message);
    } catch {
      try {
        await api.scripting.executeScript({ target: { tabId }, files: ["js/media-common.js", "js/media-content.js"] });
        return await timedMessage(tabId, message);
      } catch {
        throw new Error("The music tab is still loading. Open it, start a track, and try again.");
      }
    }
  }

  function cleanTrack(track, tab) {
    const provider = common.providerFor(tab.url);
    if (!provider || !track || typeof track.title !== "string" || !track.title.trim() || track.provider !== provider.id) return null;
    const duration = Number.isFinite(track.duration) && track.duration > 0 && track.duration <= 86400 ? track.duration : null;
    return {
      tabId: tab.id, provider: provider.id, title: track.title.trim().slice(0, 300),
      artist: typeof track.artist === "string" ? track.artist.slice(0, 200) : "",
      album: typeof track.album === "string" ? track.album.slice(0, 200) : "",
      artwork: common.artworkUrl(track.artwork), playing: track.playing === true, audible: tab.audible === true,
      ad: track.ad === true, duration,
      position: Number.isFinite(track.position) ? Math.max(0, Math.min(track.position, duration || 86400)) : 0,
      volume: Number.isFinite(track.volume) ? Math.max(0, Math.min(1, track.volume)) : null, muted: track.muted === true,
      playbackRate: Number.isFinite(track.playbackRate) && track.playbackRate >= 0.25 && track.playbackRate <= 4 ? track.playbackRate : 1,
      videoId: provider.id === "spotify" || track.ad ? "" : common.videoId(track.videoId) || common.videoIdForUrl(tab.url),
      capabilities: Object.fromEntries([...actions].filter((action) => action !== "focus").map((action) => [action, track.capabilities?.[action] === true]))
    };
  }

  async function getState() {
    // Existing tabs permission reveals site/audible status, never the page contents before site consent.
    const [enabled, tabs] = await Promise.all([
      enabledProviders(), api.tabs.query({ url: common.providers.map((provider) => provider.origin) })
    ]);
    const detected = common.providers.flatMap((provider) => {
      const matching = tabs.filter((tab) => common.providerFor(tab.url)?.id === provider.id);
      return matching.length ? [{ provider: provider.id, audible: matching.some((tab) => tab.audible), count: matching.length }] : [];
    });
    const results = await Promise.allSettled(tabs.filter((tab) => Number.isSafeInteger(tab.id)
      && enabled.some((provider) => common.providerFor(tab.url)?.id === provider.id)).map(async (tab) => {
      const response = await tabMessage(tab.id, { type: "tarnishtab:media-state" });
      const track = response?.ok && response.track;
      return cleanTrack(track, tab);
    }));
    return {
      providers: enabled.map((provider) => provider.id),
      detected,
      tracks: results.filter((result) => result.status === "fulfilled" && result.value).map((result) => result.value),
      unavailable: results.filter((result) => result.status === "rejected").length
    };
  }

  async function control(message) {
    if (!actions.has(message.action)) throw new Error("Unsupported music control.");
    const tab = await permittedTab(message.tabId);
    if (message.action === "focus") {
      await api.tabs.update(tab.id, { active: true });
      if (Number.isSafeInteger(tab.windowId)) await api.windows.update(tab.windowId, { focused: true });
      return {};
    }
    if ((message.action === "seek" && (!Number.isFinite(message.value) || message.value < 0 || message.value > 86400))
      || (message.action === "volume" && (!Number.isFinite(message.value) || message.value < 0 || message.value > 1))) {
      throw new Error("Invalid music control value.");
    }
    // Probe/inject first; never retry an action that may already have taken effect.
    await tabMessage(tab.id, { type: "tarnishtab:media-state" });
    await permittedTab(tab.id);
    const response = await timedMessage(tab.id, { type: "tarnishtab:media-action", action: message.action, value: message.value });
    if (!response?.ok) throw new Error(response?.error || "The music tab could not apply this control.");
    return { track: cleanTrack(response.track, tab) };
  }

  async function sourceForTransfer(message) {
    const provider = common.providers.find((value) => value.id === message.provider && value.id !== "spotify");
    if (!provider || !common.videoId(message.videoId) || !Number.isSafeInteger(message.tabId) || message.tabId < 0) throw new Error("Choose a supported YouTube song first.");
    if (!(await approvedSites()).includes(provider.id)
      || !(await api.permissions.contains({ permissions: ["scripting"], origins: [provider.origin] }))) throw new Error("Music-site access was removed. Allow access again to transfer playback.");
    let tab;
    try { tab = await api.tabs.get(message.tabId); }
    catch { return { provider, tab: null, track: null }; }
    await permittedTab(tab.id);
    const response = await tabMessage(tab.id, { type: "tarnishtab:media-state" });
    const track = response?.ok && cleanTrack(response.track, tab);
    if (!track || track.provider !== provider.id || track.ad || track.videoId !== message.videoId) throw new Error("The song changed in its tab. Select it again before transferring playback.");
    return { provider, tab, track };
  }

  async function handoff(message, client) {
    const { tab, track } = await sourceForTransfer(message);
    if (!tab) return { sourceClosed: true };
    const pending = handoffs.get(client);
    if (!pending || pending.tabId !== tab.id || pending.provider !== message.provider || pending.videoId !== message.videoId) {
      handoffs.set(client, { tabId: tab.id, provider: message.provider, videoId: message.videoId, playing: track.playing });
    }
    if (!track.playing) return { track };
    await permittedTab(tab.id);
    const response = await timedMessage(tab.id, { type: "tarnishtab:media-action", action: "pause", videoId: message.videoId });
    if (!response?.ok || response.track?.playing !== false) throw new Error(response?.error || "The original music tab could not be paused. Playback here stays muted to avoid playing twice.");
    return { track: cleanTrack(response.track, tab) };
  }

  async function cancelHandoff(message, client) {
    const pending = handoffs.get(client);
    if (!pending || pending.tabId !== message.tabId || pending.provider !== message.provider || pending.videoId !== message.videoId) return {};
    handoffs.delete(client);
    if (!pending.playing) return {};
    const { tab } = await sourceForTransfer(message);
    if (!tab) return {};
    await permittedTab(tab.id);
    const response = await timedMessage(tab.id, { type: "tarnishtab:media-action", action: "play", videoId: message.videoId });
    if (!response?.ok) throw new Error(response?.error || "Resume the original song in its music tab.");
    return {};
  }

  async function returnToSource(message) {
    if (!Number.isFinite(message.position) || message.position < 0 || message.position > 86400) throw new Error("Invalid playback position.");
    const { provider, tab, track } = await sourceForTransfer(message);
    if (!tab) {
      const url = new URL("watch", provider.url);
      url.searchParams.set("v", message.videoId);
      url.searchParams.set("t", String(Math.floor(message.position)));
      const opened = await api.tabs.create({ url: url.href });
      return { tabId: opened.id, opened: true };
    }
    if (track.capabilities.seek && track.duration) {
      await permittedTab(tab.id);
      const response = await timedMessage(tab.id, { type: "tarnishtab:media-action", action: "seek", value: Math.min(message.position, track.duration), videoId: message.videoId });
      if (!response?.ok) throw new Error(response?.error || "The original tab could not seek to this position.");
    }
    await permittedTab(tab.id);
    const response = await timedMessage(tab.id, { type: "tarnishtab:media-action", action: "play", videoId: message.videoId });
    if (!response?.ok) throw new Error(response?.error || "Resume playback in the music tab.");
    await api.tabs.update(tab.id, { active: true });
    if (Number.isSafeInteger(tab.windowId)) await api.windows.update(tab.windowId, { focused: true });
    return { tabId: tab.id };
  }

  function playerRuleId(tabId) {
    if (!Number.isSafeInteger(tabId) || tabId < 0 || tabId >= 2147483646) throw new Error("Open a New Tab to use playback here.");
    return tabId + 1;
  }

  async function preparePlayer(message, sender) {
    if (!common.videoId(message.videoId)) throw new Error("Choose a supported YouTube song first.");
    const id = playerRuleId(sender.tab?.id);
    const permission = { permissions: ["declarativeNetRequestWithHostAccess"], origins: ["https://www.youtube.com/*"] };
    if (!api.declarativeNetRequest?.updateSessionRules || !(await api.permissions.contains(permission))) {
      throw new Error("Allow optional YouTube player access through Play here first.");
    }
    const appId = api.runtime.id.includes("@") ? api.runtime.id.replace("@", ".") : `tarnishtab.${api.runtime.id}`;
    const identity = `https://${appId.toLowerCase()}/`;
    const rule = {
      id, priority: 1,
      action: { type: "modifyHeaders", requestHeaders: [{ header: "Referer", operation: "set", value: identity }] },
      condition: {
        regexFilter: `^https://www\\.youtube\\.com/embed/${message.videoId}(\\?|$)`, isUrlFilterCaseSensitive: true,
        initiatorDomains: [new URL(newTabUrl).hostname], tabIds: [sender.tab.id],
        resourceTypes: ["sub_frame"], requestMethods: ["get"]
      }
    };
    await api.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id], addRules: [rule] });
    return { identity };
  }

  async function removePlayerRule(tabId) {
    if (api.declarativeNetRequest?.updateSessionRules && Number.isSafeInteger(tabId) && tabId >= 0) {
      await api.declarativeNetRequest.updateSessionRules({ removeRuleIds: [playerRuleId(tabId)] });
    }
    return {};
  }

  function checkLyricsActive(signal) {
    if (signal.aborted) throw new Error("Lyrics lookup was cancelled.");
  }

  async function lyricsJson(url, signal) {
    const wait = Math.max(0, lastLyricsRequest + 300 - Date.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    checkLyricsActive(signal);
    if (!(await api.permissions.contains({ origins: [common.lyricsOrigin] }))) throw new Error("Lyrics access was disabled.");
    checkLyricsActive(signal);
    if (Date.now() < lyricsRetryAt) throw new Error("Lyrics are temporarily rate-limited. Please try again later.");
    lastLyricsRequest = Date.now();
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 8000);
    try {
      let response;
      try {
        response = await fetch(url, {
          signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer", redirect: "error",
          headers: { Accept: "application/json", "Lrclib-Client": `TarnishTab v${api.runtime.getManifest().version} (https://github.com/soul-abhi)` }
        });
      } catch {
        checkLyricsActive(signal);
        throw new Error("Lyrics could not be reached. Check your connection and try again.");
      }
      checkLyricsActive(signal);
      if (response.status === 429 || response.status === 503) {
        const retry = response.headers.get("Retry-After");
        const delay = /^\d+$/.test(retry || "") ? Number(retry) * 1000 : Math.max(1000, Date.parse(retry) - Date.now() || 30000);
        lyricsRetryAt = Date.now() + delay * (1 + Math.random() * 0.2);
        throw new Error("The lyrics service is busy. Please try again later.");
      }
      if (response.status === 404) return null;
      if (!response.ok || !response.headers.get("Content-Type")?.includes("application/json")) throw new Error("The lyrics service returned an unexpected response.");
      let body;
      try { body = await response.text(); }
      catch {
        checkLyricsActive(signal);
        throw new Error("The lyrics response could not be read. Please try again.");
      }
      checkLyricsActive(signal);
      if (body.length > 3000000) throw new Error("The lyrics response was too large.");
      try { return JSON.parse(body); }
      catch { throw new Error("The lyrics service returned an unreadable response."); }
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
    }
  }

  function lyricsRecord(record) {
    if (!record || typeof record !== "object" || typeof record.trackName !== "string" || typeof record.artistName !== "string") return null;
    const plain = typeof record.plainLyrics === "string" && record.plainLyrics.length <= 120000 ? record.plainLyrics : "";
    const synced = typeof record.syncedLyrics === "string" && record.syncedLyrics.length <= 120000 ? record.syncedLyrics : "";
    if (!plain && !synced && record.instrumental !== true) return null;
    return {
      title: record.trackName.slice(0, 200), artist: record.artistName.slice(0, 200),
      duration: Number.isFinite(record.duration) ? record.duration : null,
      plainLyrics: plain, syncedLyrics: synced, instrumental: record.instrumental === true
    };
  }

  async function findLyrics(message, signal) {
    if (!(await api.permissions.contains({ origins: [common.lyricsOrigin] }))) throw new Error("Enable LRCLIB access before searching for lyrics.");
    checkLyricsActive(signal);
    const title = typeof message.title === "string" ? message.title.trim() : "";
    const artist = typeof message.artist === "string" ? message.artist.trim() : "";
    if (!title || !artist || title.length > 200 || artist.length > 200) throw new Error("Enter a song title and artist, up to 200 characters each.");
    const duration = Number.isFinite(message.duration) && message.duration >= 1 && message.duration <= 3600 ? Math.round(message.duration) : null;
    const key = JSON.stringify([common.normalize(title), common.normalize(artist), duration]);
    const cached = lyricsCache.get(key);
    if (cached && cached.expires > Date.now()) return { lyrics: cached.value };

    const task = async () => {
      // The view may have closed or permission may have changed while queued.
      checkLyricsActive(signal);
      if (!(await api.permissions.contains({ origins: [common.lyricsOrigin] }))) throw new Error("Lyrics access was disabled.");
      checkLyricsActive(signal);
      const queued = lyricsCache.get(key);
      if (queued && queued.expires > Date.now()) return { lyrics: queued.value };
      const getUrl = new URL("https://lrclib.net/api/get");
      getUrl.searchParams.set("track_name", title);
      getUrl.searchParams.set("artist_name", artist);
      if (duration) getUrl.searchParams.set("duration", String(duration));
      let result = lyricsRecord(await lyricsJson(getUrl.href, signal));
      if (result && (common.normalize(result.title) !== common.normalize(title)
        || common.normalize(result.artist) !== common.normalize(artist)
        || (duration && result.duration && Math.abs(result.duration - duration) > 3))) result = null;
      if (!result) {
        const searchUrl = new URL("https://lrclib.net/api/search");
        searchUrl.searchParams.set("track_name", title);
        searchUrl.searchParams.set("artist_name", artist);
        const records = await lyricsJson(searchUrl.href, signal);
        const matches = (Array.isArray(records) ? records.slice(0, 20) : []).map(lyricsRecord).filter((record) => record
          && common.normalize(record.title) === common.normalize(title)
          && common.normalize(record.artist) === common.normalize(artist)
          && (!duration || !record.duration || Math.abs(record.duration - duration) <= 3));
        matches.sort((a, b) => Number(Boolean(b.syncedLyrics)) - Number(Boolean(a.syncedLyrics))
          || Math.abs((a.duration || duration) - duration) - Math.abs((b.duration || duration) - duration));
        result = matches[0] ?? null;
      }
      checkLyricsActive(signal);
      lyricsCache.set(key, { value: result, expires: Date.now() + (result ? 3600000 : 60000) });
      if (lyricsCache.size > 30) lyricsCache.delete(lyricsCache.keys().next().value);
      return { lyrics: result };
    };
    const work = lyricsQueue.then(task);
    lyricsQueue = work.catch(() => {});
    return work;
  }

  api.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== api.runtime.id || sender.url?.split("#")[0] !== newTabUrl) return false;
    const client = sender.tab?.id ?? sender.documentId ?? sender.url;
    let work;
    if (message?.type === "media:get-state") work = getState();
    else if (message?.type === "media:site-access") work = changeSiteAccess(message);
    else if (message?.type === "media:control") work = control(message);
    else if (message?.type === "media:handoff") work = handoff(message, client);
    else if (message?.type === "media:handoff-cancel") work = cancelHandoff(message, client);
    else if (message?.type === "media:return") work = returnToSource(message);
    else if (message?.type === "media:player-prepare") work = preparePlayer(message, sender);
    else if (message?.type === "media:player-stop") {
      handoffs.delete(client);
      work = removePlayerRule(sender.tab?.id);
    }
    else if (message?.type === "media:lyrics") {
      if (!Number.isSafeInteger(message.requestId) || message.requestId < 1) {
        work = Promise.reject(new Error("Invalid lyrics request."));
      } else {
        lyricsRequests.get(client)?.controller.abort();
        const pending = { requestId: message.requestId, controller: new AbortController() };
        lyricsRequests.set(client, pending);
        work = findLyrics(message, pending.controller.signal).finally(() => {
          if (lyricsRequests.get(client) === pending) lyricsRequests.delete(client);
        });
      }
    } else if (message?.type === "media:lyrics-cancel") {
      const pending = lyricsRequests.get(client);
      if (pending && pending.requestId === message.requestId) pending.controller.abort();
      work = Promise.resolve({});
    } else return false;
    work.then(
      (result) => respond({ ok: true, ...result }),
      (error) => respond({ ok: false, error: error.message || "The music request could not be completed." })
    );
    return true;
  });

  api.permissions.onRemoved?.addListener(({ origins = [] }) => {
    if (origins.includes(common.lyricsOrigin)) {
      for (const pending of lyricsRequests.values()) pending.controller.abort();
      lyricsRequests.clear();
      lyricsCache.clear();
    }
    notifyViews();
  });

  api.tabs.onRemoved?.addListener((tabId) => {
    lyricsRequests.get(tabId)?.controller.abort();
    lyricsRequests.delete(tabId);
    handoffs.delete(tabId);
    removePlayerRule(tabId).catch(() => {});
    notifyViews();
  });

  function notifyViews() {
    try { api.runtime.sendMessage({ type: "media:changed" }).catch(() => {}); }
    catch {}
  }
  api.tabs.onUpdated?.addListener((tabId, changes, tab) => {
    if (changes.url && changes.url.split("#")[0] !== newTabUrl) removePlayerRule(tabId).catch(() => {});
    if (common.providerFor(tab.url) && ("audible" in changes || "url" in changes || changes.status === "complete")) notifyViews();
  });
  api.permissions.onAdded?.addListener(notifyViews);
})();
