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
 * Segmented control for choosing what to browse.
 *
 * A two-option switch reads better here than a dropdown: both choices stay
 * visible, so the Applications list is discoverable rather than hidden behind
 * a menu, and left/right on the D-pad moves between them.
 *
 * Marking the selected tab is fiddlier than it looks. Steam shows gamepad focus
 * by painting the button's own surface, so anything inline on the button —
 * background, border, box-shadow — beats that on specificity and swallows the
 * focus highlight, leaving the user unable to tell what pressing A would do.
 * The selection is therefore drawn *inside* the button: a bar under the label,
 * plus a heavier label. Both use `currentColor`, which Steam flips along with
 * the surface on focus, so they stay legible either way.
 */
export function SourceTabs({ value, onChange }: SourceTabsProps) {
  return (
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
                width: "60%",
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
  );
}
