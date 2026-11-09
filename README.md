<div align="center">

<img src="assets/Icon-64.png" alt="TarnishTab" width="64" height="64">

# TarnishTab ||GIVE A STAR

A fast, keyboard-first New Tab page for Chromium browsers and Firefox.
Tasks, quick-saved sources, bookmarks and music controls on your own wallpaper.

![Manifest](https://img.shields.io/badge/Manifest-V3-1f2937?style=flat-square)
![Version](https://img.shields.io/badge/version-2.1.0-1f2937?style=flat-square)
![Chromium](https://img.shields.io/badge/Chromium-supported-2563eb?style=flat-square&logo=googlechrome&logoColor=white)
![Firefox](https://img.shields.io/badge/Firefox-121%2B-ea580c?style=flat-square&logo=firefoxbrowser&logoColor=white)
![Dependencies](https://img.shields.io/badge/dependencies-none-16a34a?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-0ea5e9?style=flat-square)
![Status](https://img.shields.io/badge/status-active%20development-a855f7?style=flat-square)

[Features](#features) &nbsp;&middot;&nbsp;
[Music](#music) &nbsp;&middot;&nbsp;
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
| **Source & Music** | Quick-saved pages above; a compact music-tab controller below. |
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
- The panel shows the 5 newest links, keeping long titles on one line.
- **Show more** opens a searchable, app-launcher-style drawer with all saved sources. Close it with **Esc**, the close button, or a click outside.
- Keeps up to 200 entries.

**Music**
- A compact bottom-left player, below Sources without covering saved links.
- Automatically detects playing YouTube, YouTube Music or Spotify tabs after separate one-time access for each site.
- Artwork, track details, play/pause, previous/next, seeking, volume and mute where the site supports them.
- Select a music tab when several are open; click the artwork or title to return to it.
- Inline, opt-in lyrics from LRCLIB, with timed highlighting, click-to-seek and a plain-lyrics fallback.
- **Play here** keeps supported YouTube songs playing in New Tab after the source tab closes. Otherwise, playback stays in the original music tab.

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

## Music

1. Reload the extension after updating its files, then open a new tab.
2. Start a song in a **YouTube**, **YouTube Music** or **Spotify** browser tab, then return to New Tab. Sign in on the music site itself if needed.
3. If prompted, choose **Allow YouTube Music** (or the matching site) and approve access once. No music-site access is required at installation.
4. Playing songs appear automatically, including when YouTube Music stays on its home page. There is no routine Connect step.
5. Use the player controls. To open a music site, change access or choose a particular **Music tab**, open **Music settings** with the settings button.

Detection prefers audible playing music over paused tabs. Keep the original
music tab open when the player says **In its tab**. Desktop/mobile music apps
are not detected. **Remove access** in Music settings disables that site's
connector without closing its tab or stopping its playback.

### Play here

For a supported YouTube or YouTube Music song, choose **Play here** to use the
visible YouTube player inside New Tab. This requests separate optional YouTube
player-identification access; it does not enable reading your YouTube tabs.
The new player is checked while muted before the original song is paused.

- Once **In New Tab** appears, you may close the original music tab. **Keep this New Tab open**; closing or reloading it stops playback here.
- **Back to tab** pauses local playback before returning to the matching original song, or opening it again if the source tab was closed.
- **Stop playback here** stops the embedded player; it does not automatically resume the original tab.
- Only the selected song transfers. YouTube Music queues, account features and Spotify playback do not transfer.
- Some songs cannot be embedded. Live streams, ads, unavailable video IDs and provider restrictions can make **Play here** unavailable or fail safely.

This does not bypass subscriptions, DRM, advertisements or provider playback
rules. Controls may be unavailable for some tracks or accounts. If a provider
changes its interface, use the music site's own controls.

### Lyrics

Lyrics flow inline below the player, not in a popup. Choose **Enable lyrics**
to allow anonymous LRCLIB lookups; **Flow** shows or hides the panel.
The lookup sends the song title, artist and duration, not account credentials,
tasks or saved sources. As with any web request, LRCLIB receives your IP address.

- Timed lyrics follow the current line. Click a line to seek when seeking is supported.
- Scroll manually to stop following; use **Follow lyrics** to resume.
- If a match is wrong or missing, open **Lyrics settings**, edit **Song** and **Artist**, then choose **Find lyrics**. YouTube video titles may need correction.
- Songs without timestamps show plain lyrics. Instrumental and unavailable tracks are labelled honestly.
- Lookups are requested only while the panel is on screen. Hiding Flow, scrolling it off screen, opening a modal, leaving New Tab or disabling lyrics cancels pending lookups; a request already sent cannot be recalled.
- **Disable lyrics & remove access** in Lyrics settings removes LRCLIB access. Flow and follow preferences are remembered separately.

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
| <kbd>Esc</kbd> | Leave the task box, or close Sources, Music settings or wallpaper |
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
extensions page. Your tasks and saved sources are kept. Reopen New Tab;
refresh an existing music tab if it still has an older connector loaded.

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
│   ├── style.css        Layout, theme and animations
│   └── media.css        Glass music player, inline lyrics and settings
├── js/
│   ├── background.js    Background worker for the global shortcuts
│   ├── data.js          Bookmark list
│   ├── media-common.js  Provider allowlist, metadata and lyric parsing
│   ├── media-content.js Music-site playback adapters
│   ├── media-background.js Optional access, controls and LRCLIB requests
│   ├── media-player.js  Visible YouTube iframe and playback controls
│   ├── media.js         Automatic detection, playback transfer and inline lyrics
│   └── script.js        Tasks, Source, Bookmarks and wallpaper logic
├── tests/
│   ├── media.test.cjs   Dependency-free media and permission tests
│   └── media-player.test.cjs YouTube controls, message validation and cleanup tests
└── assets/
    ├── bg-lilith.png    Default wallpaper
    └── Icon-*.png       Extension icons (16, 48, 64)
```

## Permissions

| Permission | Why it is needed |
| :--- | :--- |
| `storage` | Saves tasks, hidden bookmarks, quick-saved sources, wallpaper and music preferences |
| `tabs` | Reads the active tab for quick-save and discovers supported music sites and their audible status; song details require separate site approval |

Optional permissions are requested only through a site's **Allow** button,
**Enable lyrics** or **Play here**:

| Optional access | Why it is needed |
| :--- | :--- |
| `scripting` | Runs the bundled playback connector in a music tab |
| `declarativeNetRequestWithHostAccess` | Identifies only the selected YouTube embed with a session-scoped Referer header, restricted to its New Tab, video ID and iframe request; requested only by Play here |
| `https://www.youtube.com/*` | Enables YouTube playback here; reading track details and controlling YouTube tabs additionally require explicit music-site approval |
| `https://music.youtube.com/*` | Reads track details and operates YouTube Music playback controls |
| `https://open.spotify.com/*` | Reads track details and operates Spotify web playback controls |
| `https://lrclib.net/*` | Fetches lyrics after separate consent; no music-account authentication is used |

The same optional host patterns also appear in `optional_permissions` for
Firefox 121–127 compatibility. Modern browsers use `optional_host_permissions`.
Neither declaration grants access without approval.

Tasks and saved sources stay in browser storage. Network requests include
Google's favicon service for link icons, any wallpaper URL you choose,
provider artwork after music-site approval, YouTube when you choose Play here,
and LRCLIB when lyrics are enabled and on screen. The YouTube player uses its
own provider network requests and playback policies. Lyrics are cached briefly
in background memory, not saved as a
listening history. The extension does not read account passwords or tokens.

## Verification

Run the dependency-free unit and permission tests with Node.js:

```sh
node --test tests/*.test.cjs
```

## Troubleshooting

| Problem | Fix |
| :--- | :--- |
| Background is a plain dark colour | `assets/bg.jpg` is missing or unreadable |
| A wallpaper link does not load | The link must open the image or video file itself, not a web page that shows it. Some sites also block their files from being used elsewhere |
| A video wallpaper shows nothing | The browser cannot play that format. Convert it to MP4 (H.264) or WebM |
| Bookmarks do not appear | Check that `js/data.js` loads without errors. Inspect the page from the extension card (*Inspect views: newtab.html*) |
| Quick-save does nothing | Another extension may own the shortcut. Reassign it from the shortcuts page |
| Quick-save ignores a page | Only `http` and `https` pages can be saved |
| Music shows nothing playing | Start a song in a supported browser tab and allow that site's access once. After an update, reload the extension, reopen New Tab and refresh the existing music tab. Desktop/mobile apps are not detected |
| YouTube Music is playing but is not detected | Use Allow YouTube Music if shown, or check its access in Music settings. Refresh music.youtube.com after reloading the extension; song changes are then detected automatically |
| A music control is disabled or fails | The track or site's current interface may not support it. Refresh the music tab after reloading the extension, or use the site's own controls |
| Play here fails or is unavailable | The song needs a valid YouTube video ID and must permit embedded playback. Approve optional player access, keep the visible player on screen during setup, or use the original music tab |
| Lyrics are missing or wrong | Correct the song title and artist. Not every song has lyrics or timing in LRCLIB |
| Lyrics cannot be reached | Check your connection and LRCLIB access; wait before retrying if the service is busy |

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
