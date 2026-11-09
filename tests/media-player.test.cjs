const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/media-player.js"), "utf8");
const videoId = "abcdefghijk";

function harness(t) {
  const calls = [];
  const updates = [];
  const errors = [];
  const listeners = new Set();
  const players = new Set();
  const context = vm.createContext({
    URL, setTimeout, clearTimeout, setInterval, clearInterval,
    crypto: { randomUUID: () => "test-player" },
    location: { origin: "chrome-extension://test-extension" },
    TarnishMedia: { videoId: value => typeof value === "string" && /^[A-Za-z0-9_-]{11}$/.test(value) ? value : "" },
    document: {
      createElement(tag) {
        assert.equal(tag, "iframe");
        return {
          events: new Map(), removed: false,
          contentWindow: { postMessage: (message, origin) => calls.push({ message: JSON.parse(message), origin }) },
          addEventListener(name, listener) { this.events.set(name, listener); },
          remove() { this.removed = true; }
        };
      }
    },
    window: {
      addEventListener: (name, listener) => { assert.equal(name, "message"); listeners.add(listener); },
      removeEventListener: (name, listener) => { assert.equal(name, "message"); listeners.delete(listener); }
    }
  });
  vm.runInContext(source, context);
  t.after(() => { for (const player of players) player.destroy(); });
  const create = (options = {}) => {
    const player = new context.TarnishYouTubePlayer({ replaceChildren() {} }, {
      videoId, identity: "https://tarnishtab.test-extension/", position: 12.8,
      onUpdate: state => updates.push(state), onError: error => errors.push(error), ...options
    });
    players.add(player);
    return player;
  };
  const emit = (player, event, info, overrides = {}) => {
    player.receive({ origin: "https://www.youtube.com", source: player.frame.contentWindow,
      data: JSON.stringify({ event, info, id: player.id }), ...overrides });
  };
  return { create, emit, calls, updates, errors, listeners };
}

test("YouTube playback uses a visible, controlled, muted HTTPS iframe", t => {
  const h = harness(t);
  const player = h.create();
  const url = new URL(player.frame.src);
  assert.equal(url.origin, "https://www.youtube.com");
  assert.equal(url.pathname, `/embed/${videoId}`);
  for (const key of ["enablejsapi", "controls", "autoplay", "mute", "playsinline"]) assert.equal(url.searchParams.get(key), "1");
  assert.equal(url.searchParams.get("start"), "12");
  assert.equal(url.searchParams.get("origin"), "chrome-extension://test-extension");
  assert.equal(url.searchParams.get("widget_referrer"), "https://tarnishtab.test-extension/");
  assert.equal(player.frame.allowFullscreen, true);
  assert.match(player.frame.allow, /autoplay/);
  assert.equal(player.frame.referrerPolicy, "strict-origin-when-cross-origin");
  assert.throws(() => h.create({ videoId: "../not-a-video" }), /Invalid YouTube song/);
});

test("iframe messages reject foreign origins, windows, IDs and malformed payloads", t => {
  const h = harness(t);
  const player = h.create();
  for (const overrides of [
    { origin: "https://evil.test" }, { source: {} },
    { data: JSON.stringify({ event: "onReady", id: "another-player" }) },
    { data: { event: "onReady" } }, { data: "not JSON" }, { data: "x".repeat(100001) }
  ]) h.emit(player, "onReady", null, overrides);
  assert.equal(player.state.ready, false);
  assert.equal(h.updates.length, 0);
  assert.equal(h.calls.length, 0);
});

test("ready state registers only supported YouTube events and targets the exact origin", t => {
  const h = harness(t);
  const player = h.create();
  player.frame.events.get("load")();
  assert.equal(h.calls[0].message.event, "listening");
  h.emit(player, "onReady");
  assert.equal(player.state.ready, true);
  assert.deepEqual(h.calls.slice(1).map(call => call.message.args[0]), ["onStateChange", "onError", "onAutoplayBlocked"]);
  assert.ok(h.calls.every(call => call.origin === "https://www.youtube.com"));
  assert.throws(() => player.command("executeScript"), /Unsupported YouTube player control/);
});

