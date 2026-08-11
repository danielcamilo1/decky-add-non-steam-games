import { ButtonItem, Field, Navigation, PanelSectionRow } from "@decky/ui";
import { useState } from "react";
import { FaGamepad } from "react-icons/fa6";

import { listSavedShortcuts } from "./backend";
import type { SavedShortcut } from "./backend";
import { DisclosureRow, ListGroup, ListRow } from "./ListRow";

/**
 * Rows rendered before the list is truncated.
 *
 * A well-used Deck can have eighty non-Steam games, and scrolling all of them
 * with a D-pad answers nothing the count does not.
 */
const VISIBLE_LIMIT = 30;

/**
 * What Steam has actually written to `shortcuts.vdf`.
 *
 * This is the ground truth for "did my game really save", so the names matter
 * individually — as rows that can be opened, not a comma-separated paragraph
 * eighty entries long.
 */
export function SavedGames() {
  const [summary, setSummary] = useState<string | null>(null);
  const [games, setGames] = useState<SavedShortcut[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const onCheck = async () => {
    setBusy(true);
    setSummary("Checking…");
    try {
      const saved = await listSavedShortcuts();
      if (!saved.found) {
        setGames([]);
        setSummary(saved.error ?? "Steam has not written a shortcuts file yet.");
        return;
      }

      const named = saved.shortcuts.filter((shortcut) => shortcut.name);
      setGames(named);
      setSummary(
        named.length === 0
          ? "Steam has no non-Steam games saved to disk."
          : `${named.length} saved to disk.`,
      );
    } catch (error) {
      setGames([]);
      setSummary(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const shown = expanded ? games.slice(0, VISIBLE_LIMIT) : [];

  return (
    <>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          disabled={busy}
          description={
            summary ?? "Reads Steam's saved games file. It only updates when Steam restarts."
          }
          onClick={onCheck}
        >
          {busy ? "Checking…" : "Check saved games"}
        </ButtonItem>
      </PanelSectionRow>

      {games.length > 0 && (
        <DisclosureRow
          label={expanded ? "Hide the list" : "Show the list"}
          expanded={expanded}
          trailing={expanded ? undefined : `${games.length}`}
          onToggle={() => setExpanded(!expanded)}
        />
      )}

      {shown.length > 0 && (
        <ListGroup>
          {shown.map((game) => (
            <ListRow
              key={game.app_id}
              icon={<FaGamepad />}
              label={game.name}
              onSelect={() => {
                Navigation.Navigate(`/library/app/${game.app_id}`);
                Navigation.CloseSideMenus();
              }}
            />
          ))}
        </ListGroup>
      )}

      {expanded && games.length > shown.length && (
        <PanelSectionRow>
          <Field description={`Showing ${shown.length} of ${games.length}.`} />
        </PanelSectionRow>
      )}
    </>
  );
}
