import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const tempRoot=realpathSync(os.tmpdir());
const root=mkdtempSync(path.join(tempRoot,'billcheck-lifecycle-'));
const data=path.join(root,'data'),source=path.resolve('dist/billcheck.mjs');
const command=(entry,...args)=>execFileSync(process.execPath,[entry,...args,'--data-dir',data],{encoding:'utf8',windowsHide:true,timeout:30000});
const clients=[];
try{
 command(source,'install');command(source,'install');
 const installed=JSON.parse(readFileSync(path.join(data,'installation.json'),'utf8')).entry;
 if(!installed.startsWith(path.join(data,'releases')))throw Error('Installer did not persist release');
 for(let i=0;i<2;i++){
  const client=new Client({name:'lifecycle-'+i,version:'1'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[installed,'mcp','--data-dir',data],stderr:'pipe'}));clients.push(client);
 }
 const result=await clients[0].callTool({name:'billcheck_create_bill',arguments:{workspace_id:'local',bill:{merchantName:'Lifecycle test',date:'2026-09-08',amount:6.9,currency:'EUR',category:'Other',isTaxRelevant:false,items:[],collectionIds:[]}}});
 if(result.isError)throw Error(JSON.stringify(result));
 const bill=result.structuredContent.bill;
 const updates=await Promise.all(clients.map((client,i)=>client.callTool({name:'billcheck_update_bill',arguments:{workspace_id:'local',bill_id:bill.data.id,if_version:bill.version,patch:{amount:7+i}}})));
 if(updates.filter(r=>!r.isError).length!==1)throw Error('Concurrent stdio edits did not enforce CAS');
 for(const client of clients.splice(0))await client.close();
 const backup=JSON.parse(command(installed,'backup')).directory;
 const restored=path.join(root,'restored');execFileSync(process.execPath,[source,'restore',backup,'--data-dir',restored],{windowsHide:true,timeout:30000});
 command(installed,'stop');
 await new Promise(resolve=>setTimeout(resolve,200));
 command(source,'upgrade');
 const doctor=JSON.parse(command(installed,'doctor'));if(doctor.integrity!=='ok')throw Error('Database integrity failed');
 command(installed,'uninstall');
 if(!readFileSync(path.join(data,'billcheck.sqlite3')).length)throw Error('Uninstall removed data');
 console.log('Install/reinstall, independent stdio clients, CAS, backup/restore, upgrade, uninstall: passed');
}finally{
 for(const client of clients)await client.close();
 try{command(source,'stop')}catch{}
 await new Promise(resolve=>setTimeout(resolve,200));
 const cleanupTarget=path.resolve(root);
 if(path.dirname(cleanupTarget)!==tempRoot||!path.basename(cleanupTarget).startsWith('billcheck-lifecycle-'))throw Error('Refusing unsafe test cleanup path');
 rmSync(cleanupTarget,{recursive:true,force:true});
}
