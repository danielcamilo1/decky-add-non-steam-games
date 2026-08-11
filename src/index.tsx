import {
  ButtonItem,
  Dropdown,
  Field,
  Navigation,
  PanelSection,
  PanelSectionRow,
  ToggleField,
  showModal,
  staticClasses,
} from "@decky/ui";
import type { DropdownOption, SingleDropdownOption } from "@decky/ui";
import { FileSelectionType, definePlugin, openFilePicker, toaster } from "@decky/api";
import { useEffect, useRef, useState } from "react";
import { FaPlus } from "react-icons/fa6";

import {
  checkSteamGridDb,
  getArtworkSettings,
  getRestartPreference,
  getStartPath,
  inspectPath,
  listApplications,
  listLocations,
  log,
  makeExecutable,
  ping,
  rememberDirectory,
  setArtworkEnabled,
  setRestartPreference,
  setSteamGridDbKey,
} from "./backend";
import type {
  Application,
  ArtworkSettings,
  Location,
  Locations,
  PathInfo,
  RestartPreference,
} from "./backend";
import { fetchArtwork } from "./artwork";
import { AppList } from "./AppList";
import { PLUGIN_VERSION } from "./version";
import { LocationList } from "./LocationList";
import { ProgressRow } from "./ProgressRow";
import { SavedGames } from "./SavedGames";
import { SourceTabs } from "./SourceTabs";
import { TextEntry, usePanelVisible } from "./TextEntry";
import { describePathLocally } from "./pathinfo";
import { RestartPrompt } from "./RestartPrompt";
import {
  addNonSteamShortcut,
  addToCollection,
  getCompatibilityTools,
  listCollections,
  pickDefaultCompatTool,
  removeShortcut,
  restartSteam,
  setShortcutIcon,
} from "./steam";
import type { CollectionSummary, CompatibilityTool } from "./steam";
import { NEW_COLLECTION, clearSelection, getDraft, updateDraft, useDraft } from "./store";
import type { AddedShortcut } from "./store";

const NO_COMPAT_TOOL = "";

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Used until the backend answers, and if it never does: artwork on, no key, so
// the panel offers the feature instead of hiding it.
const ARTWORK_UNKNOWN: ArtworkSettings = {
  enabled: true,
  key: "",
  key_url: "steamgriddb.com/profile/preferences/api",
  slots: [],
};

/**
 * Put every scrollable ancestor back to the top.
 *
 * `alwaysRender` keeps this component mounted between visits, so Steam reopens
 * the panel wherever it was last scrolled to — usually somewhere in the middle
 * of the applications list.
 */
function scrollToTop(anchor: HTMLElement | null): void {
  for (let node = anchor?.parentElement; node; node = node.parentElement) {
    if (node.scrollHeight > node.clientHeight + 1) node.scrollTop = 0;
  }
}

