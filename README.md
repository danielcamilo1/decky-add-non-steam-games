# Add Non-Steam Games

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/danielcamilo)

A [Decky Loader](https://decky.xyz) plugin for adding non-Steam games to your Steam library **without leaving Game Mode**.

Normally adding a shortcut means switching to Desktop Mode, opening the Steam client, and digging through "Add a Non-Steam Game". This plugin puts a file browser in the Quick Access menu instead.

## Usage

1. Open the Quick Access menu (`•••`) and select **Add Non-Steam Games**.
2. Choose what to browse with the switch at the top:
   - **Applications** — everything installed on the device, native, Flatpak and Snap alike, with icons and a search box. This is the one you want for something like Chrome installed from Bazaar.
   - **Files** — **Places** (Home, Downloads, Documents, Games…) and **Drives** (SD card, external disks, with free space shown), then browse to the game's executable.
3. Adjust the name, pick a compatibility tool if the game is a Windows `.exe`, and add launch options if you need them.
4. Optionally pick a **Collection** to file it under — one of your existing ones, or *New collection…* to create one on the spot.
5. Press **Add to Steam**.

The game appears in your library immediately, and the plugin then offers to restart Steam — see below for why that matters. **Open game page** jumps straight to it, and **Undo** removes it again if you picked the wrong file.

Everything is a plain vertical list of full-width rows, so the whole flow is D-pad navigable without a trackpad.

### Why it asks to restart Steam

Steam keeps its non-Steam game list in memory and only writes `shortcuts.vdf` to disk **during a clean shutdown**. A game added without restarting looks fine right up until Steam is killed or the Deck loses power — then it is gone.

So after each add you get a **Restart Steam?** prompt, with a *Remember my choice* toggle. Your answer is saved as **Always restart** or **Never restart**, and either can be changed later under **Options → Restart Steam after adding** (or set back to *Ask each time*).

**Options → Check saved games** reads `shortcuts.vdf` directly and lists what Steam has actually committed to disk. That is the ground truth if you are ever unsure whether a game really stuck — remember it only changes after a restart.

### Applications

The Applications list reads the same `.desktop` files the desktop menu does — `/usr/share/applications`, both Flatpak export directories, Snap, and your user directory — in XDG precedence order, so a user override shadows the system copy rather than appearing twice. Each row shows the app's real icon and where it came from (*Flatpak*, *Snap*, *System*, *User*).

Entries marked `NoDisplay`/`Hidden`, non-application types, and anything whose binary is not actually installed (`TryExec`) are filtered out, so the list matches what you could really launch.

Picking an app fills the form in the same way Steam's own desktop dialog does. For a Flatpak that means the executable is the `flatpak` runner and the launch options carry the run arguments and app ID:

```
Exe:            /usr/bin/flatpak
Launch options: run --branch=stable --arch=x86_64 --command=/app/bin/chrome com.google.Chrome
```

Desktop-entry field codes (`%U`, `%f`, and Flatpak's `@@u … @@` wrappers) are stripped, since Steam has no use for them. The app's icon is applied to the shortcut too.

### What it handles for you

- **Name** is pre-filled from the filename and stays editable.
- **Start directory** is set to the executable's folder, which is what most games expect.
- **Proton** is preselected for `.exe`, `.bat`, `.cmd` and `.msi` files, using Proton Experimental when available. Any compatibility tool Steam knows about can be chosen from the dropdown.
- **Missing executable bit** — downloads often arrive without it, and Steam will not launch such a file. When that is the case a **Mark as executable** button appears.
- **Wrong file type** — picking an archive, a `.dll` or an image gets you a warning rather than a broken shortcut.
- **Localised folders** — Places reads `~/.config/user-dirs.dirs`, so *Downloads* is right even if your desktop language is not English.
- **Drives** are read from `/proc/mounts` and named from their filesystem label rather than `mmcblk0p1`.
- The most recently browsed folder appears at the top of Places.
- **Collections** are optional and default to *None*. The list is re-read every time the panel opens, so a collection you just made elsewhere in Steam is there. Because Steam treats collection names case-insensitively, creating one that differs only in case updates the existing collection instead of shadowing it. If filing into a collection fails, you are told — but the game is still added, since it exists by that point.

## Troubleshooting

**A game I added is gone after restarting Steam.** It was never committed to disk. Use **Options → Check saved games** to confirm, then re-add and choose **Restart now** when prompted.

**The plugin said "Added, but not confirmed".** Steam accepted the shortcut but did not read it back with the executable we asked for, which usually means the Steam client is in a bad state. Restart Steam and add the game again.

**Nothing happens when I launch the game.** Native Linux games need the executable bit — the plugin offers **Mark as executable** when it is missing, but a drive mounted `noexec` (common for some SD card and NTFS setups) will refuse it, and the plugin will tell you so. Windows games need a compatibility tool selected.

**Something else is wrong.** **Diagnostics → Run checks** reports whether the Python backend loaded, whether each Steam API the plugin needs is actually present, and how many shortcuts Steam has in memory versus saved to disk. A *frontend build MISMATCH* there means the zip only half-installed — reinstall it.

Details of every add are written to `~/homebrew/logs/Add Non-Steam Games/plugin.log`.

## Installing

Grab `out/Add-Non-Steam-Games-v1.6.0.zip` and either:

- **From the Deck:** Decky Loader → settings (gear) → *Developer mode* → *Install Plugin from URL*, pointing at a URL serving the zip; or
- **Manually:** copy the zip to the Deck, then extract it into `~/homebrew/plugins/`:

  ```bash
  unzip Add-Non-Steam-Games-v1.6.0.zip -d ~/homebrew/plugins/
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
- `ListRow.tsx` — the row and group primitives both lists are built from.
- `RestartPrompt.tsx` — the post-add restart dialog.
- `Diagnostics.tsx` — the runtime capability checks.
- `steam.ts` — shortcut creation against Steam's own `SteamClient.Apps` API.
- `backend.ts` / `pathinfo.ts` — typed bindings to `main.py`, and the local fallback used when the backend is unreachable.

### The Quick Access panel unmounts under you

Decky's `PluginView` renders a plugin's content as `{(visible || activePlugin.alwaysRender) && activePlugin.content}` — so the moment the Quick Access panel is hidden, **the whole component tree is unmounted and its React state is destroyed**.

Opening the file picker hides the panel. Without care, the picked file resolves into an unmounted component and the panel reopens blank, looking exactly like the picker did nothing. Two things prevent that:

- `alwaysRender: true` on the plugin, which keeps the content mounted.
- The in-progress selection lives in `store.ts`, a module-level object with a subscription hook, so it survives an unmount even if one happens anyway.

Any state that must outlive opening a modal belongs in the store, not in `useState`.

`main.py` is the Python backend: it inspects picked paths, sets the executable bit, enumerates user directories and mounted drives, stores preferences, and parses `shortcuts.vdf`.

### Notes on Steam's shortcut API

Worth knowing if you touch `steam.ts`:

- `AddShortcut` is called as `AddShortcut(name, exe, "", "")` — **name and exe only**. Handing it a real `startDir` or `launchOptions` makes some client builds return `0` instead of an appId, so those fields are written afterwards via the `Set*` calls instead.
- Those `Set*` calls silently do nothing until Steam has registered the new app, hence the `appStore` poll between the two.
- **The target must be quoted; the start directory must not.** `SetShortcutExe` gets `"/path/to/game"` — an unquoted target produces a shortcut that appears correctly in the library and then silently fails to launch. `SetShortcutStartDir` gets the bare path. Confirmed on hardware.
- Nothing is persisted until Steam shuts down cleanly. `SteamClient.User.StartRestart(false)` is the only way to force it from Game Mode.
- Every `Set*` returns `void` with no success signal, so the shortcut is read back through `RegisterForAppDetails` and compared against what was requested. A mismatch is surfaced to the user rather than swallowed.
- Collections go through the untyped `collectionStore` global: `NewUnsavedCollection(name, undefined, [])` for a new one, then `AsDragDropCollection().AddApps([overview])` and `await Save()`. `AddApps` takes **app overviews**, not appIds, so the shortcut has to be registered in `appStore` first — which the `AddShortcut` path already guarantees.

## Support

This plugin is free and open source, and it will stay that way. If it saved you a trip to Desktop Mode and you feel like saying thanks, you can buy me a coffee — it is genuinely appreciated and it keeps the updates coming ☕

[![Buy me a coffee at ko-fi.com](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/danielcamilo)

Starring the repo, reporting a bug or suggesting a feature helps just as much — and costs nothing.

## License

BSD 3-Clause — see [LICENSE](LICENSE). Built on the [Decky plugin template](https://github.com/SteamDeckHomebrew/decky-plugin-template).
