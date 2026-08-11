# Add Non-Steam Games

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/danielcamilo)

A [Decky Loader](https://decky.xyz) plugin for adding non-Steam games to your Steam library **without leaving Game Mode**.

Normally adding a shortcut means switching to Desktop Mode, opening the Steam client, and digging through "Add a Non-Steam Game". This plugin puts a file browser in the Quick Access menu instead.

## Usage

1. Open the Quick Access menu (`•••`) and select **Add Non-Steam Games**.
2. Pick where to look with the **Browse** switch:
   - **Applications** — everything installed on the device, native, Flatpak and Snap alike, with icons and a search box. This is the one you want for something like Chrome installed from Bazaar.
   - **Files** — **Places** (Home, Downloads, Documents, Games…) and **Drives** (SD card, external disks, with free space shown), then browse to the game's executable.
3. Adjust the name, pick a compatibility tool if the game is a Windows `.exe`, and add launch options, an **Artwork title** or a **Collection** if you want them.
4. Press **Add to Steam**.

The game appears in your library immediately, and the plugin then asks to restart Steam. **Steam only writes its non-Steam game list to disk when it shuts down**, so a game added without a restart is lost if Steam is killed or the Deck loses power. Answer once with *Remember my choice* and it stops asking; change your mind later under **Options → Restart Steam after adding**. **Options → Check saved games** lists what is actually on disk, if you are ever unsure a game stuck.

**Open game page** jumps straight to the new game, and **Undo** removes it again if you picked the wrong file. Everything is a plain vertical list of full-width rows, so the whole flow is D-pad navigable without a trackpad.

### Artwork from SteamGridDB

A shortcut lands in your library as a grey box with a filename on it unless you give it art. With a free [SteamGridDB](https://www.steamgriddb.com) API key the plugin fetches the portrait capsule, the wide grid, the hero banner, the logo and the icon for every game you add.

Set it up once under **Options**:

1. Turn on **Download artwork**.
2. Create a key at [steamgriddb.com/profile/preferences/api](https://www.steamgriddb.com/profile/preferences/api) and copy it, then press **Paste key** under the **SteamGridDB API key** field. The keyboard's own paste key works too, as does typing it in. The key is saved and checked against SteamGridDB straight away, and **Check the artwork key** re-checks it any time.

Art is matched by **title**, so when the name you gave the game is not the name SteamGridDB knows — `Hollow_Knight_Silksong.x86_64`, or a launcher you called *ELDEN RING (mods)* — put the real title in the form's **Artwork title** field. The shortcut keeps your name.

Each add shows a progress bar, then a line under **Last added** saying what it applied. The library art appears immediately; only the icon waits for a restart. If nothing came back, or the art belongs to a different game, correct the **Artwork title** there and press **Try artwork again**. Nothing here can fail the add — the game is in your library before artwork is fetched.

### Applications

The Applications list is collapsed to its search box by default — a Deck with 180 desktop entries would otherwise bury everything below it. Type and matches appear immediately; **Show all applications** opens the full list.

It reads the same `.desktop` files the desktop menu does, in XDG precedence order, so a user override shadows the system copy rather than appearing twice. Each row shows the app's real icon and where it came from (*Flatpak*, *Snap*, *System*, *User*). Hidden entries, non-application types and anything whose binary is not installed are filtered out, so the list matches what you could really launch.

Picking an app fills the form in the same way Steam's own desktop dialog does. For a Flatpak that means the executable is the `flatpak` runner and the launch options carry the run arguments and app ID:

```
Exe:            /usr/bin/flatpak
Launch options: run --branch=stable --arch=x86_64 --command=/app/bin/chrome com.google.Chrome
```

Field codes (`%U`, `%f`, Flatpak's `@@u … @@` wrappers) are stripped, and the app's icon is applied to the shortcut.

### What it handles for you

- **Name** is pre-filled from the filename and stays editable.
- **Start directory** is set to the executable's folder, which is what most games expect.
- **Proton** is preselected for `.exe`, `.bat`, `.cmd` and `.msi` files, using Proton Experimental when available. Any compatibility tool Steam knows about can be chosen instead.
- **Missing executable bit** — downloads often arrive without it and Steam will not launch such a file, so a **Mark as executable** button appears when it is needed.
- **Wrong file type** — picking an archive, a `.dll` or an image gets you a warning rather than a broken shortcut.
- **Localised folders** — Places reads `~/.config/user-dirs.dirs`, so *Downloads* is right whatever your desktop language is, and the folder you browsed last comes first.
- **Drives** are read from `/proc/mounts` and named from their filesystem label rather than `mmcblk0p1`.
- **Collections** are optional. The list is re-read every time the panel opens, so one you just made elsewhere in Steam is there, and creating a name that differs only in case updates the existing collection rather than shadowing it. A collection that fails to file is reported, but the game is still added.

## Troubleshooting

**A game I added is gone after restarting Steam.** It was never committed to disk. Use **Options → Check saved games** to confirm, then re-add and choose **Restart now** when prompted.

**The plugin said "Added, but not confirmed".** Steam accepted the shortcut but did not read it back with the executable we asked for, which usually means the Steam client is in a bad state. Restart Steam and add the game again.

**Nothing happens when I launch the game.** Native Linux games need the executable bit — the plugin offers **Mark as executable** when it is missing, but a drive mounted `noexec` (common for some SD card and NTFS setups) will refuse it, and the plugin will tell you so. Windows games need a compatibility tool selected.

**The API key will not paste.** Press **Paste key** under the field, which goes through Steam's own paste rather than the browser clipboard APIs that Game Mode blocks. If it cannot get at the clipboard it says which routes it tried; check the copy itself took by pasting into the library search box. Typing the key in always works, or write it into `~/homebrew/settings/Add Non-Steam Games/settings.json` as `{"steamgriddb_key": "…"}` and restart `plugin_loader`.

**The artwork never appeared.** The line under **Last added** says why. Press **Check the artwork key** first — most of the time it is the key. If that line instead names applied slots and a file count, the art reached Steam, so press **Open game page** to look; only the icon waits for a restart. A *certificate* error there almost always means the Deck's clock is wrong.

**The artwork is for the wrong game.** SteamGridDB matched a different title, which the **Last added** line names when it differs from what was searched for. Correct the **Artwork title** and press **Try artwork again**, or replace individual images from the game's page.

**Something else is wrong.** The panel says so at the top: *the Python backend is not responding* when the plugin's backend failed to load, and a version mismatch when the zip only half-installed (reinstall it and `sudo systemctl restart plugin_loader`).

Details of every add — including every artwork search, slot and file — go to the plugin's log. Decky keeps it at `~/homebrew/logs/Add Non-Steam Games/plugin.log`; if that folder does not exist, the backend never loaded, and the whole client-side log is at `/tmp/plugin_loader.log` (Decky's own *Settings → Developer → Logs* opens the same thing).

## Installing

Grab `out/Add-Non-Steam-Games-v1.7.9.zip` and either:

- **From the Deck:** Decky Loader → settings (gear) → *Developer mode* → *Install Plugin from URL*, pointing at a URL serving the zip; or
- **Manually:** copy the zip to the Deck, then extract it into `~/homebrew/plugins/`:

  ```bash
  unzip Add-Non-Steam-Games-v1.7.9.zip -d ~/homebrew/plugins/
  sudo systemctl restart plugin_loader
  ```

  You should end up with `~/homebrew/plugins/Add Non-Steam Games/`.

## Development

Requires Node.js 16.14+ and `pnpm` 9+.

```bash
pnpm install
pnpm run build     # compiles src/ to dist/index.js
pnpm run watch     # rebuild on change
pnpm run package   # produces out/<name>-v<version>.zip
```

The frontend lives in `src/`:

- `index.tsx` — the Quick Access panel.
- `store.ts` — the in-progress selection, held outside React (see below).
- `SourceTabs.tsx` — the Applications/Files switch.
- `AppList.tsx` — the searchable installed-application list.
- `LocationList.tsx` — the Places/Drives rows.
- `ListRow.tsx` — the row, group and disclosure primitives the lists are built from.
- `ProgressRow.tsx` — the artwork progress bar, drawn from plain elements (see below).
- `TextEntry.tsx` — the text field every form uses (see below; do not use `TextField` directly).
- `SavedGames.tsx` — the *Check saved games* list.
- `RestartPrompt.tsx` — the post-add restart dialog.
- `version.ts` — the build number, compared against the backend's at startup.
- `steam.ts` — shortcut creation against Steam's own `SteamClient.Apps` API.
- `artwork.ts` — drives the SteamGridDB download slot by slot, reporting progress.
- `backend.ts` / `pathinfo.ts` — typed bindings to `main.py`, and the local fallback used when the backend is unreachable.

### The Quick Access panel unmounts under you

Decky renders plugin content only while the panel is visible, so hiding it destroys the component tree and every bit of React state in it — and opening the file picker hides it. `alwaysRender: true` keeps the tree mounted, and the in-progress selection lives in `store.ts`, a module-level object with a subscription hook, so it survives an unmount even if one happens. Anything that has to outlive a modal belongs there rather than in `useState`.

`main.py` is the Python backend: it inspects picked paths, sets the executable bit, enumerates user directories and drives, stores preferences, fetches artwork and parses `shortcuts.vdf`.

### The plugin's `window` is not the panel's `window`

Plugin JavaScript runs in a different context from the window it renders into. The global `document` is not the one holding the panel, so `document.hasFocus()` is always false and a document-wide query cannot see the panel's own elements. Anything touching focus, the clipboard or `execCommand` goes through `panelWindow()` in `steam.ts`, which resolves the right window from a node; across that boundary prefer `contains()` and `tagName` over `instanceof`.

### Styling, focus and selection

Steam paints gamepad focus onto a button's own surface, so an inline `background`, `border` or `box-shadow` outranks it and swallows the highlight — the user can no longer see what pressing A would do. Steam's class names are hashed at build time, so take them from `@decky/ui`'s class modules instead of writing strings.

`SourceTabs` therefore marks the selected tab from inside the button, with an underline and a heavier font in `currentColor`, so selection and focus read independently. `StackedDropdown` puts label, control and description on their own lines, which at Quick Access width would otherwise each wrap to a couple of words.

### `@decky/ui` components are matched against Steam's bundle

Every component `@decky/ui` exports is one of Steam's own, found at runtime by string-matching its minified code — so a client update can leave an export `undefined`, and rendering that throws.

Keep resolved components off the path of background work. The throw comes back out through the `setState` that reported progress (Steam's React 16 renders those synchronously) and abandons the job: a progress bar that cannot draw itself takes the download with it. `ProgressRow` is a `<div>` and a percentage for that reason, and `fetchArtwork` wraps its progress callback so a UI failure cannot reach the work.

### Text fields need `TextEntry`

Use `TextEntry` for any text field; a bare `TextField` silently eats pastes. The on-screen keyboard pastes **natively**, below React — the element's value changes without a change event, so the next render restores the old value. `TextEntry` watches the real `<input>` instead (`input`, a deferred `paste`, `beforeinput`, and a poll for a value that changes with no event at all) and renders an offscreen input of its own, because `SteamClient.Browser.Paste()` needs a focused editable element.

There is no clipboard outside Steam to fall back on: gamescope implements no `wl_data_device_manager`, so the client's internal one is all there is. `onPasteKey` tries `Browser.Paste()` first, then `navigator.clipboard.readText()`, `execCommand("paste")`, the backend's compositor read for desktop sessions, and finally whatever is already in the field.

### Notes on SteamGridDB

- **Do not write library art into `userdata/<account>/config/grid` yourself.** That is the desktop-tool approach (BoilR, Steam ROM Manager) and a running Steam does not notice it. Apply art with `SteamClient.Apps.SetCustomArtworkForApp(appId, base64, 'png', assetType)` — `ELibraryAssetType` being 0 capsule, 1 hero, 2 logo, 3 header, 4 icon — preceded by `ClearCustomArtworkForApp` and a 500 ms wait, since `Set` will not replace existing art and `Clear` resolves before it has finished. [SteamGridDB's own plugin](https://github.com/SteamGridDB/decky-steamgriddb) is the reference worth reading.
- `'png'` is passed whatever the asset really is: that argument names the file Steam writes, not the format it decodes. A shortcut with no saved logo position renders its logo blank, so a default one is written after applying a logo.
- The icon is the exception, being a path in `shortcuts.vdf` rather than library art: it is written to the grid folder of the account from `MostRecent` in `loginusers.vdf` and applied with `SetShortcutIcon`, only when the shortcut has no icon, and only visible after a restart.
- **Every HTTPS request needs Decky's SSL context** (`from helpers import get_ssl_context`). The plugin sandbox has no CA bundle Python can find, so anything else fails with `CERTIFICATE_VERIFY_FAILED`.
- The backend splits the work into `find_artwork` and one `download_artwork_slot` per slot so progress can be reported, `list_artwork` reads the folder back as proof the art was accepted, and `artwork.ts` keeps a `DEFAULT_SLOTS` fallback — a loop over an empty slot list downloads nothing and reports no error. Downloads block, so they go through `asyncio.to_thread`, and the API key is never written to the log.

### Notes on Steam's shortcut API

- `AddShortcut` is called as `AddShortcut(name, exe, "", "")` — name and exe only, since some builds return `0` when given a start dir or launch options. Those are written afterwards with the `Set*` calls, which silently do nothing until `appStore` knows the app, hence the poll between them.
- **The target must be quoted; the start directory must not.** An unquoted target produces a shortcut that looks right in the library and then fails to launch. Confirmed on hardware.
- `Set*` calls return nothing, so the shortcut is read back through `RegisterForAppDetails` and compared against what was asked for; a mismatch is surfaced to the user rather than swallowed.
- Nothing persists until Steam shuts down cleanly, and `SteamClient.User.StartRestart(false)` is the only way to force that from Game Mode.
- Collections go through the untyped `collectionStore` global: `NewUnsavedCollection(name, undefined, [])`, then `AsDragDropCollection().AddApps([overview])` and `await Save()`. `AddApps` takes app overviews, not appIds.

## Support

This plugin is free and open source, and it will stay that way. If it saved you a trip to Desktop Mode and you feel like saying thanks, you can buy me a coffee — it is genuinely appreciated and it keeps the updates coming ☕

[![Buy me a coffee at ko-fi.com](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/danielcamilo)

Starring the repo, reporting a bug or suggesting a feature helps just as much — and costs nothing.

## License

BSD 3-Clause — see [LICENSE](LICENSE). Built on the [Decky plugin template](https://github.com/SteamDeckHomebrew/decky-plugin-template).
