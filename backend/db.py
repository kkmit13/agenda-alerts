import json
import os

from dotenv import load_dotenv

load_dotenv()

_client = None


def get_client():
    """Create the Supabase client on first use, so the API still starts
    (and the AI search still works) if Supabase isn't configured."""
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if not url or not key:
            return None
        from supabase import create_client

        _client = create_client(url, key)
    return _client


def save_item(item, filename, body="city", body_name="City of Jersey Village"):
    data = {
        "id": filename + "-" + item["item_number"],
        "body": body,
        "body_name": body_name,
        "meeting_date": item.get("meeting_date") or filename,
        "item_number": item["item_number"],
        "plain_summary": item.get("plain_summary", ""),
        "category": item.get("category", "other"),
        "amounts": json.dumps(item.get("amounts", [])),
        "action_required": item.get("action_required", False),
        "verified": item["verified"],
        "filename": filename,
    }
    return get_client().table("agenda_items").upsert(data).execute()


def items_for_body(body_name):
    client = get_client()
    if client is None:
        return []
    try:
        return client.table("agenda_items").select("*").eq("body_name", body_name).execute().data
    except Exception as e:  # keep the site up even if the DB hiccups
        print("Supabase read failed:", e)
        return []


def save_discovered(body, result):
    """Cache items the AI search found. Uses the existing agenda_items
    columns only; the agenda URL goes in `filename`."""
    client = get_client()
    if client is None or not result.get("items"):
        return
    rows = []
    date = result.get("meeting_date") or "unknown-date"
    for item in result["items"]:
        rows.append({
            "id": f"{body['key']}-{date}-{item['item_number']}"[:200],
            "body": body["kind"] if body["kind"] != "school" else "isd",
            "body_name": body["body_name"],
            "meeting_date": result.get("meeting_date"),
            "item_number": item["item_number"],
            "plain_summary": item["plain_summary"],
            "category": item["category"],
            "amounts": json.dumps(item["amounts"]),
            "action_required": item["action_required"],
            "verified": item["verified"],
            "filename": result.get("agenda_url") or result.get("portal_url") or "",
        })
    try:
        client.table("agenda_items").upsert(rows).execute()
    except Exception as e:
        print("Supabase write failed:", e)
