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
