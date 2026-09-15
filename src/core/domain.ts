import { z } from "zod";

export const CATEGORIES = [
  "Food & Drinks",
  "Office Supplies",
  "Legal & Other fees",
  "Vehicle",
  "Travel",
  "Technology",
  "Phone & Internet",
  "Taxes & Insurances",
  "Goods & Materials",
  "Workplace",
  "Interest & Bank charges",
  "Professional Training & Literature",
  "Marketing",
  "Investments",
  "Compensation for your employees",
  "Mailing / Shipping",
  "Leasing",
  "Other"
] as const;

export const CategorySchema = z.enum(CATEGORIES);
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/, "Use a three-letter ISO currency code");
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const NonNegativeMoneySchema = z.number().finite().nonnegative();
export const VersionSchema = z.string().min(1);

const MAX_EMBEDDED_ATTACHMENT_LENGTH = 900_000;

export const SUPPORTED_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/xml",
  "text/xml",
  "application/rtf",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/zip",
  "application/octet-stream"
] as const;

export const AttachmentMimeTypeSchema = z.enum(SUPPORTED_ATTACHMENT_MIME_TYPES);
const DATA_ATTACHMENT_PATTERN = new RegExp(
  `^data:(${SUPPORTED_ATTACHMENT_MIME_TYPES.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")});base64,[A-Za-z0-9+/=\\r\\n]+$`,
  "i"
);

export const BillAttachmentUrlSchema = z
  .string()
  .max(MAX_EMBEDDED_ATTACHMENT_LENGTH, "Bill attachment exceeds the supported embedded-file size")
  .refine((value) => {
    if (DATA_ATTACHMENT_PATTERN.test(value)) return true;
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "Use an HTTPS attachment URL or a supported Base64 attachment data URL");

export const EmbeddedBillAttachmentSchema = z.object({
  mime_type: AttachmentMimeTypeSchema,
  file_name: z.string().trim().min(1).max(160).optional(),
  data_base64: z
    .string()
    .min(1)
    .max(MAX_EMBEDDED_ATTACHMENT_LENGTH)
    .regex(/^[A-Za-z0-9+/=\r\n]+$/, "data_base64 must contain Base64 file bytes only")
});

// Compatibility exports for integrations that still use the historical image terminology.
export const BillImageUrlSchema = BillAttachmentUrlSchema;
export const EmbeddedBillImageSchema = EmbeddedBillAttachmentSchema;

export const BillItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  amount: z.number().finite(),
  category: CategorySchema
});

export const RecurringFrequencySchema = z.enum(["none", "daily", "weekly", "monthly", "yearly"]);

export const BillDataSchema = z.object({
  id: z.string().min(1),
  merchantName: z.string().trim().min(1).max(300),
  date: IsoDateSchema,
  amount: NonNegativeMoneySchema,
  currency: CurrencySchema,
  category: CategorySchema,
  items: z.array(BillItemSchema).max(500).default([]),
  isTaxRelevant: z.boolean(),
  taxReason: z.string().max(2000).optional(),
  taxDeductibleLineItems: z.array(z.string().max(500)).max(500).optional(),
  imageUrl: BillAttachmentUrlSchema.nullable().optional(),
  attachmentName: z.string().trim().min(1).max(160).optional(),
  collectionIds: z.array(z.string().min(1)).max(100).default([]),
  createdAt: z.number().int().nonnegative(),
  recurring: RecurringFrequencySchema.optional(),
  nextRecurringDate: IsoDateSchema.nullable().optional(),
  parentBillId: z.string().min(1).optional(),
  createdBy: z.string().min(1).optional(),
  createdByName: z.string().trim().min(1).max(300).optional()
});

const PersistedCategorySchema = z.string().trim().min(1).max(200);
const PersistedBillItemSchema = BillItemSchema.extend({ category: PersistedCategorySchema });
const PersistedBillDataSchema = BillDataSchema.extend({
  category: PersistedCategorySchema,
  items: z.array(PersistedBillItemSchema).max(500).default([])
});

