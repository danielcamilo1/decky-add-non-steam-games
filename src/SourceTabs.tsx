import { DialogButton, Focusable } from "@decky/ui";
import type { ReactNode } from "react";
import { FaFolderOpen, FaTableCellsLarge } from "react-icons/fa6";

export type Source = "apps" | "files";

interface SourceTabsProps {
  value: Source;
  onChange(value: Source): void;
}

const TABS: Array<{ id: Source; label: string; icon: ReactNode }> = [
  { id: "apps", label: "Applications", icon: <FaTableCellsLarge /> },
  { id: "files", label: "Files", icon: <FaFolderOpen /> },
];

/**
 * Selection and focus, painted as two visibly different things.
 *
 * Steam marks gamepad focus by inverting the button's own surface, which is the
 * strongest state the control has — so that is what the *selected* tab wears
 * permanently, and focus gets the accent colour instead. Anything inline on the
 * button would beat both on specificity, hence a stylesheet: `.ansg-tab-selected`
 * follows the base rule so it wins the tie, and the focus rules follow that with
 * a higher specificity so focus always shows through the selection.
 *
 * `:focus` rather than only Steam's `.gpfocus`, because gamepad navigation does
 * move real DOM focus and the class name is not ours to depend on.
 */
const TAB_STYLES = `
.ansg-tab {
  background: rgba(255, 255, 255, 0.08) !important;
  color: #dfe3e8 !important;
  transition: background-color 120ms ease-out, color 120ms ease-out;
}
.ansg-tab-selected {
  background: #ffffff !important;
  color: #12171d !important;
}
.ansg-tab:hover,
.ansg-tab:focus,
.ansg-tab.gpfocus {
  background: var(--gpColor-Blue, #1a9fff) !important;
  color: #ffffff !important;
}
`;

/**
 * Segmented control for choosing what to browse.
 *
 * A two-option switch reads better here than a dropdown: both choices stay
 * visible, so the Applications list is discoverable rather than hidden behind
 * a menu, and left/right on the D-pad moves between them.
 *
 * The bar under the label is what survives every combination of the two states
 * above — it is drawn in `currentColor`, which each state flips along with the
 * surface, so "which tab am I on" is answerable even while that tab is focused.
 */
export function SourceTabs({ value, onChange }: SourceTabsProps) {
  return (
    <>
      <style>{TAB_STYLES}</style>
      <Focusable
        flow-children="horizontal"
        style={{
          display: "flex",
          gap: "4px",
          margin: "0 16px 8px",
          // A track behind the pair is what makes this read as one control with
          // two settings, rather than two unrelated buttons.
          padding: "4px",
          borderRadius: "6px",
          background: "rgba(0, 0, 0, 0.3)",
        }}
      >
        {TABS.map((tab) => {
          const active = tab.id === value;
          return (
            <DialogButton
              key={tab.id}
              className={active ? "ansg-tab ansg-tab-selected" : "ansg-tab"}
              onClick={() => onChange(tab.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "5px",
                flex: "1 1 0",
                minWidth: 0,
                padding: "7px 4px 5px",
                minHeight: "0",
                fontSize: "13px",
                lineHeight: "1.2",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  minWidth: 0,
                  // Weight, not opacity: dimming the other tab reads as
                  // "disabled", so both keep full contrast.
                  fontWeight: active ? 700 : 400,
                }}
              >
                {tab.icon}
                {tab.label}
              </span>
              <span
                style={{
                  // Edge to edge: at 60% it read as decoration under the label
                  // rather than as the tab itself being marked.
                  width: "100%",
                  height: "3px",
                  borderRadius: "2px",
                  // Kept in the layout when inactive so the label does not shift
                  // as the selection moves.
                  background: active ? "currentColor" : "transparent",
                }}
              />
            </DialogButton>
          );
        })}
      </Focusable>
    </>
  );
}
