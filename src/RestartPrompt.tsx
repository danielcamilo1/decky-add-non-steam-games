import { ConfirmModal, ToggleField } from "@decky/ui";
import { useState } from "react";

interface RestartPromptProps {
  gameName: string;
  /**
   * @param restart Whether to restart Steam now.
   * @param remember Whether that answer becomes the standing preference.
   */
  onDecision(restart: boolean, remember: boolean): void;
  closeModal?(): void;
}

/**
 * Asked after a game is added, because Steam only writes `shortcuts.vdf` during
 * a clean shutdown — until then the new game lives in memory only.
 */
export function RestartPrompt({ gameName, onDecision, closeModal }: RestartPromptProps) {
  const [remember, setRemember] = useState(false);

  return (
    <ConfirmModal
      strTitle="Restart Steam?"
      strDescription={`"${gameName}" is in your library now, but Steam only saves non-Steam games to disk when it shuts down. Restarting now makes it permanent.`}
      strOKButtonText="Restart now"
      strCancelButtonText="Not now"
      closeModal={closeModal}
      onOK={() => onDecision(true, remember)}
      onCancel={() => onDecision(false, remember)}
    >
      <ToggleField
        label="Remember my choice"
        description="Do the same after every game without asking. You can change this later under Options."
        checked={remember}
        onChange={setRemember}
      />
    </ConfirmModal>
  );
}
