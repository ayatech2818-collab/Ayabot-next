import "server-only";

import { apiRequest } from "./server";

// Mirrors KnowledgeDocumentResponse / KnowledgeDocumentDetailResponse in
// ayabot-backend/app/schemas/knowledge_document.py and app/api/routes/knowledge.py.

/** The only processing states the backend writes. `completed` and `failed` are terminal. */
export type KnowledgeDocumentStatus = "pending" | "processing" | "completed" | "failed";

export type KnowledgeDocument = {
  id: string;
  product_id: string;
  title: string;
  file_name: string;
  /** Storage path inside the private knowledge bucket; not a URL. */
  file_path: string;
  mime_type: string;
  /** Bytes. */
  file_size: number;
  status: KnowledgeDocumentStatus;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

/** GET /knowledge/documents/{id} adds chunk statistics to the document. */
export type KnowledgeDocumentDetail = KnowledgeDocument & {
  total_chunks: number;
  /** Chunks that have an embedding vector. */
  embedded_chunks: number;
};

export type DeleteKnowledgeDocumentResponse = {
  success: boolean;
  message: string;
  document_id: string;
};

/** Uploads and replacements write to Supabase Storage before answering, so allow longer. */
const UPLOAD_TIMEOUT_MS = 120_000;

const documentPath = (documentId: string) => `/knowledge/documents/${encodeURIComponent(documentId)}`;

/** Newest first. Omitting `productId` returns every product's documents. */
export function listKnowledgeDocuments(productId?: string) {
  const query = productId ? `?${new URLSearchParams({ product_id: productId })}` : "";
  return apiRequest<KnowledgeDocument[]>(`/knowledge/documents${query}`);
}

/** multipart/form-data; fetch sets the boundary, so no Content-Type header is passed. */
export function uploadKnowledgeDocument(input: { productId: string; title: string; file: File }) {
  const form = new FormData();
  form.append("product_id", input.productId);
  form.append("title", input.title);
  form.append("file", input.file, input.file.name);
  return apiRequest<KnowledgeDocument>("/knowledge/documents", { method: "POST", body: form, timeoutMs: UPLOAD_TIMEOUT_MS });
}

/** Keeps the document id; old chunks stay searchable until the new file finishes processing. */
export function replaceKnowledgeDocument(documentId: string, file: File) {
  const form = new FormData();
  form.append("file", file, file.name);
  return apiRequest<KnowledgeDocument>(`${documentPath(documentId)}/replace`, {
    method: "PUT",
    body: form,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });
}

/** Accepted for `failed` and `pending` documents only; resets to `pending` and reprocesses. */
export function retryKnowledgeDocument(documentId: string) {
  return apiRequest<KnowledgeDocument>(`${documentPath(documentId)}/retry`, { method: "POST" });
}

/** Re-extracts a completed or failed document while preserving its uploaded file. */
export function reprocessKnowledgeDocument(documentId: string) {
  return apiRequest<KnowledgeDocument>(`${documentPath(documentId)}/reprocess`, { method: "POST" });
}

/** Removes the stored file and the record; chunks go with it through the FK cascade. */
export function deleteKnowledgeDocument(documentId: string) {
  return apiRequest<DeleteKnowledgeDocumentResponse>(documentPath(documentId), { method: "DELETE" });
}
