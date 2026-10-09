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
  if (document.activeElement === taskInput) return;

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

async function init() {
  const [storedTasks, storedRemoved] = await Promise.all([
    loadState("tasks"),
    loadState("removedBookmarks")
  ]);
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
