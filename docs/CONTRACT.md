# Data contract

This is the agreed shape of the data. Backend produces it, frontend consumes it. If you want to change it, tell everyone first and update this file in the same pull request.

## Agenda item

One decision on one agenda, already translated into plain language.

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Unique id, e.g. `isd-2026-11-10-04` |
| `body` | `"isd"` or `"city"` | Which kind of government body |
| `body_name` | string | Full name of the board or council |
| `meeting_date` | string `YYYY-MM-DD` | When it meets |
| `category` | `tax_rate`, `zoning`, `school_policy`, `budget`, `other` | Used for filtering and alerts |
| `title_original` | string | Item title exactly as printed on the agenda |
| `plain_summary` | string | Plain-English explanation. Every number in it must appear in the source text |
| `amounts` | list | Dollar amounts and rates found in the item (see below) |
| `location` | object or `null` | `address`, `lat`, `lon` when the item concerns a place |
| `source` | object | `url`, `page`, and `quote` (the exact line from the agenda) |
| `verified` | boolean | `true` only if the number check passed |
| `sample` | boolean | `true` on fake demo data. Real data omits it |

Each entry in `amounts`: `label`, `value`, `unit`, `source_quote`.

## Endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Is the server alive |
| `GET /api/items` | All stored agenda items. Optional `?body=isd` or `?body=city` |
| `GET /api/lookup?address=...` (or `?lat=..&lon=..`) | Works for any US address. Returns `found`, `matched_address`, `state`, and `bodies`: the city/town, school district and county, each with `kind`, `display_name`, `body_name`, `scraped`, `token`, stored `items`, and `needs_discovery` |
| `POST /api/agenda` | Body: one body from `/api/lookup` (`kind`, `name`, `display_name`, `state`, `state_name`, `token`). Searches the web for its latest agenda with Claude, then downloads the agenda and checks every number. Slow (20-60 s). Returns `status` (`ok`, `not_found`, `error`), `meeting_date`, `agenda_url`, `portal_url`, `items` |
| `POST /api/tax-impact` | Body: `home_value`, optional `over_65`. Optional `current_rate`, `proposed_rate`, `exemption`, `rate_unit` (`per100`, `mills`, `percent`). Without rates it uses the CFISD 2024 vs 2025 preset. Returns `taxable_value`, `current_bill`, `proposed_bill`, `difference`, labels and a `note` |

Items returned by the API also carry `item_number`, `source_url` (link to the original agenda) and `verified`.

`verified` means every number in `plain_summary` was found in the downloaded agenda text. Items whose agenda we could not download (some portals need JavaScript) come back with `verified: false`, and the site tells people to confirm in the original.

## Where data comes from

- **Scraped bodies** (`geo.SCRAPED_BODIES`): Jersey Village city council and CFISD, fetched by `fetcher.py` and summarized by `reader*.py`. Never searched by AI.
- **Everywhere else**: `discover.py` on demand, cached in the `agenda_items` table (agenda URL stored in `filename`). A body is searched again when its newest stored meeting is more than 21 days old.

## Coming next (not built yet)

- `POST /api/subscribe` email alerts for an address
