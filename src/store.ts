import { useEffect, useState } from "react";

import type { ArtworkProgress, ArtworkResult } from "./artwork";
import type { PathInfo } from "./backend";

export interface AddedShortcut {
  appId: number;
  name: string;
  verified: boolean;
  /** Collection the game was filed into, if any. */
  collection?: string;
  /** What was searched for on SteamGridDB, kept so the user can retry. */
  searchName: string;
  /** null until the download finishes, or when artwork was not wanted. */
  artwork: ArtworkResult | null;
  /** Set while a download is running, and what the progress bar reads from. */
  artworkProgress: ArtworkProgress | null;
}

/** Dropdown value meaning "create a collection with the name typed below". */
export const NEW_COLLECTION = "__new__";

/** Which browser the panel is showing. */
export type Source = "apps" | "files";

/** The in-progress game being added. */
export interface Draft {
  source: Source;
  target: PathInfo | null;
  name: string;
  /**
   * Title to search SteamGridDB for, when it differs from `name`.
   *
   * Empty means "search for the name above", which is right for a real game
   * title and wrong for something like "ELDEN RING launcher" or a Flatpak's
   * display name — hence the override.
   */
  artworkName: string;
  launchOptions: string;
  compatTool: string;
  /** Icon file to give the shortcut, taken from the picked application. */
  iconPath: string;
  /** "" for no collection, `NEW_COLLECTION`, or an existing collection's id. */
  collectionId: string;
  /** Name used when `collectionId` is `NEW_COLLECTION`. */
  newCollectionName: string;
  added: AddedShortcut | null;
  addError: string | null;
}

const EMPTY: Draft = {
  source: "apps",
  target: null,
  name: "",
  artworkName: "",
  launchOptions: "",
  compatTool: "",
  iconPath: "",
  collectionId: "",
  newCollectionName: "",
  added: null,
  addError: null,
};

/**
 * Draft state lives outside React on purpose.
 *
 * Decky unmounts a plugin's content whenever the Quick Access panel is hidden
 * (`PluginView` renders `content` only when `visible || alwaysRender`), and
 * opening the file picker hides it. Component state would be destroyed while
 * the picker is open, so the picked file would land on a dead component and
 * the panel would come back blank — as if nothing had happened.
 *
 * `alwaysRender` on the plugin keeps it mounted in the normal case; this keeps
 * the draft intact even if it does unmount.
 */
let draft: Draft = EMPTY;
const listeners = new Set<() => void>();

export function getDraft(): Draft {
  return draft;
}

export function updateDraft(patch: Partial<Draft>): void {
  draft = { ...draft, ...patch };
  listeners.forEach((listener) => listener());
}

export function clearSelection(): void {
  updateDraft({
    target: null,
    name: "",
    artworkName: "",
    launchOptions: "",
    compatTool: "",
    iconPath: "",
    collectionId: "",
    newCollectionName: "",
  });
}

export function useDraft(): Draft {
  const [snapshot, setSnapshot] = useState(draft);

  useEffect(() => {
    // Re-read on mount: the draft can have changed while this component was
    // unmounted, which is exactly the file-picker case.
    setSnapshot(draft);

    const listener = () => setSnapshot(draft);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return snapshot;
}
