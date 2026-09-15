import { javascript, stylesheet } from 'billcheck-web-assets';

export const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <meta name="description" content="BillCheck Local — the private SQLite edition of BillCheck.">
    <meta name="license" content="AGPL-3.0-only">
    <meta name="source" content="https://github.com/zhen1991-ch/bill-check">
    <title>BillCheck Local</title>
    <link rel="stylesheet" href="/app.css">
  </head>
  <body class="bg-slate-50 text-slate-900">
    <div id="root"></div>
    <script src="/app.js"></script>
  </body>
</html>`;

export { javascript, stylesheet };
