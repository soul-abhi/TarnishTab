/*! TarnishTab | (c) 2026 @soul-abhi | https://github.com/soul-abhi | MIT License */

const ext = globalThis.browser ?? globalThis.chrome;

const hasChromeStorage = Boolean(ext?.storage?.local);

async function loadState(key) {
  if (hasChromeStorage) {
    try {
      const result = await ext.storage.local.get(key);
      if (result[key] !== undefined) return result[key];
    } catch {}
  }
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveState(key, value) {
  if (hasChromeStorage) {
    ext.storage.local.set({ [key]: value }).catch(() => {});
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const linksList = document.getElementById("linksList");
const restoreBtn = document.getElementById("restoreLinksBtn");

const byBoard = {};
for (const item of BOOKMARKS) {
  (byBoard[item.board] ||= []).push(item);
}

let removedBookmarks = new Set();

function linkUrl(item) {
  let parsed;
  try {
    parsed = new URL(item.url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return parsed;
}

function buildLink(item, parsed) {
  const a = document.createElement("a");
  a.className = "link";
  a.href = parsed.href;

  const img = document.createElement("img");
  img.className = "link-icon";
  img.alt = "";
  img.loading = "lazy";
  img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
  img.addEventListener("error", () => {
    const letter = document.createElement("span");
    letter.className = "link-icon letter";
    letter.style.background = `hsl(${hue(item.title)} 70% 46%)`;
    letter.textContent = initial(item.title);
    img.replaceWith(letter);
  });

  const label = document.createElement("span");
  label.textContent = item.title;

  a.append(img, label);
  return a;
}

function renderLinks() {
  linksList.replaceChildren();

  for (const [board, items] of Object.entries(byBoard)) {
    const kept = items.filter((item) => {
      const parsed = linkUrl(item);
      return parsed && !removedBookmarks.has(parsed.href);
    });
    if (kept.length === 0) continue;

    const header = document.createElement("h2");
    header.className = "board-title";
    header.textContent = board;
    linksList.append(header);

    for (const item of kept) {
      const parsed = linkUrl(item);

      const li = document.createElement("li");
      li.className = "bookmark";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "bookmark-remove";
      remove.setAttribute("aria-label", `Remove ${item.title}`);
      remove.textContent = "✕";
      remove.addEventListener("click", () => {
        removedBookmarks.add(parsed.href);
        saveState("removedBookmarks", [...removedBookmarks]);
        renderLinks();
      });

      li.append(buildLink(item, parsed), remove);
      linksList.append(li);
    }
  }

  restoreBtn.hidden = removedBookmarks.size === 0;
}

restoreBtn.addEventListener("click", () => {
  removedBookmarks = new Set();
  saveState("removedBookmarks", []);
  renderLinks();
});

function initial(name) {
  return (String(name).trim().charAt(0) || "?").toUpperCase();
}

function hue(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

const SOURCE_KEY = "sourceLinks";
const sourceList = document.getElementById("sourceList");
let sourceLinks = [];

function renderSources() {
  sourceList.replaceChildren();
  if (sourceLinks.length === 0) {
    const empty = document.createElement("li");
    empty.className = "sources-empty";
    empty.textContent = "Nothing saved yet.";
    sourceList.append(empty);
    return;
  }
  for (const item of sourceLinks) {
    const parsed = linkUrl(item);
    if (!parsed) continue;
    const li = document.createElement("li");
    li.className = "bookmark";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "bookmark-remove";
    remove.setAttribute("aria-label", `Remove ${item.title}`);
    remove.textContent = "✕";
    remove.addEventListener("click", () => {
      sourceLinks = sourceLinks.filter((l) => l.url !== item.url);
      saveState(SOURCE_KEY, sourceLinks);
      renderSources();
    });

    li.append(buildLink(item, parsed), remove);
    sourceList.append(li);
  }
}

function updateSources() {
  loadState(SOURCE_KEY).then((stored) => {
    sourceLinks = Array.isArray(stored) ? stored : [];
    renderSources();
  });
}

if (ext?.runtime?.onMessage) {
  ext.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "source-updated") updateSources();
  });
}

let tasks = [];

const taskForm = document.getElementById("taskForm");
const taskInput = document.getElementById("taskInput");
const taskList = document.getElementById("taskList");
const doneList = document.getElementById("doneList");
const pendingCount = document.getElementById("pendingCount");
const doneCount = document.getElementById("doneCount");

function saveTasks() {
  saveState("tasks", tasks);
}

function renderTasks() {
  const pending = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  fillTaskList(taskList, pending, "No tasks yet. Add one above.");
  fillTaskList(doneList, done, "Nothing completed yet.");
  pendingCount.textContent = pending.length;
  doneCount.textContent = done.length;
}

function fillTaskList(list, items, emptyText) {
  list.replaceChildren();
  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "todo-empty";
    empty.textContent = emptyText;
    list.append(empty);
    return;
  }
  for (const task of items) {
    const li = document.createElement("li");
    li.className = "task" + (task.done ? " done" : "");
    li.dataset.id = task.id;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "task-toggle";
    toggle.setAttribute("aria-label", task.done ? "Mark as not done" : "Mark as done");
    toggle.textContent = task.done ? "✓" : "";

    const text = document.createElement("span");
    text.className = "task-text";
    text.textContent = task.text;

    const del = document.createElement("button");
    del.type = "button";
    del.className = "task-delete";
    del.setAttribute("aria-label", "Delete task");
    del.textContent = "✕";

    li.append(toggle, text, del);
    list.append(li);
  }
}

taskForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = taskInput.value.trim();
  if (!text) return;
  tasks.push({ id: Date.now(), text, done: false });
  saveTasks();
  taskInput.value = "";
  renderTasks();
});

