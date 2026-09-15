export type BillCheckDownloadKind = "attachment" | "image" | "archive";

export interface BillCheckDownloadRequest {
  kind: BillCheckDownloadKind;
  workspaceId: string;
  billIds: string[];
  fileName: string;
}

export interface BillCheckDownloadTicket {
  url: string;
  expiresAt: string;
}

export interface BillCheckFileDelivery {
  createDownload(request: BillCheckDownloadRequest): Promise<BillCheckDownloadTicket>;
}

export interface StoredDownloadGrant extends BillCheckDownloadRequest {
  grantId: string;
  expiresAt: number;
}
