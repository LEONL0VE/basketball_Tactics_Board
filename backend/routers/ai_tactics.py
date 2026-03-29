"""
AI-powered semantic tactic search & recommendation.

Architecture: Single-Call Context Injection
- Injects the full tactic catalog (~38 items) into a single Gemini prompt
- Gemini handles intent extraction, matching, AND reason generation in one call
- Reduces latency from ~5s (two calls) to ~2s (one call)
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os
import json
import time
import re
import httpx

router = APIRouter(prefix="/api/tactics", tags=["AI Tactics Search"])

GEMINI_MODEL = "gemini-3-flash-preview"
GEMINI_URL_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent?key={key}"
)

# --- Data directory ---
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
TACTICS_DIR = os.path.join(DATA_DIR, "tactics")


# --- Request / Response models ---

class AISearchRequest(BaseModel):
    query: str


class TacticResult(BaseModel):
    tactic_id: str
    name: str
    category: str
    sub_category: Optional[str] = None
    description: str
    tags: List[str] = []
    reason: str  # AI-generated query-aligned explanation
    preview_image: Optional[str] = None


class AISearchResponse(BaseModel):
    results: List[TacticResult]
    query: str
    message: Optional[str] = None  # e.g. "No relevant tactics found"


# --- Helpers ---

def load_tactic_catalog() -> List[dict]:
    """Load all tactics and build a lightweight catalog for the AI prompt."""
    catalog = []
    if not os.path.exists(TACTICS_DIR):
        return catalog

    for filename in os.listdir(TACTICS_DIR):
        if not filename.endswith(".json"):
            continue
        filepath = os.path.join(TACTICS_DIR, filename)
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)

            tactic_id = data.get("id", filename.replace(".json", ""))
            catalog.append({
                "id": tactic_id,
                "name": data.get("name", "Untitled"),
                "category": data.get("category", "Other"),
                "sub_category": data.get("sub_category", ""),
                "description": data.get("description", "")[:300],  # Trim long descriptions
                "tags": data.get("tags", []),
                "preview_image": data.get("preview_image", None),
            })
        except Exception as e:
            print(f"[AI Tactics] Error loading {filename}: {e}")

    return catalog


def build_search_prompt(query: str, catalog: List[dict]) -> str:
    """Build the single-call Gemini prompt with full tactic catalog."""

    catalog_json = json.dumps([
        {
            "id": t["id"],
            "name": t["name"],
            "category": t["category"],
            "sub_category": t.get("sub_category", ""),
            "tags": t["tags"],
            "description": (t["description"] or "")[:100],  # Trim to reduce token count
        }
        for t in catalog
    ], ensure_ascii=False)

    prompt = f"""You are an expert basketball coach analyzing tactics for the HoopsLens Tactics Board.

A user is searching for basketball tactics. Your job is to find the best matches from our database and explain WHY each one aligns with the user's specific request.

USER QUERY: "{query}"

TACTIC DATABASE ({len(catalog)} tactics):
{catalog_json}

RULES:
- Return the top 6 most relevant tactics as a JSON array, sorted by relevance.
- If the query is unrelated to basketball, return [].
- Each "reason" MUST directly reference the user's query wording and map it to concrete tactic properties (tags, play style, structure). This is critical — do NOT write generic definitions.

EXAMPLE of a good reason (for query "motion offense with lots of cutting"):
  "Directly matches your request for 'cutting' via its #Cut and #Off_Screen actions within a read-and-react motion framework."

EXAMPLE of a bad reason (generic definition):
  "Princeton Offense is a disciplined system emphasizing ball movement."

Return ONLY valid JSON:
[
  {{
    "tactic_id": "the-uuid-id",
    "reason": "Query-aligned explanation referencing user's terms (1-2 sentences max)"
  }}
]