test("YouTube metadata is bounded and invalid state values are ignored", t => {
  const h = harness(t);
  const player = h.create();
  h.emit(player, "infoDelivery", { currentTime: 35, duration: 180, volume: 250, muted: false, playbackRate: 1.5, playerState: 1,
    videoData: { video_id: videoId, title: "x".repeat(400), author: "y".repeat(300) } });
  assert.equal(player.state.position, 35);
  assert.equal(player.state.volume, 1);
  assert.equal(player.state.title.length, 300);
  assert.equal(player.state.artist.length, 200);
  h.emit(player, "infoDelivery", { currentTime: -1, duration: 90000, volume: "25", muted: "true", playbackRate: 10, playerState: 99, videoData: { video_id: "bad" } });
  assert.equal(player.state.position, 35);
  assert.equal(player.state.duration, 180);
  assert.equal(player.state.muted, false);
  assert.equal(player.state.playbackRate, 1.5);
  assert.equal(player.state.playerState, 1);
  assert.equal(player.state.videoId, videoId);
});

test("muted preparation waits for readiness and the selected video's actual playing state", async t => {
  const h = harness(t);
  const player = h.create();
  let finished = false;
  const starting = player.start().then(state => { finished = true; return state; });
  h.emit(player, "onReady");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.calls.slice(-2).map(call => call.message.func), ["mute", "playVideo"]);
  h.emit(player, "infoDelivery", { playerState: 1, duration: 180, videoData: { video_id: "lmnopqrstuv" } });
  await Promise.resolve();
  assert.equal(finished, false);
  h.emit(player, "infoDelivery", { playerState: 1, duration: 180, muted: true, videoData: { video_id: videoId } });
  assert.equal((await starting).videoId, videoId);
  assert.equal(finished, true);
});

test("play, pause, seeking and volume resolve only after matching player updates", async t => {
  const h = harness(t);
  const player = h.create();
  h.emit(player, "infoDelivery", { playerState: 2, duration: 180 });
  const playing = player.play(); h.emit(player, "onStateChange", 1); await playing;
  const paused = player.pause(); h.emit(player, "onStateChange", 2); await paused;
  const seeking = player.seek(30); h.emit(player, "infoDelivery", { currentTime: 30 }); await seeking;
  const volume = player.volume(0.3); h.emit(player, "infoDelivery", { volume: 30, muted: false }); await volume;
  assert.equal(player.state.volume, 0.3);
  assert.equal(player.state.muted, false);
  assert.deepEqual(h.calls.map(call => call.message.func), ["playVideo", "pauseVideo", "seekTo", "setVolume", "unMute"]);
  await assert.rejects(player.seek(-1), /Invalid playback position/);
  await assert.rejects(player.seek(181), /Invalid playback position/);
  await assert.rejects(player.volume(2), /Invalid volume/);
});

test("owner restrictions, missing identity and autoplay blocks reject pending playback", async t => {
  const h = harness(t);
  for (const [event, info, expected] of [["onError", 150, /owner does not allow/], ["onError", 153, /player identity/], ["onAutoplayBlocked", null, /Playback was blocked/]]) {
    const player = h.create();
    const waiting = player.waitFor(state => state.ready);
    h.emit(player, event, info);
    await assert.rejects(waiting, expected);
    player.destroy();
  }
  assert.equal(h.errors.length, 3);
});

test("stopping playback removes listeners and rejects all pending work", async t => {
  const h = harness(t);
  const player = h.create();
  const starting = player.start();
  player.destroy();
  await assert.rejects(starting, /Playback here was stopped/);
  assert.equal(player.frame.removed, true);
  assert.equal(h.listeners.size, 0);
  h.emit(player, "onReady");
  assert.equal(player.state.ready, false);
  assert.throws(() => player.command("playVideo"), /Playback here was stopped/);
});

test("unresponsive YouTube controls time out instead of reporting success", async t => {
  const h = harness(t);
  const player = h.create();
  await assert.rejects(player.waitFor(state => state.ready, 1), /YouTube did not start playback/);
  assert.equal(player.waiters.size, 0);
});
