import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { get } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBillCheckMcpServer } from '../core/server.js';
import { runDaemon, remoteRepository, remoteDelivery, rpc } from './runtime.js';

const roots:string[]=[],daemons:Array<Awaited<ReturnType<typeof runDaemon>>>=[];
afterEach(async()=>{for(const daemon of daemons.splice(0))await daemon.close();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})});
it('serves 16 MCP tools through the shared daemon and rejects forged browser requests',async()=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'billcheck-runtime-test-'));roots.push(root);
 const daemon=await runDaemon(root);daemons.push(daemon);
 const server=createBillCheckMcpServer(remoteRepository(root),{fileDelivery:remoteDelivery(root)});
 const client=new Client({name:'local-test',version:'1'});const [c,s]=InMemoryTransport.createLinkedPair();
 await Promise.all([server.connect(s),client.connect(c)]);
 try{
  expect((await client.listTools()).tools).toHaveLength(16);
  const result=await client.callTool({name:'billcheck_create_bill',arguments:{workspace_id:'local',bill:{merchantName:'Local',date:'2026-09-08',amount:6.9,currency:'EUR',category:'Other',isTaxRelevant:false,items:[],collectionIds:[]},attachment:{mime_type:'text/plain',file_name:'original.txt',data_base64:Buffer.from('original receipt').toString('base64')}}});
  expect(result.isError).not.toBe(true);const bill=(result.structuredContent as any).bill;
  expect((await remoteRepository(root).getBill('local',bill.data.id)).data.amount).toBe(6.9);
  const archive=await remoteDelivery(root).createDownload({kind:'archive',workspaceId:'local',billIds:[bill.data.id],fileName:'receipts.zip'});
  const response=await fetch(archive.url);const zip=Buffer.from(await response.arrayBuffer());expect(zip.readUInt32LE(0)).toBe(0x04034b50);expect(zip.includes(Buffer.from('original receipt'))).toBe(true);
  const headers={'content-type':'application/json',authorization:'Bearer '+daemon.info.token};
  expect((await fetch(daemon.info.origin+'/rpc',{method:'POST',headers:{...headers,origin:'https://evil.example'},body:JSON.stringify({method:'listWorkspaces',args:[]})})).status).toBe(403);
  expect((await fetch(daemon.info.origin+'/rpc',{method:'POST',headers:{...headers,origin:daemon.info.origin,authorization:'Bearer wrong'},body:'{}'})).status).toBe(401);
  const forgedStatus=await new Promise<number|undefined>((resolve,reject)=>{const req=get(daemon.info.origin,{headers:{host:'evil.example'}},res=>{res.resume();resolve(res.statusCode)});req.on('error',reject)});
  expect(forgedStatus).toBe(403);
  await expect(rpc(root,'constructor')).rejects.toThrow('Unknown local operation');
  await expect(runDaemon(root)).rejects.toThrow();
  const removed=await client.callTool({name:'billcheck_delete_bill',arguments:{workspace_id:'local',bill_id:bill.data.id,if_version:bill.version}});expect(removed.isError).not.toBe(true);
 }finally{await client.close();await server.close();}
},20000);
