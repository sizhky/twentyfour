# fasthtml solveit
import json
import os
import re
import random
from datetime import datetime
from typing import Any, Literal
from urllib import error as urllib_error
from urllib import request as urllib_request

import logfire
from dotenv import load_dotenv
from pydantic_ai import Agent, RunContext
from pylogue.shell import app_factory
from pylogue.integrations.pydantic_ai import PydanticAIResponder

load_dotenv(override=True)

logfire.configure(
    environment="development",
    service_name="pylogue-haiku-example",
)
logfire.instrument_pydantic_ai()

instructions = """
You talk as little as you can, while being helpful
When a question needs planning/retrospect data, call clock_read first.
Use where.labelContains for fuzzy matching (example: "sleep") unless exact label is requested.
If the user says "today", "yesterday", or "tomorrow", call today_context first and use its absolute date.
For any relative-time phrasing (for example: "last 10 mins", "last few minutes", "just now", "a few minutes ago"), call today_context first to get the latest current time, then compute start/end from that.
Do not guess "now" from prior turns for relative-time tasks; always refresh with today_context immediately before clock_create/clock_update.
Valid mode values are only "plan" and "retrospect". Never invent or transform mode names.
If user says phrases like "mark the last few min" or "I just did X in the last few min", treat it as an implicit retrospect logging request.
The app supports only one task per time slot. If user mentions multiple things in the same slot, combine them into one task entry (single label/notes), not multiple created tasks.
"""

agent = Agent(
    # "google-gla:gemini-2.5-flash-lite",
    # "openai:gpt-5-nano-2025-08-07",
    "openai:gpt-5-nano",
    instructions=instructions,
)
deps = None


def _date_or_today(value: str | None) -> str:
    if value is None or not value.strip():
        return datetime.now().astimezone().date().isoformat()
    text = value.strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        raise ValueError("date must be YYYY-MM-DD (or omit it to default to today)")
    return text


def _clock_api(payload: dict[str, Any]) -> dict[str, Any]:
    base = os.getenv("TWENTYFOUR_CLOCK_API_BASE", "http://127.0.0.1:5173").rstrip("/")
    req = urllib_request.Request(
        f"{base}/api/vault/crud",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib_request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if isinstance(data, dict) and data.get("ok") is False:
                print("[clock_api] tool error response:", json.dumps(data, indent=2, default=str))
            return data
    except urllib_error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        err = {"ok": False, "error": f"HTTP {exc.code}", "body": body, "payload": payload}
        print("[clock_api] HTTP error:", json.dumps(err, indent=2, default=str))
        return err
    except Exception as exc:
        err = {"ok": False, "error": str(exc), "payload": payload}
        print("[clock_api] unexpected error:", json.dumps(err, indent=2, default=str))
        return err

@agent.tool
def inspect_user_context(ctx: RunContext[Any], purpose: str = "verifying user context"):
    """Inspect runtime deps and return the authenticated user payload from Pylogue."""
    deps_obj = ctx.deps
    if isinstance(deps_obj, dict):
        user = deps_obj.get("pylogue_user")
    else:
        user = getattr(deps_obj, "pylogue_user", None)
    if not isinstance(user, dict):
        return {
            "ok": False,
            "message": "No pylogue_user found in ctx.deps",
            "session_sig": f"haiku-{random.randint(1000, 9999)}",
        }
    return {
        "ok": True,
        "name": user.get("display_name") or user.get("name"),
        "email": user.get("email"),
        "provider": user.get("provider"),
        "session_sig": f"haiku-{random.randint(1000, 9999)}",
    }


@agent.tool
def today_context(ctx: RunContext[Any]):
    """Return current local date/time context so date-based questions are grounded."""
    now = datetime.now().astimezone()
    return {
        "today": now.date().isoformat(),
        "now_iso": now.isoformat(timespec="seconds"),
        "timezone": str(now.tzinfo),
    }


@agent.tool
def clock_read(
    ctx: RunContext[Any],
    mode: Literal["plan", "retrospect"],
    from_date: str | None = None,
    to_date: str | None = None,
    label: str | None = None,
    label_contains: str | None = None,
):
    """Read plan/retrospect slots for a date or date range."""
    where: dict[str, Any] = {}
    if label:
        where["label"] = label
    if label_contains:
        where["labelContains"] = label_contains
    payload: dict[str, Any] = {"action": "read", "mode": mode, "fromDate": _date_or_today(from_date)}
    if to_date:
        payload["toDate"] = _date_or_today(to_date)
    if where:
        payload["where"] = where
    return _clock_api(payload)


@agent.tool
def clock_create(
    ctx: RunContext[Any],
    mode: Literal["plan", "retrospect"],
    start_time: str,
    end_time: str,
    label: str,
    notes: str = "",
    date: str | None = None,
):
    """Create one slot on the requested day and mode using HH:MM strings."""
    def to_minute(value: str, field: str) -> int:
        try:
            hour_s, minute_s = value.split(":", 1)
            hour = int(hour_s)
            minute = int(minute_s)
        except Exception as exc:
            raise ValueError(f"{field} must be HH:MM") from exc
        if not (0 <= hour <= 23):
            raise ValueError(f"{field} hour must be in 0..23")
        if not (0 <= minute <= 59):
            raise ValueError(f"{field} minute must be in 0..59")
        return hour * 60 + minute

    start = to_minute(start_time, "start_time")
    end = to_minute(end_time, "end_time")
    return _clock_api(
        {
            "action": "create",
            "mode": mode,
            "date": _date_or_today(date),
            "slots": [
                {
                    "startMinute": start,
                    "endMinute": end,
                    "label": label,
                    "notes": notes,
                }
            ],
        }
    )


@agent.tool
def clock_update(
    ctx: RunContext[Any],
    mode: Literal["plan", "retrospect"],
    date: str | None = None,
    where_label: str | None = None,
    where_label_contains: str | None = None,
    patch_label: str | None = None,
    patch_notes: str | None = None,
    limit: int = 1,
):
    """Update matching slots (for example rename a planned task)."""
    where: dict[str, Any] = {}
    patch: dict[str, Any] = {}
    if where_label:
        where["label"] = where_label
    if where_label_contains:
        where["labelContains"] = where_label_contains
    if patch_label is not None:
        patch["label"] = patch_label
    if patch_notes is not None:
        patch["notes"] = patch_notes
    return _clock_api({"action": "update", "mode": mode, "date": _date_or_today(date), "where": where, "patch": patch, "limit": limit})


@agent.tool
def clock_delete(
    ctx: RunContext[Any],
    mode: Literal["plan", "retrospect"],
    date: str | None = None,
    where_label: str | None = None,
    where_label_contains: str | None = None,
    limit: int = 1,
):
    """Delete matching slots."""
    where: dict[str, Any] = {}
    if where_label:
        where["label"] = where_label
    if where_label_contains:
        where["labelContains"] = where_label_contains
    return _clock_api({"action": "delete", "mode": mode, "date": _date_or_today(date), "where": where, "limit": limit})


def _app_factory():
    return app_factory(
        responder_factory=lambda: PydanticAIResponder(
            agent=agent,
            agent_deps=deps,
            show_tool_details=True,
        ),
        hero_title="Planning and Retrospect Assistant",
        hero_subtitle="An assistant that helps you plan your day and reflect on it at the end of the day.",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "scripts.twentyfour:_app_factory",
        host="0.0.0.0",
        port=5004,
        reload=True,
        factory=True,
    )
