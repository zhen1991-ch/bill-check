#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync, openSync, closeSync, readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBillCheckMcpServer } from '../core/server.js';
import { defaultDirectory, readInfo, rpc, remoteRepository, remoteDelivery, runDaemon } from './runtime.js';
import { restoreBackup, safeDirectory } from './storage.js';
import { installRelease } from './installer.js';

const args=process.argv.slice(2),command=args[0]??'help';
const dirIndex=args.indexOf('--data-dir');
if(dirIndex>=0&&!args[dirIndex+1])throw new Error('--data-dir requires a path');
const directory=path.resolve(dirIndex>=0?args[dirIndex+1]!:defaultDirectory());
let entry=fileURLToPath(import.meta.url);
async function ensureDaemon(){
  try{await rpc(directory,'health');return readInfo(directory);}catch{}
  safeDirectory(directory);mkdirSync(path.join(directory,'logs'),{recursive:true,mode:0o700});
  const log=openSync(path.join(directory,'logs','daemon.log'),'a',0o600);
  const child=spawn(process.execPath,[entry,'daemon','--data-dir',directory],{detached:true,windowsHide:true,stdio:['ignore',log,log]});
  closeSync(log);child.unref();let spawnError:Error|undefined;child.once('error',error=>{spawnError=error});
  for(let attempt=0;attempt<100;attempt++){
    if(spawnError)throw spawnError;
    await delay(100);try{await rpc(directory,'health');return readInfo(directory);}catch{}
  }
  throw new Error('Daemon could not start; inspect '+path.join(directory,'logs','daemon.log'));
}
async function main(){
 if(command==='daemon'){await runDaemon(directory);return;}
 if(command==='mcp'){
   await ensureDaemon();const server=createBillCheckMcpServer(remoteRepository(directory),{fileDelivery:remoteDelivery(directory)});
   await server.connect(new StdioServerTransport());return;
 }
 if(command==='install'||command==='upgrade'){
   if(command==='upgrade'){
     try{await rpc(directory,'health');console.log(JSON.stringify(await rpc(directory,'backup')));await rpc(directory,'stop');await delay(200);}catch(error){if(!(error instanceof Error)||!('code' in error)||!['ENOENT','ECONNREFUSED'].includes(String(error.code)))throw error;}
   }
   entry=installRelease(entry,safeDirectory(directory)).entry;
 }
 if(['install','upgrade','start','open'].includes(command)){
   const info=await ensureDaemon();console.log('BillCheck Local is ready.\n'+info.origin+'/#'+info.token);
   console.log('MCP command: '+JSON.stringify(process.execPath)+' '+JSON.stringify(entry)+' mcp --data-dir '+JSON.stringify(directory));
   return;
 }
 if(command==='status'){try{console.log(JSON.stringify(await rpc(directory,'health')))}catch{console.log('BillCheck Local is stopped.')}return;}
 if(command==='stop'||command==='uninstall'){
   try{await rpc(directory,'stop');console.log('Daemon stopped.')}catch{console.log('Daemon is not running.')}
   if(command==='uninstall')console.log('Data retained at '+directory+'. Remove the installed npm package separately.');return;
 }
 if(command==='backup'||command==='doctor'){await ensureDaemon();console.log(JSON.stringify(await rpc(directory,command),null,2));return;}
 if(command==='restore'){
   const source=args[1];if(!source||source.startsWith('--'))throw new Error('Usage: billcheck-local restore <backup-directory> --data-dir <new-directory>');
   restoreBackup(source,directory);console.log('Restored to '+directory);return;
 }
 if(command==='import'){
   const file=args[1],index=args.indexOf('--workspace');
   if(!file||file.startsWith('--')||index<0||!args[index+1])throw new Error('Usage: billcheck-local import <legacy.json> --workspace <source-workspace> [--data-dir <directory>]');
   const text=readFileSync(file,'utf8');if(Buffer.byteLength(text)>1900000)throw new Error('Legacy import exceeds 1.9 MB; use a smaller source export');
   await ensureDaemon();console.log(JSON.stringify(await rpc(directory,'importLegacy',[JSON.parse(text),args[index+1]])));return;
 }
 console.log('BillCheck Local\nCommands: install, start, open, status, stop, mcp, backup, restore, import, doctor, uninstall\nOptions: --data-dir <absolute-directory>\nRequires Node.js 22.16 or later.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1});
