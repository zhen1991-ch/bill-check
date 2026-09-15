import { McpServer, type ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { embeddedBillAttachment, receiptFileName, sanitizeDownloadFileName } from "./bill-image.js";
import type { BillCheckFileDelivery } from "./delivery.js";
import {
  BudgetDataSchema,
  CategorySchema,
  CreateBillSchema,
  CreateCollectionSchema,
  AttachmentMimeTypeSchema,
  EmbeddedBillAttachmentSchema,
  IsoDateSchema,
  UpdateBillSchema,
  UpdateCollectionSchema,
  VersionSchema
} from "./domain.js";
import type { Bill, CreateBill, EmbeddedBillAttachment, UpdateBill, Versioned } from "./domain.js";
import type { BillCheckRepository } from "./repository.js";
import {
  BILL_ARCHIVE_WIDGET_URI,
  BILL_IMAGE_WIDGET_URI,
  billArchiveWidgetHtml,
  billImageWidgetHtml
} from "./widgets.js";

const WorkspaceId = z.string().min(1).max(256).describe("Workspace id returned by billcheck_list_workspaces");
const MAX_ARCHIVE_BILLS = 100;
const BillAttachmentOutputSchema = {
  attachment: z.object({
    bill_id: z.string(),
    merchant_name: z.string(),
    date: IsoDateSchema,
    file_name: z.string(),
    mime_type: AttachmentMimeTypeSchema.optional(),
    is_image: z.boolean(),
    download_url: z.string().url().optional(),
    expires_at: z.string().datetime().optional()
  })
};
const ReceiptArchiveOutputSchema = {
  archive: z.object({
    file_name: z.string(),
    download_url: z.string().url(),
    expires_at: z.string().datetime(),
    selected_bill_count: z.number().int().positive().max(MAX_ARCHIVE_BILLS)
  })
};

export interface BillCheckMcpServerOptions {
  publicOrigin?: string;
  fileDelivery?: BillCheckFileDelivery;
  /** Runtime policy, called once after SDK schema validation and before data access. */
  beforeTool?: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown> | void>;
  toolDescriptionSuffix?: (name: string) => string;
}

export class ToolAccessError extends Error {
  constructor(public readonly code: string, message: string, public readonly details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ToolAccessError";
  }
}

type BillAttachmentToolResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
    | { type: "resource_link"; name: string; uri: string; mimeType: string }
    | { type: "resource"; resource: { uri: string; mimeType: string; blob: string } }
  >;
  structuredContent: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

function success(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data
  };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown BillCheck data error";
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
    ...(error instanceof ToolAccessError ? { _meta: { error: { code: error.code, ...error.details } } } : {})
  };
}

function safe<T extends Record<string, unknown>>(
  operation: () => Promise<T>
): Promise<ReturnType<typeof success> | ReturnType<typeof failure>> {
  return operation().then(success).catch(failure);
}

function billDetail(record: Versioned<Bill>) {
  const { imageUrl, ...storedFields } = record.data;
  const embedded = typeof imageUrl === "string" ? embeddedBillAttachment(imageUrl) : null;
  const attachment = !imageUrl
    ? { present: false }
    : embedded
      ? {
          present: true,
          delivery: embedded.isImage ? "mcp_image_content" : "mcp_resource_content",
          mime_type: embedded.mimeType,
          file_name: receiptFileName(record.data, embedded.extension),
          is_image: embedded.isImage
        }
      : {
          present: true,
          delivery: "https_url",
          url: imageUrl,
          ...(record.data.attachmentName ? { file_name: record.data.attachmentName } : {})
        };
  const response = { bill: { data: storedFields, version: record.version, attachment } };
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: string }
    | { type: "resource_link"; name: string; uri: string; mimeType: string }
    | { type: "resource"; resource: { uri: string; mimeType: string; blob: string } }
  > = [{ type: "text", text: JSON.stringify(response) }];
  if (embedded?.dataBase64 && embedded.isImage) {
    content.push({ type: "image", data: embedded.dataBase64, mimeType: embedded.mimeType });
  } else if (embedded?.dataBase64) {
    const fileName = receiptFileName(record.data, embedded.extension);
    content.push({
      type: "resource",
      resource: { uri: attachmentUri(record.data.id, fileName), mimeType: embedded.mimeType, blob: embedded.dataBase64 }
    });
  } else if (imageUrl) {
    content.push({
      type: "resource_link",
      name: record.data.attachmentName ?? `bill-${record.data.id}-attachment`,
      uri: imageUrl,
      mimeType: "application/octet-stream"
    });
  }
  return { content, structuredContent: response };
}

