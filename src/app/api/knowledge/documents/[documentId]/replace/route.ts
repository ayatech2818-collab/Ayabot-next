import { NextResponse, type NextRequest } from "next/server";
import { replaceKnowledgeDocument } from "../../../../../../lib/api/knowledge";
import { backendErrorResponse, detailResponse, readMultipartForm } from "../../../../../../lib/api/multipart";
import {
  KNOWLEDGE_MAX_FILE_BYTES,
  KNOWLEDGE_MAX_REQUEST_BYTES,
  validateKnowledgeFile,
} from "../../../../../../lib/knowledge/documents";
import { UUID_PATTERN } from "../../../../../admin/(protected)/products/actionErrors";

/**
 * Replacement BFF: forwards the new file to FastAPI PUT /api/v1/knowledge/documents/{id}/replace
 * with the session's Bearer token. Same validation and error mapping as the upload route.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  if (!UUID_PATTERN.test(documentId)) return detailResponse("Invalid document reference.", 400);

  const form = await readMultipartForm(request, KNOWLEDGE_MAX_REQUEST_BYTES);
  if (form instanceof NextResponse) return form;

  const file = form.get("file");
  if (!(file instanceof File)) return detailResponse("Choose a replacement file.", 400);
  const fileError = validateKnowledgeFile(file);
  if (fileError) return detailResponse(fileError, file.size > KNOWLEDGE_MAX_FILE_BYTES ? 413 : 400);

  try {
    return NextResponse.json(await replaceKnowledgeDocument(documentId, file));
  } catch (error) {
    return backendErrorResponse(error);
  }
}
