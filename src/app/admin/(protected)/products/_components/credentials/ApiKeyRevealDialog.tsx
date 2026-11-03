"use client";

import { useRef, useState } from "react";
import { AlertIcon, CheckIcon, CopyIcon, KeyIcon } from "../../../../../../components/icons";
import Modal from "../../../../_components/Modal";
import { useToast } from "../../../../_components/Toaster";
import ui from "../../../../_components/ui.module.css";
import styles from "./credentials.module.css";

export type RevealedKey = { id: string; name: string; apiKey: string };

/**
 * Shows a freshly generated API key exactly once. The key lives only in the parent's React
 * state while this dialog is open; it is never written to storage, the URL or the console,
 * and the parent drops it as soon as the admin closes the dialog.
 */
export default function ApiKeyRevealDialog({ revealed, onDone }: { revealed: RevealedKey | null; onDone: () => void }) {
  return (
    <Modal
      open={Boolean(revealed)}
      onClose={onDone}
      // Only "Done" closes it, so Esc or a stray backdrop click can't lose the key.
      dismissible={false}
      icon={<KeyIcon size={18} />}
      title="Save your API key"
      description={revealed ? `“${revealed.name}” was created. Copy the key now and store it somewhere secure.` : undefined}
    >
      {revealed && <RevealBody key={revealed.id} apiKey={revealed.apiKey} onDone={onDone} />}
    </Modal>
  );
}

function RevealBody({ apiKey, onDone }: { apiKey: string; onDone: () => void }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const selectKey = () => inputRef.current?.select();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      toast.success({ title: "API key copied", description: "Paste it into your secret manager or server config." });
    } catch {
      // Clipboard API unavailable (e.g. blocked permission): select it for a manual copy.
      selectKey();
      toast.info({ title: "Copy manually", description: "The key is selected. Press Ctrl+C (⌘C on Mac) to copy it." });
    }
  };

  return (
    <div className={ui.formStack}>
      <div className={styles.warning} role="note">
        <AlertIcon size={16} />
        <p>
          <strong>This is the only time the full key will be shown.</strong> AYABOT stores only a hash, so it can&apos;t be
          recovered later. If you lose it, revoke it and generate a new one.
        </p>
      </div>

      <div className={ui.field}>
        <label htmlFor="revealed-api-key" className={ui.fieldLabel}>
          API key
        </label>
        <div className={styles.keyBox}>
          <input
            ref={inputRef}
            id="revealed-api-key"
            className={styles.keyInput}
            value={apiKey}
            readOnly
            spellCheck={false}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            onFocus={selectKey}
            onClick={selectKey}
          />
          <button type="button" className={copied ? ui.secondaryButton : ui.primaryButton} onClick={copy}>
            {copied ? <CheckIcon size={15} strokeWidth={2.4} /> : <CopyIcon size={15} />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <label className={styles.ack}>
        <input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />
        I&apos;ve saved this key somewhere secure.
      </label>

      <div className={ui.formActions}>
        <button type="button" className={ui.primaryButton} onClick={onDone} disabled={!acknowledged}>
          Done
        </button>
      </div>
    </div>
  );
}
