


export enum Category {
  FoodAndDrinks = 'Food & Drinks',
  OfficeSupplies = 'Office Supplies',
  LegalAndFees = 'Legal & Other fees',
  Vehicle = 'Vehicle',
  Travel = 'Travel',
  Technology = 'Technology',
  PhoneAndInternet = 'Phone & Internet',
  TaxesAndInsurances = 'Taxes & Insurances',
  GoodsAndMaterials = 'Goods & Materials',
  Workplace = 'Workplace',
  InterestAndBankCharges = 'Interest & Bank charges',
  TrainingAndLiterature = 'Professional Training & Literature',
  Marketing = 'Marketing',
  Investments = 'Investments',
  EmployeeCompensation = 'Compensation for your employees',
  MailingAndShipping = 'Mailing / Shipping',
  Leasing = 'Leasing',
  Other = 'Other'
}

export type RecurringFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface BillItem {
  description: string;
  amount: number;
  category: Category;
}

export interface Bill {
  createdBy?: string;
  createdByName?: string;
  id: string;
  merchantName: string;
  date: string; // ISO Date string
  amount: number;
  currency: string;
  category: Category;
  items: BillItem[];
  isTaxRelevant: boolean;
  taxReason?: string;
  taxDeductibleLineItems?: string[];
  imageUrl?: string | null;
  attachmentName?: string;
  collectionIds: string[];
  createdAt: number;

  // Recurring Logic
  recurring?: RecurringFrequency;
  nextRecurringDate?: string | null; // YYYY-MM-DD: When the next bill should be generated
  parentBillId?: string; // If this bill was generated from a recurring bill
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  isSystem?: boolean; // e.g., "All Bills" concept
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  emailVerified: boolean;
}

export interface UserPermissions {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface SharedUser {
  email: string;
  permissions: UserPermissions;
  addedAt: number;
  invitationData?: SharedWorkspaceInvitation; // Optional: Stores the exact payload sent to registry
}

// Workspace Definitions
export type WorkspaceType = 'personal' | 'custom';

export interface Workspace {
  id: string; // User ID for personal, Doc ID for custom
  type: WorkspaceType;
  name: string;
  ownerId: string;
  permissions: UserPermissions;
  currency: Currency;
  isDefault?: boolean;
  members?: string[];
}

export interface CustomWorkspaceData {
  name: string;
  ownerId: string;
  currency: Currency;
  members: string[]; // List of emails
  createdAt: number;
}

export interface SharedWorkspaceInvitation {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  permissions: UserPermissions;
  workspaceName?: string; // The custom name of the workspace (if any)
  currency?: Currency; // The currency of the workspace
}

export interface Budget {
  monthlyLimit: number;
  yearlyLimit: number;
  isEnabled: boolean;
}

export interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: number;
  actionData?: any; // For structured actions like creating a bill
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

export type ViewState = 'dashboard' | 'upload' | 'bills';

export type Currency = 'USD' | 'EUR' | 'GBP' | 'CNY' | 'JPY';

export type TimeRange = 'this_month' | 'last_month' | 'this_year' | 'last_3_years' | 'all';
