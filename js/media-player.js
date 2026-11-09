/*! TarnishTab | (c) 2026 @soul-abhi | https://github.com/soul-abhi | MIT License */

(() => {
  const origin = "https://www.youtube.com";
  const commands = new Set(["playVideo", "pauseVideo", "seekTo", "setVolume", "mute", "unMute", "setPlaybackRate", "addEventListener"]);
  const errors = {
    2: "YouTube could not load this song. Try another track.",
    5: "This browser could not play the YouTube video. Use its music tab instead.",
    100: "This song is unavailable on YouTube.",
    101: "The owner does not allow this song to play in an embedded player.",
    150: "The owner does not allow this song to play in an embedded player.",
    153: "YouTube did not accept the player identity. Reload the extension or use the music tab."
  };

  class YouTubePlayer {
    constructor(host, { videoId, position = 0, identity, onUpdate, onError }) {
      if (!globalThis.TarnishMedia.videoId(videoId)) throw new Error("Invalid YouTube song.");
      this.id = `tarnishtab-${crypto.randomUUID()}`;
      this.expectedVideoId = videoId;
      this.onUpdate = onUpdate;
      this.onError = onError;
      this.waiters = new Set();
      this.disposed = false;
      this.error = null;
      this.state = { ready: false, playerState: -1, position: 0, duration: null, volume: 1, muted: true, playbackRate: 1, videoId: "", title: "", artist: "" };
      this.frame = document.createElement("iframe");
      this.frame.title = "YouTube music player";
      this.frame.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
      this.frame.allowFullscreen = true;
      this.frame.referrerPolicy = "strict-origin-when-cross-origin";
      const url = new URL(`/embed/${videoId}`, origin);
      for (const [key, value] of Object.entries({ enablejsapi: 1, controls: 1, playsinline: 1, autoplay: 1, mute: 1,
        start: Math.max(0, Math.floor(position)), origin: location.origin, widget_referrer: identity })) url.searchParams.set(key, value);
      this.frame.src = url.href;
      this.listen = () => this.frame.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: this.id, channel: "widget" }), origin);
      this.messageListener = (event) => this.receive(event);
      window.addEventListener("message", this.messageListener);
      this.frame.addEventListener("load", () => {
        if (this.disposed) return;
        this.listen();
        clearInterval(this.listenTimer);
        this.listenTimer = setInterval(this.listen, 300);
      });
      host.replaceChildren(this.frame);
    }

    receive(event) {
      if (this.disposed || event.origin !== origin || event.source !== this.frame.contentWindow
        || typeof event.data !== "string" || event.data.length > 100000) return;
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!message || typeof message !== "object" || (message.id && message.id !== this.id)) return;
      if (message.event === "onError") {
        this.fail(new Error(errors[message.info] || "YouTube playback failed. Use the music tab instead."));
        return;
      }
      if (message.event === "onAutoplayBlocked") {
        this.fail(new Error("Playback was blocked. Start the song in the visible YouTube player, then try Play here again."));
        return;
      }
      if (message.event === "onReady") {
        this.state.ready = true;
        clearInterval(this.listenTimer);
        for (const name of ["onStateChange", "onError", "onAutoplayBlocked"]) this.command("addEventListener", [name]);
      } else if (message.event === "onStateChange" && [-1, 0, 1, 2, 3, 5].includes(message.info)) {
        this.state.playerState = message.info;
      } else if (["initialDelivery", "infoDelivery"].includes(message.event) && message.info && typeof message.info === "object") {
        this.update(message.info);
      } else return;
      for (const waiter of [...this.waiters]) waiter.check();
      this.onUpdate?.({ ...this.state });
    }

    update(info) {
      if (Number.isFinite(info.currentTime) && info.currentTime >= 0 && info.currentTime <= 86400) this.state.position = info.currentTime;
      if (Number.isFinite(info.duration) && info.duration > 0 && info.duration <= 86400) this.state.duration = info.duration;
      if ([-1, 0, 1, 2, 3, 5].includes(info.playerState)) this.state.playerState = info.playerState;
      if (Number.isFinite(info.volume)) this.state.volume = Math.max(0, Math.min(1, info.volume / 100));
      if (typeof info.muted === "boolean") this.state.muted = info.muted;
      if (Number.isFinite(info.playbackRate) && info.playbackRate >= 0.25 && info.playbackRate <= 4) this.state.playbackRate = info.playbackRate;
      const data = info.videoData;
      if (data && typeof data === "object") {
        const videoId = globalThis.TarnishMedia.videoId(data.video_id);
        if (videoId) this.state.videoId = videoId;
        if (typeof data.title === "string") this.state.title = data.title.slice(0, 300);
        if (typeof data.author === "string") this.state.artist = data.author.slice(0, 200);
      }
    }

    command(func, args = []) {
      if (this.disposed) throw new Error("Playback here was stopped.");
      if (!commands.has(func)) throw new Error("Unsupported YouTube player control.");
      this.frame.contentWindow.postMessage(JSON.stringify({ event: "command", func, args, id: this.id }), origin);
    }

    waitFor(predicate, timeout = 12000) {
      if (this.disposed || this.error) return Promise.reject(this.error || new Error("Playback here was stopped."));
      if (predicate(this.state)) return Promise.resolve({ ...this.state });
      return new Promise((resolve, reject) => {
        const finish = (error) => {
          clearTimeout(waiter.timer);
          this.waiters.delete(waiter);
          if (error) reject(error); else resolve({ ...this.state });
        };
        const waiter = { check: () => { if (predicate(this.state)) finish(); }, reject: finish };
        waiter.timer = setTimeout(() => finish(new Error("YouTube did not start playback. Try its visible player or use the music tab.")), timeout);
        this.waiters.add(waiter);
      });
    }

    async start() {
      await this.waitFor((state) => state.ready, 20000);
      this.command("mute");
      this.command("playVideo");
      return this.waitFor((state) => state.playerState === 1 && state.videoId === this.expectedVideoId && state.duration > 0, 20000);
    }

    async play() {
      this.command("playVideo");
      return this.waitFor((state) => state.playerState === 1);
    }

    async pause() {
      this.command("pauseVideo");
      return this.waitFor((state) => state.playerState === 2 || state.playerState === 0);
    }

    async seek(position) {
      if (!Number.isFinite(position) || position < 0 || position > (this.state.duration || 86400)) throw new Error("Invalid playback position.");
      this.command("seekTo", [position, true]);
      return this.waitFor((state) => Math.abs(state.position - position) < 2);
    }

    async volume(value) {
      if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error("Invalid volume.");
      this.command("setVolume", [Math.round(value * 100)]);
      await this.mute(value === 0);
      return this.waitFor((state) => Math.abs(state.volume - value) < 0.02);
    }

    async mute(value) {
      this.command(value ? "mute" : "unMute");
      return this.waitFor((state) => state.muted === value);
    }

    fail(error) {
      if (this.error || this.disposed) return;
      this.error = error;
      clearInterval(this.listenTimer);
      for (const waiter of [...this.waiters]) waiter.reject(error);
      this.onError?.(error);
    }

    destroy() {
      if (this.disposed) return;
      this.disposed = true;
      clearInterval(this.listenTimer);
      window.removeEventListener("message", this.messageListener);
      for (const waiter of [...this.waiters]) waiter.reject(new Error("Playback here was stopped."));
      this.frame.remove();
    }
  }

  globalThis.TarnishYouTubePlayer = YouTubePlayer;
})();
