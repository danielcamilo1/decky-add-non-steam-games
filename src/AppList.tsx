import { ButtonItem, Field, PanelSection, PanelSectionRow } from "@decky/ui";
import { useMemo, useState } from "react";
import { FaArrowRotateRight, FaCube } from "react-icons/fa6";

import type { Application } from "./backend";
import { DisclosureRow, ListGroup, ListRow } from "./ListRow";
import { TextEntry } from "./TextEntry";

/**
 * Rows rendered before the list is truncated.
 *
 * A Deck can easily have 150+ desktop entries, and scrolling that far with a
 * D-pad is worse than typing two letters into the search box.
 */
const VISIBLE_LIMIT = 40;

/**
 * Rows shown while the list is collapsed.
 *
 * The list is collapsed by default because it otherwise pushes everything after
 * it — the last added game and every option — several screens down. Search
 * results still appear immediately: typing is a request to see matches, and a
 * handful of them costs no real height.
 */
const COLLAPSED_LIMIT = 6;

function matches(application: Application, query: string): boolean {
  if (!query) return true;
  const haystack = [application.name, application.source, application.args, application.exe]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

interface AppListProps {
  applications: Application[] | null;
  failed: boolean;
  onSelect(application: Application): void;
  onRefresh(): void;
}

export function AppList({ applications, failed, onSelect, onRefresh }: AppListProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(
    () => (applications ?? []).filter((application) => matches(application, query)),
    [applications, query],
  );

  if (failed) {
    return (
      <PanelSection title="Applications">
        <PanelSectionRow>
          <Field description="Could not read the installed applications." />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={onRefresh}>
            Try again
          </ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    );
  }

  if (applications === null) {
    return (
      <PanelSection title="Applications">
        <PanelSectionRow>
          <Field description="Looking for installed applications…" />
        </PanelSectionRow>
      </PanelSection>
    );
  }

  const searching = query.trim().length > 0;
  // Collapsed and idle shows no rows at all: the first few entries
  // alphabetically are not a useful preview of 180 applications.
  const shown =
    expanded || searching ? filtered.slice(0, expanded ? VISIBLE_LIMIT : COLLAPSED_LIMIT) : [];

  const hidden = filtered.length - shown.length;
  // Nothing left to reveal means the row would do nothing, so it goes away —
  // except while expanded, where it is the way back to a short panel.
  const showDisclosure = expanded || hidden > 0;

  let disclosureLabel = "Show all applications";
  if (expanded) disclosureLabel = "Collapse list";
  else if (searching) disclosureLabel = `Show all ${filtered.length} matches`;

  return (
    <PanelSection title="Applications">
      <PanelSectionRow>
        <TextEntry label="Search" value={query} onChange={setQuery} />
      </PanelSectionRow>

      {showDisclosure && (
        <DisclosureRow
          label={disclosureLabel}
          expanded={expanded}
          // The count is already in the label while searching.
          trailing={!expanded && !searching ? `${filtered.length}` : undefined}
          onToggle={() => setExpanded(!expanded)}
        />
      )}

      {shown.length > 0 && (
        <ListGroup>
          {shown.map((application) => (
            <ListRow
              key={application.desktop_file}
              icon={
                application.icon_data ? (
                  <img
                    src={application.icon_data}
                    alt=""
                    style={{ width: "20px", height: "20px", objectFit: "contain" }}
                  />
                ) : (
                  <FaCube />
                )
              }
              label={application.name}
              trailing={application.source}
              onSelect={() => onSelect(application)}
            />
          ))}
        </ListGroup>
      )}

      {/* Nothing to expand and nothing shown, so the reason has to be stated —
          otherwise the section is just a search box that never answers. */}
      {filtered.length === 0 && (searching || applications.length === 0) && (
        <PanelSectionRow>
          <Field
            description={
              applications.length === 0
                ? "No installed applications found."
                : `Nothing matches "${query}".`
            }
          />
        </PanelSectionRow>
      )}

      {expanded && hidden > 0 && (
        <PanelSectionRow>
          <Field
            description={`Showing ${shown.length} of ${filtered.length}. Search to narrow it down.`}
          />
        </PanelSectionRow>
      )}

      {/* Stays visible while collapsed: a game installed a minute ago is a
          common reason for searching and finding nothing.

          A row rather than a ButtonItem, so it lines up with the disclosure row
          and the application rows above it instead of sitting at its own width. */}
      <ListGroup>
        <ListRow icon={<FaArrowRotateRight />} label="Rescan applications" onSelect={onRefresh} />
      </ListGroup>
    </PanelSection>
  );
}
