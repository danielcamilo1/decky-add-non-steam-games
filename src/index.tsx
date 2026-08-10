import {
  ButtonItem,
  DropdownItem,
  Field,
  Navigation,
  PanelSection,
  PanelSectionRow,
  TextField,
  showModal,
  staticClasses,
} from "@decky/ui";
import {
  FileSelectionType,
  definePlugin,
  openFilePicker,
  toaster,
  useQuickAccessVisible,
} from "@decky/api";
import { useEffect, useRef, useState } from "react";
import { FaPlus } from "react-icons/fa6";

import {
  getRestartPreference,
  getStartPath,
  inspectPath,
  listApplications,
  listLocations,
  listSavedShortcuts,
  log,
  makeExecutable,
  rememberDirectory,
  setRestartPreference,
} from "./backend";
import type { Application, Location, Locations, PathInfo, RestartPreference } from "./backend";
import { AppList } from "./AppList";
import { Diagnostics, PLUGIN_VERSION } from "./Diagnostics";
import { LocationList } from "./LocationList";
import { SourceTabs } from "./SourceTabs";
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
} from "./steam";
import type { CollectionSummary, CompatibilityTool } from "./steam";
import { NEW_COLLECTION, clearSelection, updateDraft, useDraft } from "./store";
import type { AddedShortcut } from "./store";

const NO_COMPAT_TOOL = "";

// `useQuickAccessVisible` only exists on loader API v2. @decky/api falls back to
// v1 against older loaders, where it is undefined — calling it would blank the
// whole panel, so resolve it once here.
const usePanelVisible: () => boolean =
  typeof useQuickAccessVisible === "function" ? useQuickAccessVisible : () => true;

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
  const [busy, setBusy] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);

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
    getStartPath().then(setStartPath).catch(() => {});
    getRestartPreference().then(setRestartPreferenceState).catch(() => {});
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

  const promptRestart = async (gameName: string) => {
    const preference = await getRestartPreference().catch(() => "ask" as RestartPreference);

    if (preference === "always") {
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

  const onAddToSteam = async () => {
    if (!target) return;
    const gameName = name.trim();
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
        },
        target: null,
        name: "",
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

      await promptRestart(gameName);
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
        {backendError && (
          <PanelSection>
            <PanelSectionRow>
              <Field description={backendError} />
            </PanelSectionRow>
          </PanelSection>
        )}

        {errorBanner}

        <PanelSection>
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

        {added && <AddedSection added={added} onUndo={onUndo} />}

        <OptionsSection value={restartPreference} onChange={onChangeRestartPreference} />

        <Diagnostics />
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
          <TextField
            label="Name"
            value={name}
            onChange={(event) => updateDraft({ name: event.target.value })}
            description="Shown in your Steam library."
          />
        </PanelSectionRow>

        <PanelSectionRow>
          <DropdownItem
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
        </PanelSectionRow>

        <PanelSectionRow>
          <TextField
            label="Launch options"
            value={launchOptions}
            onChange={(event) => updateDraft({ launchOptions: event.target.value })}
            description="Optional. Use %command% to wrap the executable."
          />
        </PanelSectionRow>

        <PanelSectionRow>
          <DropdownItem
            label="Collection"
            description="Optional. Which library collection to file this under."
            rgOptions={collectionOptions}
            selectedOption={collectionId}
            onChange={(option) => updateDraft({ collectionId: option.data as string })}
          />
        </PanelSectionRow>

        {collectionId === NEW_COLLECTION && (
          <PanelSectionRow>
            <TextField
              label="New collection name"
              value={newCollectionName}
              onChange={(event) => updateDraft({ newCollectionName: event.target.value })}
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

function AddedSection({ added, onUndo }: { added: AddedShortcut; onUndo(): void }) {
  return (
    <PanelSection title="Last added">
      {!added.verified && (
        <PanelSectionRow>
          <Field description="Steam did not confirm this shortcut. Restart Steam and check your library — if it is missing, try again." />
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
}: {
  value: RestartPreference;
  onChange(value: RestartPreference): void;
}) {
  const [savedSummary, setSavedSummary] = useState<string | null>(null);

  const onCheckSaved = async () => {
    setSavedSummary("Checking…");
    try {
      const saved = await listSavedShortcuts();
      if (!saved.found) {
        setSavedSummary(saved.error ?? "Steam has not written a shortcuts file yet.");
        return;
      }
      const names = saved.shortcuts.map((shortcut) => shortcut.name).filter(Boolean);
      setSavedSummary(
        names.length === 0
          ? "Steam has no non-Steam games saved to disk."
          : `${names.length} saved: ${names.join(", ")}`,
      );
    } catch (error) {
      setSavedSummary(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <PanelSection title="Options">
      <PanelSectionRow>
        <DropdownItem
          label="Restart Steam after adding"
          description="Restarting is what saves new games permanently."
          rgOptions={[
            { data: "ask", label: "Ask each time" },
            { data: "always", label: "Always restart" },
            { data: "never", label: "Never restart" },
          ]}
          selectedOption={value}
          onChange={(option) => onChange(option.data as RestartPreference)}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          description={
            savedSummary ?? "Reads Steam's saved games file. It only updates when Steam restarts."
          }
          onClick={onCheckSaved}
        >
          Check saved games
        </ButtonItem>
      </PanelSectionRow>
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
