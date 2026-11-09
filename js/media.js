/*! TarnishTab | (c) 2026 @soul-abhi | https://github.com/soul-abhi | MIT License */

(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const common = globalThis.TarnishMedia;
  const available = Boolean(api?.runtime?.sendMessage && api?.permissions?.request);
  const ids = ["mediaPanel", "mediaHeading", "mediaSettingsButton", "mediaSettingsDialog", "mediaProviders", "mediaTabSelect", "mediaConnectionStatus",
    "mediaProviderName", "mediaWave", "mediaAmbient", "mediaArtworkButton", "mediaArtwork", "mediaArtworkPlaceholder", "mediaTitle", "mediaArtist",
    "mediaSeek", "mediaPosition", "mediaDuration", "mediaPrevious", "mediaPlay", "mediaPlayIcon", "mediaNext", "mediaLyrics",
    "mediaMute", "mediaVolume", "mediaVolumeIcon", "mediaStatus", "mediaAccess", "mediaAccessHint", "mediaAllow", "mediaPlaybackMode", "mediaPlaybackLabel",
    "mediaPlayHere", "mediaReturn", "mediaEmbedPanel", "mediaEmbedHost", "mediaEmbedClose", "mediaEmbedStatus", "mediaLyricsPanel", "lyricsMode", "lyricsTrack",
    "lyricsConsent", "lyricsEnable", "lyricsForm", "lyricsSong", "lyricsArtist", "lyricsFind", "lyricsStatus", "lyricsScroll", "lyricsLines", "lyricsFooter", "lyricsFollow", "lyricsDisable"];
  const ui = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const providerById = (id) => common.providers.find((provider) => provider.id === id);
  const keyFor = (value) => value ? JSON.stringify([value.tabId, value.provider, value.videoId, value.title, value.artist, Boolean(value.ad)]) : "";
  let settings = { provider: "", lyrics: false, flow: true, follow: true };
  let providers = [];
  let detected = [];
  let tracks = [];
  let track = null;
  let manualTab = null;
  let accessProvider = null;
  let observedAt = 0;
  let polling = false;
  let refreshRequested = false;
  let pollTimer;
  let clockTimer;
  let busy = false;
  let seeking = false;
  let volumeDragging = false;
  let errorUntil = 0;
  let providerSignature = "";
  let tabSignature = "";
  let trackSignature = "";
  let artwork = "";
  let localSession = null;
  let lyricsAllowed = false;
  let lyricsConsentRevision = 0;
  let lyricsKey = "";
  let lyricsRequest = 0;
  let lyricsPending = false;
  let lyricLines = [];
  let currentLine = -1;
  let lyricsWereVisible = false;
  let initialized = false;

  function setStatus(element, message, error = false) {
    if (element.textContent !== message) element.textContent = message;
    element.classList.toggle("error", error);
  }

  function showError(error) {
    errorUntil = Date.now() + 8000;
    setStatus(ui.mediaStatus, error.message, true);
  }

  async function request(message) {
    if (!available) throw new Error("Load TarnishTab as an extension to detect music tabs.");
    let timer;
    try {
      const response = await Promise.race([
        api.runtime.sendMessage(message),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("The music request timed out. Try again.")), message.type === "media:lyrics" ? 25000 : 12000); })
      ]);
      if (!response?.ok) throw new Error(response?.error || "The music tab could not be reached.");
      return response;
    } finally { clearTimeout(timer); }
  }

  function positionNow() {
    if (!track || !Number.isFinite(track.position)) return null;
    const elapsed = track.playing ? Math.min(2, Math.max(0, (performance.now() - observedAt) / 1000)) * (track.playbackRate || 1) : 0;
    return Math.max(0, Math.min(track.position + elapsed, track.duration || Infinity));
  }

  function rangeProgress(input) {
    input.style.setProperty("--range-progress", `${Math.max(0, Math.min(100, Number(input.value) / Number(input.max) * 100))}%`);
  }

  function updateTimeline() {
    const position = seeking && track?.duration ? Number(ui.mediaSeek.value) / 1000 * track.duration : positionNow();
    ui.mediaPosition.textContent = common.formatTime(position);
    ui.mediaDuration.textContent = common.formatTime(track?.duration);
    if (!seeking) ui.mediaSeek.value = track?.duration && position !== null ? String(Math.round(position / track.duration * 1000)) : "0";
    ui.mediaSeek.setAttribute("aria-valuetext", `${common.formatTime(position)} of ${common.formatTime(track?.duration)}`);
    rangeProgress(ui.mediaSeek);
  }

  function renderAccess() {
    const missing = detected.filter((value) => !providers.includes(value.provider));
    accessProvider = providerById(missing.find((value) => value.audible)?.provider || (!track ? missing[0]?.provider : ""));
    ui.mediaAccess.hidden = !available || !accessProvider;
    if (!accessProvider) return;
    const playing = missing.find((value) => value.provider === accessProvider.id)?.audible;
    ui.mediaAccessHint.textContent = `${accessProvider.name} ${playing ? "is playing" : "tab found"}. Allow this site once; songs will appear automatically.`;
    ui.mediaAllow.textContent = `Allow ${accessProvider.name}`;
  }

  function renderTrack() {
    const provider = providerById(track?.provider);
    if (provider) {
      ui.mediaPanel.dataset.provider = provider.id;
      ui.mediaPanel.style.setProperty("--provider-color", provider.color);
    } else {
      delete ui.mediaPanel.dataset.provider;
      ui.mediaPanel.style.removeProperty("--provider-color");
    }
    ui.mediaProviderName.textContent = provider?.name || "Auto-detect";
    ui.mediaHeading.textContent = track?.playing ? "Now playing" : "Your music";
    ui.mediaTitle.textContent = track?.title || "Nothing playing";
    ui.mediaTitle.title = track ? localSession?.active ? "Focus the YouTube player" : `${track.title} — open the music tab` : "Start music in a supported browser tab";
    ui.mediaArtworkButton.setAttribute("aria-label", localSession?.active ? "Focus the YouTube player" : "Open the music tab");
    ui.mediaArtist.textContent = track?.artist || (track ? provider?.name : "Start a song. We'll find it.");
    ui.mediaArtist.title = ui.mediaArtist.textContent;
    ui.mediaTitle.disabled = !track || busy;
    ui.mediaArtworkButton.disabled = !track || busy;
    ui.mediaWave.hidden = !track?.playing;
    ui.mediaPlayIcon.setAttribute("href", track?.playing ? "#media-pause" : "#media-play");
    ui.mediaPlay.setAttribute("aria-label", track?.playing ? "Pause" : "Play");
    ui.mediaPlay.title = track?.playing ? "Pause" : "Play";
    ui.mediaPrevious.setAttribute("aria-label", localSession?.active ? "Restart song" : "Previous track");
    ui.mediaPrevious.title = localSession?.active ? "Restart song" : "Previous track";
    for (const [element, action] of [[ui.mediaPlay, "toggle"], [ui.mediaPrevious, "previous"], [ui.mediaNext, "next"], [ui.mediaSeek, "seek"], [ui.mediaVolume, "volume"], [ui.mediaMute, "mute"]]) {
      element.disabled = busy || Boolean(localSession?.error) || !track?.capabilities?.[action];
    }
    ui.mediaLyrics.disabled = !track;
    ui.mediaLyrics.setAttribute("aria-pressed", String(settings.flow));
    ui.mediaLyrics.setAttribute("aria-label", settings.flow ? "Hide lyrics flow" : "Show lyrics flow");
    ui.mediaLyrics.title = settings.flow ? "Hide lyrics flow" : "Show lyrics flow";
    const muted = track?.muted || track?.volume === 0;
    ui.mediaVolumeIcon.setAttribute("href", muted ? "#media-muted" : "#media-volume");
    ui.mediaMute.setAttribute("aria-label", muted ? "Unmute" : "Mute");
    ui.mediaMute.title = muted ? "Unmute" : "Mute";
    if (!volumeDragging) ui.mediaVolume.value = Number.isFinite(track?.volume) ? String(Math.round((muted ? 0 : track.volume) * 100)) : "0";
    ui.mediaVolume.setAttribute("aria-valuetext", `${ui.mediaVolume.value}%`);
    rangeProgress(ui.mediaVolume);
    const nextArtwork = common.artworkUrl(track?.artwork);
    if (nextArtwork !== artwork) {
      artwork = nextArtwork;
      ui.mediaArtwork.hidden = !artwork;
      ui.mediaAmbient.hidden = !artwork;
      ui.mediaArtworkPlaceholder.hidden = Boolean(artwork);
      if (artwork) { ui.mediaArtwork.src = artwork; ui.mediaAmbient.src = artwork; }
      else { ui.mediaArtwork.removeAttribute("src"); ui.mediaAmbient.removeAttribute("src"); }
    }
    ui.mediaPlaybackMode.hidden = !track;
    ui.mediaPlaybackLabel.textContent = localSession ? localSession.active ? "In New Tab" : "Preparing here" : "In its tab";
    ui.mediaPlayHere.hidden = Boolean(localSession) || !available || !track?.duration || track?.ad || !common.videoId(track?.videoId) || track?.provider === "spotify";
    ui.mediaPlayHere.disabled = busy;
    ui.mediaPlayHere.title = "Play this song in New Tab. You can then close its original tab; keep this New Tab open.";
    ui.mediaReturn.hidden = !localSession?.active;
    ui.mediaReturn.disabled = busy;
    ui.mediaEmbedClose.disabled = Boolean(localSession?.phase === "handoff") || (Boolean(localSession?.active) && busy);
    renderAccess();
    renderLyricsPanel();
    if (Date.now() >= errorUntil) {
      setStatus(ui.mediaStatus, !available ? "Load the extension to detect music tabs."
        : localSession?.active ? "Playback is in this New Tab. Keep it open."
          : track ? `${track.playing ? "Playing" : "Paused"} in ${provider.name}`
            : accessProvider ? "Allow music-site access once for automatic song detection." : "Start music in a YouTube, YouTube Music or Spotify browser tab.");
    }
    updateTimeline();
  }

  function icon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("media-icon");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#media-${name}`);
    svg.append(use);
    return svg;
  }

  function renderProviders() {
    const signature = JSON.stringify([available, providers, detected]);
    if (signature === providerSignature) return;
    providerSignature = signature;
    const focusedProvider = document.activeElement?.dataset.provider;
    ui.mediaProviders.replaceChildren();
    for (const provider of common.providers) {
      const allowed = providers.includes(provider.id);
      const li = document.createElement("li");
      li.className = "media-provider-row";
      const logo = icon(provider.id);
      logo.style.color = provider.color;
      const info = document.createElement("div");
      info.className = "media-provider-info";
      const title = document.createElement("strong");
      title.textContent = provider.name;
      const status = document.createElement("p");
      status.textContent = allowed ? "Access allowed · automatic" : detected.some((value) => value.provider === provider.id) ? "Tab found · allow access once" : "Optional music-site access";
      info.append(title, status);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "media-button";
      button.dataset.provider = provider.id;
      button.textContent = allowed ? "Remove access" : "Allow";
      button.setAttribute("aria-label", `${allowed ? "Remove access to" : "Allow access to"} ${provider.name}`);
      button.disabled = !available;
      button.addEventListener("click", () => changeProvider(provider, button));
      const link = document.createElement("a");
      link.className = "media-icon-button";
      link.href = provider.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.title = `Open ${provider.name}`;
      link.setAttribute("aria-label", link.title);
      link.append(icon("external"));
      li.append(logo, info, button, link);
      ui.mediaProviders.append(li);
      if (focusedProvider === provider.id && ui.mediaSettingsDialog.open) button.focus({ preventScroll: true });
    }
  }

  function renderTabs() {
    const signature = JSON.stringify(tracks.map((value) => [value.tabId, value.provider, value.title, value.playing]));
    if (signature !== tabSignature) {
      tabSignature = signature;
      const automatic = document.createElement("option");
      automatic.value = "auto";
      automatic.textContent = "Auto-detect playing music";
      ui.mediaTabSelect.replaceChildren(automatic);
      for (const value of tracks) {
        const option = document.createElement("option");
        option.value = String(value.tabId);
        option.textContent = `${value.playing ? "Playing · " : ""}${providerById(value.provider).name} · ${value.title}`;
        ui.mediaTabSelect.append(option);
      }
    }
    ui.mediaTabSelect.disabled = !tracks.length || Boolean(localSession);
    ui.mediaTabSelect.value = manualTab === null ? "auto" : String(manualTab);
  }

  async function changeProvider(provider, button) {
    if (!available) return;
    const allowed = providers.includes(provider.id);
    button.disabled = true;
    try {
      // Browser permissions must be requested directly within the click gesture.
      const operation = allowed ? api.permissions.remove({ origins: [provider.origin] })
        : api.permissions.request({ permissions: ["scripting"], origins: [provider.origin] });
      if (!(await operation)) {
        setStatus(ui.mediaConnectionStatus, "Music-site access was not enabled. Nothing was read from the page.");
        setStatus(ui.mediaStatus, "Music-site access was not enabled. Use Allow to try again.", true);
        errorUntil = Date.now() + 8000;
        return;
      }
      await request({ type: "media:site-access", provider: provider.id, enabled: !allowed });
      if (!allowed) settings.provider = provider.id;
      else if (settings.provider === provider.id) settings.provider = "";
      saveState("mediaSettings", settings);
      manualTab = null;
      setStatus(ui.mediaConnectionStatus, allowed ? `${provider.name} access removed.` : `${provider.name} access allowed. Playing songs appear automatically.`);
      await refresh();
    } catch (error) { setStatus(ui.mediaConnectionStatus, error.message, true); showError(error); }
    finally { button.disabled = false; }
  }

  function chooseTrack() {
    if (localSession) return localSession.active ? localSession.track : localSession.source;
    const selected = tracks.find((value) => value.tabId === manualTab);
    if (selected) return selected;
    manualTab = null;
    return common.automaticTrack(tracks, settings.provider);
  }

  function selectTrack() {
    track = chooseTrack();
    const signature = keyFor(track);
    if (signature !== trackSignature) {
      trackSignature = signature;
      resetLyrics();
    }
    renderTrack();
    renderTabs();
    updateLyricsVisibility();
  }

  async function refresh() {
    if (!initialized || !available || document.hidden) return;
    if (polling) { refreshRequested = true; return; }
    clearTimeout(pollTimer);
    polling = true;
    try {
      const state = await request({ type: "media:get-state" });
      providers = Array.isArray(state.providers) ? state.providers.filter((id) => providerById(id)) : [];
      detected = Array.isArray(state.detected) ? state.detected.filter((value) => providerById(value.provider)) : [];
      tracks = Array.isArray(state.tracks) ? state.tracks.filter((value) => Number.isSafeInteger(value.tabId) && providerById(value.provider) && typeof value.title === "string") : [];
      if (!localSession?.active) observedAt = performance.now();
      renderProviders();
      selectTrack();
      if (state.unavailable && !track) setStatus(ui.mediaStatus, "The music tab is still loading. Start a song there; detection will retry automatically.", true);
    } catch (error) {
      tracks = [];
      selectTrack();
      showError(error);
    } finally {
      polling = false;
      if (!document.hidden) pollTimer = setTimeout(refresh, refreshRequested ? 0 : track?.playing || detected.some((value) => value.audible) ? 1200 : 3000);
      refreshRequested = false;
    }
  }

  async function control(action, value) {
    if (!track || busy) return;
    const session = localSession?.active ? localSession : null;
    if (session && action === "focus") { session.player.frame.focus(); session.player.frame.scrollIntoView({ block: "center" }); return; }
    busy = true;
    renderTrack();
    try {
      if (session) {
        const player = session.player;
        if (action === "toggle") await (track.playing ? player.pause() : player.play());
        else if (action === "previous") await player.seek(0);
        else if (action === "seek") await player.seek(value);
        else if (action === "volume") await player.volume(value);
        else if (action === "mute") await (track.volume === 0 ? player.volume(0.5) : player.mute(!track.muted));
        else throw new Error("Use YouTube's visible player for this control.");
        updateLocalTrack(session, player.state);
      } else {
        const response = await request({ type: "media:control", tabId: track.tabId, action, value });
        if (response.track) {
          tracks = tracks.map((item) => item.tabId === response.track.tabId ? response.track : item);
          observedAt = performance.now();
          selectTrack();
        }
      }
    } catch (error) { showError(error); }
    finally {
      busy = false;
      seeking = false;
      volumeDragging = false;
      renderTrack();
      await refresh();
    }
  }

  function transferDetails(session) {
    return { tabId: session.source.tabId, provider: session.source.provider, videoId: session.source.videoId };
  }

  function updateLocalTrack(session, state) {
    if (localSession !== session || !session.active) return;
    const changed = state.videoId && state.videoId !== session.source.videoId;
    session.track = { ...session.source, position: state.position, duration: state.duration || session.source.duration,
      playing: state.playerState === 1, volume: state.volume, muted: state.muted, playbackRate: state.playbackRate,
      videoId: state.videoId || session.source.videoId,
      title: changed ? state.title || "YouTube song" : session.source.title,
      artist: changed ? state.artist : session.source.artist,
      artwork: changed ? `https://i.ytimg.com/vi/${state.videoId}/hqdefault.jpg` : session.source.artwork,
      provider: changed ? "youtube" : session.source.provider,
      capabilities: { toggle: true, previous: true, next: false, seek: Boolean(state.duration), volume: true, mute: true } };
    observedAt = performance.now();
    selectTrack();
  }

  async function playHere() {
    if (!available || !track || busy || localSession || !common.videoId(track.videoId)) return;
    const session = { source: { ...track }, active: false, phase: "permission", player: null, handoffAttempted: false, cancelled: false };
    const ensureCurrent = () => {
      if (localSession !== session || session.cancelled) throw new Error("Playback transfer was cancelled.");
    };
    localSession = session;
    busy = true;
    renderTrack();
    try {
      const permission = api.permissions.request({ permissions: ["declarativeNetRequestWithHostAccess"], origins: ["https://www.youtube.com/*"] });
      if (!(await permission)) throw new Error("Play here access was not enabled. Your original music keeps playing.");
      ensureCurrent();
      const config = await request({ type: "media:player-prepare", videoId: session.source.videoId });
      ensureCurrent();
      session.phase = "loading";
      ui.mediaEmbedPanel.hidden = false;
      setStatus(ui.mediaEmbedStatus, "Checking playback here, muted. Your original song keeps playing until it is ready.");
      ui.mediaEmbedPanel.scrollIntoView({ block: "center", behavior: "instant" });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      ensureCurrent();
      const bounds = ui.mediaEmbedHost.getBoundingClientRect();
      const visibleHeight = Math.min(bounds.bottom, innerHeight) - Math.max(bounds.top, 0);
      if (document.hidden || document.querySelector("dialog[open]") || visibleHeight < bounds.height / 2) throw new Error("Keep the YouTube player on screen to start playback here.");
      session.player = new globalThis.TarnishYouTubePlayer(ui.mediaEmbedHost, {
        videoId: session.source.videoId, position: session.source.position, identity: config.identity,
        onUpdate: (state) => updateLocalTrack(session, state),
        onError: (error) => {
          if (localSession !== session || !session.active) return;
          session.error = true;
          session.track.playing = false;
          setStatus(ui.mediaEmbedStatus, error.message, true);
          showError(error);
          selectTrack();
        }
      });
      const ready = await session.player.start();
      ensureCurrent();
      await session.player.mute(true);
      if (Math.abs(ready.duration - session.source.duration) > 5) throw new Error("YouTube started a different playback version. Keep using the original music tab.");
      ensureCurrent();
      session.phase = "handoff";
      session.handoffAttempted = true;
      renderTrack();
      const result = await request({ type: "media:handoff", ...transferDetails(session) });
      ensureCurrent();
      if (result.track && Number.isFinite(result.track.position)) await session.player.seek(Math.min(result.track.position, ready.duration));
      ensureCurrent();
      if (session.source.playbackRate && session.source.playbackRate !== 1) session.player.command("setPlaybackRate", [session.source.playbackRate]);
      if (session.source.muted) {
        session.player.command("setVolume", [Math.round((session.source.volume ?? 0.7) * 100)]);
      } else await session.player.volume(session.source.volume ?? 0.7);
      ensureCurrent();
      await session.player.play();
      ensureCurrent();
      session.active = true;
      session.phase = "active";
      setStatus(ui.mediaEmbedStatus, "This song plays in New Tab now. You may close its original tab; keep this New Tab open.");
      errorUntil = 0;
      updateLocalTrack(session, session.player.state);
    } catch (error) {
      session.player?.destroy();
      if (session.handoffAttempted) {
        try { await request({ type: "media:handoff-cancel", ...transferDetails(session) }); }
        catch { error = new Error(`${error.message} Resume the original song in its music tab.`); }
      }
      if (localSession === session) localSession = null;
      ui.mediaEmbedPanel.hidden = true;
      ui.mediaEmbedHost.replaceChildren();
      try { await request({ type: "media:player-stop" }); } catch {}
      showError(error);
    } finally {
      busy = false;
      selectTrack();
      await refresh();
    }
  }

  function stopLocalPlayer() {
    const session = localSession;
    if (!session || (busy && session.active) || session.phase === "handoff") return;
    session.cancelled = true;
    session.player?.destroy();
    localSession = null;
    ui.mediaEmbedPanel.hidden = true;
    ui.mediaEmbedHost.replaceChildren();
    if (session.active) {
      try { api.runtime.sendMessage({ type: "media:player-stop" }).catch(() => {}); } catch {}
      errorUntil = 0;
    }
    selectTrack();
    refresh();
  }

  async function returnToTab() {
    const session = localSession;
    if (!session?.active || busy) return;
    busy = true;
    renderTrack();
    try {
      if (!session.error && session.player.state.playerState === 1) await session.player.pause();
      const position = session.player.state.position;
      const result = await request({ type: "media:return", ...transferDetails(session), position });
      session.player.destroy();
      localSession = null;
      ui.mediaEmbedPanel.hidden = true;
      ui.mediaEmbedHost.replaceChildren();
      manualTab = Number.isSafeInteger(result.tabId) ? result.tabId : null;
      await request({ type: "media:player-stop" });
      errorUntil = 0;
    } catch (error) { showError(error); setStatus(ui.mediaEmbedStatus, `${error.message} Playback here remains paused.`, true); }
    finally { busy = false; selectTrack(); await refresh(); }
  }

  function lyricsVisible() {
    if (document.hidden || ui.mediaLyricsPanel.hidden || document.querySelector("dialog[open]") || !document.getElementById("wallpaperPanel").hidden) return false;
    const bounds = ui.mediaLyricsPanel.getBoundingClientRect();
    return bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.top < innerHeight && bounds.right > 0 && bounds.left < innerWidth;
  }

  function cancelLyricsLookup() {
    if (!lyricsPending) return;
    if (available) {
      try { api.runtime.sendMessage({ type: "media:lyrics-cancel", requestId: lyricsRequest }).catch(() => {}); } catch {}
    }
    lyricsPending = false;
    lyricsRequest++;
    lyricsKey = "";
    ui.lyricsFind.disabled = false;
  }

  function resetLyrics() {
    cancelLyricsLookup();
    lyricsRequest++;
    lyricsKey = "";
    lyricLines = [];
    currentLine = -1;
    ui.lyricsLines.replaceChildren();
    ui.lyricsScroll.hidden = true;
    ui.lyricsFollow.hidden = true;
    ui.lyricsFind.disabled = false;
    ui.mediaLyricsPanel.dataset.state = "ready";
    ui.lyricsMode.textContent = "Flow";
    const details = common.lyricDetails(track || {});
    ui.lyricsSong.value = details.title;
    ui.lyricsArtist.value = details.artist;
    setStatus(ui.lyricsStatus, "");
  }

  function renderFollow() {
    ui.lyricsFollow.setAttribute("aria-pressed", String(settings.follow));
    ui.lyricsFollow.textContent = settings.follow ? "Following" : "Follow lyrics";
    ui.lyricsFollow.title = settings.follow ? "Pause following" : "Follow the current line";
  }

  function renderLyricsPanel() {
    ui.mediaLyricsPanel.hidden = !settings.flow || !track;
    ui.lyricsTrack.textContent = track ? `${track.title} · ${track.artist || providerById(track.provider).name}` : "No track is playing";
    ui.lyricsConsent.hidden = lyricsAllowed || Boolean(track?.ad);
    ui.lyricsForm.hidden = !lyricsAllowed || !track || track.ad;
    ui.lyricsFooter.hidden = !lyricsAllowed;
    ui.lyricsEnable.disabled = !available || !track || track.ad;
    if (track?.ad) setStatus(ui.lyricsStatus, "Lyrics resume after the advertisement.");
    renderFollow();
  }

  function updateLyricsVisibility() {
    if (!initialized) return;
    const visible = lyricsVisible();
    if (!visible) cancelLyricsLookup();
    else if (lyricsAllowed && track && !track.ad) {
      if (!lyricsPending && lyricsKey !== keyFor(track)) loadLyrics();
      else syncLyrics(!lyricsWereVisible);
    }
    lyricsWereVisible = visible;
  }

  async function loadLyrics() {
    if (!track || track.ad || !settings.lyrics || !lyricsAllowed || !lyricsVisible()) return;
    cancelLyricsLookup();
    const title = ui.lyricsSong.value.trim();
    const artist = ui.lyricsArtist.value.trim();
    const currentKey = keyFor(track);
    lyricsKey = currentKey;
    if (!title || !artist) { setStatus(ui.lyricsStatus, "Add the song and artist in Lyrics settings to find lyrics."); return; }
    const requestId = ++lyricsRequest;
    lyricsPending = true;
    lyricLines = [];
    currentLine = -1;
    ui.lyricsLines.replaceChildren();
    ui.lyricsScroll.hidden = true;
    ui.lyricsFollow.hidden = true;
    ui.lyricsFind.disabled = true;
    ui.mediaLyricsPanel.dataset.state = "loading";
    ui.lyricsMode.textContent = "Flow";
    setStatus(ui.lyricsStatus, "Finding lyrics…");
    try {
      const response = await request({ type: "media:lyrics", requestId, title, artist, duration: track.duration });
      if (requestId !== lyricsRequest || currentKey !== keyFor(track) || !lyricsVisible()) return;
      const record = response.lyrics;
      if (!record) { setStatus(ui.lyricsStatus, "No lyrics found. Check the song and artist in Lyrics settings."); return; }
      if (record.instrumental) { setStatus(ui.lyricsStatus, "This track is instrumental."); return; }
      lyricLines = common.parseLrc(record.syncedLyrics);
      ui.lyricsLines.classList.toggle("plain", !lyricLines.length);
      const fragment = document.createDocumentFragment();
      if (lyricLines.length) {
        for (const line of lyricLines) {
          const li = document.createElement("li");
          li.className = `lyrics-line${line.text ? "" : " break"}`;
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = line.text || " ";
          button.disabled = !track.capabilities?.seek || !line.text;
          button.setAttribute("aria-label", `${line.text || "Pause in lyrics"} — seek to ${common.formatTime(line.time)}`);
          button.addEventListener("click", () => control("seek", Math.min(line.time, track?.duration || line.time)));
          li.append(button);
          fragment.append(li);
        }
        ui.mediaLyricsPanel.dataset.state = "synced";
        ui.lyricsMode.textContent = "Synced";
        ui.lyricsFollow.hidden = false;
        setStatus(ui.lyricsStatus, `Line-synced · ${record.artist} — ${record.title}`);
      } else {
        const plain = typeof record.plainLyrics === "string" ? record.plainLyrics.slice(0, 120000) : "";
        if (!plain.trim()) { setStatus(ui.lyricsStatus, "No readable lyrics are available for this song."); return; }
        for (const line of plain.split(/\r?\n/).slice(0, 2000)) {
          const li = document.createElement("li");
          li.className = `lyrics-line${line.trim() ? "" : " break"}`;
          const paragraph = document.createElement("p");
          paragraph.textContent = line || " ";
          li.append(paragraph);
          fragment.append(li);
        }
        ui.mediaLyricsPanel.dataset.state = "plain";
        ui.lyricsMode.textContent = "Plain";
        setStatus(ui.lyricsStatus, "Plain lyrics — timing is not available for this song.");
      }
      ui.lyricsLines.replaceChildren(fragment);
      ui.lyricsScroll.hidden = false;
      renderFollow();
      syncLyrics(true);
    } catch (error) {
      if (requestId === lyricsRequest && lyricsVisible()) setStatus(ui.lyricsStatus, error.message, true);
    } finally {
      if (requestId === lyricsRequest) { lyricsPending = false; ui.lyricsFind.disabled = false; }
    }
  }

  function syncLyrics(center = false) {
    if (!lyricsVisible() || !lyricLines.length || lyricsKey !== keyFor(track)) return;
    const position = positionNow();
    if (position === null) return;
    let low = 0, high = lyricLines.length - 1, index = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (lyricLines[middle].time <= position) { index = middle; low = middle + 1; }
      else high = middle - 1;
    }
    if (index === currentLine && !center) return;
    currentLine = index;
    [...ui.lyricsLines.children].forEach((line, number) => {
      line.classList.toggle("is-current", number === index);
      line.classList.toggle("is-past", number < index);
      line.classList.toggle("is-near", number !== index && Math.abs(number - index) === 1);
      if (number === index) line.setAttribute("aria-current", "true"); else line.removeAttribute("aria-current");
    });
    const line = ui.lyricsLines.children[index];
    if (line && settings.follow) {
      const top = line.getBoundingClientRect().top - ui.lyricsScroll.getBoundingClientRect().top + ui.lyricsScroll.scrollTop
        - (ui.lyricsScroll.clientHeight - line.offsetHeight) / 2;
      ui.lyricsScroll.scrollTo({ top: Math.max(0, top), behavior: reducedMotion.matches ? "instant" : "smooth" });
    }
  }

  function bindSettingsDialog() {
    const dialog = ui.mediaSettingsDialog, trigger = ui.mediaSettingsButton;
    let backdropPressed = false;
    const outside = (event) => {
      const bounds = dialog.getBoundingClientRect();
      return event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
    };
    trigger.addEventListener("click", () => {
      if (dialog.open) return;
      setWallpaperPanel(false);
      cancelLyricsLookup();
      dialog.showModal();
      trigger.setAttribute("aria-expanded", "true");
      document.body.classList.add("media-modal-open");
      renderProviders(); renderTabs(); refresh();
      if (!available) setStatus(ui.mediaConnectionStatus, "Load TarnishTab as an extension to allow music-site access.");
    });
    dialog.querySelector("[data-close-dialog]").addEventListener("click", () => dialog.close());
    dialog.addEventListener("pointerdown", (event) => { backdropPressed = outside(event); });
    dialog.addEventListener("click", (event) => { if (backdropPressed && outside(event)) dialog.close(); });
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault(); event.stopPropagation(); dialog.close();
    });
    dialog.addEventListener("close", () => {
      trigger.setAttribute("aria-expanded", "false");
      document.body.classList.remove("media-modal-open");
      trigger.focus({ preventScroll: true });
      updateLyricsVisibility();
    });
  }

  ui.mediaArtwork.addEventListener("error", () => { ui.mediaArtwork.hidden = true; ui.mediaAmbient.hidden = true; ui.mediaArtworkPlaceholder.hidden = false; });
  ui.mediaAmbient.addEventListener("error", () => { ui.mediaAmbient.hidden = true; });
  for (const [id, action] of [["mediaPlay", "toggle"], ["mediaPrevious", "previous"], ["mediaNext", "next"], ["mediaMute", "mute"], ["mediaTitle", "focus"], ["mediaArtworkButton", "focus"]]) ui[id].addEventListener("click", () => control(action));
  ui.mediaSeek.addEventListener("input", () => { seeking = true; updateTimeline(); });
  ui.mediaSeek.addEventListener("change", () => { if (track?.duration) control("seek", Number(ui.mediaSeek.value) / 1000 * track.duration); });
  ui.mediaSeek.addEventListener("blur", () => { seeking = false; });
  ui.mediaVolume.addEventListener("input", () => { volumeDragging = true; rangeProgress(ui.mediaVolume); });
  ui.mediaVolume.addEventListener("change", () => control("volume", Number(ui.mediaVolume.value) / 100));
  ui.mediaVolume.addEventListener("blur", () => { volumeDragging = false; });
  ui.mediaTabSelect.addEventListener("change", () => { manualTab = ui.mediaTabSelect.value === "auto" ? null : Number(ui.mediaTabSelect.value); selectTrack(); });
  ui.mediaAllow.addEventListener("click", () => { if (accessProvider) changeProvider(accessProvider, ui.mediaAllow); });
  ui.mediaPlayHere.addEventListener("click", playHere);
  ui.mediaReturn.addEventListener("click", returnToTab);
  ui.mediaEmbedClose.addEventListener("click", stopLocalPlayer);
  ui.mediaLyrics.addEventListener("click", () => { settings.flow = !settings.flow; saveState("mediaSettings", settings); renderTrack(); updateLyricsVisibility(); });
  ui.lyricsForm.addEventListener("submit", (event) => { event.preventDefault(); loadLyrics(); });
  ui.lyricsEnable.addEventListener("click", async () => {
    if (!available) return;
    const revision = ++lyricsConsentRevision;
    ui.lyricsEnable.disabled = true;
    try {
      const operation = api.permissions.request({ origins: [common.lyricsOrigin] });
      if (!(await operation)) { setStatus(ui.lyricsStatus, "Lyrics access was not enabled. Nothing was sent to LRCLIB."); return; }
      if (revision !== lyricsConsentRevision || !(await api.permissions.contains({ origins: [common.lyricsOrigin] }))) return;
      if (revision !== lyricsConsentRevision) return;
      settings.lyrics = true;
      lyricsAllowed = true;
      saveState("mediaSettings", settings);
      lyricsKey = "";
      renderTrack();
      updateLyricsVisibility();
    } catch { setStatus(ui.lyricsStatus, "Lyrics access could not be enabled. Try again.", true); }
    finally { renderTrack(); }
  });
  ui.lyricsDisable.addEventListener("click", async () => {
    lyricsConsentRevision++;
    settings.lyrics = false;
    lyricsAllowed = false;
    saveState("mediaSettings", settings);
    resetLyrics(); renderTrack();
    try { await api.permissions.remove({ origins: [common.lyricsOrigin] }); }
    catch { setStatus(ui.lyricsStatus, "Lyrics are off. Remove LRCLIB access in the browser's extension settings if access could not be removed here.", true); }
  });
  ui.lyricsFollow.addEventListener("click", () => { settings.follow = !settings.follow; saveState("mediaSettings", settings); renderFollow(); syncLyrics(true); });
  const stopFollowing = () => {
    if (!settings.follow) return;
    settings.follow = false; saveState("mediaSettings", settings); renderFollow();
  };
  ui.lyricsScroll.addEventListener("wheel", stopFollowing, { passive: true });
  ui.lyricsScroll.addEventListener("touchmove", stopFollowing, { passive: true });
  ui.lyricsScroll.addEventListener("keydown", (event) => { if (event.target === ui.lyricsScroll && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) stopFollowing(); });
  bindSettingsDialog();

  const visibilityObserver = new IntersectionObserver(updateLyricsVisibility);
  visibilityObserver.observe(ui.mediaLyricsPanel);
  const modalObserver = new MutationObserver(updateLyricsVisibility);
  for (const element of document.querySelectorAll("dialog, #wallpaperPanel")) modalObserver.observe(element, { attributes: true, attributeFilter: ["open", "hidden"] });
  window.addEventListener("resize", updateLyricsVisibility, { passive: true });

  function startClock() {
    clearInterval(clockTimer);
    if (!document.hidden) clockTimer = setInterval(() => { updateTimeline(); syncLyrics(); }, 250);
  }
  document.addEventListener("visibilitychange", () => {
    clearTimeout(pollTimer); startClock();
    if (document.hidden) cancelLyricsLookup();
    else { refresh(); updateLyricsVisibility(); }
  });
  window.addEventListener("pagehide", () => {
    clearTimeout(pollTimer); clearInterval(clockTimer); cancelLyricsLookup();
    if (localSession) localSession.cancelled = true;
    localSession?.player?.destroy();
    if (available && localSession) { try { api.runtime.sendMessage({ type: "media:player-stop" }).catch(() => {}); } catch {} }
  });
  if (available) {
    api.runtime.onMessage?.addListener((message, sender) => {
      if (sender?.id === api.runtime.id && message?.type === "media:changed") refresh();
      return false;
    });
    api.permissions.onAdded?.addListener(() => refresh());
    api.permissions.onRemoved?.addListener(({ origins = [], permissions = [] }) => {
      if (origins.includes(common.lyricsOrigin)) {
        lyricsConsentRevision++;
        settings.lyrics = false; lyricsAllowed = false;
        saveState("mediaSettings", settings); resetLyrics(); renderTrack();
      }
      if (localSession && (origins.includes("https://www.youtube.com/*") || permissions.includes("declarativeNetRequestWithHostAccess"))) {
        const session = localSession;
        session.cancelled = true;
        session.player?.destroy();
        if (session.active) {
          localSession = null; ui.mediaEmbedPanel.hidden = true; ui.mediaEmbedHost.replaceChildren();
          try { api.runtime.sendMessage({ type: "media:player-stop" }).catch(() => {}); } catch {}
          showError(new Error("YouTube player access was removed. Playback here stopped."));
        }
      }
      refresh();
    });
  }

  async function initMedia() {
    const stored = await loadState("mediaSettings");
    if (stored && typeof stored === "object") settings = { provider: providerById(stored.provider)?.id || "", lyrics: stored.lyrics === true, flow: stored.flow !== false, follow: stored.follow !== false };
    lyricsAllowed = Boolean(available && settings.lyrics && await api.permissions.contains({ origins: [common.lyricsOrigin] }));
    initialized = true;
    renderProviders(); renderTabs(); renderTrack(); startClock();
    await refresh();
  }
  initMedia().catch(() => setStatus(ui.mediaStatus, "Music settings could not be loaded. Reload this tab to try again.", true));
})();
