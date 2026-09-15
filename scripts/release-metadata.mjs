import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// npm supplies its own CLI path to lifecycle scripts; avoid PATH-selected Node.
if (!process.env.npm_execpath) throw new Error('Run npm run release:metadata using the supported Node runtime.');
const sbom = execFileSync(process.execPath, [process.env.npm_execpath, 'sbom', '--sbom-format=cyclonedx', '--omit=dev', '--package-lock-only'], { encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
const parsed = JSON.parse(sbom);
if (parsed.bomFormat !== 'CycloneDX' || !Array.isArray(parsed.components)) throw new Error('Invalid generated SBOM.');
writeFileSync('dist/sbom.cdx.json', JSON.stringify(parsed, null, 2) + '\n');
const manifest = JSON.parse(readFileSync('dist/checksums.json', 'utf8'));
manifest.files['sbom.cdx.json'] = createHash('sha256').update(readFileSync('dist/sbom.cdx.json')).digest('hex');
writeFileSync('dist/checksums.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Release metadata: ${parsed.components.length} production components; SHA-256 recorded. No signing or publication performed.`);
