import { ButtonItem, Field, PanelSection, PanelSectionRow, TextField } from "@decky/ui";
import { useMemo, useState } from "react";
import { FaCube } from "react-icons/fa6";

import type { Application } from "./backend";
import { ListGroup, ListRow } from "./ListRow";

/**
 * Rows rendered before the list is truncated.
 *
 * A Deck can easily have 150+ desktop entries, and scrolling that far with a
 * D-pad is worse than typing two letters into the search box.
 */
const VISIBLE_LIMIT = 40;

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

  const shown = filtered.slice(0, VISIBLE_LIMIT);

  return (
    <PanelSection title="Applications">
      <PanelSectionRow>
        <TextField
          label="Search"
          value={query}
          bShowClearAction
          onChange={(event) => setQuery(event.target.value)}
        />
      </PanelSectionRow>

      {shown.length === 0 ? (
        <PanelSectionRow>
          <Field
            description={
              applications.length === 0
                ? "No installed applications found."
                : `Nothing matches "${query}".`
            }
          />
        </PanelSectionRow>
      ) : (
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

      {filtered.length > shown.length && (
        <PanelSectionRow>
          <Field
            description={`Showing ${shown.length} of ${filtered.length}. Search to narrow it down.`}
          />
        </PanelSectionRow>
      )}

      <PanelSectionRow>
        <ButtonItem layout="below" onClick={onRefresh}>
          Rescan applications
        </ButtonItem>
      </PanelSectionRow>
    </PanelSection>
  );
}
