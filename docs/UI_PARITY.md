# BillCheck Web UI parity

BillCheck Local deliberately uses the hosted BillCheck application's product
UI instead of a separate community-edition design.

## Shared product surface

The Local source under `src/ui` is based on the hosted application's React
views for:

- dashboard header, filters, totals, charts, and responsive cards;
- bottom navigation and floating assistant;
- receipt scan/manual entry, editing, list, filters, and detail view;
- category, collection, recurring-expense, budget, and Billspace dialogs;
- colors, spacing, typography scale, breakpoints, icons, and component states.

## Intentional Local substitutions

The UI shell stays the same while the platform boundary changes:

- authentication is replaced by an always-present local device user;
- the hosted data adapter is replaced by authenticated loopback RPC to SQLite;
- the Local edition exposes one Personal Billspace and no remote members;
- billing controls are absent because Local has no paid entitlement;
- receipt extraction and open-ended automation belong to the user's MCP agent;
- no hosted database, analytics, telemetry, or remote model is loaded.

When the hosted product UI changes, port the corresponding view changes into
`src/ui` and rerun the browser smoke test at desktop and 390 x 844 mobile sizes.
Do not introduce a separate Local visual language.
