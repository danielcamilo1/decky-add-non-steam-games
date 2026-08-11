import { TextField } from "@decky/ui";
import { useQuickAccessVisible } from "@decky/api";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

// `useQuickAccessVisible` only exists on loader API v2. @decky/api falls back to
// v1 against older loaders, where it is undefined — calling it would blank the
// whole panel, so resolve it once here.
export const usePanelVisible: () => boolean =
  typeof useQuickAccessVisible === "function" ? useQuickAccessVisible : () => true;

interface TextEntryProps {
  label: string;
  value: string;
  description?: ReactNode;
  onChange(value: string): void;
  /**
   * Accept pastes that never reach this element.
   *
   * A native paste dispatches a `paste` event carrying the text, and that event
   * exists even when the value never lands on the input. Listening for it on the
   * panel's document catches the paste wherever it was aimed — worth it for a
   * field the user has no other way to fill, and wrong for one they can just
   * type into, hence opt-in.
   */
  captureGlobalPaste?: boolean;
}

/**
 * A text field whose real `<input>` is watched, so text that arrives from
 * outside React still registers.
 *
 * The SteamOS on-screen keyboard's paste key pastes **natively**, below React:
 * the element's value changes without the change event a controlled field
 * relies on, so the next render puts the old value back and the paste looks
 * like it did nothing at all. Every field a user might paste into needs this,
 * not just the one that made it obvious.
 *
 * Four things watch for it, because which events a given Steam build fires is
 * not knowable from here: `input` (typing and most pastes), `paste` (whose
 * handler runs before the value lands, hence the deferred read), `beforeinput`
 * (whose `data` survives an insert that gets reverted), and a poll for a value
 * that changes with no event at all.
 *
 * Note that everything is resolved from the element rather than from the global
 * `document`: a plugin's JavaScript does not run in the window it renders into,
 * so this context's `document` is not the one holding the Quick Access panel,
 * and a listener or a query aimed at it finds nothing.
 */
export function TextEntry({
  label,
  value,
  description,
  onChange,
  captureGlobalPaste,
}: TextEntryProps) {
  const row = useRef<HTMLDivElement>(null);
  const scratch = useRef<HTMLInputElement>(null);

  // Kept in refs so the watcher does not need re-creating on every keystroke,
  // and cannot act on a stale value or a stale handler.
  const latest = useRef(value);
  const handler = useRef(onChange);
  useEffect(() => {
    latest.current = value;
    handler.current = onChange;
  }, [value, onChange]);

  const visible = usePanelVisible();

  useEffect(() => {
    if (!visible) return;

    let watched: HTMLInputElement | null = null;

    const commit = (text: string) => {
      if (text === latest.current) return;
      latest.current = text;
      handler.current(text);
      // The scratch input is a conduit, not storage: leaving the text in a
      // stray DOM node would also make it look like the field's own value.
      if (scratch.current) scratch.current.value = "";
    };

    const onInput = () => {
      if (watched) commit(watched.value);
    };
    const onPasted = () => setTimeout(onInput, 0);

    /**
     * Take the text off the event when the insert itself does not stick.
     *
     * A multi-character insert is a paste, never typing, so if the element's
     * value is unchanged a moment later the insert was reverted — and the
     * event's own `data` is then the only copy of it left.
     */
    const onBeforeInput = (event: InputEvent) => {
      const inserted = event.data;
      if (!inserted || inserted.length < 2) return;
      setTimeout(() => {
        if (!watched) return;
        commit(watched.value !== latest.current ? watched.value : inserted);
      }, 0);
    };

    const listen = (input: HTMLInputElement | null, add: boolean) => {
      const method = add ? "addEventListener" : "removeEventListener";
      input?.[method]("input", onInput);
      input?.[method]("paste", onPasted);
      input?.[method]("beforeinput", onBeforeInput as EventListener);
    };

    // Re-found every tick: Steam's TextField can replace the element, and it may
    // not exist at all until the field is first activated — in which case the
    // scratch input stands in, so there is always something to paste into.
    const sync = () => {
      const input =
        row.current?.querySelector<HTMLInputElement>("input:not([data-paste-target])") ??
        scratch.current;

      if (input !== watched) {
        listen(watched, false);
        listen(input, true);
        watched = input;
      }
      if (input) onInput();
    };

    sync();
    const poll = window.setInterval(sync, 400);

    return () => {
      listen(watched, false);
      clearInterval(poll);
    };
  }, [visible]);

  useEffect(() => {
    if (!captureGlobalPaste || !visible) return;

    // The panel's document, not this context's — a listener on the wrong one
    // never fires.
    const target = row.current?.ownerDocument;
    if (!target) return;

    const onDocumentPaste = (event: Event) => {
      const text = (event as ClipboardEvent).clipboardData?.getData("text/plain")?.trim();
      if (!text) return;

      // Claim it when it was aimed at this field, or when no other field could
      // have wanted it. Anything else belongs to whoever is focused.
      //
      // `contains` and `tagName` rather than `instanceof`: the active element
      // belongs to another document, where our constructors do not apply.
      const active = target.activeElement;
      const ours = Boolean(active && row.current?.contains(active));
      const elsewhere =
        !ours && (active?.tagName === "INPUT" || active?.tagName === "TEXTAREA");
      if (elsewhere) return;

      latest.current = text;
      handler.current(text);
    };

    target.addEventListener("paste", onDocumentPaste, true);
    return () => target.removeEventListener("paste", onDocumentPaste, true);
  }, [captureGlobalPaste, visible]);

  return (
    <div ref={row}>
      <TextField
        label={label}
        value={value}
        description={description}
        bShowClearAction
        onChange={(event) => onChange(event.target.value)}
      />
      {/*
        A native-paste target of our own.

        `SteamClient.Browser.Paste()` needs a real focused editable element, and
        Steam's own field does not always render an `<input>` to be one. This is
        a plain input in the panel's document, offscreen rather than hidden —
        `display: none` cannot take focus — and out of the gamepad's way. It is
        never typed into: whatever is pasted here is read out and cleared.
      */}
      <input
        ref={scratch}
        data-paste-target=""
        aria-hidden="true"
        tabIndex={-1}
        style={{
          position: "absolute",
          left: "-9999px",
          width: "1px",
          height: "1px",
          opacity: 0,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
