import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bill,
  Budget,
  ChatSession,
  Collection,
  Currency,
  SharedUser,
  User,
  UserPermissions,
  Workspace,
  WorkspaceType
} from '../types';

type Versioned<T> = { data: T; version: string };

interface AppContextType {
  user: User | null;
  activeWorkspace: Workspace | null;
  availableWorkspaces: Workspace[];
  switchWorkspace: (workspace: Workspace) => void;
  createWorkspace: (name: string, currency: string, initialMembers?: string[]) => Promise<void>;
  updateWorkspaceDetails: (id: string, type: WorkspaceType, data: Partial<Workspace>) => Promise<void>;
  removeWorkspace: (id: string) => Promise<void>;
  leaveWorkspace: (id: string) => Promise<void>;
  setDefaultWorkspace: (id: string) => Promise<void>;
  bills: Bill[];
  collections: Collection[];
  chatSessions: ChatSession[];
  sharedUsers: SharedUser[];
  budget: Budget | null;
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  addBill: (bill: Bill) => Promise<void>;
  updateBill: (bill: Bill) => Promise<void>;
  deleteBill: (id: string) => Promise<void>;
  addCollection: (collection: Collection) => Promise<void>;
  updateCollection: (collection: Collection) => Promise<void>;
  deleteCollection: (id: string, deleteBills?: boolean) => Promise<void>;
  saveChatSession: (session: ChatSession) => Promise<void>;
  deleteChatSession: (id: string) => Promise<void>;
  inviteUser: (email: string, permissions: UserPermissions) => Promise<void>;
  removeUser: (email: string) => Promise<void>;
  updateBudget: (budget: Budget) => Promise<void>;
  login: () => Promise<void>;
  loginWithEmail: () => Promise<void>;
  registerWithEmail: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  isLoading: boolean;
  dbError: string | null;
  showSecurityRules: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const localUser: User = {
  id: 'local-owner',
  name: 'Local User',
  email: 'Stored on this device',
  avatarUrl: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#6366f1"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs><rect width="64" height="64" rx="32" fill="url(#g)"/><path d="M32 31a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-18 22c2-11 9-17 18-17s16 6 18 17" fill="#fff" opacity=".92"/></svg>')}`,
  emailVerified: true
};

function tokenFromLocation(): string {
  const fromHash = window.location.hash.slice(1);
  if (fromHash) {
    sessionStorage.setItem('billcheck-token', fromHash);
    history.replaceState(null, '', window.location.pathname + window.location.search);
    return fromHash;
  }
  return sessionStorage.getItem('billcheck-token') ?? '';
}

async function rpc<T>(method: string, ...args: unknown[]): Promise<T> {
  const token = tokenFromLocation();
  if (!token) throw new Error('Open BillCheck Local using the secure address printed by the start command.');
  const response = await fetch('/rpc', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ method, args })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Local operation failed');
  return body.result as T;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [bills, setBills] = useState<Bill[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [currency, setCurrencyState] = useState<Currency>('EUR');
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);
  const billVersions = useRef(new Map<string, string>());
  const collectionVersions = useRef(new Map<string, string>());
  const budgetVersion = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    const [workspaces, versionedBills, versionedCollections, versionedBudget] = await Promise.all([
      rpc<Workspace[]>('listWorkspaces'),
      rpc<Array<Versioned<Bill>>>('listBills', 'local', { limit: 500 }),
      rpc<Array<Versioned<Collection>>>('listCollections', 'local'),
      rpc<Versioned<Budget> | null>('getBudget', 'local')
    ]);
    const nextWorkspace = workspaces[0] ?? null;
    setWorkspace(nextWorkspace);
    setCurrencyState((nextWorkspace?.currency as Currency) ?? 'EUR');
    billVersions.current = new Map(versionedBills.map(record => [record.data.id, record.version]));
    collectionVersions.current = new Map(versionedCollections.map(record => [record.data.id, record.version]));
    budgetVersion.current = versionedBudget?.version;
    setBills(versionedBills.map(record => record.data));
    setCollections(versionedCollections.map(record => record.data));
    setBudget(versionedBudget?.data ?? null);
  }, []);

  useEffect(() => {
    let active = true;
    refresh()
      .catch(error => active && setDbError(error instanceof Error ? error.message : String(error)))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, [refresh]);

  const runAndRefresh = useCallback(async (operation: () => Promise<unknown>) => {
    setDbError(null);
    try {
      await operation();
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDbError(message);
      throw error;
    }
  }, [refresh]);

  const value = useMemo<AppContextType>(() => ({
    user: localUser,
    activeWorkspace: workspace,
    availableWorkspaces: workspace ? [workspace] : [],
    switchWorkspace: () => undefined,
    createWorkspace: async () => { throw new Error('BillCheck Local uses one Personal Billspace.'); },
    updateWorkspaceDetails: async () => { throw new Error('Local Billspace metadata is managed locally.'); },
    removeWorkspace: async () => { throw new Error('The Local Billspace cannot be removed from the app.'); },
    leaveWorkspace: async () => { throw new Error('The Local Billspace belongs to this device.'); },
    setDefaultWorkspace: async () => undefined,
    bills,
    collections,
    chatSessions,
    sharedUsers: [] as SharedUser[],
    budget,
    currency,
    setCurrency: setCurrencyState,
    addBill: bill => runAndRefresh(() => rpc('createBill', 'local', bill)),
    updateBill: bill => runAndRefresh(() => rpc('updateBill', 'local', bill.id, bill, billVersions.current.get(bill.id))),
    deleteBill: id => runAndRefresh(() => rpc('deleteBill', 'local', id, billVersions.current.get(id))),
    addCollection: collection => runAndRefresh(() => rpc('createCollection', 'local', collection)),
    updateCollection: collection => runAndRefresh(() => rpc('updateCollection', 'local', collection.id, collection, collectionVersions.current.get(collection.id))),
    deleteCollection: (id, deleteBills = false) => runAndRefresh(async () => {
      if (deleteBills) {
        for (const bill of bills.filter(item => item.collectionIds.includes(id))) {
          await rpc('deleteBill', 'local', bill.id, billVersions.current.get(bill.id));
        }
      }
      await rpc('deleteCollection', 'local', id, collectionVersions.current.get(id));
    }),
    saveChatSession: async session => setChatSessions(current => [...current.filter(item => item.id !== session.id), session]),
    deleteChatSession: async id => setChatSessions(current => current.filter(item => item.id !== id)),
    inviteUser: async () => { throw new Error('BillCheck Local has no accounts or remote members.'); },
    removeUser: async () => undefined,
    updateBudget: nextBudget => runAndRefresh(() => rpc('setBudget', 'local', nextBudget, budgetVersion.current)),
    login: async () => undefined,
    loginWithEmail: async () => undefined,
    registerWithEmail: async () => undefined,
    logout: async () => undefined,
    deleteAccount: async () => { throw new Error('BillCheck Local has no account. Your data remains in the selected local directory.'); },
    isLoading,
    dbError,
    showSecurityRules: () => setDbError('Your local database could not be opened.')
  }), [workspace, bills, collections, chatSessions, budget, currency, isLoading, dbError, runAndRefresh]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};
