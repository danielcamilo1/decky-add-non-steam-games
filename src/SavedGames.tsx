import { ButtonItem, Field, Navigation, PanelSectionRow } from "@decky/ui";
import { useMemo, useState } from "react";
import { FaChevronDown, FaGamepad } from "react-icons/fa6";

import { listSavedShortcuts } from "./backend";
import type { SavedShortcut } from "./backend";
import { DisclosureRow, ListGroup, ListRow } from "./ListRow";
import { TextEntry } from "./TextEntry";

/** Rows revealed when the list first opens. */
const INITIAL_LIMIT = 20;

/** Rows added by one press of the reveal row. */
const REVEAL_STEP = 20;

/**
 * List length that earns a search box.
 *
 * Below this the field costs more height than the scrolling it saves; above it,
 * typing two letters beats every other way of finding one entry.
 */
const SEARCH_THRESHOLD = 12;

/** Case-insensitive, digit-aware ordering, so "Game 2" precedes "Game 10". */
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function matches(shortcut: SavedShortcut, query: string): boolean {
  if (!query) return true;
  const haystack = `${shortcut.name} ${shortcut.exe}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

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
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(INITIAL_LIMIT);
  /** Row to hand the D-pad to, set when revealing more; -1 while idle. */
  const [focusRow, setFocusRow] = useState(-1);
  const [busy, setBusy] = useState(false);

  const collapse = () => {
    setExpanded(false);
    setQuery("");
    setLimit(INITIAL_LIMIT);
    setFocusRow(-1);
  };

  const onCheck = async () => {
    setBusy(true);
    setSummary("Loading…");
    collapse();
    try {
      const saved = await listSavedShortcuts();
      if (!saved.found) {
        setGames([]);
        setSummary(saved.error ?? "Steam has not written a shortcuts file yet.");
        return;
      }

      // Sorted once here rather than at render: shortcuts.vdf is in the order
      // Steam happened to write them, which is no order at all to look through.
      const named = saved.shortcuts
        .filter((shortcut) => shortcut.name)
        .sort((a, b) => collator.compare(a.name, b.name));
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

  const filtered = useMemo(
    () => games.filter((shortcut) => matches(shortcut, query)),
    [games, query],
  );

  const shown = expanded ? filtered.slice(0, limit) : [];
  const hidden = filtered.length - shown.length;

  return (
    <>
      <PanelSectionRow>
        <ButtonItem
          layout="below"
          disabled={busy}
          description={
            summary ??
            "Show list of current Steam shortcuts. Updates when the Steam client restarts."
          }
          onClick={onCheck}
        >
          {busy ? "Loading…" : "Load Steam Shortcuts"}
        </ButtonItem>
      </PanelSectionRow>

      {/* Set off on both sides: flush against the row above it the toggle reads
          as part of that button, and flush against the list below it as the
          list's first entry. */}
      {games.length > 0 && (
        <div style={{ margin: "10px 0" }}>
          <DisclosureRow
            label={expanded ? "Hide the list" : "Show the list"}
            expanded={expanded}
            trailing={expanded ? undefined : `${games.length}`}
            onToggle={() => (expanded ? collapse() : setExpanded(true))}
          />
        </div>
      )}

      {/* Long lists get a filter instead of pages. Paging a flat list of names
          means remembering which page a name was on and walking back through
          the ones before it; a filter answers "where is X" in two letters, and
          it is what the Applications list above already does. */}
      {expanded && games.length >= SEARCH_THRESHOLD && (
        <PanelSectionRow>
          <TextEntry
            label="Search"
            value={query}
            onChange={(next) => {
              setQuery(next);
              // A new set of results starts at the top, never part way into a
              // list the old query had been expanded through — and the D-pad
              // stays in the field the user is still typing into.
              setLimit(INITIAL_LIMIT);
              setFocusRow(-1);
            }}
          />
        </PanelSectionRow>
      )}

      {shown.length > 0 && (
        <ListGroup>
          {shown.map((game, index) => (
            <ListRow
              key={game.app_id}
              icon={<FaGamepad />}
              label={game.name}
              takeFocus={index === focusRow}
              onSelect={() => {
                Navigation.Navigate(`/library/app/${game.app_id}`);
                Navigation.CloseSideMenus();
              }}
            />
          ))}
        </ListGroup>
      )}

      {/* Reveals in place rather than replacing the page, so everything already
          read stays where it was.

          Focus follows onto the first row revealed, since this row drops twenty
          places down the panel the moment it is pressed — left where it was,
          the D-pad would be at the bottom of the new rows looking up at them,
          which is the wrong end of what the press just produced. */}
      {expanded && hidden > 0 && (
        <div style={{ marginTop: "10px" }}>
          <ListGroup>
            <ListRow
              icon={<FaChevronDown />}
              label={`Show ${Math.min(REVEAL_STEP, hidden)} more`}
              trailing={`${hidden} left`}
              onSelect={() => {
                setFocusRow(shown.length);
                setLimit(limit + REVEAL_STEP);
              }}
            />
          </ListGroup>
        </div>
      )}

      {expanded && filtered.length === 0 && (
        <PanelSectionRow>
          <Field description={`Nothing matches "${query}".`} />
        </PanelSectionRow>
      )}
    </>
  );
}