function safeBill(operation: () => Promise<Versioned<Bill>>) {
  return operation().then(billDetail).catch(failure);
}

function withAttachment<T extends CreateBill | UpdateBill>(
  input: T,
  attachment?: EmbeddedBillAttachment,
  removeAttachment = false
): T {
  if (attachment && removeAttachment) throw new Error("attachment and remove_attachment cannot be used together");
  if (attachment && input.imageUrl !== undefined) throw new Error("Use either bill.imageUrl/patch.imageUrl or attachment, not both");
  const normalized = { ...input } as T;
  if (attachment) {
    const embedded = embeddedBillAttachment(`data:${attachment.mime_type};base64,${attachment.data_base64.replace(/\s/g, "")}`);
    if (!embedded) throw new Error("Could not read the supplied receipt attachment");
    normalized.imageUrl = `data:${embedded.mimeType};base64,${embedded.dataBase64}`;
    normalized.attachmentName = sanitizeDownloadFileName(
      attachment.file_name ?? `receipt.${embedded.extension}`,
      `receipt.${embedded.extension}`
    );
  }
  if (removeAttachment) {
    normalized.imageUrl = null;
    normalized.attachmentName = undefined;
  }
  if ("items" in normalized && Array.isArray(normalized.items) && normalized.items.length > 0) {
    const itemTotal = normalized.items.reduce((sum, item) => sum + item.amount, 0);
    if (itemTotal > 0) normalized.amount = Math.round((itemTotal + Number.EPSILON) * 100) / 100;
  }
  return normalized;
}

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const delivery = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const create = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const update = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const remove = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