function onTaskClick(event) {
  const li = event.target.closest(".task");
  if (!li) return;
  const id = Number(li.dataset.id);
  if (event.target.closest(".task-delete")) {
    tasks = tasks.filter((t) => t.id !== id);
  } else {
    const task = tasks.find((t) => t.id === id);
    if (task) task.done = !task.done;
  }
  saveTasks();
  renderTasks();
}

taskList.addEventListener("click", onTaskClick);
doneList.addEventListener("click", onTaskClick);

const DRAFT_KEY = "taskDraft";

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.shiftKey) return;
  if (event.target.closest?.(".wallpaper-control")) return;
  if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  event.preventDefault();
  try {
    if (taskInput.value) sessionStorage.setItem(DRAFT_KEY, taskInput.value);
  } catch {}
  location.reload();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && document.activeElement === taskInput) {
    taskInput.blur();
    return;
  }
  if (event.key.toLowerCase() !== "k" || !event.shiftKey) return;
  if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  if (event.target.closest?.("input, textarea, [contenteditable]")) return;

  const focused = document.activeElement?.closest?.("#taskList .task");
  const id = focused ? Number(focused.dataset.id) : null;
  const task = tasks.find((t) => !t.done && (id === null || t.id === id));
  if (!task) return;
  event.preventDefault();
  task.done = true;
  saveTasks();
  renderTasks();
  taskList.querySelector(".task .task-toggle")?.focus();
});

function restoreDraft() {
  try {
    const draft = sessionStorage.getItem(DRAFT_KEY);
    sessionStorage.removeItem(DRAFT_KEY);
    if (draft) taskInput.value = draft;
  } catch {}
}

const WALLPAPER_KEY = "wallpaper";
const WALLPAPER_DB = "tarnishtab";
const WALLPAPER_STORE = "files";
const VIDEO_EXT = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i;

