import { ButtonItem, Field, PanelSection, PanelSectionRow } from "@decky/ui";
import { useState } from "react";

import { listSavedShortcuts, ping } from "./backend";
import { countShortcutsInMemory } from "./steam";

/** Keep in sync with package.json and PLUGIN_VERSION in main.py. */
export const PLUGIN_VERSION = "1.6.0";

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

const has = (value: unknown) => typeof value === "function";

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];

  let backendVersion: string | null = null;
  let backendError = "";
  try {
    backendVersion = await ping();
  } catch (error) {
    backendError = error instanceof Error ? error.message : String(error);
  }

  checks.push({
    label: "Python backend",
    ok: backendVersion !== null,
    detail: backendVersion !== null ? `v${backendVersion}` : backendError || "unreachable",
  });

  checks.push({
    label: "Frontend build",
    ok: backendVersion === null || backendVersion === PLUGIN_VERSION,
    detail:
      backendVersion !== null && backendVersion !== PLUGIN_VERSION
        ? `v${PLUGIN_VERSION} — MISMATCH, reinstall`
        : `v${PLUGIN_VERSION}`,
  });

  const apps = SteamClient?.Apps;
  checks.push({
    label: "Steam shortcut API",
    ok: has(apps?.AddShortcut) && has(apps?.SetShortcutExe),
    detail: has(apps?.AddShortcut) ? "available" : "AddShortcut missing",
  });

  // The type says appStore always exists; at runtime it may not, which is the
  // whole point of checking.
  const appStoreReady = has(window.appStore?.GetAppOverviewByAppID as unknown);
  checks.push({
    label: "Steam app store",
    ok: appStoreReady,
    detail: appStoreReady ? "available" : "appStore missing",
  });

  checks.push({
    label: "Steam restart API",
    ok: has(SteamClient?.User?.StartRestart),
    detail: has(SteamClient?.User?.StartRestart) ? "available" : "StartRestart missing",
  });

  const inMemory = countShortcutsInMemory();
  checks.push({
    label: "Shortcuts in memory",
    ok: inMemory !== null,
    detail: inMemory === null ? "collectionStore unreadable" : `${inMemory}`,
  });

  try {
    const saved = await listSavedShortcuts();
    checks.push({
      label: "Shortcuts saved to disk",
      ok: saved.found,
      detail: saved.found ? `${saved.shortcuts.length}` : saved.error ?? "no file",
    });
  } catch (error) {
    checks.push({
      label: "Shortcuts saved to disk",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  return checks;
}

/**
 * Reports what the plugin can actually reach at runtime.
 *
 * Adding a game touches several APIs that are only present inside Steam's own
 * JS context; when one is missing the add fails in a way that otherwise looks
 * like "nothing happened".
 */
export function Diagnostics() {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [running, setRunning] = useState(false);

  const onRun = async () => {
    setRunning(true);
    try {
      setChecks(await runChecks());
    } finally {
      setRunning(false);
    }
  };

  return (
    <PanelSection title="Diagnostics">
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={running} onClick={onRun}>
          {running ? "Checking…" : `Run checks (v${PLUGIN_VERSION})`}
        </ButtonItem>
      </PanelSectionRow>

      {checks?.map((check) => (
        <PanelSectionRow key={check.label}>
          <Field
            label={check.label}
            padding="compact"
            bottomSeparator="none"
            childrenLayout="inline"
            childrenContainerWidth="max"
          >
            <div style={{ fontSize: "12px", textAlign: "right", color: check.ok ? undefined : "#ff6b6b" }}>
              {check.ok ? "" : "⚠ "}
              {check.detail}
            </div>
          </Field>
        </PanelSectionRow>
      ))}
    </PanelSection>
  );
}
