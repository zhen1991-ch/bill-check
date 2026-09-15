import { copyFileSync, existsSync, readFileSync, writeFileSync, renameSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { safeDirectory, sha256 } from './storage.js';

export const VERSION='0.2.1';
type Installation={version:string;entry:string;previousEntry?:string};
export function installRelease(sourceEntry:string,directory:string):Installation {
  if(path.basename(sourceEntry)!=='billcheck.mjs')throw new Error('Install the bundled build: node dist/billcheck.mjs install');
  const manifest=JSON.parse(readFileSync(path.join(path.dirname(sourceEntry),'checksums.json'),'utf8')) as {version:string;files:Record<string,string>};
  const checksum=sha256(readFileSync(sourceEntry));
  if(manifest.version!==VERSION||manifest.files['billcheck.mjs']!==checksum)throw new Error('Release checksum does not match');
  const release=safeDirectory(path.join(directory,'releases',VERSION+'-'+checksum.slice(0,12))),entry=path.join(release,'billcheck.mjs');
  if(existsSync(entry)){
    if(lstatSync(entry).isSymbolicLink()||sha256(readFileSync(entry))!==checksum)throw new Error('Installed release has been modified');
  }else copyFileSync(sourceEntry,entry);
  writeFileSync(path.join(release,'checksums.json'),JSON.stringify(manifest),{mode:0o600});
  const config=path.join(directory,'installation.json');
  if(existsSync(config)&&lstatSync(config).isSymbolicLink())throw new Error('Unsafe installation record');
  const previous:Installation|undefined=existsSync(config)?JSON.parse(readFileSync(config,'utf8')):undefined;
  const installation={version:VERSION,entry,previousEntry:previous?.entry!==entry?previous?.entry:previous?.previousEntry};
  const temp=config+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify(installation),{mode:0o600,flag:'wx'});renameSync(temp,config);
  return installation;
}
