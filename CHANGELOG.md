# Changelog

The section for a version is what the release workflow puts on that release's
page, so write it for someone deciding whether to update — not for someone
reading the diff.

## v1.7.14

**Compatibility list**

- The **Compatibility** dropdown only offered "None (native Linux game)" on
  current Steam clients, so Windows games could not be given Proton. Steam
  removed the call the plugin used to read the list, and it now uses the service
  that replaced it.
- The list is read each time the panel opens, so a tool installed while the
  plugin is running shows up without restarting anything.
- If Steam still returns no tools, the dropdown says so instead of looking like
  None is the only option.

## v1.7.13

**Steam shortcuts list**

- **Check saved games** is now **Load Steam Shortcuts**, and says what it does
  before you press it: it shows the shortcuts currently in Steam, and only
  updates when the Steam client restarts.
- The list is sorted alphabetically. It used to arrive in whatever order Steam
  had written `shortcuts.vdf`, which is no order at all to look through.
- Thirty entries was a hard cut-off, with the rest simply unreachable. The list
  now opens at twenty and a **Show 20 more** row extends it, so nothing is out
  of reach and the panel still opens short. Pressing it moves the D-pad onto
  the first row it revealed, rather than dropping the selection twenty rows
  down the panel with the row that was pressed.
- A **Search** field appears once there are twelve or more shortcuts, matching
  on the name and the path — the fastest way to answer "is my game in here?"
  without scrolling past a hundred rows.
- The **Show the list** toggle no longer sits flush against the button above it
  or the first entry below it.

## v1.7.10

**Browse tabs**

- The selected tab now wears the inverted white surface permanently, and gamepad
  focus and hover use the accent colour instead. Selection and focus were
  previously the same paint, so a focused tab and a selected one were
  indistinguishable.
- The bar marking the selected tab runs the full width of the button rather than
  60% of it.

**Options**

- Removed the **Paste key** button. The on-screen keyboard's own paste key now
  lands in the field correctly, so the button had nothing left to do. Every
  fallback route behind it went with it — the clipboard API, `execCommand`, and
  the backend's `wl-paste`/`xclip`/`xsel` read, which had been shelling out as
  root.
- Reworded the restart and artwork settings, and said *shortcuts* where the
  thing being added is as often an application as a game.
- Spacing and indentation: descriptions are indented under the control they
  belong to, the **SteamGridDB API key** field is set off from the toggle above
  it, and **Rescan applications** no longer sits flush against the row above it.

## v1.7.9

**Artwork from SteamGridDB**

- Download grid, wide grid, hero, logo and icon art for each game added, using a
  free API key set under **Options**.
- Library art is applied through Steam rather than written into
  `userdata/<account>/config/grid`, which a running Steam never notices — art
  now appears without a restart. Only the icon still waits for one.
- An optional **Artwork title** field, so a shortcut can keep a name SteamGridDB
  would not recognise while the search uses the real title.
- Per-slot progress under **Last added**, with the restart held until the
  download finishes and skipped entirely when artwork failed, so the reason
  stays readable.
- The API key is checked against SteamGridDB whenever it is saved, and on demand
  with **Check the artwork key**.

**Pasting**

- Every text field now survives a native paste from the on-screen keyboard,
  which previously reverted silently.

**Panel**

- The Applications list is collapsed to its search box by default instead of
  pushing everything below it off screen.
- **Last added** moved to the top of the panel, and the panel scrolls there
  after an add.
- Saved games are an expandable list of rows that open each game's page.
- Dropdown label, control and description are stacked rather than crammed into
  one row.
- Removed the Diagnostics section; its useful parts remain as the key check and
  a startup warning when the backend is unreachable or its version does not
  match the panel's.

## v1.6.0

First release. Browse installed applications or the filesystem from the Quick
Access menu, pick a compatibility tool for Windows executables, and file the
result into a collection — without leaving Game Mode.
