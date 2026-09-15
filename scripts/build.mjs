import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
await build({entryPoints:['src/local/cli.ts'],outfile:'dist/billcheck.mjs',bundle:true,platform:'node',format:'esm',target:'node22',
  banner:{js:"import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"}});
const bytes=readFileSync('dist/billcheck.mjs');
writeFileSync('dist/checksums.json',JSON.stringify({version:'0.1.0',files:{'billcheck.mjs':createHash('sha256').update(bytes).digest('hex')}},null,2)+'\n');
