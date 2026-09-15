import type {
  Bill,
  BillFilters,
  Budget,
  Collection,
  CreateBill,
  CreateCollection,
  SpendingSummary,
  SummaryGroup,
  UpdateBill,
  UpdateCollection,
  Versioned,
  Workspace
} from "./domain.js";

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} '${id}' was not found`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(entity: string, id: string, expected: string, actual: string) {
    super(`${entity} '${id}' changed: expected version ${expected}, current version ${actual}`);
    this.name = "ConflictError";
  }
}

export class PermissionError extends Error {
  constructor(action: string, workspaceId: string) {
    super(`Workspace '${workspaceId}' does not allow ${action}`);
    this.name = "PermissionError";
  }
}

export interface BillCheckRepository {
  listWorkspaces(): Promise<Workspace[]>;
  listBills(workspaceId: string, filters?: BillFilters): Promise<Array<Versioned<Bill>>>;
  getBill(workspaceId: string, billId: string): Promise<Versioned<Bill>>;
  getBills(workspaceId: string, billIds: string[]): Promise<Array<Versioned<Bill>>>;
  createBill(workspaceId: string, input: CreateBill): Promise<Versioned<Bill>>;
  updateBill(workspaceId: string, billId: string, patch: UpdateBill, expectedVersion: string): Promise<Versioned<Bill>>;
  deleteBill(workspaceId: string, billId: string, expectedVersion: string): Promise<void>;

  listCollections(workspaceId: string): Promise<Array<Versioned<Collection>>>;
  createCollection(workspaceId: string, input: CreateCollection): Promise<Versioned<Collection>>;
  updateCollection(
    workspaceId: string,
    collectionId: string,
    patch: UpdateCollection,
    expectedVersion: string
  ): Promise<Versioned<Collection>>;
  deleteCollection(workspaceId: string, collectionId: string, expectedVersion: string): Promise<void>;

  getBudget(workspaceId: string): Promise<Versioned<Budget> | null>;
  setBudget(workspaceId: string, budget: Budget, expectedVersion?: string): Promise<Versioned<Budget>>;

  getSpendingSummary(
    workspaceId: string,
    groupBy: SummaryGroup,
    filters?: Pick<BillFilters, "from" | "to">
  ): Promise<SpendingSummary>;
}