function Content() {
  // The in-progress game lives outside React so it survives the Quick Access
  // panel being unmounted while the file picker is open. See ./store.
  const {
    source,
    target,
    name,
    artworkName,
    launchOptions,
    compatTool,
    iconPath,
    collectionId,
    newCollectionName,
    added,
    addError,
  } = useDraft();

  const [locations, setLocations] = useState<Locations | null>(null);
  const [applications, setApplications] = useState<Application[] | null>(null);
  const [applicationsFailed, setApplicationsFailed] = useState(false);
  const [startPath, setStartPath] = useState("");
  const [compatTools, setCompatTools] = useState<CompatibilityTool[]>([]);
  const [collections, setCollections] = useState<CollectionSummary[]>([]);
  const [restartPreference, setRestartPreferenceState] = useState<RestartPreference>("ask");
  const [artworkSettings, setArtworkSettings] = useState<ArtworkSettings>(ARTWORK_UNKNOWN);
  const [keyStatus, setKeyStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [versionWarning, setVersionWarning] = useState("");

  const panelVisible = usePanelVisible();
  const topAnchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panelVisible) return;
    // Collections can be created elsewhere in Steam while the panel sits
    // mounted, so re-read them rather than caching from first mount.
    setCollections(listCollections());
    // One frame later, so the panel has laid out before we reset it.
    const frame = requestAnimationFrame(() => scrollToTop(topAnchor.current));
    return () => cancelAnimationFrame(frame);
  }, [panelVisible]);

  const loadApplications = (refresh: boolean) => {
    if (refresh) setApplications(null);
    setApplicationsFailed(false);
    listApplications(refresh)
      .then(setApplications)
      .catch((error) => {
        console.error("[add-non-steam-games] could not list applications", error);
        setApplicationsFailed(true);
      });
  };

  useEffect(() => {
    listLocations()
      .then((result) => {
        setLocations(result);
        setBackendError(null);
      })
      .catch((error) => {
        console.error("[add-non-steam-games] could not list locations", error);
        setBackendError(
          "The plugin's Python backend is not responding. Browsing still works, but folder shortcuts and saved-game checks do not.",
        );
        setLocations({ recent: null, places: [], drives: [] });
      });
    loadApplications(false);
    // A zip that only half-installed leaves the Python and the panel on
    // different versions, and every symptom after that is misleading.
    ping()
      .then((backend) => {
        if (backend !== PLUGIN_VERSION) {
          setVersionWarning(
            `This install is half-updated: the Python backend is v${backend} and this panel is v${PLUGIN_VERSION}. Reinstall the plugin and restart plugin_loader.`,
          );
        }
      })
      .catch(() => {});
    getStartPath().then(setStartPath).catch(() => {});
    getRestartPreference().then(setRestartPreferenceState).catch(() => {});
    getArtworkSettings().then(setArtworkSettings).catch(() => {});
    getCompatibilityTools().then(setCompatTools);
  }, []);

  // The compat tool list loads asynchronously, so a file picked before it
  // arrives gets its Proton default applied here instead.
  useEffect(() => {
    if (target?.is_windows_app && compatTool === NO_COMPAT_TOOL && compatTools.length > 0) {
      updateDraft({ compatTool: pickDefaultCompatTool(compatTools) });
    }
  }, [compatTools, target]);

  const browseAt = async (path: string) => {
    let picked: { path: string; realpath: string };
    try {
      picked = await openFilePicker(
        FileSelectionType.FILE,
        path,
        true, // browse files
        true, // and folders, so the user can navigate
        undefined, // no filter: Linux game binaries often have no extension
        undefined,
        false, // hidden files off by default
        true, // but let the picker offer "all files"
      );
    } catch {
      return; // the picker rejects when the user backs out
    }

    // The backend describes the file better than we can, but a backend problem
    // must never strand the user on a picker that appears to do nothing.
    let info: PathInfo;
    try {
      info = await inspectPath(picked.path);
      setBackendError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[add-non-steam-games] inspect_path failed", error);
      setBackendError(`The plugin's Python backend is not responding (${message}).`);
      info = describePathLocally(picked.path);
    }

    updateDraft({
      added: null,
      addError: null,
      target: info,
      name: info.suggested_name,
      compatTool: info.is_windows_app ? pickDefaultCompatTool(compatTools) : NO_COMPAT_TOOL,
    });

    setStartPath(info.directory);
    rememberDirectory(info.directory)
      .then(() => listLocations().then(setLocations))
      .catch(() => {});
  };

  /**
   * An installed application already tells us everything the form needs, so
   * this skips the file picker entirely. For a Flatpak, `exe` is the flatpak
   * runner and `args` carry the app ID — the same split Steam's own desktop
   * dialog produces.
   */
  const onApplicationSelected = (application: Application) => {
    updateDraft({
      added: null,
      addError: null,
      target: {
        path: application.exe,
        exists: true,
        is_dir: false,
        directory: application.start_dir,
        extension: "",
        suggested_name: application.name,
        is_windows_app: false,
        is_executable: true,
        looks_launchable: true,
        needs_quoting: false,
      },
      name: application.name,
      launchOptions: application.args,
      compatTool: NO_COMPAT_TOOL,
      iconPath: application.icon_path,
    });
  };

  const onMakeExecutable = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const result = await makeExecutable(target.path);
      if (result.success) {
        updateDraft({ target: await inspectPath(target.path) });
        toaster.toast({ title: "Add Non-Steam Games", body: "Marked as executable" });
      } else {
        toaster.toast({ title: "Could not mark as executable", body: result.error ?? "Unknown error" });
      }
    } finally {
      setBusy(false);
    }
  };

  /**
   * Offer, or take, the restart that makes the new shortcut permanent.
   *
   * `hold` stops an automatic restart. Something went wrong that the panel is
   * currently explaining, and restarting Steam takes the explanation with it —
   * which is how "it added the game and did nothing else" happens.
   */
  const promptRestart = async (gameName: string, hold = false) => {
    const preference = await getRestartPreference().catch(() => "ask" as RestartPreference);

    if (preference === "always") {
      if (hold) return;
      // Long enough to see what just happened before the client goes down.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      restartSteam();
      return;
    }
    if (preference === "never") return;

    showModal(
      <RestartPrompt
        gameName={gameName}
        onDecision={(restart, remember) => {
          if (remember) {
            const choice: RestartPreference = restart ? "always" : "never";
            setRestartPreferenceState(choice);
            setRestartPreference(choice).catch(() => {});
          }
          if (restart) restartSteam();
        }}
      />,
    );
  };

  /**
   * File the new shortcut into the chosen collection, if any.
   *
   * Returns the collection's name on success, or null when none was chosen or
   * the write failed — the game itself is already added either way.
   */
  const fileIntoCollection = async (appId: number): Promise<string | null> => {
    if (!collectionId) return null;

    const creating = collectionId === NEW_COLLECTION;
    const collectionName = creating
      ? newCollectionName.trim()
      : (collections.find((collection) => collection.id === collectionId)?.name ?? "");

    if (!collectionName) return null;

    try {
      await addToCollection(appId, {
        id: creating ? undefined : collectionId,
        name: collectionName,
      });
      setCollections(listCollections());
      return collectionName;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("error", `Could not add to collection "${collectionName}": ${message}`).catch(() => {});
      toaster.toast({ title: "Could not add to collection", body: message });
      return null;
    }
  };

  /**
   * Fetch SteamGridDB artwork for a game that has already been added.
   *
   * Nothing here can fail the add — the game is in the library by now — so every
   * outcome, including "no API key", ends up as a line under "Last added".
   *
   * `keepIcon` is set when the shortcut already carries an application's own
   * icon, which is a better match for a Flatpak than SteamGridDB's guess.
   */
  const downloadArtworkFor = async (
    appId: number,
    searchName: string,
    keepIcon: boolean,
    slots: string[],
  ) => {
    // The user can add another game while this runs, so only ever patch the
    // entry this download belongs to.
    const patch = (fields: Partial<AddedShortcut>) => {
      const current = getDraft().added;
      if (current?.appId === appId) updateDraft({ added: { ...current, ...fields } });
    };

    const artwork = await fetchArtwork(appId, searchName, slots, (progress) =>
      patch({ artworkProgress: progress }),
    );

    if (artwork.iconPath && !keepIcon) setShortcutIcon(appId, artwork.iconPath);

    patch({ artwork, artworkProgress: null });
    return artwork;
  };

  /**
   * Re-read the artwork settings, and bring the panel into step with them.
   *
   * The copy loaded at mount is the only one the panel has, so a single failed
   * read used to mean no artwork — and no slot list — for the rest of the
   * session, silently.
   */
  const refreshArtworkSettings = async (): Promise<ArtworkSettings> => {
    const settings = await getArtworkSettings().catch(() => artworkSettings);
    // Not while a key is still on its way to disk: this would put the old one
    // back in the field underneath whoever is typing.
    if (unsavedKey.current === null) setArtworkSettings(settings);
    return settings;
  };

  /**
   * Fetch artwork for the game just added, on demand.
   *
   * Reachable whether or not the automatic attempt ran, since "it downloaded
   * nothing" and "it was never asked to" look the same from the panel.
   */
  const retryArtwork = async () => {
    const current = getDraft().added;
    if (!current) return;

    await flushArtworkKey();
    const settings = await refreshArtworkSettings();
    await downloadArtworkFor(current.appId, current.searchName.trim(), false, settings.slots);
  };

  const onAddToSteam = async () => {
    if (!target) return;
    const gameName = name.trim();
    // Artwork is searched for under the real title when the library name is not
    // one SteamGridDB would recognise.
    const searchName = artworkName.trim() || gameName;
    const hasOwnIcon = Boolean(iconPath);
    setBusy(true);
    try {
      updateDraft({ addError: null });
      const result = await addNonSteamShortcut({
        name: gameName,
        exe: target.path,
        startDir: target.directory,
        launchOptions: launchOptions.trim(),
        compatTool,
        iconPath,
      });

      // The game exists at this point, so a collection failure is reported but
      // never turned into a failed add.
      const filedInto = await fileIntoCollection(result.appId);

      log("info", `Added "${gameName}": ${result.log.join(" | ")}`).catch(() => {});
      updateDraft({
        added: {
          appId: result.appId,
          name: gameName,
          verified: result.verified,
          collection: filedInto ?? undefined,
          searchName,
          artwork: null,
          artworkProgress: null,
        },
        target: null,
        name: "",
        artworkName: "",
        launchOptions: "",
        compatTool: NO_COMPAT_TOOL,
        iconPath: "",
        collectionId: "",
        newCollectionName: "",
      });

      toaster.toast({
        title: result.verified ? "Added to Steam" : "Added, but not confirmed",
        body: gameName,
      });

      // "Last added" is the top section now, but the panel is still scrolled to
      // wherever the form's button was — and the artwork progress that appears
      // there is the only thing on screen saying the download is happening.
      scrollToTop(topAnchor.current);

      // Read the settings back instead of trusting what was loaded at mount: if
      // that one read failed, artwork would be skipped for the rest of the
      // session with nothing to show it had been.
      const settings = await refreshArtworkSettings();

      // Before the restart, and awaited: a restart while art is still being
      // applied loses the rest of it.
      let artworkFailed = false;
      if (settings.enabled) {
        // A key typed a moment ago may still be waiting out its debounce, and
        // the backend can only use what it has been given.
        await flushArtworkKey();
        const artwork = await downloadArtworkFor(
          result.appId,
          searchName,
          hasOwnIcon,
          settings.slots,
        );
        artworkFailed = !artwork.success;
        toaster.toast({
          title: artwork.success ? "Artwork applied" : "No artwork",
          body: artwork.success ? artwork.applied.join(", ") : artwork.error,
        });
      }

      // An automatic restart is skipped when the artwork failed: the reason is
      // on screen, and restarting is what would take it away unread.
      await promptRestart(gameName, artworkFailed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("error", `Could not add "${gameName}": ${message}`).catch(() => {});
      // A toast is easy to miss in Game Mode, and this is the failure the user
      // most needs to see, so it also stays on screen.
      updateDraft({ addError: message });
      toaster.toast({ title: "Could not add the game", body: message });
    } finally {
      setBusy(false);
    }
  };

  const onUndo = () => {
    if (!added) return;
    removeShortcut(added.appId);
    toaster.toast({ title: "Removed from Steam", body: added.name });
    updateDraft({ added: null });
  };

  const onChangeRestartPreference = (value: RestartPreference) => {
    setRestartPreferenceState(value);
    setRestartPreference(value).catch(() => {});
  };

  // A settings write per keystroke would be silly, so the key is saved once
  // typing stops. Deliberately not cancelled on unmount: the panel can be
  // hidden mid-edit, and the key still has to be saved.
  const keySaveTimer = useRef<number | undefined>(undefined);
  /** The key waiting on that timer, or null when nothing is pending. */
  const unsavedKey = useRef<string | null>(null);

  /**
   * Ask SteamGridDB whether the saved key actually works.
   *
   * Run after every save, so a key that was mistyped, truncated by a partial
   * paste or never written to disk says so there and then rather than at the
   * next add — which is several steps later and easy to blame on something else.
   */
  const checkKey = async () => {
    setKeyStatus("Checking the key with SteamGridDB…");
    try {
      const result = await checkSteamGridDb();
      setKeyStatus(result.ok ? `SteamGridDB: ${result.detail}.` : `Not usable: ${result.detail}.`);
    } catch (error) {
      setKeyStatus(`Could not reach the plugin's backend: ${message(error)}.`);
    }
  };

  const saveKey = async (key: string) => {
    unsavedKey.current = null;
    try {
      await setSteamGridDbKey(key);
    } catch (error) {
      setKeyStatus(`Could not save the key: ${message(error)}.`);
      return;
    }
    if (key.trim()) await checkKey();
    else setKeyStatus("");
  };

  /** Save a debounced key right now, for when something is about to need it. */
  const flushArtworkKey = async () => {
    const key = unsavedKey.current;
    if (key === null) return;
    clearTimeout(keySaveTimer.current);
    await saveKey(key);
  };

  const onChangeArtwork = (patch: Partial<ArtworkSettings>) => {
    setArtworkSettings((current) => ({ ...current, ...patch }));

    if (patch.enabled !== undefined) setArtworkEnabled(patch.enabled).catch(() => {});
    if (patch.key !== undefined) {
      const key = patch.key;
      clearTimeout(keySaveTimer.current);
      unsavedKey.current = key;
      keySaveTimer.current = window.setTimeout(() => {
        saveKey(key).catch(() => {});
      }, 700);
    }
  };

  const compatOptions = [
    { data: NO_COMPAT_TOOL, label: "None (native Linux game)" },
    ...compatTools.map((tool) => ({ data: tool.strToolName, label: tool.strDisplayName })),
  ];

  const collectionOptions = [
    { data: "", label: "None" },
    ...collections.map((collection) => ({ data: collection.id, label: collection.name })),
    { data: NEW_COLLECTION, label: "New collection…" },
  ];

  // Choosing "New collection…" without naming it would silently file the game
  // nowhere, so block the add until there is a name.
  const collectionReady = collectionId !== NEW_COLLECTION || Boolean(newCollectionName.trim());
  const canAdd = !busy && Boolean(name.trim()) && collectionReady;

  const needsExecutableBit = Boolean(
    target && target.exists && !target.is_dir && !target.is_windows_app && !target.is_executable,
  );

  const places = locations
    ? [...(locations.recent ? [locations.recent] : []), ...locations.places]
    : [];
  const onLocationSelected = (location: Location) => browseAt(location.path);

  // A failed add leaves the form on screen, a successful one returns to
  // browsing, so this has to render in both.
  const errorBanner = addError ? (
    <PanelSection title="Last error">
      <PanelSectionRow>
        <Field description={addError} />
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => updateDraft({ addError: null })}>
          Dismiss
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  ) : null;

  // Browsing is the whole panel until a file is chosen; after that the form
  // takes over so the user is not scrolling past a sidebar to reach it.
  const body = !target ? (
      <>
        {(backendError || versionWarning) && (
          <PanelSection>
            {backendError && (
              <PanelSectionRow>
                <Field description={backendError} />
              </PanelSectionRow>
            )}
            {versionWarning && (
              <PanelSectionRow>
                <Field description={versionWarning} />
              </PanelSectionRow>
            )}
          </PanelSection>
        )}

        {errorBanner}

        {/* First, not last: this is where an add reports what it did, including
            the artwork progress that runs before Steam restarts. Below the
            application list it was off the bottom of the screen. */}
        {added && (
          <AddedSection
            added={added}
            artworkReady={artworkSettings.enabled && Boolean(artworkSettings.key.trim())}
            onUndo={onUndo}
            onArtwork={retryArtwork}
            onChangeSearchName={(searchName) => {
              const current = getDraft().added;
              if (current) updateDraft({ added: { ...current, searchName } });
            }}
          />
        )}

        {/* Titled, so the segmented control below it reads as a choice of what
            to browse rather than two loose buttons. */}
        <PanelSection title="Browse">
          <SourceTabs value={source} onChange={(next) => updateDraft({ source: next })} />
        </PanelSection>

        {source === "apps" ? (
          <AppList
            applications={applications}
            failed={applicationsFailed}
            onSelect={onApplicationSelected}
            onRefresh={() => loadApplications(true)}
          />
        ) : (
          <>
            <PanelSection title="Places">
              {places.length > 0 ? (
                <LocationList locations={places} onSelect={onLocationSelected} />
              ) : (
                <PanelSectionRow>
                  <Field description="Loading…" />
                </PanelSectionRow>
              )}
            </PanelSection>

            <PanelSection title="Drives">
              {locations && locations.drives.length > 0 ? (
                <LocationList locations={locations.drives} onSelect={onLocationSelected} />
              ) : (
                <PanelSectionRow>
                  <Field description="No SD card or external drives connected." />
                </PanelSectionRow>
              )}
            </PanelSection>

            <PanelSection>
              <PanelSectionRow>
                <ButtonItem layout="below" onClick={() => browseAt(startPath || "/")}>
                  Browse from anywhere
                </ButtonItem>
              </PanelSectionRow>
            </PanelSection>
          </>
        )}

        <OptionsSection
          value={restartPreference}
          onChange={onChangeRestartPreference}
          artwork={artworkSettings}
          onChangeArtwork={onChangeArtwork}
          keyStatus={keyStatus}
          onCheckKey={checkKey}
        />
      </>
  ) : (
    <>
      {errorBanner}

      <PanelSection title="Game">
        <PanelSectionRow>
          <Field label="Selected" childrenLayout="below" bottomSeparator="standard">
            <div style={{ fontSize: "11px", wordBreak: "break-all", opacity: 0.8 }}>{target.path}</div>
          </Field>
        </PanelSectionRow>

        {!target.looks_launchable && (
          <PanelSectionRow>
            <Field
              description={`${target.extension} files are not launchable on their own. Pick the game's executable instead.`}
            />
          </PanelSectionRow>
        )}

        {needsExecutableBit && (
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              disabled={busy}
              description="This file is not marked as executable, so Steam cannot launch it."
              onClick={onMakeExecutable}
            >
              Mark as executable
            </ButtonItem>
          </PanelSectionRow>
        )}

        <PanelSectionRow>
          <ButtonItem layout="below" disabled={busy} onClick={clearSelection}>
            Choose a different file
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>

      <PanelSection title="Details">
        <PanelSectionRow>
          <TextEntry
            label="Name"
            value={name}
            onChange={(next) => updateDraft({ name: next })}
            description="Shown in your Steam library."
          />
        </PanelSectionRow>

        {artworkSettings.enabled && (
          artworkSettings.key ? (
            <PanelSectionRow>
              <TextEntry
                label="Artwork title"
                value={artworkName}
                onChange={(next) => updateDraft({ artworkName: next })}
                description="Optional. The game's real title, if the name above is not one SteamGridDB would know."
              />
            </PanelSectionRow>
          ) : (
            <PanelSectionRow>
              <Field
                label="Artwork"
                padding="compact"
                description={`Add a SteamGridDB API key under Options to download artwork automatically. Get one at ${artworkSettings.key_url}.`}
              />
            </PanelSectionRow>
          )
        )}

        <StackedDropdown
          label="Compatibility"
          description={
            target.is_windows_app
              ? "Windows games need Proton to run."
              : "Leave on None unless the game needs Proton."
          }
          rgOptions={compatOptions}
          selectedOption={compatTool}
          onChange={(option) => updateDraft({ compatTool: option.data })}
        />

        <PanelSectionRow>
          <TextEntry
            label="Launch options"
            value={launchOptions}
            onChange={(next) => updateDraft({ launchOptions: next })}
            description="Optional. Use %command% to wrap the executable."
          />
        </PanelSectionRow>

        <StackedDropdown
          label="Collection"
          description="Optional. Which library collection to file this under."
          rgOptions={collectionOptions}
          selectedOption={collectionId}
          onChange={(option) => updateDraft({ collectionId: option.data as string })}
        />

        {collectionId === NEW_COLLECTION && (
          <PanelSectionRow>
            <TextEntry
              label="New collection name"
              value={newCollectionName}
              onChange={(next) => updateDraft({ newCollectionName: next })}
            />
          </PanelSectionRow>
        )}

        <PanelSectionRow>
          <ButtonItem layout="below" disabled={!canAdd} onClick={onAddToSteam}>
            {busy ? "Adding…" : "Add to Steam"}
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    </>
  );

  return (
    <>
      {/* Anchor for scrollToTop; must stay the first node in the panel. */}
      <div ref={topAnchor} />
      {body}
    </>
  );
}

