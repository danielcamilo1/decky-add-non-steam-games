import type { PathInfo } from "./backend";

/** Kept in sync with WINDOWS_EXTENSIONS in main.py. */
const WINDOWS_EXTENSIONS = new Set([".exe", ".bat", ".cmd", ".msi"]);

/** Kept in sync with NON_EXECUTABLE_EXTENSIONS in main.py. */
const NON_EXECUTABLE_EXTENSIONS = new Set([
  ".dll", ".so", ".zip", ".7z", ".rar", ".tar", ".gz", ".iso",
  ".txt", ".md", ".png", ".jpg", ".jpeg", ".ini", ".cfg", ".json",
]);

/**
 * Derive everything the form needs from the path alone.
 *
 * The Python backend does this better — it can stat the file and check the
 * executable bit — but adding a game must not depend on the backend being
 * reachable, so this is the fallback when that call fails.
 */
export function describePathLocally(path: string): PathInfo {
  const normalized = path.replace(/\/+$/, "");
  const lastSlash = normalized.lastIndexOf("/");
  const directory = lastSlash > 0 ? normalized.slice(0, lastSlash) : "/";
  const basename = normalized.slice(lastSlash + 1);

  const dot = basename.lastIndexOf(".");
  const extension = dot > 0 ? basename.slice(dot).toLowerCase() : "";
  const stem = dot > 0 ? basename.slice(0, dot) : basename;

  return {
    path,
    exists: true,
    is_dir: false,
    directory,
    extension,
    suggested_name: stem.replace(/_/g, " ").replace(/\s+/g, " ").trim(),
    is_windows_app: WINDOWS_EXTENSIONS.has(extension),
    // Unknown without stat'ing the file. Assume it is fine rather than nag
    // about an executable bit we cannot actually check.
    is_executable: true,
    looks_launchable: !NON_EXECUTABLE_EXTENSIONS.has(extension),
    needs_quoting: false,
  };
}
