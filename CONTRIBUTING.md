# Contributing to BillCheck Local

Thank you for improving BillCheck Local. Keep contributions limited to the
local, account-free runtime: SQLite storage, local attachments, the loopback Web
UI, local lifecycle commands, MCP tools, and their shared domain contracts.

Cloud hosting, remote authentication, hosted billing, private production
configuration, customer data, credentials, and operational runbooks do not
belong in this repository.

## License of contributions

By submitting a contribution, you agree that it is licensed under
**GNU Affero General Public License version 3 only (`AGPL-3.0-only`)**, the same
license as the project. Do not submit code that you do not have the right to
license on these terms.

## Before opening a change

Run:

```sh
npm ci
npm run build
npm test
npm run test:boundary
npm run test:package
```

Never commit receipts, personal data, access tokens, service-account files,
private endpoints, or generated local databases.
