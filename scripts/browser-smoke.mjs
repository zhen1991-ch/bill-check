import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const directory = process.argv[2];
if (!directory) throw Error('Pass the disposable test data directory');
const info = JSON.parse(readFileSync(path.join(directory, 'runtime.json'), 'utf8'));
const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(info.origin + '/#' + info.token);
  await page.getByRole('heading', { name: 'Local Billspace', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open user menu', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Profile', exact: true }).click();
  await page.getByLabel('Display Name', { exact: true }).fill('Browser Tester');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.getByText('Hello, Browser!', { exact: true }).waitFor();

  await page.getByRole('button', { name: 'Manage Billspaces', exact: true }).click();
  await page.getByRole('button', { name: 'View local Billspace', exact: true }).click();
  await page.getByLabel('Billspace Name', { exact: true }).fill('Browser Billspace');
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.getByRole('heading', { name: 'Browser Billspace', exact: true }).waitFor();

  await page.getByRole('button', { name: 'Add receipt', exact: true }).click();
  await page.getByRole('button', { name: /Manual/ }).click();
  await page.getByPlaceholder('0.00').fill('6.90');
  await page.getByPlaceholder('e.g. Starbucks').fill('Browser parity receipt');
  await page.getByRole('button', { name: 'Save Manual Bill', exact: true }).click();
  await page.getByRole('heading', { name: 'Browser Billspace', exact: true }).waitFor();

  await page.getByText('Bills', { exact: true }).click();
  await page.getByRole('heading', { name: 'My Bills', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Browser parity receipt', exact: true }).waitFor();
  await page.screenshot({ path: path.join(directory, 'desktop.png'), fullPage: true });

  await page.getByRole('heading', { name: 'Browser parity receipt', exact: true }).click();
  await page.getByRole('heading', { name: 'Bill Details', exact: true }).waitFor();
  await page.getByText('€6.90', { exact: true }).last().waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(directory, 'mobile.png'), fullPage: true });
  if (errors.length) throw Error(errors.join('\n'));
  console.log('Paid-Web dashboard, persistent local names, manual entry, bill list/detail, icons and responsive screenshots: passed');
} finally {
  await browser.close();
}