const wallpaperLayer = document.getElementById("wallpaper");
const wallpaperPanel = document.getElementById("wallpaperPanel");
const wallpaperToggle = document.getElementById("wallpaperToggle");
const wallpaperFile = document.getElementById("wallpaperFile");
const wallpaperUrlForm = document.getElementById("wallpaperUrlForm");
const wallpaperUrl = document.getElementById("wallpaperUrl");
const wallpaperStatus = document.getElementById("wallpaperStatus");
const wallpaperDim = document.getElementById("wallpaperDim");
const wallpaperReset = document.getElementById("wallpaperReset");

let wallpaper = { source: "default", dim: false };
let wallpaperObjectUrl = null;

function openWallpaperDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WALLPAPER_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(WALLPAPER_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function wallpaperDbRun(mode, action) {
  const db = await openWallpaperDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WALLPAPER_STORE, mode);
    const request = action(tx.objectStore(WALLPAPER_STORE));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

const readWallpaperFile = () => wallpaperDbRun("readonly", (store) => store.get(WALLPAPER_KEY));
const writeWallpaperFile = (blob) => wallpaperDbRun("readwrite", (store) => store.put(blob, WALLPAPER_KEY));
const clearWallpaperFile = () => wallpaperDbRun("readwrite", (store) => store.delete(WALLPAPER_KEY));

function setWallpaperStatus(message, isError = false) {
  wallpaperStatus.textContent = message;
  wallpaperStatus.classList.toggle("error", isError);
}

function wallpaperElement(src, isVideo) {
  return new Promise((resolve, reject) => {
    const el = document.createElement(isVideo ? "video" : "img");
    if (isVideo) {
      Object.assign(el, { muted: true, loop: true, autoplay: true, playsInline: true });
      el.addEventListener("loadeddata", () => resolve(el), { once: true });
    } else {
      el.alt = "";
      el.addEventListener("load", () => resolve(el), { once: true });
    }
    el.addEventListener("error", () => reject(new Error("load failed")), { once: true });
    el.src = src;
  });
}

async function showWallpaper(src, isVideo) {
  const el = await wallpaperElement(src, isVideo);
  wallpaperLayer.replaceChildren(el);
  if (isVideo) el.play().catch(() => {});
}

function clearWallpaperLayer() {
  wallpaperLayer.replaceChildren();
  if (wallpaperObjectUrl) {
    URL.revokeObjectURL(wallpaperObjectUrl);
    wallpaperObjectUrl = null;
  }
}

function applyDim() {
  wallpaperLayer.classList.toggle("dim", wallpaper.dim);
  wallpaperDim.setAttribute("aria-pressed", String(wallpaper.dim));
}

async function renderWallpaper() {
  applyDim();
  if (wallpaper.source === "file") {
    const blob = await readWallpaperFile().catch(() => null);
    if (!blob) return clearWallpaperLayer();
    const objectUrl = URL.createObjectURL(blob);
    try {
      await showWallpaper(objectUrl, blob.type.startsWith("video/"));
      if (wallpaperObjectUrl) URL.revokeObjectURL(wallpaperObjectUrl);
      wallpaperObjectUrl = objectUrl;
    } catch {
      URL.revokeObjectURL(objectUrl);
      clearWallpaperLayer();
    }
  } else if (wallpaper.source === "url" && wallpaper.url) {
    await showWallpaper(wallpaper.url, wallpaper.video).catch(() => clearWallpaperLayer());
  } else {
    clearWallpaperLayer();
  }
}

function saveWallpaper() {
  saveState(WALLPAPER_KEY, wallpaper);
}

wallpaperFile.addEventListener("change", async () => {
  const file = wallpaperFile.files[0];
  wallpaperFile.value = "";
  if (!file) return;
  const isVideo = file.type.startsWith("video/");
  if (!isVideo && !file.type.startsWith("image/")) {
    setWallpaperStatus("That file is not an image or video.", true);
    return;
  }
  setWallpaperStatus("Loading...");
  const objectUrl = URL.createObjectURL(file);
  try {
    await showWallpaper(objectUrl, isVideo);
  } catch {
    URL.revokeObjectURL(objectUrl);
    setWallpaperStatus("This file could not be displayed.", true);
    return;
  }
  if (wallpaperObjectUrl) URL.revokeObjectURL(wallpaperObjectUrl);
  wallpaperObjectUrl = objectUrl;
  try {
    await writeWallpaperFile(file);
    wallpaper = { source: "file", name: file.name, dim: wallpaper.dim };
    saveWallpaper();
    setWallpaperStatus(`Using ${file.name}`);
  } catch {
    setWallpaperStatus("Shown for now, but it could not be saved.", true);
  }
});

wallpaperUrlForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  let parsed;
  try {
    parsed = new URL(wallpaperUrl.value.trim());
  } catch {
    setWallpaperStatus("Enter a full link starting with https://", true);
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    setWallpaperStatus("Only http and https links are supported.", true);
    return;
  }
  const isVideo = VIDEO_EXT.test(parsed.pathname);
  setWallpaperStatus("Loading...");
  try {
    await showWallpaper(parsed.href, isVideo);
  } catch {
    setWallpaperStatus("Could not load that link. Check that it points directly to an image or video.", true);
    return;
  }
  if (wallpaperObjectUrl) {
    URL.revokeObjectURL(wallpaperObjectUrl);
    wallpaperObjectUrl = null;
  }
  clearWallpaperFile().catch(() => {});
  wallpaper = { source: "url", url: parsed.href, video: isVideo, dim: wallpaper.dim };
  saveWallpaper();
  wallpaperUrl.value = "";
  setWallpaperStatus("Wallpaper updated.");
});

