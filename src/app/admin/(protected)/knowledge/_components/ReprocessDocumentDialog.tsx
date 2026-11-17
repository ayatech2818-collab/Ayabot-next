"use client";

import { useTransition } from "react";
import { ResetIcon } from "../../../../../components/icons";
import type { KnowledgeDocument } from "../../../../../lib/api/knowledge";
import Modal from "../../../_components/Modal";
import ui from "../../../_components/ui.module.css";

type ReprocessDocumentDialogProps = {
  document: KnowledgeDocument | null;
  onClose: () => void;
  /** Starts reprocessing; resolves after the result has updated the list and notifications. */
  onConfirm: (document: KnowledgeDocument) => Promise<void>;
};

export default function ReprocessDocumentDialog({ document, onClose, onConfirm }: ReprocessDocumentDialogProps) {
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    if (!document || pending) return;
    startTransition(async () => {
      await onConfirm(document);
      onClose();
    });
  };

  return (
    <Modal
      open={Boolean(document)}
      onClose={onClose}
      busy={pending}
      size="sm"
      icon={<ResetIcon size={18} />}
      title="Reprocess document?"
      footer={
        <>
          <button type="button" className={ui.secondaryButton} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={ui.primaryButton} onClick={confirm} disabled={pending} aria-busy={pending} autoFocus>
            {pending ? <span className={ui.spinner} aria-hidden="true" /> : <ResetIcon size={15} />}
            {pending ? "Starting…" : "Reprocess"}
          </button>
        </>
      }
    >
      <p className={ui.modalCopy}>
        This will extract the document again, regenerate its chunks and embeddings, and replace its existing knowledge chunks. The
        original uploaded file will remain unchanged.
      </p>
    </Modal>
  );
}
