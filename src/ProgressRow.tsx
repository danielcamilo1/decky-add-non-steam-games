import { Field, PanelSectionRow } from "@decky/ui";

/**
 * A progress bar drawn from plain elements.
 *
 * `@decky/ui` does have one, but like every component it exports it is found by
 * matching a string in Steam's minified bundle — so a client update can turn it
 * into `undefined`, and rendering that throws. Everything here is ours, which
 * matters because this bar reports work that must not be interrupted by its own
 * progress display.
 */
export function ProgressRow({
  label,
  description,
  status,
  done,
  total,
}: {
  label: string;
  description?: string;
  /** What is happening right now, shown beside the percentage. */
  status: string;
  done: number;
  total: number;
}) {
  const fraction = total > 0 ? Math.min(Math.max(done / total, 0), 1) : 0;

  return (
    <PanelSectionRow>
      <Field
        label={label}
        description={description}
        childrenLayout="below"
        childrenContainerWidth="max"
        padding="compact"
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", opacity: 0.8 }}>
          <span>{status}</span>
          <span>{Math.round(fraction * 100)}%</span>
        </div>
        <div
          style={{
            marginTop: "4px",
            height: "6px",
            borderRadius: "3px",
            background: "rgba(255, 255, 255, 0.15)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${fraction * 100}%`,
              height: "100%",
              borderRadius: "3px",
              background: "#1a9fff",
              transition: "width 150ms linear",
            }}
          />
        </div>
      </Field>
    </PanelSectionRow>
  );
}
