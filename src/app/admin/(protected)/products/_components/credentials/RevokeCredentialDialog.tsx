"use client";

import { useTransition } from "react";
import { BanIcon } from "../../../../../../components/icons";
import type { Credential } from "../../../../../../lib/api/credentials";
import Modal from "../../../../_components/Modal";
import { useToast } from "../../../../_components/Toaster";
import { revokeCredentialAction } from "../../credentialActions";
import ui from "../../../../_components/ui.module.css";

type RevokeCredentialDialogProps = {
  credential: Credential | null;
  onClose: () => void;
};

/** Confirms revoking a credential. Revocation is permanent, so the copy says so plainly. */
export default function RevokeCredentialDialog({ credential, onClose }: RevokeCredentialDialogProps) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const confirm = () => {
    if (!credential) return;
    startTransition(async () => {
      try {
        const result = await revokeCredentialAction(credential.product_id, credential.id);
        if (result.ok) {
          toast.success({ title: "API key revoked", description: `${result.credential.name} (${result.credential.key_prefix}…) can no longer be used.` });
        } else {
          toast.error({ title: "Couldn't revoke API key", description: result.error });
        }
      } catch {
        toast.error({ title: "Something went wrong", description: "Check your connection and try again." });
      }
      onClose();
    });
  };

  return (
    <Modal
      open={Boolean(credential)}
      onClose={onClose}
      busy={pending}
      size="sm"
      tone="danger"
      icon={<BanIcon size={18} />}
      title="Revoke API key?"
      footer={
        <>
          <button type="button" className={ui.secondaryButton} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={ui.dangerButton} onClick={confirm} disabled={pending} aria-busy={pending} autoFocus>
            {pending && <span className={ui.spinner} aria-hidden="true" />}
            {pending ? "Revoking…" : "Revoke key"}
          </button>
        </>
      }
    >
      {credential && (
        <p className={ui.modalCopy}>
          <strong>{credential.name}</strong> (<code>{credential.key_prefix}…</code>) will stop working immediately. Any
          service using it will be rejected. This can&apos;t be undone, but you can generate a new key at any time.
        </p>
      )}
    </Modal>
  );
}
