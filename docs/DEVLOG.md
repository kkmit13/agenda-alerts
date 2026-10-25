# Dev log

Short dated notes: what you built, what you decided, where AI tools helped. This feeds the AI-use disclosure and the "my contribution" part of the submission.

## 2026-10-11
- Repo created from starter.

## 2026-10-24
- Expanded coverage from Jersey Village + CFISD to any US address (Kelvin, using Claude Code / Claude Opus 5.5 as the AI coding assistant).
- `geo.py`: Census geocoder now returns the city or town, school district and county for any address or GPS location; no more coverage whitelist.
- `discover.py` (new): for places we don't scrape, Claude with web search finds the latest official agenda; our server downloads it and checks every number before marking an item verified.
- `/api/lookup` now matches stored items by `body_name` (it used to return every city's items for any city). New `/api/agenda` endpoint. Tax calculator accepts any rates.
- Frontend redesign: per-government cards that load in parallel, "Use my location", shareable `?q=` links, source links on every item, topic filter counts, mobile and dark mode. Unified the name to Agenda Alerts.