wallpaperDim.addEventListener("click", () => {
  wallpaper.dim = !wallpaper.dim;
  applyDim();
  saveWallpaper();
});

wallpaperReset.addEventListener("click", () => {
  clearWallpaperLayer();
  clearWallpaperFile().catch(() => {});
  wallpaper = { source: "default", dim: false };
  applyDim();
  saveWallpaper();
  setWallpaperStatus("Back to the default wallpaper.");
});

function setWallpaperPanel(open) {
  wallpaperPanel.hidden = !open;
  wallpaperToggle.setAttribute("aria-expanded", String(open));
  if (open) {
    setWallpaperStatus(wallpaper.source === "file" && wallpaper.name ? `Using ${wallpaper.name}` : "");
    wallpaperUrl.focus();
  }
}

wallpaperToggle.addEventListener("click", () => setWallpaperPanel(wallpaperPanel.hidden));

document.addEventListener("click", (event) => {
  if (wallpaperPanel.hidden) return;
  if (event.target.closest(".wallpaper-control")) return;
  setWallpaperPanel(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !wallpaperPanel.hidden) {
    setWallpaperPanel(false);
    wallpaperToggle.focus();
    return;
  }
  if (event.key.toLowerCase() !== "w" || !event.shiftKey) return;
  if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing) return;
  if (event.target.closest?.("input, textarea, [contenteditable]")) return;
  event.preventDefault();
  setWallpaperPanel(wallpaperPanel.hidden);
});

async function init() {
  const [storedTasks, storedRemoved, storedWallpaper] = await Promise.all([
    loadState("tasks"),
    loadState("removedBookmarks"),
    loadState(WALLPAPER_KEY)
  ]);
  if (storedWallpaper && typeof storedWallpaper === "object") {
    wallpaper = { ...wallpaper, ...storedWallpaper };
  }
  renderWallpaper();
  tasks = Array.isArray(storedTasks) ? storedTasks : [];
  removedBookmarks = new Set(Array.isArray(storedRemoved) ? storedRemoved : []);
  renderLinks();
  updateSources();
  renderTasks();
  restoreDraft();
  taskInput.focus();
  taskInput.setSelectionRange(taskInput.value.length, taskInput.value.length);
}

init();
