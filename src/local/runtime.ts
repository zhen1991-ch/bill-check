import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync, lstatSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { SqliteBillCheckRepository, safeDirectory, sha256 } from './storage.js';
import { ConflictError, NotFoundError, PermissionError, type BillCheckRepository } from '../core/repository.js';
import { embeddedBillAttachment, receiptFileName, sanitizeDownloadFileName } from '../core/bill-image.js';
import type { BillCheckFileDelivery, BillCheckDownloadRequest } from '../core/delivery.js';
import { StoredZipWriter } from '../core/zip-stream.js';
import { html, javascript, stylesheet } from './web.js';

export function defaultDirectory() {
  if(process.platform==='win32') return path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(),'AppData','Local'),'BillCheck Local');
  if(process.platform==='darwin') return path.join(os.homedir(),'Library','Application Support','BillCheck Local');
  return path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(),'.local','share'),'billcheck');
}
export const socketFor=(directory:string) => process.platform==='win32'
  ? `\\\\.\\pipe\\billcheck-${sha256(path.resolve(directory)).slice(0,24)}` : path.join(directory,'daemon.sock');
type RuntimeInfo={version:1;pid:number;origin:string;token:string};
export function readInfo(directory:string):RuntimeInfo {
  const file=path.join(safeDirectory(directory),'runtime.json');
  if(lstatSync(file).isSymbolicLink()) throw new Error('Unsafe runtime file');
  return JSON.parse(readFileSync(file,'utf8'));
}
const methods=new Set(['getLocalIdentity','updateLocalIdentity','listWorkspaces','listBills','getBill','getBills','createBill','updateBill','deleteBill',
  'listCollections','createCollection','updateCollection','deleteCollection','getBudget','setBudget','getSpendingSummary']);
export const repositoryMethods=[...methods];
export async function rpc(directory:string,method:string,args:unknown[]=[]):Promise<any> {
  const info=readInfo(directory);
  return new Promise((resolve,reject) => {
    const data=JSON.stringify({method,args});
    const req=httpRequest({socketPath:socketFor(directory),path:'/rpc',method:'POST',headers:{
      authorization:`Bearer ${info.token}`,'content-type':'application/json','content-length':Buffer.byteLength(data)}},res=>{
      const chunks:Buffer[]=[];let bytes=0;
      res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>80*1024*1024){req.destroy(new Error('RPC response too large'));return;}chunks.push(chunk);});
      res.on('end',()=>{try{const body=JSON.parse(Buffer.concat(chunks).toString());
        if(res.statusCode!==200){const error=new Error(body.error ?? 'Local operation failed');error.name=body.name ?? 'Error';reject(error);}else resolve(body.result);
      }catch(error){reject(error);}});
    });
    req.setTimeout(30000,()=>req.destroy(new Error('Local daemon timed out')));
    req.on('error',reject);req.end(data);
  });
}
export function remoteRepository(directory:string):BillCheckRepository {
  return Object.fromEntries([...methods].map(method=>[method,(...args:unknown[])=>rpc(directory,method,args)])) as unknown as BillCheckRepository;
}
export function remoteDelivery(directory:string):BillCheckFileDelivery {
  return {createDownload:(request)=>rpc(directory,'createDownload',[request])};
}

