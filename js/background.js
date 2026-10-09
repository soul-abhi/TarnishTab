/*! TarnishTab | (c) 2026 @soul-abhi | https://github.com/soul-abhi | MIT License */

const api = globalThis.browser ?? globalThis.chrome;

const COMMAND = "quick-save";
const KEY = "sourceLinks";
const MAX_LINKS = 200;

const FOCUS_COMMAND = "focus-task";
const NEWTAB_URL = api.runtime.getURL("newtab.html");

const NEWTAB_PREFIXES = [
  "chrome://newtab",
  "edge://newtab",
  "about:newtab",
  "about:home",
  NEWTAB_URL
];

async function focusTaskInput() {
  let tab;
  try {
    [tab] = await api.tabs.query({ active: true, currentWindow: true });
  } catch {
    return;
  }
  if (!tab) return;
  const url = tab.url || tab.pendingUrl || "";
  const isOurNewTab = NEWTAB_PREFIXES.some((prefix) => url.startsWith(prefix));
  if (!isOurNewTab) return;
  api.tabs.update(tab.id, { url: NEWTAB_URL + "#task" }).catch(() => {});
}

api.commands.onCommand.addListener(async (command) => {
  if (command === FOCUS_COMMAND) {
    await focusTaskInput();
    return;
  }
  if (command !== COMMAND) return;

  let tab;
  try {
    [tab] = await api.tabs.query({ active: true, currentWindow: true });
  } catch {
    return;
  }
  if (!tab || !tab.url) return;
  if (!/^https?:\/\//i.test(tab.url)) return;

  const entry = { title: tab.title || tab.url, url: tab.url, savedAt: Date.now() };

  try {
    const result = await api.storage.local.get(KEY);
    const links = Array.isArray(result[KEY]) ? result[KEY] : [];
    links.unshift(entry);

    const deduped = [];
    const seen = new Set();
    for (const link of links) {
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      deduped.push(link);
      if (deduped.length >= MAX_LINKS) break;
    }

    await api.storage.local.set({ [KEY]: deduped });
    api.runtime.sendMessage({ type: "source-updated" }).catch(() => {});
  } catch {}
});