/**
 * A dropdown with its label above it and its explanation below it.
 *
 * `DropdownItem` puts the label and the control side by side, which in a panel
 * this narrow leaves each of them a couple of words wide and wraps both — and
 * the description then wraps under the label, so three things compete for the
 * same corner. Stacking them costs a little height and makes the row readable
 * at a glance, matching how the button rows already read.
 */
function StackedDropdown({
  label,
  description,
  rgOptions,
  selectedOption,
  onChange,
}: {
  label: string;
  description?: string;
  rgOptions: DropdownOption[];
  selectedOption: string;
  onChange(option: SingleDropdownOption): void;
}) {
  return (
    <>
      <PanelSectionRow>
        <Field
          label={label}
          childrenLayout="below"
          childrenContainerWidth="max"
          bottomSeparator="none"
        >
          <Dropdown rgOptions={rgOptions} selectedOption={selectedOption} onChange={onChange} />
        </Field>
      </PanelSectionRow>
      {description && (
        <PanelSectionRow>
          {/* Indented, so it reads as a note belonging to the control above it
              rather than as the next thing in the section. */}
          <div style={{ paddingLeft: "8px" }}>
            <Field description={description} padding="compact" />
          </div>
        </PanelSectionRow>
      )}
    </>
  );
}

/**
 * One line describing how the artwork download went, or "" when there is
 * nothing to say — artwork turned off, or a download not attempted yet.
 *
 * Names the files on disk, since none of them are visible in the library until
 * Steam restarts: without that, a download that worked and one that did nothing
 * read exactly the same.
 */
