import { findSP } from "@decky/ui";

/** A Proton/compatibility tool as reported by `SteamClient.Settings.GetGlobalCompatTools`. */
export interface CompatibilityTool {
  strToolName: string;
  strDisplayName: string;
}

/** The subset of Steam's `AppDetails` this plugin reads back for verification. */
interface ShortcutDetails {
  strShortcutExe?: string;
  strShortcutStartDir?: string;
  strShortcutLaunchOptions?: string;
  strLaunchOptions?: string;
}

export interface ShortcutRequest {
  name: string;
  exe: string;
  startDir: string;
  launchOptions: string;
  /** `strToolName` of a compatibility tool, or "" to leave Steam's default. */
  compatTool: string;
  /** Icon file for the shortcut, or "" to let Steam decide. */
  iconPath?: string;
}

export interface ShortcutResult {
  appId: number;
  /**
   * Whether Steam read the shortcut back with the exe we asked for. A false
   * here means Steam created an incomplete entry that will not survive a
   * restart, so the UI has to say so rather than claim success.
   */
  verified: boolean;
  /** Human-readable trace of what happened, mirrored into the plugin log. */
  log: string[];
}

const stripQuotes = (value: string) => value.replace(/^"|"$/g, "");

/** Steam stores shortcut targets quoted; double-quoting breaks the launch. */
const quote = (value: string) => `"${stripQuotes(value)}"`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll `appStore` until Steam has registered the freshly created shortcut.
 *
 * `AddShortcut` resolves before Steam finishes registering the app internally,
 * and the `Set*` calls silently do nothing until the overview exists.
 */
async function waitForAppOverview(appId: number, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (window.appStore?.GetAppOverviewByAppID(appId)) return true;
    await sleep(100);
  }
  return false;
}

/**
 * Resolve an app's details via the one-shot `RegisterForAppDetails` pattern.
 *
 * The callback can fire with nothing before the app's data loads, so those
 * early empty fires are ignored.
 */
function getAppDetails(appId: number, timeoutMs = 3000): Promise<ShortcutDetails | null> {
  return new Promise((resolve) => {
    let settled = false;
    let registration: { unregister: () => void } | undefined;

    const finish = (value: ShortcutDetails | null) => {
      if (settled) return;
      settled = true;
      registration?.unregister();
      resolve(value);
    };

    registration = SteamClient.Apps.RegisterForAppDetails(appId, (details) => {
      if (details) finish(details as ShortcutDetails);
    });

    setTimeout(() => finish(null), timeoutMs);
  });
}

/**
 * Ask Steam for a new shortcut, returning its appId.
 *
 * Only the name and exe are passed. Steam's own "Add a Non-Steam Game" flow
 * does the same, and handing `AddShortcut` a start dir or launch options makes
 * some client builds return 0 instead of an appId — the caller writes those
 * fields afterwards anyway.
 *
 * Whether the exe wants quoting differs between client builds, and the wrong
 * choice just yields 0, so both are tried before giving up.
 */
