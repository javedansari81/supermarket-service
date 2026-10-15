"""
Application logging (stdout, collected by DigitalOcean App Platform Runtime Logs)
"""
import logging
import sys
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class RequestIdFilter(logging.Filter):
    """Attach the current request ID to every log record"""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def setup_logging(level: str = "INFO") -> None:
    """Configure the root logger to write to stdout"""
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s"
    ))

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())

    # Requests are logged by the request ID middleware
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
