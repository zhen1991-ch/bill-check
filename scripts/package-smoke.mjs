import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
if (!process.env.npm_execpath) throw new Error('Run npm run test:package.');
const tempRoot = realpathSync(os.tmpdir());
const root = mkdtempSync(path.join(tempRoot, 'billcheck-package-test-'));
const data = path.join(root, 'data');
const archive = path.resolve('billcheck-local-0.1.0.tgz');
const source = path.resolve('dist/billcheck.mjs');
const run = (entry, ...args) => execFileSync(process.execPath, [entry, ...args], { encoding: 'utf8', windowsHide: true, timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] });
try {
  // npm may obtain runtime dependencies from its normal cache/registry. This
  // verifies a supplied tarball, not ownership of a public npm package name.
  run(process.env.npm_execpath, 'exec', '--yes', '--ignore-scripts', '--package', archive, '--', 'billcheck-local', 'install', '--data-dir', data);
  const record = JSON.parse(readFileSync(path.join(data, 'installation.json'), 'utf8'));
  assert.equal(path.dirname(path.dirname(record.entry)), path.join(data, 'releases'));
  assert.equal(JSON.parse(run(record.entry, 'doctor', '--data-dir', data)).integrity, 'ok');
  run(record.entry, 'uninstall', '--data-dir', data);
  assert.ok(readFileSync(path.join(data, 'billcheck.sqlite3')).length);
  console.log('One-command npm tarball install, independent installed daemon, doctor and data-preserving uninstall: passed.');
} finally {
  try { run(source, 'stop', '--data-dir', data); } catch {}
  await new Promise(resolve => setTimeout(resolve, 250));
  const target = path.resolve(root);
  if (path.dirname(target) !== tempRoot || !path.basename(target).startsWith('billcheck-package-test-')) throw new Error('Refusing unsafe test cleanup.');
  rmSync(target, { recursive: true, force: true });
}
