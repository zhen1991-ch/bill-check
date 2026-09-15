import { SUPPORTED_ATTACHMENT_MIME_TYPES, type AttachmentMimeType, type Bill } from "./domain.js";

const DATA_ATTACHMENT = /^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/i;
const PREVIEWABLE_IMAGE_TYPES = new Set<AttachmentMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);
const SUPPORTED_TYPES = new Set<string>(SUPPORTED_ATTACHMENT_MIME_TYPES);

const EXTENSIONS: Record<AttachmentMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/json": "json",
  "application/xml": "xml",
  "text/xml": "xml",
  "application/rtf": "rtf",
  "application/msword": "doc",
  "application/vnd.ms-excel": "xls",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  "application/vnd.oasis.opendocument.presentation": "odp",
  "application/zip": "zip",
  "application/octet-stream": "bin"
};

export interface BillAttachmentBytes {
  bytes: Uint8Array;
  mimeType: AttachmentMimeType;
  extension: string;
  isImage: boolean;
  dataBase64?: string;
}

export type BillImageBytes = BillAttachmentBytes;

export function embeddedBillAttachment(value: string | null | undefined): BillAttachmentBytes | null {
  if (!value) return null;
  const match = DATA_ATTACHMENT.exec(value);
  if (!match) return null;
  const declaredMimeType = normalizedMimeType(match[1] ?? null);
  if (!declaredMimeType) throw new Error("The saved receipt uses an unsupported attachment type");
  const dataBase64 = match[2]!.replace(/\s/g, "");
  const bytes = decodeBase64(dataBase64);
  const mimeType = validateAttachmentContent(bytes, declaredMimeType);
  return {
    bytes,
    mimeType,
    extension: extensionFor(mimeType),
    isImage: PREVIEWABLE_IMAGE_TYPES.has(mimeType),
    dataBase64
  };
}

export function embeddedBillImage(value: string | null | undefined): BillAttachmentBytes | null {
  const attachment = embeddedBillAttachment(value);
  return attachment?.isImage ? attachment : null;
}

export function detectImageMimeType(bytes: Uint8Array): AttachmentMimeType | null {
  if (bytes.length >= 8 && equals(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (bytes.length >= 3 && equals(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    equals(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    equals(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }
  if (bytes.length >= 6 && (asciiStartsWith(bytes, "GIF87a") || asciiStartsWith(bytes, "GIF89a"))) return "image/gif";
  return null;
}

export function receiptFileName(bill: Bill, extension: string): string {
  if (bill.attachmentName) {
    const sanitized = sanitizeDownloadFileName(bill.attachmentName, "receipt");
    return extension === "bin" && /\.[A-Za-z0-9]{1,10}$/.test(sanitized) ? sanitized : ensureExtension(sanitized, extension);
  }
  const merchant = sanitizeFilePart(bill.merchantName).slice(0, 60) || "receipt";
  const id = sanitizeFilePart(bill.id).slice(-24) || "bill";
  return `${bill.date}_${merchant}_${id}.${extension}`;
}

export function sanitizeDownloadFileName(value: string, fallback: string): string {
  const cleaned = value.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "-").replace(/\s+/g, " ").trim();
  return (cleaned || fallback).slice(0, 160);
}

export function validateAttachmentContent(bytes: Uint8Array, declaredMimeType: AttachmentMimeType): AttachmentMimeType {
  if (bytes.byteLength === 0) throw new Error("The saved receipt attachment is empty");

  const detectedImage = detectImageMimeType(bytes);
  if (detectedImage) return detectedImage;
  if (PREVIEWABLE_IMAGE_TYPES.has(declaredMimeType)) {
    throw new Error("The saved receipt data is not a supported JPEG, PNG, WebP, or GIF image");
  }
  if (declaredMimeType === "application/pdf" && !asciiStartsWith(bytes, "%PDF-")) {
    throw new Error("The saved receipt PDF does not match its declared file type");
  }
  if (isZipMimeType(declaredMimeType) && !isZip(bytes)) {
    throw new Error("The saved receipt archive does not match its declared file type");
  }
  if (isLegacyOfficeMimeType(declaredMimeType) && !equals(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    throw new Error("The saved receipt Office document does not match its declared file type");
  }
  if (declaredMimeType === "application/rtf" && !asciiStartsWith(bytes, "{\\rtf")) {
    throw new Error("The saved receipt RTF does not match its declared file type");
  }
  if (isTextMimeType(declaredMimeType) && bytes.some((value) => value === 0)) {
    throw new Error("The saved receipt text file contains binary data");
  }
  return declaredMimeType;
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "-").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function normalizedMimeType(value: string | null): AttachmentMimeType | null {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase();
  return normalized && SUPPORTED_TYPES.has(normalized) ? (normalized as AttachmentMimeType) : null;
}

export function extensionFor(mimeType: AttachmentMimeType): string {
  return EXTENSIONS[mimeType];
}

function isZipMimeType(mimeType: AttachmentMimeType): boolean {
  return mimeType === "application/zip" || mimeType.includes("openxmlformats") || mimeType.includes("oasis.opendocument");
}

function isLegacyOfficeMimeType(mimeType: AttachmentMimeType): boolean {
  return mimeType === "application/msword" || mimeType === "application/vnd.ms-excel" || mimeType === "application/vnd.ms-powerpoint";
}

function isTextMimeType(mimeType: AttachmentMimeType): boolean {
  return mimeType.startsWith("text/") || mimeType === "application/json" || mimeType === "application/xml";
}

function isZip(bytes: Uint8Array): boolean {
  return equals(bytes, [0x50, 0x4b, 0x03, 0x04]) || equals(bytes, [0x50, 0x4b, 0x05, 0x06]) || equals(bytes, [0x50, 0x4b, 0x07, 0x08]);
}

function ensureExtension(fileName: string, extension: string): string {
  const withoutExtension = fileName.replace(/\.[A-Za-z0-9]{1,10}$/, "");
  return `${withoutExtension}.${extension}`;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value.replace(/\s/g, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asciiStartsWith(bytes: Uint8Array, expected: string): boolean {
  return equals(bytes, Array.from(expected, (character) => character.charCodeAt(0)));
}

function equals(bytes: Uint8Array, expected: number[]): boolean {
  return bytes.length >= expected.length && expected.every((value, index) => bytes[index] === value);
}
