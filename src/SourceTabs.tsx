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
 */
export function SourceTabs({ value, onChange }: SourceTabsProps) {
  return (
    <Focusable
      flow-children="horizontal"
      style={{ display: "flex", gap: "4px", padding: "0 16px 8px" }}
    >
      {TABS.map((tab) => {
        const active = tab.id === value;
        return (
          <DialogButton
            key={tab.id}
            // Steam's own primary-button style marks the selection. Using its
            // class rather than an inline background keeps the gamepad focus
            // highlight working: focus and selection stay separately visible.
            className={active ? "Primary" : undefined}
            onClick={() => onChange(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              flex: "1 1 0",
              minWidth: 0,
              padding: "8px 4px",
              minHeight: "0",
              fontSize: "13px",
              lineHeight: "1.2",
              // Weight, not opacity: dimming an unselected tab reads as
              // "disabled", so the inactive one keeps full contrast and simply
              // sits on the standard button surface.
              fontWeight: active ? 600 : 400,
            }}
          >
            {tab.icon}
            {tab.label}
          </DialogButton>
        );
      })}
    </Focusable>
  );
}
