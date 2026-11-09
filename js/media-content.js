/*! TarnishTab | (c) 2026 @soul-abhi | https://github.com/soul-abhi | MIT License */

(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const common = globalThis.TarnishMedia;
  const provider = common?.providerFor(location.href);
  if (!provider || !api?.runtime?.onMessage) return;
  if (globalThis.__tarnishMediaConnector?.version === 2) return;
  globalThis.__tarnishMediaConnector?.dispose?.();

  const text = (element) => (element?.textContent || "").replace(/\s+/g, " ").trim();
  const clip = (value, limit = 200) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
  const usable = (element) => Boolean(element && !element.disabled && element.getAttribute("aria-disabled") !== "true" && element.getBoundingClientRect().width > 0);
  const within = (element, selector) => element?.querySelector(selector) || element?.shadowRoot?.querySelector(selector);

  function mediaElements() {
    if (provider.id === "spotify") {
      return {
        video: null,
        play: document.querySelector('[data-testid="control-button-playpause"]'),
        previous: document.querySelector('[data-testid="control-button-skip-back"]'),
        next: document.querySelector('[data-testid="control-button-skip-forward"]'),
        seek: document.querySelector('[data-testid="playback-progressbar"] input[type="range"]')
          || document.querySelector('[data-testid="playback-progressbar"] [role="slider"]')
          || document.querySelector('[data-testid="playback-progressbar"]'),
        volume: document.querySelector('[data-testid="volume-bar"] input[type="range"]')
          || document.querySelector('[data-testid="volume-bar"] [role="slider"]')
          || document.querySelector('[data-testid="volume-bar"] [data-testid="progress-bar"]'),
        mute: document.querySelector('[data-testid="volume-bar-toggle-mute-button"]')
      };
    }
    const music = provider.id === "youtubeMusic";
    const bar = music ? document.querySelector("ytmusic-player-bar") : null;
    const player = music ? document.querySelector("ytmusic-player") : document.querySelector("#movie_player");
    const media = [...(player?.querySelectorAll("video, audio") || []), ...(player?.shadowRoot?.querySelectorAll("video, audio") || [])];
    const video = media.find((element) => !element.paused && !element.ended)
      || media.find((element) => element.readyState > 0) || media[0]
      || document.querySelector(music ? "video.html5-main-video, #movie_player video, ytmusic-player audio, video, audio" : "video.html5-main-video, #movie_player video");
    return {
      video, bar,
      play: music ? within(bar, "#play-pause-button, [aria-label='Pause'], [aria-label='Play']") : document.querySelector(".ytp-play-button"),
      previous: music ? within(bar, "#previous-button") : document.querySelector(".ytp-prev-button"),
      next: music ? within(bar, "#next-button") : document.querySelector(".ytp-next-button"),
      seek: music ? within(bar, "#progress-bar, #player-progress-bar") : null,
      volume: music ? within(bar, "#volume-slider") : null,
      mute: music ? within(bar, "#volume-button") : null
    };
  }

  function sliderValue(element) {
    if (!element) return null;
    const raw = element instanceof HTMLInputElement ? element.value : element.getAttribute("aria-valuenow");
    if (raw === null || raw === "") return null;
    const max = Number(element instanceof HTMLInputElement ? element.max || 100 : element.getAttribute("aria-valuemax") || 100);
    const min = Number(element instanceof HTMLInputElement ? element.min || 0 : element.getAttribute("aria-valuemin") || 0);
    const value = Number(raw);
    return Number.isFinite(value) && max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : null;
  }

  function snapshot() {
    const elements = mediaElements();
    const metadata = navigator.mediaSession?.metadata;
    let title = "";
    let artist = "";
    const album = clip(metadata?.album);
    let artwork = "";
    let videoId = common.videoIdForUrl(location.href);

    if (provider.id === "youtubeMusic") {
      const bar = elements.bar;
      const heading = within(bar, ".title, .content-info-wrapper yt-formatted-string");
      title = text(heading) || heading?.getAttribute("title") || metadata?.title;
      artist = text(within(bar, ".byline a, .subtitle a")) || metadata?.artist || text(within(bar, ".byline, .subtitle"));
      const image = within(bar, "img");
      artwork = image?.currentSrc || image?.src;
      videoId = videoId || common.videoIdForUrl(within(bar, 'a[href*="watch?v="]')?.href);
    } else if (provider.id === "youtube") {
      title = text(document.querySelector("ytd-watch-metadata h1, h1.title")) || metadata?.title;
      artist = text(document.querySelector("ytd-watch-metadata #owner #channel-name a, #owner #channel-name a")) || metadata?.artist;
      if (videoId) artwork = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    } else {
      const widget = document.querySelector('[data-testid="now-playing-widget"]');
      title = text(widget?.querySelector('[data-testid="context-item-link"], a[href*="/track/"]')) || metadata?.title;
      artist = text(widget?.querySelector('[data-testid="context-item-info-subtitles"]')) || metadata?.artist;
      artwork = widget?.querySelector("img")?.currentSrc;
    }

    title = clip(title, 300);
    if (!title || (!elements.video && !elements.play)) return null;
    artist = clip(artist);
    artwork = common.artworkUrl(artwork) || common.artworkUrl(metadata?.artwork?.at(-1)?.src);
    const ad = provider.id !== "spotify" && Boolean(document.querySelector("#movie_player.ad-showing"));
    let duration = elements.video?.duration;
    let position = elements.video?.currentTime ?? 0;
    let volume = elements.video?.volume ?? sliderValue(elements.volume);
    let muted = elements.video?.muted ?? false;
    let playing = elements.video ? !elements.video.paused && !elements.video.ended : navigator.mediaSession?.playbackState === "playing";

    if (provider.id === "youtubeMusic" && !elements.video) {
      const label = elements.play?.getAttribute("aria-label") || elements.play?.getAttribute("title") || "";
      const glyph = elements.play?.getAttribute("icon") || within(elements.play, "[icon]")?.getAttribute("icon") || "";
      if (/pause/i.test(label + glyph)) playing = true;
      else if (/\bplay\b/i.test(label + glyph)) playing = false;
      const times = text(within(elements.bar, ".time-info, #time-info")).match(/\d{1,3}:\d{2}(?::\d{2})?/g) || [];
      duration = common.parseTime(times[1]) || Number(elements.seek?.getAttribute("aria-valuemax")) || null;
      position = common.parseTime(times[0]) ?? (sliderValue(elements.seek) ?? 0) * (duration || 0);
      muted = volume === 0;
    }

    if (provider.id === "spotify") {
      duration = common.parseTime(text(document.querySelector('[data-testid="playback-duration"]')));
      position = common.parseTime(text(document.querySelector('[data-testid="playback-position"]'))) ?? (sliderValue(elements.seek) ?? 0) * (duration || 0);
      const label = elements.play?.getAttribute("aria-label") || "";
      if (navigator.mediaSession?.playbackState === "none" || !navigator.mediaSession) playing = /pause/i.test(label);
      muted = volume === 0;
    }

    duration = Number.isFinite(duration) && duration > 0 ? duration : null;
    position = Number.isFinite(position) ? Math.max(0, Math.min(position, duration ?? position)) : 0;
    volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : null;
    return {
      provider: provider.id, title: ad ? "Advertisement" : title, artist: ad ? provider.name : artist, album,
      artwork, playing, position, duration, volume, muted, ad, videoId: ad ? "" : videoId,
      playbackRate: elements.video?.playbackRate || 1,
      capabilities: {
        toggle: Boolean(elements.video) || usable(elements.play),
        play: Boolean(elements.video) || usable(elements.play), pause: Boolean(elements.video) || usable(elements.play),
        previous: usable(elements.previous), next: usable(elements.next),
        seek: !ad && Boolean(duration && (elements.video || usable(elements.seek))),
        volume: Boolean(elements.video) || usable(elements.volume),
        mute: Boolean(elements.video) || usable(elements.mute)
      }
    };
  }

  function setSlider(element, fraction) {
    if (!usable(element)) throw new Error("This control is not available in the music tab.");
    if (element instanceof HTMLInputElement) {
      const min = Number(element.min || 0);
      const max = Number(element.max || 100);
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(element, String(min + fraction * (max - min)));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    const bounds = element.getBoundingClientRect();
    const coordinates = { bubbles: true, clientX: bounds.left + Math.max(1, Math.min(bounds.width - 1, bounds.width * fraction)), clientY: bounds.top + bounds.height / 2, button: 0 };
    element.dispatchEvent(new PointerEvent("pointerdown", { ...coordinates, pointerId: 1, pointerType: "mouse", isPrimary: true, buttons: 1 }));
    element.dispatchEvent(new MouseEvent("mousedown", { ...coordinates, buttons: 1 }));
    document.dispatchEvent(new MouseEvent("mousemove", { ...coordinates, buttons: 1 }));
    element.dispatchEvent(new PointerEvent("pointerup", { ...coordinates, pointerId: 1, pointerType: "mouse", isPrimary: true }));
    document.dispatchEvent(new MouseEvent("mouseup", coordinates));
    element.dispatchEvent(new MouseEvent("click", coordinates));
  }

  async function act(action, value, expectedVideoId) {
    const elements = mediaElements();
    const state = snapshot();
    if (!state || !state.capabilities[action]) throw new Error("This control is not available for the current track.");
    if (expectedVideoId && (state.ad || state.videoId !== expectedVideoId)) throw new Error("The song changed before playback could be transferred. Try again.");

    if (action === "toggle" || action === "play" || action === "pause") {
      if (elements.video) {
        const shouldPlay = action === "play" || (action === "toggle" && elements.video.paused);
        if (shouldPlay && elements.video.paused) {
          try { await elements.video.play(); }
          catch { throw new Error("Open the music tab and start playback once, then try again."); }
        } else if (!shouldPlay) elements.video.pause();
      } else if (action === "toggle" || (action === "play" && !state.playing) || (action === "pause" && state.playing)) elements.play.click();
    } else if (action === "previous" || action === "next") {
      elements[action].click();
    } else if (action === "seek") {
      if (!Number.isFinite(value) || value < 0 || value > state.duration) throw new Error("Invalid playback position.");
      if (elements.video) elements.video.currentTime = value;
      else setSlider(elements.seek, value / state.duration);
    } else if (action === "volume") {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid volume.");
      if (elements.video) {
        elements.video.volume = value;
        elements.video.muted = value === 0;
      } else setSlider(elements.volume, value);
    } else if (action === "mute") {
      if (elements.video) {
        if (elements.video.volume === 0) {
          elements.video.volume = 0.5;
          elements.video.muted = false;
        } else elements.video.muted = !elements.video.muted;
      } else elements.mute.click();
    }
    return snapshot();
  }

  const listener = (message, sender, respond) => {
    if (sender.id !== api.runtime.id) return false;
    if (message?.type === "tarnishtab:media-state") {
      respond({ ok: true, track: snapshot() });
      return false;
    }
    if (message?.type !== "tarnishtab:media-action") return false;
    act(message.action, message.value, message.videoId).then(
      (track) => respond({ ok: true, track }),
      (error) => respond({ ok: false, error: error.message })
    );
    return true;
  };
  api.runtime.onMessage.addListener(listener);
  globalThis.__tarnishMediaConnector = { version: 2, dispose: () => api.runtime.onMessage.removeListener?.(listener) };
})();
