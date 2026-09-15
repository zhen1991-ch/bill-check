# BillCheck public/private release boundary

## Decision

`BillCheck-Community` is the only public source and npm release unit for the
open-source edition. It is AGPL-3.0-only licensed and contains the local SQLite
runtime, local Web UI, local attachment storage, the 16-tool MCP server and the
shared domain contract required by those components.

The hosted Web app, Mobile cloud client, remote MCP Worker, Cloud Backend,
Stripe integration, Firebase configuration, production migrations and
operational runbooks remain outside the public package. They may move to
separate repositories later, but they must never be added to the Community npm
tarball or its Git history as part of a release shortcut.

## Enforced package surface

The npm package uses an explicit `files` allowlist:

- `dist/`
- `README.md`
- `LICENSE`
- `NOTICE`
- `package.json` (always included by npm)

The generated `dist/` contains only the Local CLI/runtime, SQLite repository,
Web UI, MCP server, shared domain declarations, checksums and CycloneDX SBOM.
No authentication is required and the runtime does not call Stripe, Firebase,
Firestore or a BillCheck Cloud API.

`npm run test:boundary` checks the license, allowlist, dependency names and both
source and generated code for forbidden Cloud coupling. The cross-platform CI
executes it after every build and before packaging.

The Local Web UI prominently links to the canonical public source. A modified
network-interactive version must continue to offer its corresponding source to
remote users as required by AGPL-3.0-only section 13.

## Release procedure

1. Build and test inside a clean checkout of `BillCheck-Community` only.
2. Run `npm run test:boundary`, lifecycle smoke, release metadata generation and
   installed-tarball smoke.
3. Inspect `npm pack --dry-run --json`; the current expected package has 31
   files and no bundled dependencies.
4. Scan the complete public Git history for credentials and private Cloud code.
5. Publish the Community repository and npm package only after the owner
   approves the exact destinations. Do not push the private repositories as a
   side effect of publishing Local.

## Legal boundary

AGPL-3.0-only selection, LICENSE, NOTICE and SBOM are implemented. This technical
boundary does not replace counsel review of third-party notices, contribution
policy, trademarks, privacy terms or consumer/tax obligations.
