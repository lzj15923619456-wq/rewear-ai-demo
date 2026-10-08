import asyncio
import ast
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "coze"))
from auth_guard import WorkflowAuth
from output_guard import parse_model_result


class OutputTests(unittest.TestCase):
    request = {"action": "analyze", "requestId": "trusted-request", "itemId": "trusted-item"}
    result = {"status": "needs_confirmation", "attributes": {"slot": "upper", "colors": ["黑色"]}}

    def test_valid_json_and_message_blocks(self):
        raw = json.dumps(self.result)
        for value in (raw, "```json\n" + raw + "\n```", [{"type": "text", "text": raw}]):
            result = parse_model_result(value, self.request)
            self.assertEqual(result["itemId"], "trusted-item")
            self.assertEqual(result["requestId"], "trusted-request")

    def test_invalid_json_and_shapes_are_rejected(self):
        for raw in ('{"status":None}', '{"status":NaN}', '{"status":', '[]',
                    '{"status":"confirmed"}', '{"status":"needs_confirmation","attributes":null}',
                    json.dumps({"status": "needs_confirmation", "attributes": {"slot": "upper", "colors": "黑色"}})):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_model_result(raw, self.request)
        with self.assertRaises(ValueError):
            parse_model_result('{"status":"completed","outfits":{}}', {"action": "recommend", "requestId": "r"})
        with self.assertRaises(ValueError):
            parse_model_result('{"status":"completed","answer":" "}', {"action": "answer", "requestId": "r"})

    def test_invalid_model_output_is_a_business_error(self):
        graph = ast.parse((Path(__file__).resolve().parents[1] / "coze/graph.py").read_text(encoding="utf-8"))
        node = next(n for n in graph.body if isinstance(n, ast.FunctionDef) and n.name == "call_model")
        node.returns = None
        for arg in node.args.args:
            arg.annotation = None
        class Client:
            calls = 0
            def __init__(self, **kwargs): pass
            def invoke(self, **kwargs):
                Client.calls += 1
                return type("Response", (), {"content": '{"attributes":None}'})()
        env = {"json": json, "parse_model_result": parse_model_result, "LLMClient": Client,
               "SystemMessage": lambda **kw: kw, "HumanMessage": lambda **kw: kw, "VISION": "", "STYLIST": ""}
        exec(compile(ast.Module(body=[node], type_ignores=[]), "call_model", "exec"), env)
        result = env["call_model"](type("State", (), {"payload": {**self.request, "imageUrl": "unit-test-image"}})(), None,
                                   type("Runtime", (), {"context": None})())["result"]
        self.assertEqual(Client.calls, 1)
        self.assertEqual(result["warnings"], ["invalid_model_output"])
        self.assertEqual(result["status"], "error")


class AuthTests(unittest.TestCase):
    def invoke(self, path="/run", headers=(), secret="unit-test-secret", method="POST"):
        events, calls = [], []
        async def app(scope, receive, send):
            calls.append(scope["path"])
            await send({"type": "http.response.start", "status": 200})
        async def send(event): events.append(event)
        async def receive(): return {"type": "http.request", "body": b""}
        with patch.dict(os.environ, {"REWEAR_API_TOKEN": secret}):
            asyncio.run(WorkflowAuth(app)({"type": "http", "path": path, "method": method,
                                          "headers": list(headers)}, receive, send))
        return events[0]["status"], calls

    def test_all_execution_routes_reject_missing_and_wrong_tokens(self):
        for path in ("/run", "/stream_run", "/node_run/a", "/async_run", "/task/a", "/cancel/a", "/v1/chat/completions"):
            for headers in ((), ((b"authorization", b"Bearer wrong"),)):
                with self.subTest(path=path):
                    self.assertEqual(self.invoke(path, headers), (401, []))

    def test_correct_token_health_and_fail_closed(self):
        self.assertEqual(self.invoke(headers=((b"authorization", b"Bearer unit-test-secret"),)), (200, ["/run"]))
        self.assertEqual(self.invoke(secret=""), (503, []))
        self.assertEqual(self.invoke("/health", secret="", method="GET"), (200, ["/health"]))
        self.assertEqual(self.invoke(headers=((b"authorization", b"Bearer unit-test-secret"),) * 2), (401, []))


if __name__ == "__main__":
    unittest.main()