export function createBillCheckMcpServer(repository: BillCheckRepository, options: BillCheckMcpServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: "billcheck-data", version: "0.6.0" },
    {
      instructions:
        "BillCheck exposes only the data and workspaces allowed by the current runtime. List workspaces before querying records. Treat versions as optimistic concurrency guards. Ask for explicit user confirmation before calling permanent delete tools. Receipt tools may return sensitive financial documents; use them only when the user asks to view or download a receipt. BillCheck does not provide financial, tax, accounting, or legal advice."
    }
  );
  registerMediaWidgets(server, options.publicOrigin);

  function registerTool<Output extends z.ZodRawShape, Input extends z.ZodRawShape | undefined = undefined>(
    name: string,
    config: Parameters<typeof server.registerTool<Output, Input>>[1],
    callback: ToolCallback<Input>
  ) {
    const guarded = async (...parameters: Parameters<ToolCallback<Input>>) => {
      try {
        const args = config.inputSchema ? parameters[0] as Record<string, unknown> : {};
        const meta = await options.beforeTool?.(name, args);
        // The SDK callback is conditional on inputSchema; forward the same tuple unchanged.
        const invoke = callback as unknown as (...args: Parameters<ToolCallback<Input>>) => ReturnType<ToolCallback<Input>>;
        const result = await invoke(...parameters);
        return meta ? { ...result, _meta: { ...result._meta, ...meta } } : result;
      } catch (error) {
        return failure(error);
      }
    };
    return server.registerTool(name, {
      ...config,
      description: `${config.description ?? ""}${options.toolDescriptionSuffix?.(name) ?? ""}`
    }, guarded as ToolCallback<Input>);
  }

  registerTool(
    "billcheck_list_workspaces",
    {
      title: "List BillCheck workspaces",
      description: "List the BillCheck workspaces and permissions available to the current connection.",
      annotations: readOnly
    },
    () => safe(async () => ({ workspaces: await repository.listWorkspaces() }))
  );

  registerTool(
    "billcheck_list_bills",
    {
      title: "List BillCheck bills",
      description:
        "List bill records with optional deterministic filters. Large limits are safely clamped to 500. Embedded attachment bytes are omitted here; call billcheck_get_bill for stored details or billcheck_get_bill_attachment to retrieve the original receipt.",
      inputSchema: {
        workspace_id: WorkspaceId,
        from: IsoDateSchema.optional(),
        to: IsoDateSchema.optional(),
        category: CategorySchema.optional(),
        collection_id: z.string().min(1).optional(),
        limit: z.coerce.number().int().positive().default(100).transform((value) => Math.min(value, 500))
      },
      annotations: readOnly
    },
    ({ workspace_id, from, to, category, collection_id, limit }) =>
      safe(async () => ({
        bills: await repository.listBills(workspace_id, {
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(category ? { category } : {}),
          ...(collection_id ? { collectionId: collection_id } : {}),
          limit
        })
      }))
  );

  registerTool(
    "billcheck_get_bill",
    {
      title: "Get a BillCheck bill",
      description:
        "Read every stored field for one bill, including line items, tax metadata, collections, recurrence, creator metadata, version, and attachment metadata. When the user's goal is to retrieve the original receipt, prefer billcheck_get_bill_attachment.",
      inputSchema: { workspace_id: WorkspaceId, bill_id: z.string().min(1) },
      annotations: readOnly
    },
    ({ workspace_id, bill_id }) => safeBill(() => repository.getBill(workspace_id, bill_id))
  );

  registerTool(
    "billcheck_get_bill_attachment",
    {
      title: "Get a BillCheck receipt attachment",
      description:
        "Retrieve one bill's original receipt attachment. Images are returned as standard MCP image content; PDF, Office, text, archive, and other supported files are returned as an embedded resource or a short-lived original-file download.",
      inputSchema: { workspace_id: WorkspaceId, bill_id: z.string().min(1) },
      outputSchema: BillAttachmentOutputSchema,
      annotations: delivery,
      ...(options.publicOrigin ? { _meta: widgetToolMeta(BILL_IMAGE_WIDGET_URI, "Loading receipt…", "Receipt ready") } : {})
    },
    ({ workspace_id, bill_id }) => getBillAttachmentResult(repository, options, workspace_id, bill_id)
  );

  registerTool(
    "billcheck_get_bill_image",
    {
      title: "Get a BillCheck receipt attachment (legacy name)",
      description:
        "Compatibility alias for billcheck_get_bill_attachment. It retrieves both receipt images and supported non-image receipt files.",
      inputSchema: { workspace_id: WorkspaceId, bill_id: z.string().min(1) },
      outputSchema: BillAttachmentOutputSchema,
      annotations: delivery,
      ...(options.publicOrigin ? { _meta: widgetToolMeta(BILL_IMAGE_WIDGET_URI, "Loading receipt…", "Receipt ready") } : {})
    },
    ({ workspace_id, bill_id }) => getBillAttachmentResult(repository, options, workspace_id, bill_id)
  );

  registerTool(
    "billcheck_create_receipt_archive",
    {
      title: "Download BillCheck receipt attachments",
      description:
        "Create a short-lived ZIP download containing original receipt images and files without re-encoding. Use bill_ids for an exact set, or omit bill_ids and filter by date, category, or collection. The ZIP also contains a manifest of included and missing attachments.",
      inputSchema: {
        workspace_id: WorkspaceId,
        bill_ids: z.array(z.string().min(1)).min(1).max(MAX_ARCHIVE_BILLS).optional(),
        from: IsoDateSchema.optional(),
        to: IsoDateSchema.optional(),
        category: CategorySchema.optional(),
        collection_id: z.string().min(1).optional(),
        limit: z.coerce.number().int().positive().default(50).transform((value) => Math.min(value, MAX_ARCHIVE_BILLS))
      },
      outputSchema: ReceiptArchiveOutputSchema,
      annotations: delivery,
      ...(options.publicOrigin ? { _meta: widgetToolMeta(BILL_ARCHIVE_WIDGET_URI, "Preparing receipt archive…", "Archive ready") } : {})
    },
    ({ workspace_id, bill_ids, from, to, category, collection_id, limit }) =>
      safeArchive(async () => {
        if (!options.fileDelivery) throw new Error("Receipt archive delivery is not configured");
        if (bill_ids && (from || to || category || collection_id)) {
          throw new Error("Use either bill_ids or archive filters, not both");
        }
        let selectedIds: string[];
        if (bill_ids) {
          const workspace = (await repository.listWorkspaces()).find(({ id }) => id === workspace_id);
          if (!workspace || !workspace.permissions.canView) throw new Error(`Workspace '${workspace_id}' is not available for viewing`);
          selectedIds = [...new Set(bill_ids)];
        } else {
          selectedIds = (
            await repository.listBills(workspace_id, {
              ...(from ? { from } : {}),
              ...(to ? { to } : {}),
              ...(category ? { category } : {}),
              ...(collection_id ? { collectionId: collection_id } : {}),
              limit
            })
          ).map(({ data }) => data.id);
        }
        if (selectedIds.length === 0) throw new Error("No bills matched the requested receipt archive");
        const fileName = sanitizeDownloadFileName(
          `billcheck-receipts-${from ?? "all"}-${to ?? new Date().toISOString().slice(0, 10)}.zip`,
          "billcheck-receipts.zip"
        );
        const ticket = await options.fileDelivery.createDownload({
          kind: "archive",
          workspaceId: workspace_id,
          billIds: selectedIds.slice(0, MAX_ARCHIVE_BILLS),
          fileName
        });
        const archive = {
            file_name: fileName,
            download_url: ticket.url,
            expires_at: ticket.expiresAt,
            selected_bill_count: selectedIds.length
        };
        return {
          content: [
            { type: "text", text: JSON.stringify({ archive }) },
            { type: "resource_link", name: fileName, uri: ticket.url, mimeType: "application/zip" }
          ],
          structuredContent: { archive }
        };
      })
  );

  registerTool(
    "billcheck_create_bill",
    {
      title: "Create a BillCheck bill",
      description:
        "Create the same complete bill record as the BillCheck UI. Line-item totals override amount when positive; creator, timestamps, recurrence defaults, collections, tax fields, and an optional Base64 image or file attachment are persisted. This performs no OCR or AI operation.",
      inputSchema: {
        workspace_id: WorkspaceId,
        bill: CreateBillSchema,
        attachment: EmbeddedBillAttachmentSchema.optional()
      },
      annotations: create
    },
    ({ workspace_id, bill, attachment }) => safeBill(() => repository.createBill(workspace_id, withAttachment(bill, attachment)))
  );

  registerTool(
    "billcheck_update_bill",
    {
      title: "Update a BillCheck bill",
      description: "Update fields or replace/remove an image or file attachment only if the bill version still matches, preventing lost updates.",
      inputSchema: {
        workspace_id: WorkspaceId,
        bill_id: z.string().min(1),
        if_version: VersionSchema,
        patch: UpdateBillSchema,
        attachment: EmbeddedBillAttachmentSchema.optional(),
        remove_attachment: z.boolean().default(false)
      },
      annotations: update
    },
    ({ workspace_id, bill_id, if_version, patch, attachment, remove_attachment }) =>
      safeBill(() =>
        repository.updateBill(workspace_id, bill_id, withAttachment(patch, attachment, remove_attachment), if_version)
      )
  );

  registerTool(
    "billcheck_delete_bill",
    {
      title: "Delete a BillCheck bill",
      description: "Permanently delete one bill only if its version still matches.",
      inputSchema: { workspace_id: WorkspaceId, bill_id: z.string().min(1), if_version: VersionSchema },
      annotations: remove
    },
    ({ workspace_id, bill_id, if_version }) =>
      safe(async () => {
        await repository.deleteBill(workspace_id, bill_id, if_version);
        return { deleted: true, bill_id };
      })
  );

  registerTool(
    "billcheck_list_collections",
    {
      title: "List BillCheck collections",
      description: "List bill collections and their current versions in one workspace.",
      inputSchema: { workspace_id: WorkspaceId },
      annotations: readOnly
    },
    ({ workspace_id }) =>
      safe(async () => ({ collections: await repository.listCollections(workspace_id) }))
  );

  registerTool(
    "billcheck_create_collection",
    {
      title: "Create a BillCheck collection",
      description: "Create a collection used to organize bills.",
      inputSchema: { workspace_id: WorkspaceId, collection: CreateCollectionSchema },
      annotations: create
    },
    ({ workspace_id, collection }) =>
      safe(async () => ({ collection: await repository.createCollection(workspace_id, collection) }))
  );

  registerTool(
    "billcheck_update_collection",
    {
      title: "Update a BillCheck collection",
      description: "Update a non-system collection only if its version still matches.",
      inputSchema: {
        workspace_id: WorkspaceId,
        collection_id: z.string().min(1),
        if_version: VersionSchema,
        patch: UpdateCollectionSchema
      },
      annotations: update
    },
    ({ workspace_id, collection_id, if_version, patch }) =>
      safe(async () => ({
        collection: await repository.updateCollection(workspace_id, collection_id, patch, if_version)
      }))
  );

  registerTool(
    "billcheck_delete_collection",
    {
      title: "Delete a BillCheck collection",
      description: "Permanently delete a non-system collection and unlink it from bills.",
      inputSchema: { workspace_id: WorkspaceId, collection_id: z.string().min(1), if_version: VersionSchema },
      annotations: remove
    },
    ({ workspace_id, collection_id, if_version }) =>
      safe(async () => {
        await repository.deleteCollection(workspace_id, collection_id, if_version);
        return { deleted: true, collection_id };
      })
  );

  registerTool(
    "billcheck_get_budget",
    {
      title: "Get BillCheck budget",
      description: "Read the workspace budget and its current version.",
      inputSchema: { workspace_id: WorkspaceId },
      annotations: readOnly
    },
    ({ workspace_id }) => safe(async () => ({ budget: await repository.getBudget(workspace_id) }))
  );

  registerTool(
    "billcheck_set_budget",
    {
      title: "Set BillCheck budget",
      description: "Create or replace the workspace budget. Existing budgets require the current version.",
      inputSchema: {
        workspace_id: WorkspaceId,
        budget: BudgetDataSchema,
        if_version: VersionSchema.optional()
      },
      annotations: update
    },
    ({ workspace_id, budget, if_version }) =>
      safe(async () => ({
        budget: await repository.setBudget(workspace_id, budget, if_version)
      }))
  );

  registerTool(
    "billcheck_get_spending_summary",
    {
      title: "Summarize BillCheck spending",
      description:
        "Compute exact totals from lightweight projected bill fields, without loading receipt attachments, AI inference, or currency conversion.",
      inputSchema: {
        workspace_id: WorkspaceId,
        group_by: z.enum(["category", "merchant", "month"]),
        from: IsoDateSchema.optional(),
        to: IsoDateSchema.optional()
      },
      annotations: readOnly
    },
    ({ workspace_id, group_by, from, to }) =>
      safe(async () => ({
        summary: await repository.getSpendingSummary(workspace_id, group_by, {
          ...(from ? { from } : {}),
          ...(to ? { to } : {})
        })
      }))
  );

  return server;
}

