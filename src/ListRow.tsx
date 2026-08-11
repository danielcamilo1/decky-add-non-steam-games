import { DialogButton, Focusable } from "@decky/ui";
import { useEffect, useRef, type ReactNode } from "react";
import { FaChevronDown, FaChevronRight } from "react-icons/fa6";

export interface ListRowProps {
  icon: ReactNode;
  label: string;
  /** Right-aligned secondary text: free space, app source, and so on. */
  trailing?: string;
  /**
   * Take gamepad focus when this row appears.
   *
   * For a row that arrives in response to a press, so the D-pad carries on from
   * what the press produced rather than from wherever the pressed row went.
   */
  takeFocus?: boolean;
  onSelect(): void;
}

/**
 * One selectable row.
 *
 * Rows are deliberately full width and a single line: in the Quick Access
 * panel that makes them large D-pad targets, and keeps a long list scannable
 * without a trackpad.
 */
export function ListRow({ icon, label, trailing, takeFocus, onSelect }: ListRowProps) {
  const element = useRef<HTMLDivElement>(null);

  // Steam moves gamepad focus by focusing the real element, so this is the
  // whole of handing the D-pad to a row. A frame late: the row is not laid out
  // until after the commit that mounted it has painted, and focus given to an
  // unlaid-out element is focus Steam's navigation immediately takes back.
  useEffect(() => {
    if (!takeFocus) return;
    const frame = requestAnimationFrame(() => element.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [takeFocus]);

  return (
    <DialogButton
      ref={element}
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        // Tighter than a default DialogButton so a full list fits on screen,
        // but still a comfortable controller target.
        padding: "8px 12px",
        minHeight: "0",
        width: "100%",
        minWidth: "0",
        fontSize: "14px",
        lineHeight: "1.2",
        textAlign: "left",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          width: "20px",
          height: "20px",
          fontSize: "15px",
          opacity: 0.85,
        }}
      >
        {icon}
      </span>
      <span
        style={{
          flex: "1 1 auto",
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      {trailing && <span style={{ flexShrink: 0, opacity: 0.6, fontSize: "11px" }}>{trailing}</span>}
    </DialogButton>
  );
}

/**
 * Vertical group of rows.
 *
 * `flow-children="vertical"` keeps up/down moving between rows instead of
 * escaping the group, which is what makes these lists usable in Game Mode.
 */
export function ListGroup({ children }: { children: ReactNode }) {
  return (
    <Focusable
      flow-children="vertical"
      style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "0 16px" }}
    >
      {children}
    </Focusable>
  );
}

/**
 * Row that expands or collapses the list below it.
 *
 * Built from `ListRow` so it sits in the same visual language as the rows it
 * reveals, and the chevron says which way pressing A will go.
 */
export function DisclosureRow({
  label,
  expanded,
  trailing,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  trailing?: string;
  onToggle(): void;
}) {
  return (
    <ListGroup>
      <ListRow
        icon={expanded ? <FaChevronDown /> : <FaChevronRight />}
        label={label}
        trailing={trailing}
        onSelect={onToggle}
      />
    </ListGroup>
  );
}
