"""Turn any US address (or lat/lon) into the local governments that serve it.

Uses the free US Census geocoder, which covers every state. For each address
we return up to three "bodies":
  - the city / town / village (or New England-style town) it sits in
  - the school district
  - the county (or parish / borough)
"""

import hashlib
import hmac
import os
import re

import requests

CENSUS = "https://geocoding.geo.census.gov/geocoder/geographies"
COMMON = {
    "benchmark": "Public_AR_Current",
    "vintage": "Current_Current",
    "layers": "all",
    "format": "json",
}

# Bodies we already scrape ourselves (fetcher.py + reader*.py). For these we
# serve the stored items and never call the AI search step.
# Key: (census name, state) -> body_name used in the agenda_items table.
SCRAPED_BODIES = {
    ("Jersey Village city", "TX"): "City of Jersey Village",
    ("Cypress-Fairbanks Independent School District", "TX"): "Cypress-Fairbanks ISD",
}

_SUFFIXES = {
    "city": "City of {}",
    "town": "Town of {}",
    "village": "Village of {}",
    "borough": "Borough of {}",
    "township": "Township of {}",
}


def _get(url, params):
    response = requests.get(url, params=params, timeout=15)
    response.raise_for_status()
    return response.json()


def _geocode_address(address):
    data = _get(f"{CENSUS}/onelineaddress", {**COMMON, "address": address})
    return data["result"]["addressMatches"]


def _first(geographies, layer):
    rows = geographies.get(layer) or []
    return rows[0] if rows else None


def _pretty_municipality(census_name):
    """'Jersey Village city' -> 'City of Jersey Village'."""
    for suffix, template in _SUFFIXES.items():
        if census_name.endswith(" " + suffix):
            return template.format(census_name[: -len(suffix) - 1])
    return census_name


def _short_district(name):
    return (
        name.replace("Independent School District", "ISD")
        .replace("Consolidated ISD", "CISD")
        .replace("Unified School District", "USD")
    )


def body_token(kind, name, state):
    """Signature so /api/agenda only runs for bodies our own lookup produced.
    Stops strangers from making us pay for AI searches on arbitrary text."""
    secret = os.getenv("TOKEN_SECRET") or os.getenv("ANTHROPIC_API_KEY") or "dev"
    msg = f"{kind}|{name}|{state}".encode()
    return hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()[:24]


def _body(kind, census_name, display, state, state_name):
    scraped = SCRAPED_BODIES.get((census_name, state))
    slug = re.sub(r"[^a-z0-9]+", "-", f"{state}-{kind}-{census_name}".lower()).strip("-")
    return {
        "key": slug,
        "kind": kind,  # "city", "school", "county"
        "name": census_name,
        "display_name": display,
        "state": state,
        "state_name": state_name,
        # body_name is what we store items under in the database
        "body_name": scraped or f"{display}, {state}",
        "scraped": bool(scraped),
        "token": body_token(kind, census_name, state),
    }


def bodies_from_geographies(geographies):
    state_row = _first(geographies, "States") or {}
    state = state_row.get("STUSAB") or ""
    state_name = state_row.get("NAME") or ""
    bodies = []

    place = _first(geographies, "Incorporated Places")
    if place:
        bodies.append(_body("city", place["NAME"], _pretty_municipality(place["NAME"]), state, state_name))
    else:
        # New England, NJ, PA, NY, MI, WI... towns/townships are real governments
        sub = _first(geographies, "County Subdivisions")
        if sub and not sub["NAME"].endswith(("CCD", "UT")) and " " in sub["NAME"]:
            bodies.append(_body("city", sub["NAME"], _pretty_municipality(sub["NAME"]), state, state_name))

    district = (
        _first(geographies, "Unified School Districts")
        or _first(geographies, "Elementary School Districts")
        or _first(geographies, "Secondary School Districts")
    )
    if district and "not defined" not in district["NAME"].lower():
        bodies.append(_body("school", district["NAME"], _short_district(district["NAME"]), state, state_name))

    county = _first(geographies, "Counties")
    if county:
        bodies.append(_body("county", county["NAME"], county["NAME"], state, state_name))

    return bodies, state, state_name


def lookup_address(address):
    matches = _geocode_address(address)

    # if not found, try dropping the street number as a fallback
    if not matches:
        parts = address.strip().split(" ")
        if len(parts) > 2:
            matches = _geocode_address(" ".join(parts[1:]))

    if not matches:
        return {"found": False, "reason": "We couldn't find that address. Try adding the city, state and ZIP code."}

    match = matches[0]
    bodies, state, state_name = bodies_from_geographies(match["geographies"])
    return {
        "found": True,
        "matched_address": match.get("matchedAddress"),
        "lat": match["coordinates"]["y"],
        "lon": match["coordinates"]["x"],
        "state": state,
        "state_name": state_name,
        "bodies": bodies,
    }


def lookup_coordinates(lat, lon):
    data = _get(f"{CENSUS}/coordinates", {**COMMON, "x": lon, "y": lat})
    geographies = data["result"]["geographies"]
    bodies, state, state_name = bodies_from_geographies(geographies)
    if not bodies:
        return {"found": False, "reason": "That location doesn't look like it's in the United States."}
    return {
        "found": True,
        "matched_address": None,
        "lat": lat,
        "lon": lon,
        "state": state,
        "state_name": state_name,
        "bodies": bodies,
    }


if __name__ == "__main__":
    for a in [
        "16327 Lakeview Dr Jersey Village TX",
        "1600 Smith St Houston TX",
        "9811 Huffmeister Rd Cypress TX 77095",
        "600 4th Ave Seattle WA 98104",
        "333 Washington St Brookline MA",
    ]:
        print("---", a)
        print(lookup_address(a))
