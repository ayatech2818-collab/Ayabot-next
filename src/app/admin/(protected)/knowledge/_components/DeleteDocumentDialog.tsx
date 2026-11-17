"use client";

import { useTransition } from "react";
import { TrashIcon } from "../../../../../components/icons";
import type { KnowledgeDocument } from "../../../../../lib/api/knowledge";
import Modal from "../../../_components/Modal";
import { useToast } from "../../../_components/Toaster";
import { deleteKnowledgeDocumentAction } from "../actions";
import ui from "../../../_components/ui.module.css";

type DeleteDocumentDialogProps = {
  document: KnowledgeDocument | null;
  /** Known chunk count, if details have been loaded. */
  chunkCount?: number;
  onClose: () => void;
  /** Called when the document is gone - deleted now, or already deleted elsewhere. */
  onDeleted: (documentId: string) => void;
};

/** Confirms a permanent delete: stored file, record and (by cascade) every chunk. */
export default function DeleteDocumentDialog({ document, chunkCount, onClose, onDeleted }: DeleteDocumentDialogProps) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    if (!document || pending) return;
    startTransition(async () => {
      try {
        const result = await deleteKnowledgeDocumentAction(document.id);
        if (result.ok) {
          toast.success({ title: "Document deleted", description: `${document.title} was removed from the knowledge base.` });
          onDeleted(document.id);
        } else {
          if (result.gone) onDeleted(document.id);
          toast.error({ title: "Couldn't delete document", description: result.error });
        }
      } catch {
        toast.error({ title: "Something went wrong", description: "Check your connection and try again." });
      }
      onClose();
    });
  };

  const chunks =
    chunkCount === undefined
      ? "all of its chunks are"
      : chunkCount === 1
        ? "its 1 chunk is"
        : `all ${chunkCount.toLocaleString("en-IN")} of its chunks are`;
  const consequence = `The original file is removed from storage, and ${chunks} removed from AYABOT's knowledge base. This can't be undone.`;

  return (
    <Modal
      open={Boolean(document)}
      onClose={onClose}
      busy={pending}
      size="sm"
      tone="danger"
      icon={<TrashIcon size={18} />}
      title="Delete document?"
      footer={
        <>
          <button type="button" className={ui.secondaryButton} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={ui.dangerButton} onClick={confirm} disabled={pending} aria-busy={pending} autoFocus>
            {pending && <span className={ui.spinner} aria-hidden="true" />}
            {pending ? "Deleting…" : "Delete document"}
          </button>
        </>
      }
    >
      {document && (
        <p className={ui.modalCopy}>
          <strong>{document.title}</strong> ({document.file_name}) will be permanently deleted. {consequence}
        </p>
      )}
    </Modal>
  );
}
