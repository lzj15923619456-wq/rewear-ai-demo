"""Require a server-side secret before any workflow HTTP execution."""
import hmac
import os


class WorkflowAuth:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or (scope.get("path") == "/health" and scope.get("method") == "GET"):
            return await self.app(scope, receive, send)
        secret = os.environ.get("REWEAR_API_TOKEN", "").strip()
        status = 503
        body = b'{"detail":"Workflow authentication is not configured"}'
        if secret:
            headers = [v for k, v in scope.get("headers", []) if k.lower() == b"authorization"]
            if len(headers) == 1 and hmac.compare_digest(headers[0], b"Bearer " + secret.encode("utf-8")):
                return await self.app(scope, receive, send)
            status = 401
            body = b'{"detail":"Unauthorized"}'
        await send({"type": "http.response.start", "status": status,
                    "headers": [(b"content-type", b"application/json"), (b"cache-control", b"no-store")]})
        await send({"type": "http.response.body", "body": body})
