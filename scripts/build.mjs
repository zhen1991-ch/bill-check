import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const tsc = require.resolve('typescript/bin/tsc');

execFileSync(process.execPath, [tsc, '-p', path.join(root, 'tsconfig.ui.json')], { stdio: 'inherit' });
rmSync(path.join(root, 'dist'), { recursive: true, force: true });
mkdirSync(path.join(root, 'dist'), { recursive: true });
execFileSync(process.execPath, [tsc, '-p', path.join(root, 'tsconfig.json')], { stdio: 'inherit' });

const uiResult = await build({
  entryPoints: [path.join(root, 'src/ui/index.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2022'],
  write: false,
  minify: true,
  sourcemap: false,
  define: { 'process.env.NODE_ENV': '"production"' }
});
const javascript = uiResult.outputFiles[0]?.text;
if (!javascript) throw new Error('BillCheck Web UI bundle was not generated');

const sourceCss = readFileSync(path.join(root, 'src/ui/index.css'), 'utf8');
const tailwindResult = await postcss([
  tailwindcss({
    content: [path.join(root, 'src/ui/**/*.{ts,tsx}')],
    theme: { extend: { scale: { 98: '.98' } } }
  }),
  autoprefixer
]).process(sourceCss, { from: path.join(root, 'src/ui/index.css') });

const iconCssParts = [];
for (const file of ['fontawesome.min.css', 'solid.min.css', 'regular.min.css']) {
  const iconResult = await build({
    entryPoints: [require.resolve(`@fortawesome/fontawesome-free/css/${file}`)],
    bundle: true,
    platform: 'browser',
    write: false,
    minify: true,
    loader: { '.woff2': 'dataurl', '.ttf': 'dataurl' }
  });
  if (!iconResult.outputFiles[0]?.text) throw new Error(`BillCheck icon bundle was not generated for ${file}`);
  iconCssParts.push(iconResult.outputFiles[0].text);
}
const iconCss = iconCssParts.join('\n');
const stylesheet = `${tailwindResult.css}\n${iconCss}`;

const assetsPlugin = {
  name: 'billcheck-web-assets',
  setup(context) {
    context.onResolve({ filter: /^billcheck-web-assets$/ }, () => ({ path: 'assets', namespace: 'billcheck-web-assets' }));
    context.onLoad({ filter: /.*/, namespace: 'billcheck-web-assets' }, () => ({
      contents: `export const javascript=${JSON.stringify(javascript)};export const stylesheet=${JSON.stringify(stylesheet)};`,
      loader: 'js'
    }));
  }
};

await build({
  entryPoints: [path.join(root, 'src/local/cli.ts')],
  outfile: path.join(root, 'dist/billcheck.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  plugins: [assetsPlugin],
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" }
});

const bytes = readFileSync(path.join(root, 'dist/billcheck.mjs'));
writeFileSync(
  path.join(root, 'dist/checksums.json'),
  JSON.stringify({ version: '0.2.0', files: { 'billcheck.mjs': createHash('sha256').update(bytes).digest('hex') } }, null, 2) + '\n'
);