If nothing matches, return: []"""

    return prompt


def _extract_text_from_gemini(data: dict) -> str:
    """Extract text content from Gemini API response."""
    candidates = data.get("candidates", [])
    if not candidates:
        raise ValueError("Gemini returned no candidates")
    candidate0 = candidates[0] or {}
    parts = candidate0.get("content", {}).get("parts", []) or []
    text_chunks = [p.get("text", "") for p in parts if isinstance(p, dict) and p.get("text")]
    if not text_chunks:
        finish_reason = candidate0.get("finishReason", "UNKNOWN")
        raise ValueError(f"Gemini returned empty parts (finishReason={finish_reason})")
    return "\n".join(text_chunks).strip()


def _parse_json_response(text: str) -> list:
    """Robustly parse JSON from Gemini response, handling markdown code blocks."""
    # Strip markdown code fences
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = "\n".join(cleaned.split("\n")[1:])
        if "```" in cleaned:
            cleaned = cleaned[:cleaned.rfind("```")]
    cleaned = cleaned.strip()

    # Try direct JSON parse
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass

    # Try extracting first JSON array block
    match = re.search(r"\[[\s\S]*\]", cleaned)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass

    return []


# --- Endpoint ---

@router.post("/ai-search", response_model=AISearchResponse)
async def ai_search_tactics(request: AISearchRequest):
    """
    AI-powered semantic tactic search.
    Single-call architecture: injects full tactic catalog into Gemini prompt.
    """
    started_at = time.perf_counter()
    query = request.query.strip()

    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    print(f"[AI Tactics Search] START query='{query}'", flush=True)

    # 1. Load tactic catalog
    catalog = load_tactic_catalog()
    if not catalog:
        return AISearchResponse(
            results=[],
            query=query,
            message="No tactics in the database yet. Save some tactics first!"
        )

    # Build catalog lookup for quick access
    catalog_map = {t["id"]: t for t in catalog}

    # 2. Build prompt and call Gemini (single call)
    gemini_api_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY not configured. AI search requires Gemini API."
        )

    prompt = build_search_prompt(query, catalog)
    gemini_url = GEMINI_URL_TEMPLATE.format(model=GEMINI_MODEL, key=gemini_api_key)

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            resp = await client.post(
                gemini_url,
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [{"parts": [{"text": prompt}]}],
                    "generationConfig": {
                        "temperature": 0.3,
                        "maxOutputTokens": 4096,
                    },
                },
            )
            resp.raise_for_status()
            data = resp.json()
            # DEBUG: print raw response to help diagnose empty results
            print(f"[AI Tactics Search] Raw Gemini response: {json.dumps(data)[:800]}", flush=True)
            content = _extract_text_from_gemini(data)
            print(f"[AI Tactics Search] Parsed content: {content[:500]}", flush=True)

    except httpx.TimeoutException:
        elapsed = time.perf_counter() - started_at
        print(f"[AI Tactics Search] TIMEOUT after {elapsed:.2f}s", flush=True)
        raise HTTPException(
            status_code=504,
            detail="AI search took too long. Please try again."
        )
    except Exception as e:
        elapsed = time.perf_counter() - started_at
        print(f"[AI Tactics Search] Gemini error after {elapsed:.2f}s: {e}", flush=True)
        raise HTTPException(status_code=500, detail=f"AI search failed: {str(e)}")

    # 3. Parse response
    ai_results = _parse_json_response(content)

    # 4. Build response with full tactic metadata
    results: List[TacticResult] = []
    for item in ai_results:
        tactic_id = item.get("tactic_id", "")
        tactic_info = catalog_map.get(tactic_id)
        if not tactic_info:
            continue

        results.append(TacticResult(
            tactic_id=tactic_id,
            name=tactic_info["name"],
            category=tactic_info["category"],
            sub_category=tactic_info.get("sub_category"),
            description=tactic_info["description"],
            tags=tactic_info.get("tags", []),
            reason=item.get("reason", "Matches your search criteria."),
            preview_image=tactic_info.get("preview_image"),
        ))

    # Results are already sorted by relevance from Gemini

    elapsed = time.perf_counter() - started_at
    message = None
    if not results:
        message = "No relevant tactics found. Try describing a specific basketball scenario, play style, or action type."

    print(
        f"[AI Tactics Search] DONE in {elapsed:.2f}s — "
        f"found {len(results)} result(s) for query='{query}'",
        flush=True,
    )

    return AISearchResponse(results=results, query=query, message=message)