function getBillAttachmentResult(
  repository: BillCheckRepository,
  options: BillCheckMcpServerOptions,
  workspaceId: string,
  billId: string
): Promise<BillAttachmentToolResult | ReturnType<typeof failure>> {
  return safeAttachment(async () => {
    const bill = await repository.getBill(workspaceId, billId);
    if (!bill.data.imageUrl) throw new Error(`Bill '${billId}' does not have a saved receipt attachment`);
    const embedded = embeddedBillAttachment(bill.data.imageUrl);
    const fileName = embedded
      ? receiptFileName(bill.data, embedded.extension)
      : sanitizeDownloadFileName(bill.data.attachmentName ?? `receipt-${billId}.bin`, `receipt-${billId}.bin`);
    const ticket = options.fileDelivery
      ? await options.fileDelivery.createDownload({ kind: "attachment", workspaceId, billIds: [billId], fileName })
      : null;
    const attachment = {
      bill_id: billId,
      merchant_name: bill.data.merchantName,
      date: bill.data.date,
      file_name: fileName,
      mime_type: embedded?.mimeType,
      is_image: embedded?.isImage ?? false,
      ...(ticket ? { download_url: ticket.url, expires_at: ticket.expiresAt } : {})
    };
    const content: BillAttachmentToolResult["content"] = [
      { type: "text", text: JSON.stringify({ attachment }) }
    ];
    if (embedded?.dataBase64 && embedded.isImage) {
      content.push({ type: "image", data: embedded.dataBase64, mimeType: embedded.mimeType });
    } else if (embedded?.dataBase64 && !ticket) {
      content.push({
        type: "resource",
        resource: { uri: attachmentUri(billId, fileName), mimeType: embedded.mimeType, blob: embedded.dataBase64 }
      });
    }
    if (ticket) {
      content.push({
        type: "resource_link",
        name: fileName,
        uri: ticket.url,
        mimeType: embedded?.mimeType ?? "application/octet-stream"
      });
    }
    return { content, structuredContent: { attachment } };
  });
}

