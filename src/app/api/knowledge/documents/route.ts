import { NextResponse, type NextRequest } from "next/server";
import { uploadKnowledgeDocument } from "../../../../lib/api/knowledge";
import { backendErrorResponse, detailResponse, readMultipartForm } from "../../../../lib/api/multipart";
import {
  KNOWLEDGE_MAX_FILE_BYTES,
  KNOWLEDGE_MAX_REQUEST_BYTES,
  validateKnowledgeFile,
  validateKnowledgeTitle,
} from "../../../../lib/knowledge/documents";
import { UUID_PATTERN } from "../../../admin/(protected)/products/actionErrors";

/**
 * Upload BFF: the browser posts multipart/form-data here (XHR, for progress), and this forwards
 * a rebuilt form with only the expected fields to FastAPI POST /api/v1/knowledge/documents with
 * the session's Bearer token (via apiRequest). The token never reaches client code.
 * proxy.ts has already refreshed the session and rejected unauthenticated requests.
 */
export async function POST(request: NextRequest) {
  const form = await readMultipartForm(request, KNOWLEDGE_MAX_REQUEST_BYTES);
  if (form instanceof NextResponse) return form;

  const productId = String(form.get("product_id") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const file = form.get("file");

  if (!UUID_PATTERN.test(productId)) return detailResponse("Choose a valid product.", 400);
  const titleError = validateKnowledgeTitle(title);
  if (titleError) return detailResponse(titleError, 400);
  if (!(file instanceof File)) return detailResponse("Choose a file to upload.", 400);
  const fileError = validateKnowledgeFile(file);
  if (fileError) return detailResponse(fileError, file.size > KNOWLEDGE_MAX_FILE_BYTES ? 413 : 400);

  try {
    const document = await uploadKnowledgeDocument({ productId, title, file });
    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    return backendErrorResponse(error);
  }
}
