import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SqliteBillCheckRepository, restoreBackup } from './storage.js';
import type { CreateBill } from '../core/domain.js';

const roots:string[]=[],repos:SqliteBillCheckRepository[]=[];
const input=(patch:Partial<CreateBill>={}):CreateBill=>({merchantName:'Train',date:'2026-09-08',amount:0.1,currency:'EUR',category:'Travel',items:[],isTaxRelevant:false,collectionIds:[],...patch});
function setup(){const root=mkdtempSync(path.join(realpathSync(os.tmpdir()),'billcheck-sqlite-test-'));roots.push(root);const repo=new SqliteBillCheckRepository(path.join(root,'data'));repos.push(repo);return {root,repo};}
afterEach(()=>{for(const repo of repos.splice(0))repo.close();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})});
describe('SQLite local repository',()=>{
 it('persists bills and enforces CAS across independent database connections',async()=>{
  const {root,repo}=setup();const created=await repo.createBill('local',input());
  const second=new SqliteBillCheckRepository(path.join(root,'data'));repos.push(second);
  const results=await Promise.allSettled([repo.updateBill('local',created.data.id,{amount:2},'1'),second.updateBill('local',created.data.id,{amount:3},'1')]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((await second.getBill('local',created.data.id)).version).toBe('2');
  await expect(repo.deleteBill('local',created.data.id,'1')).rejects.toThrow('changed');
  await repo.deleteBill('local',created.data.id,'2');await expect(second.getBill('local',created.data.id)).rejects.toThrow('not found');
 });
 it('prevents alternate workspaces and remote attachment fetches',async()=>{
  const {repo}=setup();await expect(repo.createBill('other',input())).rejects.toThrow('does not allow');
  await expect(repo.createBill('local',input({imageUrl:'https://example.com/file.pdf'}))).rejects.toThrow('not remote URLs');
  expect(await repo.listBills('local')).toHaveLength(0);
 });
 it('sums all history beyond the list limit using decimal arithmetic',async()=>{
  const {repo}=setup();for(let i=0;i<501;i++)await repo.createBill('local',input({amount:i===500?0.2:0.1}));
  expect(await repo.listBills('local',{limit:500})).toHaveLength(500);
  expect((await repo.getSpendingSummary('local','category')).totalsByCurrency.EUR).toBe(50.2);
  await repo.createBill('local',input({currency:'KWD',amount:0.001}));
  expect((await repo.getSpendingSummary('local','category')).totalsByCurrency.KWD).toBe(0.001);
 });
 it('cleans collection links atomically and requires budget versions',async()=>{
  const {repo}=setup();const c=await repo.createCollection('local',{name:'Trip'});
  const b=await repo.createBill('local',input({collectionIds:[c.data.id]}));
  await repo.deleteCollection('local',c.data.id,c.version);
  const updated=await repo.getBill('local',b.data.id);expect(updated.data.collectionIds).toEqual([]);expect(updated.version).toBe('2');
  const budget={monthlyLimit:100,yearlyLimit:1200,isEnabled:true};await repo.setBudget('local',budget);
  await expect(repo.setBudget('local',budget)).rejects.toThrow('changed');
  expect((await repo.setBudget('local',budget,'1')).version).toBe('2');
 });
 it('stores original bytes outside SQLite and verifies backup before restoring',async()=>{
  const {root,repo}=setup();const bytes=Buffer.from('%PDF-1.4\nlocal test');
  const b=await repo.createBill('local',input({attachmentName:'票据.pdf',imageUrl:'data:application/pdf;base64,'+bytes.toString('base64')}));
  const raw=repo.db.prepare("SELECT data FROM records WHERE kind='bill'").get() as {data:string};expect(raw.data).not.toContain('base64');
  expect(repo.attachment(b.data.id)?.bytes.equals(bytes)).toBe(true);
  const backup=repo.backup(path.join(root,'backup'));const restored=path.join(root,'restored');restoreBackup(backup,restored);
  const check=new SqliteBillCheckRepository(restored);repos.push(check);expect((await check.getBill('local',b.data.id)).data.attachmentName).toBe('票据.pdf');
  expect(check.attachment(b.data.id)?.bytes.equals(bytes)).toBe(true);
  const manifest=JSON.parse(readFileSync(path.join(backup,'manifest.json'),'utf8'));manifest.files['../escape']='bad';writeFileSync(path.join(backup,'manifest.json'),JSON.stringify(manifest));
  expect(()=>restoreBackup(backup,path.join(root,'invalid'))).toThrow('Unsafe backup member');
 });
 it('imports an explicitly selected legacy workspace atomically and preserves revisions',async()=>{
  const {repo}=setup();const legacy={schemaVersion:1,workspaces:{personal:{}},bills:{personal:{first:{data:{...input(),id:'first',createdAt:1},revision:3}}},collections:{personal:{}},budgets:{}};
  expect(()=>repo.importLegacy(legacy,'other')).toThrow('Source workspace');
  expect(repo.importLegacy(legacy,'personal')).toEqual({bills:1,collections:0});
  expect((await repo.getBill('local','first')).version).toBe('3');
  expect(()=>repo.importLegacy(legacy,'personal')).toThrow('empty local Billspace');
 });
});