function safeAttachment(operation: () => Promise<BillAttachmentToolResult>): Promise<BillAttachmentToolResult | ReturnType<typeof failure>> {
  return operation().catch(failure);
}

function attachmentUri(billId: string, fileName: string): string {
  return `billcheck://receipts/${encodeURIComponent(billId)}/${encodeURIComponent(fileName)}`;
}

type BillArchiveToolResult = {
  content: Array<{ type: "text"; text: string } | { type: "resource_link"; name: string; uri: string; mimeType: string }>;
  structuredContent: Record<string, unknown>;
};

function safeArchive(
  operation: () => Promise<BillArchiveToolResult>
): Promise<BillArchiveToolResult | ReturnType<typeof failure>> {
  return operation().catch(failure);
}

function widgetToolMeta(resourceUri: string, invoking: string, invoked: string) {
  return {
    ui: { resourceUri },
    "openai/outputTemplate": resourceUri,
    "openai/toolInvocation/invoking": invoking,
    "openai/toolInvocation/invoked": invoked
  };
}

function registerMediaWidgets(server: McpServer, publicOrigin?: string): void {
  if (!publicOrigin) return;
  const origin = new URL(publicOrigin).origin;
  const resourceMeta = {
    ui: {
      prefersBorder: true,
      domain: origin,
      csp: { connectDomains: [], resourceDomains: [origin] }
    },
    "openai/widgetDescription": "Displays a BillCheck receipt image preview when possible and a secure original-file download action for every supported attachment.",
    "openai/widgetPrefersBorder": true,
    "openai/widgetDomain": origin,
    "openai/widgetCSP": {
      connect_domains: [],
      resource_domains: [origin],
      redirect_domains: [origin]
    }
  };
  server.registerResource("billcheck-receipt-image", BILL_IMAGE_WIDGET_URI, {}, async () => ({
    contents: [{ uri: BILL_IMAGE_WIDGET_URI, mimeType: "text/html;profile=mcp-app", text: billImageWidgetHtml(), _meta: resourceMeta }]
  }));
  server.registerResource("billcheck-receipt-archive", BILL_ARCHIVE_WIDGET_URI, {}, async () => ({
    contents: [{ uri: BILL_ARCHIVE_WIDGET_URI, mimeType: "text/html;profile=mcp-app", text: billArchiveWidgetHtml(), _meta: resourceMeta }]
  }));
}
