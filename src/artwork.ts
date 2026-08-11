import { downloadArtworkSlot, findArtwork, listArtwork, log } from "./backend";
import { applyCustomArtwork } from "./steam";

/**
 * The artwork kinds to fetch when the backend has not said.
 *
 * `get_artwork_settings` normally supplies this list, and a failed settings read
 * used to leave it empty — which downloaded nothing at all, quietly, since a
 * loop over no slots cannot fail. Duplicating the list is the lesser evil.
 */
export const DEFAULT_SLOTS = ["grid", "wide grid", "hero", "logo", "icon"];

/** How far through the artwork download we are, for the panel's progress bar. */
export interface ArtworkProgress {
  /** Slots finished so far. */
  done: number;
  total: number;
  /** The slot being fetched, or "" while searching. */
  slot: string;
}

export interface ArtworkResult {
  success: boolean;
  /** Title SteamGridDB matched, which is not always what was searched for. */
  game: string;
  /** Kinds written, e.g. ["grid", "hero", "logo"]. */
  applied: string[];
  /** Kinds SteamGridDB had nothing for. */
  missing: string[];
  /** Icon file written, if any. */
  iconPath: string;
  /** Files actually present in Steam's grid folder afterwards. */
  files: string[];
  /** Where those files are, for the log and for the panel to name. */
  directory: string;
  /** "" on success. */
  error: string;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Log to the plugin log, which is what a user can actually send us. */
const record = (level: "info" | "warning", text: string) =>
  log(level, text).catch(() => {});

/**
 * Fetch one slot and give it to Steam. Returns the icon's path, if that is what
 * this slot was, and throws with a readable reason when the slot has no art.
 *
 * The backend hands back the image rather than writing it: library art has to go
 * through `SetCustomArtworkForApp` for a running client to show it.
 */
async function fetchSlot(appId: number, gameId: number, slot: string): Promise<string> {
  const result = await downloadArtworkSlot(appId, gameId, slot);
  if (result.error) throw new Error(result.error);

  // The icon is a path on the shortcut itself, which the caller applies.
  if (result.icon_path) return result.icon_path;

  if (!result.data) throw new Error("no image came back");

  await applyCustomArtwork(
    appId,
    result.asset_type as 0 | 1 | 2 | 3,
    result.data,
    result.extension === "jpg" ? "jpg" : "png",
  );
  return "";
}

/**
 * Fetch every kind of artwork for a shortcut, reporting progress as it goes.
 *
 * One search, then one request per slot, so the caller can show what is
 * happening — this runs between adding a game and restarting Steam, and with
 * automatic restarts turned on that is the user's only sign it happened at all.
 *
 * Nothing here throws, and nothing here depends on the reporting working: the
 * game exists by the time this runs, so every failure is a description of what
 * is missing, not a failed add.
 */
export async function fetchArtwork(
  appId: number,
  searchName: string,
  slots: string[],
  onProgress: (progress: ArtworkProgress) => void,
): Promise<ArtworkResult> {
  const kinds = slots.length > 0 ? slots : DEFAULT_SLOTS;
  const total = kinds.length;

  // A progress bar that throws must not take the download with it. Steam's
  // components are resolved by matching its minified bundle, so any of them can
  // become undefined after a client update — and rendering that throws right
  // back out through here.
  const report = (progress: ArtworkProgress) => {
    try {
      onProgress(progress);
    } catch (error) {
      console.error("[add-non-steam-games] could not show artwork progress", error);
    }
  };

  const failure = (error: string): ArtworkResult => {
    record("warning", `Artwork for "${searchName}" (appid ${appId}) failed: ${error}`);
    return {
      success: false,
      game: "",
      applied: [],
      missing: kinds,
      iconPath: "",
      files: [],
      directory: "",
      error,
    };
  };

  record("info", `Artwork for "${searchName}" (appid ${appId}): fetching ${total} slots`);
  report({ done: 0, total, slot: "" });

  let match;
  try {
    match = await findArtwork(searchName);
  } catch (error) {
    return failure(message(error));
  }
  if (!match.found) return failure(match.error || "SteamGridDB found no match");

  const applied: string[] = [];
  const missing: string[] = [];
  let iconPath = "";

  for (const [index, slot] of kinds.entries()) {
    report({ done: index, total, slot });

    // One unreachable slot is not worth abandoning the rest for.
    try {
      const icon = await fetchSlot(appId, match.game_id, slot);
      if (icon) iconPath = icon;
      applied.push(slot);
    } catch (error) {
      missing.push(slot);
      record("warning", `Artwork slot "${slot}": ${message(error)}`);
    }
  }

  report({ done: total, total, slot: "" });

  // Read the folder back rather than trusting the calls: Steam writes these
  // files itself, so their presence is what proves the art was accepted.
  let files: string[] = [];
  let directory = "";
  try {
    const onDisk = await listArtwork(appId);
    files = onDisk.files;
    directory = onDisk.directory;
  } catch (error) {
    console.error("[add-non-steam-games] could not list artwork files", error);
  }

  record(
    applied.length > 0 ? "info" : "warning",
    `Artwork for "${match.game_name}" (appid ${appId}): applied ${applied.join(", ") || "nothing"}; ` +
      `${files.length} file(s) now in ${directory || "an unknown folder"}`,
  );

  return {
    success: applied.length > 0,
    game: match.game_name,
    applied,
    missing,
    iconPath,
    files,
    directory,
    error: applied.length > 0 ? "" : "SteamGridDB has no artwork for this game",
  };
}