function describeArtwork(added: AddedShortcut): string {
  const artwork = added.artwork;
  if (!artwork) return "";

  const count = artwork.files.length;
  const files = count === 1 ? "file" : "files";
  const onDisk = count > 0 ? ` ${count} ${files} in ${artwork.directory}.` : "";

  if (!artwork.success) return `No artwork: ${artwork.error}.${onDisk}`;

  // Worth saying when SteamGridDB matched a different title, since that is the
  // one case where correct-looking artwork can be for the wrong game.
  const matched =
    artwork.game && artwork.game.toLowerCase() !== added.searchName.toLowerCase()
      ? ` for "${artwork.game}"`
      : "";
  // Library art is applied through Steam and is there now; the icon is a file on
  // the shortcut, and shortcuts are only read at startup.
  const icon = artwork.iconPath ? " The icon appears after Steam restarts." : "";
  return `Artwork${matched}: ${artwork.applied.join(", ")}.${onDisk}${icon}`;
}

function AddedSection({
  added,
  artworkReady,
  onUndo,
  onArtwork,
  onChangeSearchName,
}: {
  added: AddedShortcut;
  /** Artwork is switched on and has a key, so a download is worth offering. */
  artworkReady: boolean;
  onUndo(): void;
  onArtwork(): void;
  onChangeSearchName(value: string): void;
}) {
  const artworkSummary = describeArtwork(added);
  const progress = added.artworkProgress;

  // An exact match already has its artwork, so there is nothing to fix. Every
  // other state — a failure, art found under a different title, or no attempt
  // at all — is worth a try with a corrected title, which is only possible here
  // since the form is gone by now.
  const exactMatch =
    added.artwork?.success &&
    added.artwork.game.toLowerCase() === added.searchName.toLowerCase();
  const canRetryArtwork = artworkReady && !progress && !exactMatch;

  return (
    <PanelSection title="Last added">
      {!added.verified && (
        <PanelSectionRow>
          <Field description="Steam did not confirm this shortcut. Restart Steam and check your library — if it is missing, try again." />
        </PanelSectionRow>
      )}

      {/* Steam is not restarted until this finishes, so it doubles as the
          reason the panel is busy. */}
      {progress && (
        <ProgressRow
          label="Artwork"
          description="Downloading from SteamGridDB. Steam restarts once this is done."
          done={progress.done}
          total={progress.total}
          status={
            progress.slot
              ? `${progress.slot} (${progress.done + 1} of ${progress.total})`
              : "Searching SteamGridDB…"
          }
        />
      )}

      {artworkSummary && (
        <PanelSectionRow>
          <Field description={artworkSummary} />
        </PanelSectionRow>
      )}

      {/* The one case that would otherwise say nothing at all, which is what
          "it added the game but downloaded no artwork" looks like. */}
      {!artworkReady && !added.artwork && (
        <PanelSectionRow>
          <Field description="No artwork was downloaded: turn on Download artwork under Options and set a SteamGridDB API key." />
        </PanelSectionRow>
      )}

      {canRetryArtwork && (
        <PanelSectionRow>
          <TextEntry
            label="Artwork title"
            value={added.searchName}
            description="The title to look for on SteamGridDB."
            onChange={onChangeSearchName}
          />
        </PanelSectionRow>
      )}

      {canRetryArtwork && (
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            disabled={!added.searchName.trim()}
            onClick={onArtwork}
          >
            {added.artwork ? "Try artwork again" : "Download artwork"}
          </ButtonItem>
        </PanelSectionRow>
      )}

      <PanelSectionRow>
        <ButtonItem
          layout="below"
          description={
            added.collection
              ? `"${added.name}" is in your library, under ${added.collection}.`
              : `"${added.name}" is in your library.`
          }
          onClick={() => {
            Navigation.Navigate(`/library/app/${added.appId}`);
            Navigation.CloseSideMenus();
          }}
        >
          Open game page
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={() => restartSteam()}>
          Restart Steam
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" onClick={onUndo}>
          Undo
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}

function OptionsSection({
  value,
  onChange,
  artwork,
  onChangeArtwork,
  keyStatus,
  onCheckKey,
}: {
  value: RestartPreference;
  onChange(value: RestartPreference): void;
  artwork: ArtworkSettings;
  onChangeArtwork(patch: Partial<ArtworkSettings>): void;
  /** What SteamGridDB said about the saved key, or "" before it was asked. */
  keyStatus: string;
  onCheckKey(): void;
}) {
  return (
    <PanelSection title="Options">
      <StackedDropdown
        label="Restart Steam after adding"
        description="Steam requires a client (soft) restart to save shortcuts."
        rgOptions={[
          { data: "ask", label: "Ask each time" },
          { data: "always", label: "Always restart" },
          { data: "never", label: "Never restart" },
        ]}
        selectedOption={value}
        onChange={(option) => onChange(option.data as RestartPreference)}
      />

      <PanelSectionRow>
        <ToggleField
          label="Download artwork"
          description="Automatically applies artwork from SteamGridDB to the created shortcut."
          checked={artwork.enabled}
          onChange={(enabled) => onChangeArtwork({ enabled })}
        />
      </PanelSectionRow>

      {artwork.enabled && (
        <>
          {/* Above the field, not below it: the instructions are read once and
              then go away entirely, while the field stays. */}
          {!artwork.key.trim() && (
            <PanelSectionRow>
              <div style={{ paddingLeft: "8px" }}>
                <Field
                  padding="compact"
                  description={`SteamGridDB needs a free API key. Create one at ${artwork.key_url}, then paste it into the field below.`}
                />
              </div>
            </PanelSectionRow>
          )}

          {/* Set off from the toggle above it: the field's own label is small
              enough that, flush, it reads as part of that row. */}
          <PanelSectionRow>
            <div style={{ paddingTop: "10px" }}>
              <TextEntry
                label="SteamGridDB API key"
                value={artwork.key}
                // The one field a user cannot reasonably type, so it takes a
                // paste even when the event was aimed somewhere else.
                captureGlobalPaste
                onChange={(next) => onChangeArtwork({ key: next })}
              />
            </div>
          </PanelSectionRow>

          {/* The key is checked against SteamGridDB after every save, so this
              answers "is the key in and working" without waiting for an add. */}
          <PanelSectionRow>
            <ButtonItem layout="below" description={keyStatus || undefined} onClick={onCheckKey}>
              Check the artwork key
            </ButtonItem>
          </PanelSectionRow>
        </>
      )}

      <SavedGames />
    </PanelSection>
  );
}

export default definePlugin(() => ({
  name: "Add Non-Steam Games",
  titleView: (
    <div className={staticClasses.Title} style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
      Add Non-Steam Games
      {/* Visible build number, so a stale install is obvious at a glance. */}
      <span style={{ fontSize: "11px", opacity: 0.5 }}>v{PLUGIN_VERSION}</span>
    </div>
  ),
  content: <Content />,
  icon: <FaPlus />,
  // Decky unmounts plugin content whenever the Quick Access panel is hidden,
  // and opening the file picker hides it. Without this the picked file lands on
  // an unmounted component and the panel reopens blank.
  alwaysRender: true,
}));
