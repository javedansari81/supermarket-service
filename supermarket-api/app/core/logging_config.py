"""
Application logging (stdout, collected by DigitalOcean App Platform Runtime Logs)
"""
import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

# India Standard Time (no daylight saving)
IST = timezone(timedelta(hours=5, minutes=30))


class RequestIdFilter(logging.Filter):
    """Attach the current request ID to every log record"""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    """Format each log record as a single JSON line"""

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "time": datetime.fromtimestamp(record.created, IST).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "message": record.getMessage(),
        }
        if record.exc_info:
            entry["traceback"] = self.formatException(record.exc_info)
        if record.stack_info:
            entry["stack"] = self.formatStack(record.stack_info)
        return json.dumps(entry, ensure_ascii=False, default=str)


def setup_logging(level: str = "INFO") -> None:
    """Configure the root logger to write to stdout"""
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())

    # Route uvicorn logs through the root handler
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers = []
        uvicorn_logger.propagate = True

    # Requests are logged by the request ID middleware
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