const NULLABLE_LEGACY_OPTIONAL_BILL_FIELDS = [
  "taxReason",
  "taxDeductibleLineItems",
  "parentBillId",
  "recurring",
  "createdBy",
  "createdByName",
  "attachmentName"
] as const;

/**
 * Parses records written by older BillCheck clients without widening the
 * current create/update input contract. Retired category labels remain visible
 * on reads and summaries instead of making an entire workspace unreadable.
 */
export function parsePersistedBillData(input: unknown): Bill {
  if (!input || typeof input !== "object" || Array.isArray(input)) return PersistedBillDataSchema.parse(input);

  const normalized: Record<string, unknown> = { ...(input as Record<string, unknown>) };
  for (const field of NULLABLE_LEGACY_OPTIONAL_BILL_FIELDS) {
    if (normalized[field] === null) delete normalized[field];
  }
  return PersistedBillDataSchema.parse(normalized);
}

export const CreateBillSchema = BillDataSchema.omit({ id: true, createdAt: true }).extend({
  id: z.string().min(1).optional(),
  createdAt: z.number().int().nonnegative().optional()
});

export const UpdateBillSchema = BillDataSchema.omit({ id: true, createdAt: true }).partial();

export const CollectionDataSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  isSystem: z.boolean().optional()
});

export const CreateCollectionSchema = CollectionDataSchema.omit({ id: true, isSystem: true }).extend({
  id: z.string().min(1).optional()
});

export const UpdateCollectionSchema = CollectionDataSchema.omit({ id: true, isSystem: true }).partial();

export const BudgetDataSchema = z.object({
  monthlyLimit: NonNegativeMoneySchema,
  yearlyLimit: NonNegativeMoneySchema,
  isEnabled: z.boolean()
});

export const WorkspaceSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["personal", "custom"]),
  name: z.string().min(1),
  ownerId: z.string().min(1),
  currency: CurrencySchema,
  permissions: z.object({
    canView: z.boolean(),
    canEdit: z.boolean(),
    canDelete: z.boolean()
  }),
  isDefault: z.boolean().optional()
});

export const LocalIdentitySchema = z.object({
  workspaceName: z.string().trim().min(1).max(200),
  userName: z.string().trim().min(1).max(200)
});

export const UpdateLocalIdentitySchema = LocalIdentitySchema.partial().refine(
  value => Object.keys(value).length > 0,
  'At least one local identity field is required'
);

export type Bill = z.infer<typeof PersistedBillDataSchema>;
export type AttachmentMimeType = z.infer<typeof AttachmentMimeTypeSchema>;
export type EmbeddedBillAttachment = z.infer<typeof EmbeddedBillAttachmentSchema>;
export type CreateBill = z.infer<typeof CreateBillSchema>;
export type UpdateBill = z.infer<typeof UpdateBillSchema>;
export type Collection = z.infer<typeof CollectionDataSchema>;
export type CreateCollection = z.infer<typeof CreateCollectionSchema>;
export type UpdateCollection = z.infer<typeof UpdateCollectionSchema>;
export type Budget = z.infer<typeof BudgetDataSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type LocalIdentity = z.infer<typeof LocalIdentitySchema>;
export type UpdateLocalIdentity = z.infer<typeof UpdateLocalIdentitySchema>;

export interface Versioned<T> {
  data: T;
  version: string;
}

export interface BillFilters {
  from?: string;
  to?: string;
  category?: (typeof CATEGORIES)[number];
  collectionId?: string;
  limit?: number;
}

export type SummaryGroup = "category" | "merchant" | "month";

export interface SpendingSummary {
  workspaceId: string;
  from?: string;
  to?: string;
  billCount: number;
  totalsByCurrency: Record<string, number>;
  groups: Array<{
    key: string;
    count: number;
    totalsByCurrency: Record<string, number>;
  }>;
}
