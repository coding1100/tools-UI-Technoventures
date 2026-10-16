import { MAX_UPLOAD_BYTES, postFile } from "@/lib/api";

export const DOCUMENT_ACCEPT = ".pdf,.docx,.txt,.rtf";
export const IMAGE_ACCEPT = ".png,.jpg,.jpeg,.webp";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

export function assertUploadSize(file: File) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("This file is over 4 MB. Paste the text instead, or upload a smaller file.");
  }
}

/**
 * Text from a PDF, DOCX, TXT or RTF document, or (OCR) from a screenshot or
 * photo of a page. OCR is a billed model call; document parsing is not.
 */
export async function extractText(file: File): Promise<string> {
  assertUploadSize(file);
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTENSIONS.includes(extension)) {
    const result = await postFile<{ text?: string }>("ai-detect/ocr", file);
    return String(result?.text ?? "").trim();
  }
  return String(await postFile<string>("parse-document", file)).trim();
}
