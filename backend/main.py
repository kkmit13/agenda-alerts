"""Agenda Alerts backend.

Run from inside the backend/ folder:
    uvicorn main:app --reload --port 8000

Then open http://localhost:8000/docs to try every endpoint in the browser.
"""

import datetime
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import db
from discover import discover_agenda
from geo import _body, body_token, lookup_address, lookup_coordinates

load_dotenv()

app = FastAPI(title="Agenda Alerts API")

origins = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

STALE_AFTER_DAYS = 21

# Where our own scrapers get their agendas, so old rows can link to a source.
SCRAPED_SOURCES = {
    "City of Jersey Village": "https://www.jerseyvillage.gov/AgendaCenter",
    "Cypress-Fairbanks ISD": "https://manuals.boardbook.org/Public/Organization/668",
}


def _amounts(value):
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value or "[]")
        return parsed if isinstance(parsed, list) else [str(parsed)]
    except (TypeError, ValueError):
        return [str(value)]


def _date_or_none(value):
    try:
        return datetime.date.fromisoformat(str(value)[:10]).isoformat()
    except ValueError:
        return None


def _normalize_row(row):
    """Turn a database row into the shape the frontend expects (see docs/CONTRACT.md)."""
    filename = row.get("filename") or ""
    body_name = row.get("body_name")
    if filename.startswith("http"):
        source_url = filename
    elif body_name == "City of Jersey Village" and filename:
        source_url = f"https://www.jerseyvillage.gov/AgendaCenter/ViewFile/Agenda/{filename.removesuffix('.pdf')}"
    else:
        source_url = SCRAPED_SOURCES.get(body_name)
    return {
        "id": row.get("id"),
        "body_name": body_name,
        "item_number": row.get("item_number"),
        "meeting_date": _date_or_none(row.get("meeting_date")),
        "category": row.get("category") or "other",
        "title_original": row.get("title_original"),
        "plain_summary": row.get("plain_summary"),
        "amounts": _amounts(row.get("amounts")),
        "action_required": bool(row.get("action_required")),
        "verified": bool(row.get("verified")),
        "source_url": source_url,
    }


def _sorted(items):
    return sorted(items, key=lambda i: i["meeting_date"] or "", reverse=True)


def _is_fresh(items):
    dates = [i["meeting_date"] for i in items if i["meeting_date"]]
    if not dates:
        return False
    newest = datetime.date.fromisoformat(max(dates))
    return (datetime.date.today() - newest).days <= STALE_AFTER_DAYS


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/items")
def list_items(body: str | None = None):
    client = db.get_client()
    if client is None:
        return []
    query = client.table("agenda_items").select("*")
    if body:
        query = query.eq("body", body)
    return [_normalize_row(r) for r in query.execute().data]


@app.get("/api/lookup")
def lookup(address: str | None = None, lat: float | None = None, lon: float | None = None):
    """Find the city, school district and county for a US address (or lat/lon),
    plus any agenda items we already have stored for them."""
    try:
        if lat is not None and lon is not None:
            geo = lookup_coordinates(lat, lon)
        elif address and address.strip():
            geo = lookup_address(address.strip())
        else:
            raise HTTPException(400, "Give an address, or lat and lon")
    except HTTPException:
        raise
    except Exception as e:
        print("Geocoder failed:", e)
        raise HTTPException(502, "The address lookup service is not responding. Please try again.")

    if not geo["found"]:
        return {"found": False, "reason": geo["reason"], "bodies": []}

    for body in geo["bodies"]:
        items = _sorted([_normalize_row(r) for r in db.items_for_body(body["body_name"])])
        body["items"] = items
        # Our own scraped bodies are always "ready". Others need a fresh AI search
        # if we have nothing stored or only old meetings.
        body["needs_discovery"] = not body["scraped"] and not _is_fresh(items)
        if items:
            body["source_url"] = items[0]["source_url"]
    return geo


class AgendaRequest(BaseModel):
    kind: str
    name: str
    display_name: str
    state: str
    state_name: str
    token: str


@app.post("/api/agenda")
def agenda(req: AgendaRequest):
    """Search the web for this body's latest agenda and summarize it (slow: ~20-60s)."""
    if req.kind not in ("city", "school", "county"):
        raise HTTPException(400, "Unknown kind")
    if not hmac.compare_digest(req.token, body_token(req.kind, req.name, req.state)):
        raise HTTPException(403, "Invalid token. Look up the address again.")

    body = _body(req.kind, req.name, req.display_name, req.state, req.state_name)
    result = discover_agenda(body, datetime.date.today().isoformat())
    if result["items"]:
        db.save_discovered(body, result)

    source_url = result.get("agenda_url") or result.get("portal_url")
    for item in result["items"]:
        item["meeting_date"] = _date_or_none(result.get("meeting_date"))
        item["source_url"] = source_url
        item["body_name"] = body["body_name"]
        item["id"] = f"{body['key']}-{item['item_number']}"
    return {**result, "items": _sorted(result["items"])}


# CFISD numbers, used when no rates are given (keeps the original demo working)
CFISD = {"current_rate": 1.0869, "proposed_rate": 1.0669, "label_current": "2024", "label_proposed": "2025"}


class TaxImpactRequest(BaseModel):
    home_value: float = Field(gt=0, description="Appraised home value in dollars")
    over_65: bool = Field(default=False, description="Over 65 or disabled (CFISD preset only)")
    exemption: float | None = Field(default=None, ge=0, description="Dollar exemption. Leave empty for the CFISD homestead formula")
    current_rate: float | None = Field(default=None, ge=0)
    proposed_rate: float | None = Field(default=None, ge=0)
    rate_unit: str = Field(default="per100", description="per100 (Texas style), mills (per $1,000) or percent")


@app.post("/api/tax-impact")
def tax_impact(req: TaxImpactRequest):
    preset = req.current_rate is None or req.proposed_rate is None
    current_rate = CFISD["current_rate"] if preset else req.current_rate
    proposed_rate = CFISD["proposed_rate"] if preset else req.proposed_rate

    if req.exemption is not None:
        exemption = req.exemption
    elif preset:
        # CFISD homestead exemption: 20% of value + $140,000 flat, +$75,000 if 65+/disabled
        exemption = req.home_value * 0.20 + 140000 + (75000 if req.over_65 else 0)
    else:
        exemption = 0

    taxable_value = max(req.home_value - exemption, 0)
    divisor = {"per100": 100, "mills": 1000, "percent": 100}.get(req.rate_unit)
    if divisor is None:
        raise HTTPException(400, "rate_unit must be per100, mills or percent")

    current_bill = taxable_value / divisor * current_rate
    proposed_bill = taxable_value / divisor * proposed_rate

    return {
        "home_value": req.home_value,
        "exemption": round(exemption, 2),
        "taxable_value": round(taxable_value, 2),
        "current_rate": current_rate,
        "proposed_rate": proposed_rate,
        "current_bill": round(current_bill, 2),
        "proposed_bill": round(proposed_bill, 2),
        "difference": round(proposed_bill - current_bill, 2),
        "label_current": CFISD["label_current"] if preset else "Current rate",
        "label_proposed": CFISD["label_proposed"] if preset else "Proposed rate",
        "note": (
            "Estimate for CFISD school tax only (2024 vs 2025 rates). Does not include city, county, or other taxing units."
            if preset
            else "Estimate for this one taxing unit only, using the rates you entered. Check your appraisal notice for exact exemptions."
        ),
    }
