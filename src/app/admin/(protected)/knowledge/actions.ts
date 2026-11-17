"use server";

import { ApiError } from "../../../../lib/api/errors";
import {
  deleteKnowledgeDocument,
  reprocessKnowledgeDocument,
  retryKnowledgeDocument,
  type KnowledgeDocument,
} from "../../../../lib/api/knowledge";
import { UUID_PATTERN, toActionFailure, type ActionFailure } from "../products/actionErrors";

/** `gone` tells the UI the document no longer exists, so it can drop it from the list. */
type KnowledgeActionFailure = ActionFailure & { gone?: boolean };

export type RetryDocumentResult = { ok: true; document: KnowledgeDocument } | KnowledgeActionFailure;
export type ReprocessDocumentResult = { ok: true; document: KnowledgeDocument } | KnowledgeActionFailure;
export type DeleteDocumentResult = { ok: true; documentId: string } | KnowledgeActionFailure;

const NOT_FOUND = "This document no longer exists. It may have been deleted.";

function invalidId(documentId: string): KnowledgeActionFailure | null {
  return UUID_PATTERN.test(documentId) ? null : { ok: false, error: "Invalid document reference." };
}

function failure(error: unknown, storageMessage?: string): KnowledgeActionFailure {
  // 502 from these endpoints means Supabase Storage failed; the backend left the record as it was.
  if (storageMessage && error instanceof ApiError && error.status === 502) return { ok: false, error: storageMessage };
  const result: KnowledgeActionFailure = toActionFailure(error, { notFound: NOT_FOUND });
  if (error instanceof ApiError && error.kind === "not_found") result.gone = true;
  return result;
}

// The Knowledge Base page keeps its document list in client state (it polls while documents are
// processing), so these actions return the result instead of revalidating the route.

/** Re-queues a `failed` document, or a `pending` one stuck after a server restart. */
export async function retryKnowledgeDocumentAction(documentId: string): Promise<RetryDocumentResult> {
  const invalid = invalidId(documentId);
  if (invalid) return invalid;
  try {
    return { ok: true, document: await retryKnowledgeDocument(documentId) };
  } catch (error) {
    // 400 here means the document is processing or completed (e.g. changed in another tab).
    return failure(error);
  }
}

/** Re-extracts a completed or failed document without replacing its stored file. */
export async function reprocessKnowledgeDocumentAction(documentId: string): Promise<ReprocessDocumentResult> {
  const invalid = invalidId(documentId);
  if (invalid) return invalid;
  try {
    return { ok: true, document: await reprocessKnowledgeDocument(documentId) };
  } catch (error) {
    // 409 means another processing run started before this request reached the backend.
    return failure(error);
  }
}

export async function deleteKnowledgeDocumentAction(documentId: string): Promise<DeleteDocumentResult> {
  const invalid = invalidId(documentId);
  if (invalid) return invalid;
  try {
    await deleteKnowledgeDocument(documentId);
    return { ok: true, documentId };
  } catch (error) {
    return failure(error, "The stored file couldn't be removed, so the document was kept. Please try again shortly.");
  }
}
