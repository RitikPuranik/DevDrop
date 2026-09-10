"""
Structured JSON logging, mirroring the Node backend's Winston setup
(backend/src/shared/utils/logger.js): one JSON object per line, a constant
`service` field so log aggregation can tell the two services apart, level
driven by environment.
"""
import json
import logging
import sys
from datetime import datetime, timezone

from config import get_settings

SERVICE_NAME = "ai-service"

# Standard attributes every LogRecord carries — anything else on the record
# came from `extra={...}` in a logging call and should ride along in the
# JSON output (mirrors winston.format.splat()/metadata behavior).
_RESERVED_LOG_RECORD_KEYS = {
    "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
    "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
    "created", "msecs", "relativeCreated", "thread", "threadName",
    "processName", "process", "message", "taskName",
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
            "level": record.levelname.lower(),
            "message": record.getMessage(),
            "service": SERVICE_NAME,
            "logger": record.name,
        }
        if record.exc_info:
            payload["stack"] = self.formatException(record.exc_info)
        for key, value in record.__dict__.items():
            if key not in _RESERVED_LOG_RECORD_KEYS:
                payload.setdefault(key, value)
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    settings = get_settings()
    level = getattr(logging, settings.log_level.upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Without this, uvicorn's own loggers print their default (non-JSON)
    # lines alongside ours.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(name)
        uv_logger.handlers = [handler]
        uv_logger.propagate = False
