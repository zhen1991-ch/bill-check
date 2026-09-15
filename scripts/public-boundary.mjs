import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const license = await readFile(path.join(root, 'LICENSE'), 'utf8');
const readme = await readFile(path.join(root, 'README.md'), 'utf8');
const localWeb = await readFile(path.join(root, 'src/local/web.ts'), 'utf8');

assert.equal(packageJson.license, 'AGPL-3.0-only');
assert.deepEqual(packageJson.files, ['dist', 'README.md', 'LICENSE', 'NOTICE']);
assert.equal(packageJson.repository?.url, 'git+https://github.com/zhen1991-ch/bill-check.git');
assert.match(license, /GNU AFFERO GENERAL PUBLIC LICENSE/);
assert.match(license, /13\. Remote Network Interaction/);
assert.match(readme, /AGPL-3\.0-only/);
assert.match(localWeb, /github\.com\/zhen1991-ch\/bill-check/);
assert.match(localWeb, /AGPL-3\.0-only/);

const dependencyNames = Object.keys({
  ...packageJson.dependencies,
  ...packageJson.optionalDependencies,
  ...packageJson.peerDependencies
});
for (const name of dependencyNames) {
  assert.doesNotMatch(name, /firebase|firestore|stripe/i, `public dependency ${name} crosses the Cloud boundary`);
}

const forbidden = [
  /\bfirebase\b/i,
  /\bfirestore\b/i,
  /\bstripe\b/i,
  /STRIPE_(?:SECRET|WEBHOOK|PRICE)/,
  /BILLCHECK_BILLING/,
  /https?:\/\/[^"'\s]*workers\.dev/i,
  /AIza[0-9A-Za-z_-]{30,}/,
  /\b(?:sk_(?:live|test)|whsec|price|bpc|we|acct)_[0-9A-Za-z_]+\b/,
  /billcheck-5aa49/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(absolute));
    else if (/\.(?:ts|js|mjs|json)$/.test(entry.name)) files.push(absolute);
  }
  return files;
}

for (const directory of ['src', 'dist']) {
  for (const file of await sourceFiles(path.join(root, directory))) {
    const content = await readFile(file, 'utf8');
    for (const pattern of forbidden) {
      assert.doesNotMatch(content, pattern, `${path.relative(root, file)} crosses the public/private boundary`);
    }
  }
}

console.log('Public package boundary passed: AGPL-3.0-only Local runtime only; no Stripe, Firebase or Cloud API coupling.');
