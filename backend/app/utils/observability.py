"""
52e: Observability — structured logging for Changes 44, 46, 48
"""
import logging
from datetime import datetime, timezone

logger = logging.getLogger("cuidau.observability")
logger.setLevel(logging.INFO)

_event_log = []

def log_event(change: str, event: str, details: dict = None):
    entry = {
        "change": change, "event": event,
        "details": details or {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _event_log.append(entry)
    if len(_event_log) > 500:
        _event_log.pop(0)
    logger.info(f"[{change}] {event}: {details}")
    return entry

def get_recent_events(limit=100):
    return _event_log[-limit:]