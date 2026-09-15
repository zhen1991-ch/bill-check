import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, lstatSync, realpathSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { embeddedBillAttachment } from '../core/bill-image.js';
import { BillDataSchema, BudgetDataSchema, CollectionDataSchema, CreateBillSchema, CreateCollectionSchema,
  UpdateBillSchema, UpdateCollectionSchema, parsePersistedBillData,
  type Bill, type BillFilters, type Budget, type Collection, type CreateBill, type CreateCollection,
  type UpdateBill, type UpdateCollection, type Versioned, type Workspace, type SummaryGroup, type SpendingSummary } from '../core/domain.js';
import { ConflictError, NotFoundError, PermissionError, type BillCheckRepository } from '../core/repository.js';

export const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const SCHEMA = `
CREATE TABLE records(kind TEXT NOT NULL CHECK(kind IN ('bill','collection','budget')), id TEXT NOT NULL,
  data TEXT NOT NULL CHECK(json_valid(data)), version INTEGER NOT NULL CHECK(version > 0), PRIMARY KEY(kind,id));
CREATE TABLE attachments(bill_id TEXT PRIMARY KEY, hash TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL);
CREATE INDEX bill_date ON records(json_extract(data,'$.date')) WHERE kind='bill';
CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);
`;
type Row = { data: string; version: number };
type Attachment = { hash: string; mime: string; size: number };
const moneyKeys = new Set(['amount', 'monthlyLimit', 'yearlyLimit']);
// Decimal text is the storage truth. The public MCP number contract stays unchanged.
const encode = (value: unknown) => JSON.stringify(value, (key, v) => moneyKeys.has(key) && typeof v === 'number' ? String(v) : v);
const decode = (value: string) => JSON.parse(value, (key, v) => moneyKeys.has(key) && typeof v === 'string' ? Number(v) : v);

export function safeDirectory(directory: string): string {
  const resolved = path.resolve(directory);
  let current = path.parse(resolved).root;
  for (const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    if (existsSync(current)) {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Data path must contain real directories only');
    } else mkdirSync(current, { mode: 0o700 });
  }
  return realpathSync(resolved);
}

function safeFile(file: string): void {
  if (existsSync(file) && (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink())) throw new Error('Unsafe file path');
}

