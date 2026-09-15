# BillCheck Local

A local receipt workspace for people and their agents. One SQLite database,
original files on disk, a browser interface, and all 16 BillCheck MCP tools.
No account, cloud database, model API key, or telemetry is required.

The browser application uses the same React views, responsive layout, visual
tokens, navigation, receipt forms, charts, lists, details, and management
dialogs as the hosted BillCheck application. Local-only copy replaces account,
member, billing, and remote-AI actions without introducing a second UI design.

## Run from source

Requires Node.js **22.16 or later** (Node 24 recommended).

```sh
npm ci
npm run build
node dist/billcheck.mjs install
```

Open the printed browser address. It contains a local session secret; treat it
like access to your receipts. There is no user login. The server accepts only
loopback requests with the expected Host and Origin, and authenticated local
operations. Do not expose it through a reverse proxy or a public tunnel.

BillCheck Local is licensed under **GNU AGPL v3.0 only**; see [LICENSE](LICENSE).
Modified versions offered to users over a network must provide those users the
corresponding source as required by section 13 of the license.

For a privately supplied, verified release tarball, a one-command local install
works without publishing it first:

```sh
npm exec --package /absolute/path/billcheck-local-0.2.0.tgz -- billcheck-local install
```

Node.js must already be installed. npm is used here only as the local Node.js
dependency/build runner; this project is distributed through GitHub, not the
npm registry. `npm pack` generates a CycloneDX production
dependency SBOM and SHA-256 manifest inside the package; these are integrity and
inventory metadata, not a cryptographic publisher signature.

## Agent configuration

Use the absolute paths printed by `install`, for example:

```json
{
  "mcpServers": {
    "billcheck-local": {
      "command": "node",
      "args": ["/absolute/path/to/installed/billcheck.mjs", "mcp"]
    }
  }
}
```

The MCP entry starts the local daemon if needed. Multiple agents and the UI
share its SQLite connection. stdout carries MCP only; diagnostics use stderr.
List workspaces first and use the returned `local` ID. Updates and deletions
require the current record version. Agents supply their own OCR/model.

## Data and lifecycle

- Windows: `%LOCALAPPDATA%/BillCheck Local`
- macOS: `~/Library/Application Support/BillCheck Local`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/billcheck`

Every command accepts `--data-dir <directory>`. Never share one directory
between users or place it on a network drive. Symlink data paths are rejected.

```sh
node dist/billcheck.mjs status
node dist/billcheck.mjs open
node dist/billcheck.mjs backup
node dist/billcheck.mjs doctor
node dist/billcheck.mjs stop
node dist/billcheck.mjs restore /path/to/backup --data-dir /path/to/new-data
node dist/billcheck.mjs import /path/to/legacy.json --workspace personal
```

Restore validates hashes before copying into a new directory, retaining the
old data. Legacy import requires an empty Billspace and an explicitly selected
source workspace (maximum 1.9 MB per import). Embedded original files are
imported; remote attachment URLs are rejected because local operation must not
silently depend on cloud storage. Backup includes all referenced originals.
Deleting a receipt detaches its file; unreferenced files are retained for now.

There is no automatic launch-at-login registration yet. After reboot, run
`start` or connect an MCP client. `uninstall` stops the daemon and preserves
data; source/package removal is separate. Installation copies a checksum-verified
standalone bundle into a versioned directory, so the daemon does not depend on
the original checkout or a temporary npm cache. To upgrade, obtain the new
package and run `node dist/billcheck.mjs upgrade` (published equivalent:
`npx billcheck-local@latest upgrade`). A running daemon is backed up and stopped
first; previous release files remain available for rollback.

## Current boundaries

- The UI shows up to 500 receipts; date-range summaries cover the entire history.
- MCP attachment inputs retain the existing 900,000-character data URL limit.
  The browser accepts JPEG, PNG, and WebP source images up to 8 MB and compresses
  them before storage. Archives contain at most 100 selected originals.
- Currency totals stay separate and use decimal arithmetic. The repository
  stores canonical decimal text instead of binary floating-point amounts.
- SQLite uses WAL, FULL synchronization, transactions, and version checks.
- The current migration uses indexed JSON records plus a separate attachment
  table; this retains the full shared domain contract without duplicating it
  into divergent per-field schemas. No existing cloud data is migrated.
- Cross-platform tests are configured in CI. Local execution is verified on
  Windows; macOS/Linux and a public clean-machine installation still need CI.

## Source, development and contributions

The canonical public source is
[github.com/zhen1991-ch/bill-check](https://github.com/zhen1991-ch/bill-check).
Run `npm test`, `npm run build`, and `npm run test:boundary` before submitting a
change. Contributions are accepted under the same AGPL-3.0-only license; see
[CONTRIBUTING.md](CONTRIBUTING.md).