export async function runDaemon(directory:string,requestedPort=0) {
  directory=safeDirectory(directory);
  const token=randomBytes(32).toString('hex'), socket=socketFor(directory);
  const tickets=new Map<string,{request:BillCheckDownloadRequest;expires:number}>();
  let repository:SqliteBillCheckRepository;
  let origin='';let closing=false;
  const authorized=(request:IncomingMessage)=>{
    const value=request.headers.authorization?.replace(/^Bearer /,'') ?? '';
    return value.length===token.length && timingSafeEqual(Buffer.from(value),Buffer.from(token));
  };
  const reply=(res:ServerResponse,status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  const dispatch=async(method:string,args:unknown[])=>{
    if(method==='health') return {version:1,status:'ok'};
    if(method==='stop'){setTimeout(()=>void close(),25);return {stopped:true};}
    if(method==='backup') return {directory:repository.backup(path.join(directory,'backups',new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(4).toString('hex')))};
    if(method==='doctor') return {integrity:Object.values(repository.db.prepare('PRAGMA integrity_check').get()!)[0],directory};
    if(method==='importLegacy') {if(typeof args[1]!=='string')throw new Error('Source workspace is required');return repository.importLegacy(args[0],args[1]);}
    if(method==='createDownload') {
      const request=args[0] as BillCheckDownloadRequest;
      if(!request || request.workspaceId!=='local' || !['attachment','image','archive'].includes(request.kind)
        || !Array.isArray(request.billIds) || request.billIds.length<1 || request.billIds.length>100
        || request.billIds.some(id=>typeof id!=='string') || typeof request.fileName!=='string') throw new Error('Invalid download request');
      for(const [key,ticket] of tickets) if(ticket.expires<Date.now()) tickets.delete(key);
      if(tickets.size>=1000) throw new Error('Too many active downloads');
      const key=randomBytes(32).toString('hex'),expires=Date.now()+300000;
      tickets.set(key,{request,expires});return {url:`${origin}/download/${key}`,expiresAt:new Date(expires).toISOString()};
    }
    if(!methods.has(method)) throw new Error('Unknown local operation');
    return (repository as any)[method](...args);
  };
  const handleRpc=async(req:IncomingMessage,res:ServerResponse)=>{
    if(!authorized(req)) {reply(res,401,{error:'Unauthorized local request'});return;}
    if(!req.headers['content-type']?.startsWith('application/json')){reply(res,415,{error:'JSON required'});return;}
    try{
      let bytes=0;const chunks:Buffer[]=[];
      for await(const chunk of req){bytes+=chunk.length;if(bytes>2*1024*1024){reply(res,413,{error:'Request too large'});return;}chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString()) as {method:string;args:unknown[]};
      if(typeof body.method!=='string'||!Array.isArray(body.args)||body.args.length>5) throw new Error('Invalid operation');
      reply(res,200,{result:await dispatch(body.method,body.args)});
    }catch(error){reply(res,error instanceof ConflictError?409:error instanceof PermissionError?403:error instanceof NotFoundError?404:400,
      {error:error instanceof Error?error.message:'Operation failed',name:error instanceof Error?error.name:'Error'});}
  };
  const ipc=createServer((req,res)=>{if(req.url==='/rpc'&&req.method==='POST')void handleRpc(req,res);else reply(res,404,{error:'Not found'});});
  // Binding is the process lock: only one daemon can own the data directory.
  if(process.platform!=='win32' && existsSync(socket)) {
    try{await rpc(directory,'health');throw new Error('Daemon is already running');}
    catch(error){if(!(error instanceof Error)||!('code' in error)||!['ECONNREFUSED','ENOENT'].includes(String(error.code)))throw error;unlinkSync(socket);}
  }
  await new Promise<void>((resolve,reject)=>{ipc.once('error',reject);ipc.listen(socket,resolve);});
  try{repository=new SqliteBillCheckRepository(directory);}catch(error){ipc.close();throw error;}
  const web=createServer(async(req,res)=>{
    if(req.headers.host!==new URL(origin).host){reply(res,403,{error:'Invalid host'});return;}
    res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');res.setHeader('cache-control','no-store');
    res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    if(req.method==='POST'&&req.url==='/rpc') {
      if(req.headers.origin!==origin){reply(res,403,{error:'Invalid origin'});return;}
      await handleRpc(req,res);return;
    }
    if(req.method!=='GET'){reply(res,405,{error:'Method not allowed'});return;}
    if(req.url?.startsWith('/download/')) {
      const ticket=tickets.get(req.url.slice('/download/'.length));
      if(!ticket||ticket.expires<Date.now()){reply(res,404,{error:'Download expired'});return;}
      try{
        const request=ticket.request;
        res.setHeader('content-disposition',`attachment; filename*=UTF-8''${encodeURIComponent(sanitizeDownloadFileName(request.fileName,'receipt'))}`);
        if(request.kind!=='archive'){
          const attachment=repository.attachment(request.billIds[0]!);
          if(!attachment)throw new NotFoundError('attachment',request.billIds[0]!);
          res.setHeader('content-type',attachment.mime);res.end(attachment.bytes);return;
        }
        res.setHeader('content-type','application/zip');
        // Generate one entry at a time; Node's pipeline applies socket backpressure.
        const stream=Readable.from((async function*(){
          const queue:Uint8Array[]=[];
          const writer=new StoredZipWriter({enqueue:(chunk:Uint8Array)=>queue.push(chunk),close:()=>{}} as any);
          let index=0;
          for(const id of request.billIds){
            const bill=await repository.getBill('local',id),attachment=embeddedBillAttachment(bill.data.imageUrl);
            if(!attachment)throw new NotFoundError('attachment',id);
            writer.add(`${++index}_${receiptFileName(bill.data,attachment.extension)}`,attachment.bytes);
            while(queue.length)yield queue.shift()!;
          }
          writer.close();while(queue.length)yield queue.shift()!;
        })());
        await pipeline(stream,res);
      }catch(error){if(!res.headersSent)reply(res,404,{error:error instanceof Error?error.message:'Download failed'});else res.destroy();}
      return;
    }
    const asset=req.url==='/'?[html,'text/html']:req.url==='/app.js'?[javascript,'text/javascript']:req.url==='/app.css'?[stylesheet,'text/css']:null;
    if(!asset){reply(res,404,{error:'Not found'});return;}res.setHeader('content-type',asset[1]!);res.end(asset[0]);
  });
  await new Promise<void>((resolve,reject)=>{web.once('error',reject);web.listen(requestedPort,'127.0.0.1',resolve);});
  const address=web.address();if(!address||typeof address==='string')throw new Error('Missing local address');
  origin=`http://127.0.0.1:${address.port}`;
  const info:RuntimeInfo={version:1,pid:process.pid,origin,token};
  const infoFile=path.join(directory,'runtime.json');
  if(existsSync(infoFile)&&lstatSync(infoFile).isSymbolicLink())throw new Error('Unsafe runtime info');
  writeFileSync(infoFile,JSON.stringify(info),{mode:0o600});
  const close=async()=>{
    if(closing)return;closing=true;
    web.closeAllConnections();await Promise.all([new Promise<void>(resolve=>web.close(()=>resolve())),new Promise<void>(resolve=>ipc.close(()=>resolve()))]);
    repository.close();if(existsSync(infoFile))unlinkSync(infoFile);
  };
  process.once('SIGTERM',()=>void close());process.once('SIGINT',()=>void close());
  return {info,close};
}