export class SqliteBillCheckRepository implements BillCheckRepository {
  readonly directory: string;
  readonly db: DatabaseSync;
  constructor(directory: string) {
    this.directory = safeDirectory(directory);
    safeDirectory(path.join(this.directory, 'attachments'));
    const file = path.join(this.directory, 'billcheck.sqlite3');
    for (const suffix of ['', '-wal', '-shm']) safeFile(file + suffix);
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
    const version = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    if (version === 0) {
      this.transaction(() => {
        this.db.exec(SCHEMA);
        this.db.prepare('INSERT INTO schema_migrations VALUES(1,?,?)').run(sha256(SCHEMA), new Date().toISOString());
        this.db.exec('PRAGMA user_version=1');
      });
    } else if (version !== 1 || (this.db.prepare('SELECT checksum FROM schema_migrations WHERE version=1').get() as {checksum: string})?.checksum !== sha256(SCHEMA)) {
      this.db.close(); throw new Error('Unsupported or modified database migration');
    }
  }
  close() { this.db.close(); }
  private scope(id: string) { if (id !== 'local') throw new PermissionError('access', id); }
  private transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private row(kind: string, id: string): Row | undefined {
    return this.db.prepare('SELECT data,version FROM records WHERE kind=? AND id=?').get(kind,id) as Row | undefined;
  }
  private require<T>(kind: string, id: string): Versioned<T> {
    const row = this.row(kind,id);
    if (!row) throw new NotFoundError(kind,id);
    return { data: decode(row.data) as T, version: String(row.version) };
  }
  private cas(kind: string, id: string, expected: string | undefined) {
    const actual = this.row(kind,id);
    if (!actual) throw new NotFoundError(kind,id);
    if (expected !== String(actual.version)) throw new ConflictError(kind,id,expected ?? 'explicit version',String(actual.version));
  }
  private put<T>(kind: string, id: string, data: T): Versioned<T> {
    this.db.prepare(`INSERT INTO records VALUES(?,?,?,1) ON CONFLICT(kind,id)
      DO UPDATE SET data=excluded.data,version=records.version+1`).run(kind,id,encode(data));
    return this.require<T>(kind,id);
  }
  private insert<T>(kind: string, id: string, data: T) {
    if (this.row(kind,id)) throw new ConflictError(kind,id,'absent','present');
    return this.put(kind,id,data);
  }
  attachmentPath(hash: string) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid attachment hash');
    const directory = safeDirectory(path.join(this.directory,'attachments',hash.slice(0,2)));
    const file = path.join(directory,hash); safeFile(file); return file;
  }
  attachment(id: string): { bytes: Buffer; mime: string } | null {
    const row = this.db.prepare('SELECT hash,mime,size FROM attachments WHERE bill_id=?').get(id) as Attachment | undefined;
    if (!row) return null;
    const bytes = readFileSync(this.attachmentPath(row.hash));
    if (bytes.length !== row.size || sha256(bytes) !== row.hash) throw new Error('Attachment integrity check failed');
    return { bytes, mime: row.mime };
  }
  private storeAttachment(id: string, data: Bill) {
    const embedded = embeddedBillAttachment(data.imageUrl);
    if (data.imageUrl && !embedded) throw new Error('Local attachments must contain file bytes, not remote URLs');
    if (embedded) {
      const hash = sha256(embedded.bytes), file = this.attachmentPath(hash);
      if (!existsSync(file)) {
        const temp = file + '.' + randomUUID() + '.tmp';
        writeFileSync(temp,embedded.bytes,{mode:0o600,flag:'wx'}); renameSync(temp,file);
      }
      this.db.prepare('INSERT OR REPLACE INTO attachments VALUES(?,?,?,?)').run(id,hash,embedded.mimeType,embedded.bytes.length);
    } else this.db.prepare('DELETE FROM attachments WHERE bill_id=?').run(id);
    const stored = {...data}; delete stored.imageUrl; return stored;
  }
  private bill(id: string): Versioned<Bill> {
    const record = this.require<Bill>('bill',id);
    const attachment = this.attachment(id);
    if (attachment) record.data.imageUrl = `data:${attachment.mime};base64,${attachment.bytes.toString('base64')}`;
    return record;
  }
  async listWorkspaces(): Promise<Workspace[]> {
    return [{id:'local',type:'personal',name:'Local Billspace',ownerId:'local-owner',currency:'EUR',isDefault:true,
      permissions:{canView:true,canEdit:true,canDelete:true}}];
  }
  private billRows(filters: BillFilters = {}): Array<Versioned<Bill>> {
    return (this.db.prepare("SELECT data,version FROM records WHERE kind='bill' ORDER BY json_extract(data,'$.date') DESC,json_extract(data,'$.createdAt') DESC,id").all() as Row[])
      .map(row => ({data:decode(row.data) as Bill,version:String(row.version)}))
      .filter(({data:b}) => (!filters.from || b.date>=filters.from) && (!filters.to || b.date<=filters.to)
        && (!filters.category || b.category===filters.category) && (!filters.collectionId || b.collectionIds.includes(filters.collectionId)));
  }
  async listBills(workspace: string, filters: BillFilters = {}) {
    this.scope(workspace);
    return this.billRows(filters).slice(0,Math.min(500,Math.max(1,filters.limit ?? 100)));
  }
  async getBill(workspace: string,id: string) { this.scope(workspace); return this.bill(id); }
  async getBills(workspace: string,ids: string[]) {
    this.scope(workspace); return ids.filter(id => this.row('bill',id)).map(id => this.bill(id));
  }
  async createBill(workspace: string,input: CreateBill) {
    this.scope(workspace); const parsed = CreateBillSchema.parse(input), id = parsed.id ?? randomUUID();
    return this.transaction(() => {
      if (this.row('bill',id)) throw new ConflictError('bill',id,'absent','present');
      const bill = BillDataSchema.parse({...parsed,id,createdAt:parsed.createdAt ?? Date.now()});
      this.put('bill',id,this.storeAttachment(id,bill)); return this.bill(id);
    });
  }
  async updateBill(workspace: string,id: string,patch: UpdateBill,version: string) {
    this.scope(workspace);
    return this.transaction(() => {
      this.cas('bill',id,version);
      const data = parsePersistedBillData({...this.bill(id).data,...UpdateBillSchema.parse(patch)});
      this.put('bill',id,this.storeAttachment(id,data)); return this.bill(id);
    });
  }
  async deleteBill(workspace: string,id: string,version: string) {
    this.scope(workspace); this.transaction(() => {
      this.cas('bill',id,version); this.db.prepare("DELETE FROM records WHERE kind='bill' AND id=?").run(id);
      this.db.prepare('DELETE FROM attachments WHERE bill_id=?').run(id);
    }); // Keep unreferenced files until explicit garbage collection; rollback cannot lose originals.
  }
  async listCollections(workspace: string): Promise<Array<Versioned<Collection>>> {
    this.scope(workspace);
    return (this.db.prepare("SELECT data,version FROM records WHERE kind='collection' ORDER BY json_extract(data,'$.name'),id").all() as Row[])
      .map(row => ({data:decode(row.data),version:String(row.version)}));
  }
  async createCollection(workspace: string,input: CreateCollection) {
    this.scope(workspace); const parsed=CreateCollectionSchema.parse(input),id=parsed.id ?? randomUUID();
    return this.transaction(() => this.insert('collection',id,CollectionDataSchema.parse({...parsed,id})));
  }
  async updateCollection(workspace: string,id: string,patch: UpdateCollection,version: string) {
    this.scope(workspace); return this.transaction(() => {
      this.cas('collection',id,version); const current=this.require<Collection>('collection',id);
      if(current.data.isSystem) throw new PermissionError('editing system collection',workspace);
      return this.put('collection',id,CollectionDataSchema.parse({...current.data,...UpdateCollectionSchema.parse(patch)}));
    });
  }
  async deleteCollection(workspace: string,id: string,version: string) {
    this.scope(workspace); this.transaction(() => {
      this.cas('collection',id,version);
      if(this.require<Collection>('collection',id).data.isSystem) throw new PermissionError('deleting system collection',workspace);
      this.db.prepare("DELETE FROM records WHERE kind='collection' AND id=?").run(id);
      for(const {data:b} of this.billRows()) if(b.collectionIds.includes(id)) {
        b.collectionIds=b.collectionIds.filter(value => value!==id); this.put('bill',b.id,b);
      }
    });
  }
  async getBudget(workspace: string) { this.scope(workspace); return this.row('budget','local') ? this.require<Budget>('budget','local') : null; }
  async setBudget(workspace: string,budget: Budget,version?: string) {
    this.scope(workspace); return this.transaction(() => {
      if(this.row('budget','local')) this.cas('budget','local',version);
      else if(version) throw new ConflictError('budget','local',version,'absent');
      return this.put('budget','local',BudgetDataSchema.parse(budget));
    });
  }
  async getSpendingSummary(workspace: string,groupBy: SummaryGroup,filters: Pick<BillFilters,'from'|'to'> = {}): Promise<SpendingSummary> {
    this.scope(workspace);
    const rows=this.billRows(filters), totals=new Map<string,string[]>(),groups=new Map<string,{count:number;totals:Map<string,string[]>}>();
    for(const {data:b} of rows) {
      const key=groupBy==='category'?b.category:groupBy==='merchant'?b.merchantName:b.date.slice(0,7);
      const group=groups.get(key) ?? {count:0,totals:new Map<string,string[]>()}; group.count++;
      for(const map of [totals,group.totals]) map.set(b.currency,[...(map.get(b.currency) ?? []),String(b.amount)]);
      groups.set(key,group);
    }
    const sum=(map:Map<string,string[]>) => Object.fromEntries([...map].map(([currency,values]) => [currency,decimalSum(values)]));
    return {workspaceId:workspace,...filters,billCount:rows.length,totalsByCurrency:sum(totals),
      groups:[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([key,g])=>({key,count:g.count,totalsByCurrency:sum(g.totals)}))};
  }
  importLegacy(input: unknown,workspaceId: string): {bills:number;collections:number} {
    const record=z.object({data:z.unknown(),revision:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)});
    const source=z.object({schemaVersion:z.literal(1),workspaces:z.record(z.unknown()),
      bills:z.record(z.record(record)),collections:z.record(z.record(record)),budgets:z.record(record)}).parse(input);
    if(!Object.hasOwn(source.workspaces,workspaceId))throw new Error('Source workspace was not found');
    return this.transaction(()=>{
      if(this.db.prepare('SELECT 1 FROM records LIMIT 1').get())throw new Error('Import requires an empty local Billspace');
      const collections=Object.values(source.collections[workspaceId]??{}),bills=Object.values(source.bills[workspaceId]??{});
      for(const item of collections){const data=CollectionDataSchema.parse(item.data);this.insert('collection',data.id,data);this.db.prepare("UPDATE records SET version=? WHERE kind='collection' AND id=?").run(item.revision,data.id);}
      for(const item of bills){const data=parsePersistedBillData(item.data);this.insert('bill',data.id,this.storeAttachment(data.id,data));this.db.prepare("UPDATE records SET version=? WHERE kind='bill' AND id=?").run(item.revision,data.id);}
      const budget=source.budgets[workspaceId];if(budget){this.put('budget','local',BudgetDataSchema.parse(budget.data));this.db.prepare("UPDATE records SET version=? WHERE kind='budget'").run(budget.revision);}
      return {bills:bills.length,collections:collections.length};
    });
  }
  backup(destination: string): string {
    const target=path.resolve(destination);
    if(existsSync(target)) throw new Error('Backup destination must not exist');
    safeDirectory(target);
    const database=path.join(target,'billcheck.sqlite3');
    this.db.exec(`VACUUM INTO '${database.replaceAll("'","''")}'`);
    const files: Record<string,string>={'billcheck.sqlite3':sha256(readFileSync(database))};
    for(const {hash} of this.db.prepare('SELECT DISTINCT hash FROM attachments').all() as Array<{hash:string}>) {
      const relative=`attachments/${hash.slice(0,2)}/${hash}`;
      const dest=path.join(target,relative); safeDirectory(path.dirname(dest));
      copyFileSync(this.attachmentPath(hash),dest); files[relative]=sha256(readFileSync(dest));
    }
    writeFileSync(path.join(target,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),files},null,2),{mode:0o600,flag:'wx'});
    return target;
  }
}

