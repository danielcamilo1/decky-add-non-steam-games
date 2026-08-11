import { callable } from "@decky/api";

/** Everything the backend can tell us about a path the user picked. */
export interface PathInfo {
  path: string;
  exists: boolean;
  is_dir: boolean;
  directory: string;
  extension: string;
  suggested_name: string;
  /** Needs Proton to run: .exe, .bat, .cmd, .msi */
  is_windows_app: boolean;
  is_executable: boolean;
  /** False for archives, libraries, images and other things that cannot be launched. */
  looks_launchable: boolean;
  needs_quoting: boolean;
}

/** An entry in the browse sidebar: a user directory, a drive, or the last folder used. */
export interface Location {
  label: string;
  path: string;
  kind:
    | "recent"
    | "home"
    | "downloads"
    | "documents"
    | "desktop"
    | "pictures"
    | "videos"
    | "music"
    | "games"
    | "applications"
    | "sdcard"
    | "drive";
  detail: string;
  free_bytes?: number;
  total_bytes?: number;
}

export interface Locations {
  recent: Location | null;
  places: Location[];
  drives: Location[];
}

/** An installed application, read from its `.desktop` file. */
export interface Application {
  name: string;
  /** Absolute path to the binary. For Flatpak apps this is the flatpak runner. */
  exe: string;
  /** Arguments from the desktop entry's Exec, field codes stripped. */
  args: string;
  start_dir: string;
  /** "Flatpak", "Snap", "System" or "User". */
  source: string;
  categories: string[];
  icon_path: string;
  /** The icon inlined as a data URI, or "" when there is none. */
  icon_data: string;
  /** Unique per entry, so it doubles as the React key. */
  desktop_file: string;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}

/** "ask" prompts after every add; "always"/"never" skip the prompt. */
export type RestartPreference = "ask" | "always" | "never";

/** Resolves with the backend's version, proving the Python side actually loaded. */
export const ping = callable<[], string>("ping");

export const getStartPath = callable<[], string>("get_start_path");

/** Remember where the user browsed so the picker reopens there next time. */
export const rememberDirectory = callable<[path: string], void>("remember_directory");

/** User directories and mounted drives for the browse sidebar. */
export const listLocations = callable<[], Locations>("list_locations");

/** Installed applications. Cached in the backend; pass true to rescan. */
export const listApplications = callable<[refresh: boolean], Application[]>("list_applications");

export const inspectPath = callable<[path: string], PathInfo>("inspect_path");

/** chmod +x, for downloads that arrived without the executable bit. */
export const makeExecutable = callable<[path: string], ActionResult>("make_executable");

export const getRestartPreference = callable<[], RestartPreference>("get_restart_preference");
export const setRestartPreference = callable<[value: RestartPreference], void>("set_restart_preference");

/** Mirror frontend events into the plugin log so failures are diagnosable. */
export const log = callable<[level: string, message: string], void>("log");

export interface ArtworkSettings {
  /** Whether to fetch artwork after each add. */
  enabled: boolean;
  /** The user's SteamGridDB API key, or "" when they have not set one. */
  key: string;
  /** Where to get a key, so the panel and the README cannot disagree. */
  key_url: string;
  /** The artwork kinds an add fills: grid, wide grid, hero, logo, icon. */
  slots: string[];
}

export interface ArtworkMatch {
  found: boolean;
  game_id: number;
  /** Title SteamGridDB matched, which is not always what was searched for. */
  game_name: string;
  /** "" when a game was found. */
  error: string;
}

export interface ArtworkSlotResult {
  /** The image, base64-encoded, for `SetCustomArtworkForApp`. "" for the icon. */
  data: string;
  /** What to tell Steam the image is: "png" or "jpg". */
  extension: string;
  /** Steam's `ELibraryAssetType` for this slot, or -1 when the slot is unknown. */
  asset_type: number;
  /** Set only for the icon, which is a file path on the shortcut itself. */
  icon_path: string;
  error: string;
}

export const getArtworkSettings = callable<[], ArtworkSettings>("get_artwork_settings");
export const setArtworkEnabled = callable<[value: boolean], void>("set_artwork_enabled");
export const setSteamGridDbKey = callable<[value: string], void>("set_steamgriddb_key");

/**
 * Find the game to fetch artwork for.
 *
 * Never rejects for a missing key, an unknown title or a network problem — the
 * game is already added by then, so those come back as `found: false`.
 */
export const findArtwork = callable<[searchName: string], ArtworkMatch>("find_artwork");

/**
 * Fetch one artwork kind, for the frontend to hand to Steam.
 *
 * One call per slot rather than one for all of them, so the panel can report
 * progress while it happens — an add that restarts Steam immediately otherwise
 * looks like it downloaded nothing at all.
 */
export const downloadArtworkSlot =
  callable<[appId: number, gameId: number, slot: string], ArtworkSlotResult>(
    "download_artwork_slot",
  );

/**
 * The artwork files sitting in Steam's grid folder for one shortcut.
 *
 * Read back after a download so the panel can prove something landed — until
 * Steam restarts, a successful download and a silent failure look the same.
 */
export const listArtwork =
  callable<[appId: number], { directory: string; files: string[]; error: string }>("list_artwork");

/** Whether artwork downloads would work: key accepted, grid folder found. */
export const checkSteamGridDb = callable<[], { ok: boolean; detail: string }>("check_steamgriddb");

export interface SavedShortcut {
  app_id: number;
  name: string;
  exe: string;
}

export interface SavedShortcuts {
  found: boolean;
  shortcuts: SavedShortcut[];
  error?: string;
}

/**
 * The non-Steam games Steam has written to `shortcuts.vdf`.
 *
 * Steam only writes that file when it shuts down, so this reflects the last
 * restart — which is exactly what makes it useful for answering "did my game
 * actually save?".
 */
export const listSavedShortcuts = callable<[], SavedShortcuts>("list_saved_shortcuts");
