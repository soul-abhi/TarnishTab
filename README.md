<div align="center">

<img src="assets/Icon-64.png" alt="TarnishTab" width="64" height="64">

# TarnishTab

A fast, keyboard-first New Tab page for Chromium browsers and Firefox.
Tasks, quick-saved sources and bookmarks in one place, on your own wallpaper.

![Manifest](https://img.shields.io/badge/Manifest-V3-1f2937?style=flat-square)
![Version](https://img.shields.io/badge/version-2.1.0-1f2937?style=flat-square)
![Chromium](https://img.shields.io/badge/Chromium-supported-2563eb?style=flat-square&logo=googlechrome&logoColor=white)
![Firefox](https://img.shields.io/badge/Firefox-121%2B-ea580c?style=flat-square&logo=firefoxbrowser&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-none-16a34a?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-0ea5e9?style=flat-square)
![Status](https://img.shields.io/badge/status-active%20development-a855f7?style=flat-square)

[Features](#features) &nbsp;&middot;&nbsp;
[Keyboard Shortcuts](#keyboard-shortcuts) &nbsp;&middot;&nbsp;
[Installation](#installation) &nbsp;&middot;&nbsp;
[Customization](#customization) &nbsp;&middot;&nbsp;
[Roadmap](#roadmap)

Made by [@soul-abhi](https://github.com/soul-abhi)

</div>

---

## Overview

TarnishTab replaces the default New Tab page with a clean three-column
workspace. It is built with plain HTML, CSS and JavaScript on Manifest V3,
has no build step and no third-party dependencies, and the same set of files
runs in Chrome, Edge, Brave, Vivaldi, Arc and Firefox.

| Column | Purpose |
| :--- | :--- |
| **Tasks** | A lightweight to-do list. Type, press Enter, done. |
| **Source** | Pages you saved from anywhere in the browser with a single shortcut. |
| **Bookmarks** | Your curated links, grouped by board, each with its site icon. |

On smaller screens the columns stack into a single column.

## Features

**Tasks**
- Add a task by typing and pressing <kbd>Enter</kbd>.
- Click a task to move it between *Task You Added* and *Task You Completed*.
- Hover a task and use the remove button to delete it.
- Live counters for pending and completed tasks.
- A half-typed task is kept when the page reloads.

**Source (quick-save)**
- Save the active tab from any website with <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Y</kbd>.
- Newest entries appear first and duplicate URLs are merged.
- Open New Tab pages refresh automatically when something is saved.
- Keeps up to 200 entries.

**Bookmarks**
- Grouped by board, in the order they are defined.
- Real site icons, with a coloured letter avatar as a fallback when offline.
- Hide any bookmark from the page; restore all of them with one click.
- Links open in the same tab.

**Wallpaper**
- Set your own wallpaper straight from the page with the **Wallpaper** button.
- Pick an image, animated GIF or video (MP4, WebM, Ogg) from your computer.
- Or paste a direct link to an image or video on the web.
- Videos play muted and loop, for a live wallpaper.
- Optional dim overlay to keep text readable on bright images.
- One click to go back to the default wallpaper.

**Appearance**
- Translucent task panel with an animated gradient border.
- Respects the system *reduce motion* setting.

**Storage**
- Data is saved in extension storage and mirrored to `localStorage`,
  so it survives browser restarts.

## Keyboard Shortcuts

The page is designed to be used without a mouse. These are the shortcuts
available today.

### Global (work anywhere in the browser)

| Shortcut | macOS | Action |
| :--- | :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Y</kbd> | <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Y</kbd> | Save the current tab to the **Source** panel |
| <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd> | <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd> | On the New Tab page, move focus from the address bar to the task box |

### On the New Tab page

| Shortcut | Action |
| :--- | :--- |
| <kbd>Enter</kbd> | Add the typed task |
| <kbd>Shift</kbd> + <kbd>Enter</kbd> | Reload the page and return focus to the task box (your draft is kept) |
| <kbd>Esc</kbd> | Leave the task box, or close the wallpaper panel |
| <kbd>Shift</kbd> + <kbd>K</kbd> | Complete the focused task, or the top pending task if none is focused |
| <kbd>Shift</kbd> + <kbd>W</kbd> | Open or close the wallpaper panel |
| <kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd> | Move between tasks, links and buttons |

> **Tip:** a typical flow is <kbd>Ctrl</kbd> + <kbd>T</kbd> to open a tab,
> type a task, <kbd>Enter</kbd>, then <kbd>Esc</kbd> followed by
> <kbd>Shift</kbd> + <kbd>K</kbd> to tick tasks off as you finish them.

### Changing the global shortcuts

| Browser | Where |
| :--- | :--- |
| Chrome, Brave, Vivaldi, Arc | `chrome://extensions/shortcuts` |
| Edge | `edge://extensions/shortcuts` |
| Firefox | `about:addons`, gear menu, *Manage Extension Shortcuts* |

On some Firefox setups <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Y</kbd> opens
the Downloads library. If it clashes, rebind quick-save from the page above.

> More shortcuts are being worked on to make the keyboard experience even
> smoother. See the [Roadmap](#roadmap).

## Installation

### Chromium browsers (Chrome, Edge, Brave, Vivaldi, Arc)

1. Open the extensions page:
   - Chrome, Vivaldi, Arc: `chrome://extensions`
   - Brave: `brave://extensions`
   - Edge: `edge://extensions`
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `tarnishtab` folder.
4. Open a new tab.

Chrome may show a warning about the Firefox-specific manifest keys
(`background.scripts`, `browser_specific_settings`). It is harmless and
those keys are ignored.

### Firefox 121 or newer

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on** and select `manifest.json`.
3. When Firefox asks about the changed New Tab page, choose **Keep**.

Temporary add-ons are removed when Firefox closes. For a permanent install,
sign the extension as an unlisted add-on on
[addons.mozilla.org](https://addons.mozilla.org/developers/), or use
Firefox Developer Edition or Nightly with `xpinstall.signatures.required`
set to `false`.

### Other browsers

| Browser | Status |
| :--- | :--- |
| Opera | Does not let extensions replace its Speed Dial page |
| Safari | Requires conversion with `safari-web-extension-converter`; New Tab override is not supported |

### Updating after changes

Edit any file, then press the reload button on the extension's card in the
extensions page. Your tasks and saved sources are kept.

## Customization

### Wallpaper

The easiest way is from the page itself. Click **Wallpaper** in the bottom
right corner, or press <kbd>Shift</kbd> + <kbd>W</kbd>.

| Option | What it does |
| :--- | :--- |
| **Choose from computer** | Uses an image, GIF or video file from your PC. The file is copied into the extension's own storage (IndexedDB), so it keeps working even if you move or delete the original. Large files are fine. |
| **Paste a link** | Uses an image or video from the web. The link must point directly to the file. Links ending in `.mp4`, `.webm`, `.ogv`, `.mov` or `.m4v` are played as video. |
| **Dim** | Adds a dark overlay on top of the wallpaper for better contrast. |
| **Reset to default** | Removes your wallpaper and goes back to `assets/bg.jpg`. |

Your choice is remembered across restarts. Wallpapers added from a link need
an internet connection to load.

To change the built-in default instead, replace `assets/bg.jpg` with any
image and reload the extension, or update the path in `css/style.css`:

```css
body {
  background: url("../assets/bg.jpg") center / cover no-repeat fixed, #0b0f1e;
}
```

If the default image cannot be loaded, the page falls back to a dark solid colour.

### Bookmarks

Bookmarks live in `js/data.js`. Each entry has a `board`, a `title` and a
`url`, and entries are grouped on the page by `board`.

```js
const BOOKMARKS = [
  { board: "Quick Saved", title: "Medium Collection", url: "https://example.com/article" },
  { board: "UI/UX",       title: "10015 Tools",       url: "https://10015.io/" }
];
```

- Only `http` and `https` URLs are shown; anything else is skipped.
- Icons are loaded from Google's favicon service.
- Hiding a bookmark on the page does not modify `js/data.js`. Hidden items
  are stored under the `removedBookmarks` key and can be brought back with
  **Restore removed bookmarks**.

The current list was generated from a bookmark export. To refresh it,
export again and replace the `BOOKMARKS` array with the active entries.

## Project Structure

```text
tarnishtab/
├── LICENSE              MIT License
├── manifest.json        Extension manifest, New Tab override, shortcuts
├── newtab.html          Page markup
├── css/
│   └── style.css        Layout, theme and animations
├── js/
│   ├── background.js    Background worker for the global shortcuts
│   ├── data.js          Bookmark list
│   └── script.js        Tasks, Source and Bookmarks logic
└── assets/
    ├── bg.jpg           Wallpaper
    └── Icon-*.png       Extension icons (16, 48, 64)
```

## Permissions

| Permission | Why it is needed |
| :--- | :--- |
| `storage` | Saves tasks, hidden bookmarks, quick-saved sources and wallpaper settings |
| `tabs` | Reads the title and URL of the active tab when you use quick-save |

No host permissions are requested and no data leaves your browser, apart
from the favicon requests used to display site icons.

## Troubleshooting

| Problem | Fix |
| :--- | :--- |
| Background is a plain dark colour | `assets/bg.jpg` is missing or unreadable |
| A wallpaper link does not load | The link must open the image or video file itself, not a web page that shows it. Some sites also block their files from being used elsewhere |
| A video wallpaper shows nothing | The browser cannot play that format. Convert it to MP4 (H.264) or WebM |
| Bookmarks do not appear | Check that `js/data.js` loads without errors. Inspect the page from the extension card (*Inspect views: newtab.html*) |
| Quick-save does nothing | Another extension may own the shortcut. Reassign it from the shortcuts page |
| Quick-save ignores a page | Only `http` and `https` pages can be saved |

## Roadmap

This project is under active development. Work currently in progress to
improve the experience:

- [ ] More keyboard shortcuts for navigating and editing tasks
- [ ] Inline editing and reordering of tasks
- [ ] Adding and editing bookmarks directly from the page
- [ ] Search across tasks, sources and bookmarks
- [x] Wallpaper picker with support for your own images and videos
- [ ] Wallpaper fit and position options
- [ ] Light and dark theme options
- [ ] Import and export of all saved data

Suggestions and feedback are welcome.

## License

Released under the [MIT License](LICENSE).

Copyright (c) 2026 [@soul-abhi](https://github.com/soul-abhi)
