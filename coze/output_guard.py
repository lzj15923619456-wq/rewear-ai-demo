"""Strict parsing of model output; never repair or execute model text."""
import json


def parse_model_result(raw, request):
    if isinstance(raw, list):
        raw = "".join(v if isinstance(v, str) else v.get("text", "")
                      for v in raw if isinstance(v, (str, dict)))
    if not isinstance(raw, str):
        raise ValueError("Model output must be text")
    raw = raw.strip()
    if raw.startswith("```") and raw.endswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    def reject_constant(value):
        raise ValueError("Non-finite JSON value")
    result = json.loads(raw, parse_constant=reject_constant)
    if not isinstance(result, dict):
        raise ValueError("Model output must be an object")
    if not isinstance(result.get("warnings", []), list):
        raise ValueError("Invalid warnings")
    action = request["action"]
    status = result.get("status")
    if action == "analyze":
        if status not in ("needs_confirmation", "invalid_image"):
            raise ValueError("Invalid analysis status")
        if status == "needs_confirmation":
            attributes = result.get("attributes")
            if not isinstance(attributes, dict) or attributes.get("slot") not in ("upper", "bottom", "shoes"):
                raise ValueError("Invalid garment category")
            if not isinstance(attributes.get("colors"), list):
                raise ValueError("Invalid colors")
        result["itemId"] = request["itemId"]
    elif action == "inspect_references":
        if status not in ("completed", "insufficient_references") or not isinstance(result.get("references"), list):
            raise ValueError("Invalid reference analysis")
    elif action == "answer":
        if status != "completed" or not isinstance(result.get("answer"), str) or not result["answer"].strip():
            raise ValueError("Missing answer")
    elif status not in ("completed", "needs_confirmation", "insufficient_references") or not isinstance(result.get("outfits"), list):
        raise ValueError("Invalid outfits")
    result.update(schemaVersion=1, requestId=request["requestId"])
    return result