export function restoreBackup(source: string,destination: string): void {
  const root=safeDirectory(source), target=path.resolve(destination);
  if(existsSync(target)) throw new Error('Restore destination must not exist; retain the original data directory');
  safeFile(path.join(root,'manifest.json'));
  const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8')) as {version:number;files:Record<string,string>};
  if(manifest.version!==1 || !manifest.files?.['billcheck.sqlite3']) throw new Error('Invalid backup manifest');
  const entries=Object.entries(manifest.files);
  for(const [relative,hash] of entries) {
    if(relative!=='billcheck.sqlite3' && !/^attachments\/[a-f0-9]{2}\/[a-f0-9]{64}$/.test(relative)) throw new Error('Unsafe backup member');
    const file=path.join(root,relative); safeDirectory(path.dirname(file)); safeFile(file);
    if(sha256(readFileSync(file))!==hash) throw new Error('Backup integrity check failed');
  }
  const check=new DatabaseSync(path.join(root,'billcheck.sqlite3'),{readOnly:true});
  try { if(Object.values(check.prepare('PRAGMA integrity_check').get()!)[0]!=='ok') throw new Error('Invalid backup database'); }
  finally { check.close(); }
  safeDirectory(target);
  for(const [relative] of entries) { const file=path.join(target,relative); safeDirectory(path.dirname(file)); copyFileSync(path.join(root,relative),file); }
}

function decimalSum(values: string[]): number {
  const parts=values.map(value => {
    const [base,exp='0']=value.toLowerCase().split('e');
    const [whole,fraction='']=base!.split('.');
    return {digits:BigInt(whole!+fraction),scale:fraction.length-Number(exp)};
  });
  const scale=Math.max(0,...parts.map(p=>p.scale));
  const total=parts.reduce((n,p)=>n+p.digits*10n**BigInt(scale-p.scale),0n);
  return Number(total)/10**scale;
}