async function createShortcut(
  name: string,
  exe: string,
  note: (message: string) => void,
): Promise<number> {
  for (const [label, candidate] of [
    ["plain", exe],
    ["quoted", `"${exe}"`],
  ]) {
    try {
      const appId = await SteamClient.Apps.AddShortcut(name, candidate, "", "");
      if (typeof appId === "number" && appId !== 0) {
        note(`AddShortcut with ${label} exe returned appId ${appId}`);
        return appId;
      }
      note(`AddShortcut with ${label} exe returned ${JSON.stringify(appId)}`);
    } catch (error) {
      note(`AddShortcut with ${label} exe threw: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    "Steam would not create the shortcut. This usually means the Steam client's shortcut list is in a bad state — restart Steam and try again.",
  );
}

/**
 * Create a non-Steam shortcut and return its appId.
 *
 * Steam's shortcut API is quirky in two ways that this function works around:
 *
 * - `AddShortcut` does not reliably apply everything it is handed, and does not
 *   reliably set the name, so every field is written again through the `Set*`
 *   calls once `appStore` reports the app. Those calls are no-ops until Steam
 *   has registered it, hence the wait.
 * - Paths must be passed **unquoted**. Steam quotes them itself when it writes
 *   `shortcuts.vdf`; pre-quoting produces a double-quoted entry that will not
 *   launch.
 *
 * Steam only flushes `shortcuts.vdf` to disk when it shuts down, so a shortcut
 * that reads back correctly here still needs a Steam restart to become
 * permanent. The caller handles that.
 */
export async function addNonSteamShortcut(request: ShortcutRequest): Promise<ShortcutResult> {
  const log: string[] = [];
  const note = (message: string) => {
    log.push(message);
    console.log(`[add-non-steam-games] ${message}`);
  };

  note(`Adding name=${request.name} exe=${request.exe} startDir=${request.startDir}`);

  const appId = await createShortcut(request.name, request.exe, note);
  note(`Steam assigned appId ${appId}`);

  if (!(await waitForAppOverview(appId))) {
    note("Steam never registered the new app; the writes below may not stick");
  }

  // Re-apply everything now that Steam knows about the app. Each call is
  // isolated so one unavailable API cannot abort the rest.
  const attempt = (label: string, action: () => void) => {
    try {
      action();
    } catch (error) {
      note(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  attempt("SetShortcutName", () => SteamClient.Apps.SetShortcutName(appId, request.name));
  // The target must be quoted or Steam cannot launch it — confirmed on device.
  // The start directory must NOT be; Steam handles that one itself.
  attempt("SetShortcutExe", () => SteamClient.Apps.SetShortcutExe(appId, quote(request.exe)));
  attempt("SetShortcutStartDir", () => SteamClient.Apps.SetShortcutStartDir(appId, request.startDir));
  attempt("SetShortcutLaunchOptions", () =>
    SteamClient.Apps.SetShortcutLaunchOptions(appId, request.launchOptions),
  );
  attempt("SetAppLaunchOptions", () =>
    SteamClient.Apps.SetAppLaunchOptions(appId, request.launchOptions),
  );

  if (request.iconPath) {
    attempt("SetShortcutIcon", () => SteamClient.Apps.SetShortcutIcon(appId, request.iconPath!));
  }

  if (request.compatTool) {
    attempt("SpecifyCompatTool", () => SteamClient.Apps.SpecifyCompatTool(appId, request.compatTool));
    note(`Compatibility tool set to ${request.compatTool}`);
  }

  // Give Steam a moment to apply the writes before reading them back.
  await sleep(300);

  const details = await getAppDetails(appId);
  const readBack = details?.strShortcutExe ?? "";
  const verified = stripQuotes(readBack) === request.exe;

  if (!verified) {
    note(`Could not verify shortcut; Steam reports exe ${readBack || "<nothing>"}`);
  } else if (readBack !== quote(request.exe)) {
    // The path is right but the quotes did not survive, which is the one state
    // that looks fine in the library and then fails to launch.
    note(`Steam stored the target unquoted (${readBack}); it may not launch`);
  } else {
    note("Shortcut verified");
  }

  return { appId, verified, log };
}

/**
 * Steam's collection store, which `@decky/ui` does not type.
 *
 * Only the parts this plugin touches are declared.
 */
interface SteamCollection {
  AsDragDropCollection(): { AddApps(overviews: unknown[]): void };
  Save(): Promise<void>;
  displayName: string;
  id: string;
}

interface CollectionStore {
  userCollections?: SteamCollection[];
  GetCollection(id: string): SteamCollection | undefined;
  NewUnsavedCollection(tag: string, filter?: unknown, overviews?: unknown[]): SteamCollection;
}

function getCollectionStore(): CollectionStore | null {
  return (window as unknown as { collectionStore?: CollectionStore }).collectionStore ?? null;
}

export interface CollectionSummary {
  id: string;
  name: string;
}

/** The user's own collections, alphabetically. Empty if Steam has none yet. */
export function listCollections(): CollectionSummary[] {
  const collections = getCollectionStore()?.userCollections;
  if (!collections) return [];

  return collections
    .map((collection) => ({ id: collection.id, name: collection.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Put a newly created shortcut into a collection, creating the collection when
 * it does not exist yet.
 *
 * Steam collapses collection names case-insensitively, so a name differing only
 * in case has to update the existing collection — creating a second one would
 * shadow it and lose its games.
 */
export async function addToCollection(
  appId: number,
  request: { id?: string; name: string },
): Promise<void> {
  const store = getCollectionStore();
  if (!store) throw new Error("Steam's collection store is not available");

  const overview = window.appStore?.GetAppOverviewByAppID(appId);
  if (!overview) throw new Error("Steam has not registered the new game yet");

  const name = request.name.trim();
  const existing = request.id
    ? store.GetCollection(request.id)
    : store.userCollections?.find(
        (collection) => collection.displayName.toLowerCase() === name.toLowerCase(),
      );

  const collection = existing ?? store.NewUnsavedCollection(name, undefined, []);
  collection.AsDragDropCollection().AddApps([overview]);
  await collection.Save();
}

/**
 * The window the panel's own DOM lives in.
 *
 * A plugin's JavaScript does not necessarily run in the window it renders into:
 * the global `document` here is a different document from the one holding the
 * Quick Access panel. That single fact explains two symptoms that look
 * unrelated — `document.hasFocus()` reporting false (it is not the focused
 * document, and never will be) and a document-wide query for the panel's own
 * `<input>` elements finding none of them.
 *
 * So anything to do with focus, the clipboard or `execCommand` has to be aimed
 * at *this* window, resolved from a node that is actually in the panel.
 */
export function panelWindow(node?: Node | null): Window {
  const fromNode = node?.ownerDocument?.defaultView;
  if (fromNode) return fromNode;

  try {
    return findSP();
  } catch (error) {
    console.error("[add-non-steam-games] could not find Steam's window", error);
    return window;
  }
}

/**
 * Read the clipboard through the web API, in the panel's own window.
 *
 * Refuses with *Document is not focused* unless that document holds focus, so
 * callers still need a fallback — but pass the right window and it at least has
 * a chance, which it never does from the plugin's own context.
 */
export async function readClipboard(view: Window = window): Promise<string> {
  const clipboard: { readText?(): Promise<string> } | undefined = view.navigator?.clipboard;
  if (typeof clipboard?.readText !== "function") {
    throw new Error("This Steam build does not allow reading the clipboard.");
  }
  return await clipboard.readText();
}

/**
 * Paste into `input` using Steam's own native paste.
 *
 * This is the mechanism behind the on-screen keyboard's paste key, and the only
 * one that reaches the Steam client's internal clipboard: Game Mode runs on
 * gamescope, which does not implement `wl_data_device_manager`, so there is no
 * compositor clipboard for `wl-paste` — or anything else outside Steam — to
 * read.
 *
 * The paste happens natively, below React, so the caller reads the result off
 * the element rather than waiting for a change event that may never come.
 * Returns whether the call was made at all.
 */
export function nativePaste(input: HTMLInputElement): boolean {
  const browser = SteamClient?.Browser;
  if (typeof browser?.Paste !== "function") return false;

  try {
    input.focus();
    // Some builds gate clipboard access on a recent user activation, and a
    // gamepad button press does not always count as one.
    if (typeof browser.NotifyUserActivation === "function") browser.NotifyUserActivation();
    browser.Paste();
    return true;
  } catch (error) {
    console.error("[add-non-steam-games] native paste failed", error);
    return false;
  }
}

/**
 * Point an existing shortcut at an icon file.
 *
 * Steam reads a non-Steam game's icon from the shortcut itself rather than from
 * the grid folder, so a downloaded icon only takes effect once this is called.
 */
export function setShortcutIcon(appId: number, iconPath: string): void {
  try {
    SteamClient.Apps.SetShortcutIcon(appId, iconPath);
  } catch (error) {
    console.error("[add-non-steam-games] could not set the shortcut icon", error);
  }
}

/**
 * Steam's `ELibraryAssetType`: 0 capsule, 1 hero, 2 logo, 3 header, 4 icon.
 *
 * Typed as a number rather than imported: `ELibraryAssetType` exists only in
 * `@decky/ui`'s type declarations, so the enum has no runtime value to read.
 */
type LibraryAssetType = 0 | 1 | 2 | 3 | 4;

interface CustomArtworkApi {
  ClearCustomArtworkForApp(appId: number, assetType: number): Promise<void>;
  SetCustomArtworkForApp(
    appId: number,
    base64: string,
    imageType: "png" | "jpg",
    assetType: number,
  ): Promise<void>;
}

/**
 * Give Steam a piece of library artwork for an app.
 *
 * This is how art gets applied from inside Game Mode: Steam writes the file into
 * its own grid folder and updates the library immediately, no restart. Writing
 * those files directly is the desktop-tool approach (BoilR, Steam ROM Manager)
 * and does not reliably take effect for a client that is already running.
 *
 * Existing art is cleared first, because `SetCustomArtworkForApp` will not
 * replace an asset that is already set — the same order SteamGridDB's own plugin
 * uses, including the wait, since `Clear` resolves before it has finished.
 */
export async function applyCustomArtwork(
  appId: number,
  assetType: LibraryAssetType,
  base64: string,
  imageType: "png" | "jpg",
): Promise<void> {
  const apps = SteamClient.Apps as unknown as CustomArtworkApi;

  await apps.ClearCustomArtworkForApp(appId, assetType);
  await sleep(500);
  await apps.SetCustomArtworkForApp(appId, base64, imageType, assetType);

  // A shortcut with no saved logo position renders its logo blank, so give it
  // the default one Steam would otherwise have written on first edit.
  if (assetType === 2) fixLogoPosition(appId);
}

/** Steam's default logo placement, written only when the app has none. */
function fixLogoPosition(appId: number): void {
  // The two stores disagree about the overview type they hand around, and only
  // one of them is what `appStore` actually returns.
  const details = window.appDetailsStore as unknown as {
    GetCustomLogoPosition(app: unknown): unknown;
    SaveCustomLogoPosition(app: unknown, position: Record<string, unknown>): unknown;
  };

  try {
    const overview = window.appStore?.GetAppOverviewByAppID(appId);
    if (!overview || details.GetCustomLogoPosition(overview)) return;

    details.SaveCustomLogoPosition(overview, {
      pinnedPosition: "BottomLeft",
      nWidthPct: 50,
      nHeightPct: 50,
    });
  } catch (error) {
    console.error("[add-non-steam-games] could not set the logo position", error);
  }
}

export function removeShortcut(appId: number): void {
  SteamClient.Apps.RemoveShortcut(appId);
}

/**
 * Restart the Steam client.
 *
 * This is what makes a new shortcut permanent: Steam holds its shortcut list in
 * memory and only writes `shortcuts.vdf` during a clean shutdown. A shortcut
 * added without a restart disappears if Steam is killed or the Deck loses
 * power.
 */
export function restartSteam(): void {
  console.log("[add-non-steam-games] restarting Steam");
  SteamClient.User.StartRestart(false);
}

/**
 * Every compatibility tool Steam knows about.
 *
 * Steam includes a "None"/default entry with an empty `strToolName`; it is
 * dropped here because the UI models "no compat tool" as its own choice.
 */
export async function getCompatibilityTools(): Promise<CompatibilityTool[]> {
  try {
    const tools = await SteamClient.Settings.GetGlobalCompatTools();
    return (tools ?? []).filter((tool) => Boolean(tool?.strToolName));
  } catch (error) {
    console.error("[add-non-steam-games] could not read compatibility tools", error);
    return [];
  }
}

/**
 * Best default compatibility tool for a Windows executable: Proton Experimental
 * when available, otherwise the first tool Steam listed.
 */
export function pickDefaultCompatTool(tools: CompatibilityTool[]): string {
  const experimental = tools.find((tool) => tool.strToolName === "proton_experimental");
  return experimental?.strToolName ?? tools[0]?.strToolName ?? "";
}
