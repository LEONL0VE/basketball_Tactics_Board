from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Tuple, Optional
import time
import os
import math
import httpx
import re
import ast
import json

router = APIRouter(prefix="/api/diagnose_lineup", tags=["AI Diagnostics"])

GEMINI_MODEL = "gemini-2.5-flash-lite"
GEMINI_URL_TEMPLATE = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{model}:generateContent?key={key}"
)

SYSTEM_PROMPT = """You are the "Lineup Match & Diagnostic Engine" for the HoopsLens Tactics Board.
Your task is to evaluate the fit between the user's [starting lineup tags] and [action requirements of a specific tactic].
"""

class PlayerTag(BaseModel):
    position: str
    player_tag: str

class TargetTactic(BaseModel):
    name: str
    action_requirements: List[str]
    action_requirements_detailed: List[dict] = []
    score_metric: str = "cosine"

class DiagnoseRequest(BaseModel):
    target_tactic: TargetTactic
    current_lineup: List[PlayerTag]


SYNERGY_DIMS = [
    "Spot_Up", "PnR_BH", "PnR_RM", "Post_Up", "Cut",
    "Transition", "Isolation", "Off_Screen", "Hand_Off", "Putback"
]

TAG_CAPABILITY: Dict[str, Dict[str, float]] = {
    "STB": {"Spot_Up": 0.27, "PnR_BH": 0.07, "PnR_RM": 0.19, "Post_Up": 0.07, "Cut": 0.07, "Transition": 0.07, "Isolation": 0.07, "Off_Screen": 0.07, "Hand_Off": 0.07, "Putback": 0.07},
    "ISA": {"Spot_Up": 0.10, "PnR_BH": 0.10, "PnR_RM": 0.10, "Post_Up": 0.10, "Cut": 0.10, "Transition": 0.10, "Isolation": 0.14, "Off_Screen": 0.10, "Hand_Off": 0.10, "Putback": 0.10},
    "PUB": {"Spot_Up": 0.07, "PnR_BH": 0.07, "PnR_RM": 0.18, "Post_Up": 0.26, "Cut": 0.07, "Transition": 0.07, "Isolation": 0.07, "Off_Screen": 0.07, "Hand_Off": 0.07, "Putback": 0.07},
    "SBH": {"Spot_Up": 0.23, "PnR_BH": 0.36, "PnR_RM": 0.05, "Post_Up": 0.05, "Cut": 0.05, "Transition": 0.05, "Isolation": 0.05, "Off_Screen": 0.05, "Hand_Off": 0.05, "Putback": 0.05},
    "TRA": {"Spot_Up": 0.33, "PnR_BH": 0.05, "PnR_RM": 0.05, "Post_Up": 0.05, "Cut": 0.05, "Transition": 0.23, "Isolation": 0.05, "Off_Screen": 0.05, "Hand_Off": 0.05, "Putback": 0.05},
    "PBH": {"Spot_Up": 0.06, "PnR_BH": 0.46, "PnR_RM": 0.06, "Post_Up": 0.06, "Cut": 0.06, "Transition": 0.06, "Isolation": 0.06, "Off_Screen": 0.06, "Hand_Off": 0.06, "Putback": 0.06},
    "SUS": {"Spot_Up": 0.47, "PnR_BH": 0.06, "PnR_RM": 0.06, "Post_Up": 0.06, "Cut": 0.06, "Transition": 0.06, "Isolation": 0.06, "Off_Screen": 0.06, "Hand_Off": 0.06, "Putback": 0.06},
    "RCB": {"Spot_Up": 0.06, "PnR_BH": 0.06, "PnR_RM": 0.23, "Post_Up": 0.06, "Cut": 0.26, "Transition": 0.06, "Isolation": 0.06, "Off_Screen": 0.06, "Hand_Off": 0.06, "Putback": 0.06},
    "OSS": {"Spot_Up": 0.28, "PnR_BH": 0.05, "PnR_RM": 0.05, "Post_Up": 0.05, "Cut": 0.05, "Transition": 0.05, "Isolation": 0.05, "Off_Screen": 0.34, "Hand_Off": 0.05, "Putback": 0.05},
    "WWH": {"Spot_Up": 0.29, "PnR_BH": 0.22, "PnR_RM": 0.06, "Post_Up": 0.06, "Cut": 0.06, "Transition": 0.06, "Isolation": 0.06, "Off_Screen": 0.06, "Hand_Off": 0.06, "Putback": 0.06},
}

SUPPLY_DECAY_ALPHA: Dict[str, float] = {
    "Spot_Up": 0.8,
    "PnR_BH": 0.2,
    "PnR_RM": 0.8,
    "Post_Up": 0.2,
    "Cut": 0.8,
    "Transition": 0.8,
    "Isolation": 0.2,
    "Off_Screen": 0.8,
    "Hand_Off": 0.2,
    "Putback": 0.8,
}

POSITION_ROLE_POOL: Dict[str, List[str]] = {
    "PG": ["PBH", "SBH", "WWH", "TRA"],
    "SG": ["SBH", "SUS", "WWH", "TRA", "OSS", "PBH"],
    "SF": ["WWH", "TRA", "OSS", "SUS", "SBH", "ISA"],
    "PF": ["RCB", "PUB", "STB", "TRA", "WWH"],
    "C": ["STB", "PUB", "RCB"],
}


def normalize_role_tag(tag: str) -> str:
    if not tag:
        return ""
    code = tag.split(" - ", 1)[0].strip().upper()
    return code if code in TAG_CAPABILITY else tag.strip()


def to_dim_key(name: str) -> str:
    n = name.lower().replace("-", "_")
    if "cut" in n:
        return "Cut"
    if "spot" in n:
        return "Spot_Up"
    if "hand_off" in n or ("hand" in n and "off" in n):
        return "Hand_Off"
    if "off_screen" in n or ("off" in n and "screen" in n):
        return "Off_Screen"
    if "post" in n:
        return "Post_Up"
    if "putback" in n or "put_back" in n:
        return "Putback"
    if n == "pnr_rm" or "pnr_rm" in n or "roll_man" in n or "roll man" in n:
        return "PnR_RM"
    if "pnr" in n or "pick" in n or "ball_hand" in n or "ballhand" in n:
        return "PnR_BH"
    if "iso" in n:
        return "Isolation"
    if "transit" in n:
        return "Transition"
    if "play" in n or "assist" in n:
        return "PnR_BH"
    if "spac" in n:
        return "Spot_Up"
    if "defense" in n:
        return "Cut"
    return name


def compute_demand(action_requirements: List[str], action_requirements_detailed: Optional[List[dict]] = None) -> Dict[str, float]:
    counts: Dict[str, int] = {}

    detailed_tags: List[str] = []
    for item in action_requirements_detailed or []:
        detailed_tags.extend(item.get("actionTags", []) or [])

    demand_source = detailed_tags if detailed_tags else (action_requirements or [])

    for action in demand_source:
        key = to_dim_key(action)
        if key in SYNERGY_DIMS:
            counts[key] = counts.get(key, 0) + 1
    total = sum(counts.values())
    if total == 0:
        return {}
    return {k: counts[k] / total for k in counts}


def compute_rank_weighted_supply(role_tags: List[str]) -> Dict[str, float]:
    raw: Dict[str, float] = {}
    normalized: Dict[str, float] = {}

    for dim in SYNERGY_DIMS:
        alpha = SUPPLY_DECAY_ALPHA.get(dim, 0.8)
        values = sorted(
            [TAG_CAPABILITY.get(normalize_role_tag(tag), {}).get(dim, 0.07) for tag in role_tags],
            reverse=True,
        )
        raw_dim = 0.0
        for j, v in enumerate(values):
            raw_dim += v * (alpha ** j)
        raw[dim] = raw_dim

    total_raw = sum(raw.values())
    for dim in SYNERGY_DIMS:
        normalized[dim] = (raw.get(dim, 0.0) / total_raw) if total_raw > 0 else 0.0
    return normalized


def compute_histogram_intersection_score(demand_map: Dict[str, float], role_tags: List[str]) -> int:
    supply_map = compute_rank_weighted_supply(role_tags)
    
    sum_d = sum(demand_map.get(dim, 0.0) for dim in SYNERGY_DIMS)
    if sum_d == 0:
        return 0
        
    intersection = sum(
        min(demand_map.get(dim, 0.0), supply_map.get(dim, 0.0))
        for dim in SYNERGY_DIMS
    )
    
    return int(round((intersection / sum_d) * 100))


def compute_jsd_fit_score(demand_map: Dict[str, float], role_tags: List[str]) -> int:
    supply_map = compute_rank_weighted_supply(role_tags)
    d_vec = [demand_map.get(dim, 0.0) for dim in SYNERGY_DIMS]
    s_vec = [supply_map.get(dim, 0.0) for dim in SYNERGY_DIMS]

    if sum(d_vec) <= 0 or sum(s_vec) <= 0:
        return 0

    def kl_div(p: List[float], q: List[float]) -> float:
        total = 0.0
        for p_i, q_i in zip(p, q):
            if p_i <= 0 or q_i <= 0:
                continue
            total += p_i * math.log(p_i / q_i)
        return total

    mean_vec = [0.5 * (d + s) for d, s in zip(d_vec, s_vec)]
    jsd = 0.5 * kl_div(d_vec, mean_vec) + 0.5 * kl_div(s_vec, mean_vec)
    fit = (1.0 - (jsd / math.log(2.0))) * 100.0
    return max(0, min(100, int(round(fit))))


def compute_fit_score(demand_map: Dict[str, float], role_tags: List[str], score_metric: str = "intersection") -> int:
    metric = (score_metric or "intersection").lower()
    if metric == "jsd":
        return compute_jsd_fit_score(demand_map, role_tags)
    return compute_histogram_intersection_score(demand_map, role_tags)


def build_dimensions(action_requirements: List[str], demand_map: Dict[str, float], supply_map: Dict[str, float]) -> List[dict]:
    dimensions: List[dict] = []
    for action in action_requirements or []:
        dim = to_dim_key(action)
        demand = demand_map.get(dim, 0.0)
        supply = supply_map.get(dim, 0.0)
        if demand <= 0:
            score = int(round(supply * 100))
        else:
            ratio = max(0.0, min(1.0, supply / demand))
            score = int(round(ratio * 100))
        gap = (supply - demand) * 100
        reason = (
            f"Demand {demand * 100:.1f}% vs Supply {supply * 100:.1f}% "
            f"(gap {gap:+.1f}pp, alpha={SUPPLY_DECAY_ALPHA.get(dim, 0.8):.1f})."
        )
        dimensions.append({"name": action, "score": max(0, min(100, score)), "reason": reason})
    return dimensions


def generate_weak_links(
    current_lineup: List[PlayerTag],
    demand_map: Dict[str, float],
    base_score: int,
    score_metric: str = "cosine",
) -> List[dict]:
    role_tags = [normalize_role_tag(p.player_tag) for p in current_lineup]
    suggestions: List[Tuple[float, dict]] = []

    for idx, player in enumerate(current_lineup):
        current_tag = normalize_role_tag(player.player_tag)
        best_tag = current_tag
        best_score = base_score
        role_pool = POSITION_ROLE_POOL.get(player.position.upper(), list(TAG_CAPABILITY.keys()))

        for candidate in role_pool:
            if candidate == current_tag:
                continue
            trial_tags = list(role_tags)
            trial_tags[idx] = candidate
            trial_score = compute_fit_score(demand_map, trial_tags, score_metric)
            if trial_score > best_score:
                best_score = trial_score
                best_tag = candidate

        delta = best_score - base_score
        if delta > 0:
            suggestions.append((
                float(delta),
                {
                    "position": player.position,
                    "current_tag": current_tag,
                    "issue": "",
                    "suggestion": best_tag,
                    "expected_score": best_score,
                    "delta_score": delta,
                },
            ))

    suggestions.sort(key=lambda x: x[0], reverse=True)
    return [item for _, item in suggestions[:3]]

ROLE_FULL_NAME: Dict[str, str] = {
    "STB": "Stretch Big",
    "ISA": "Isolation Scorer",
    "PUB": "Post-Up Big",
    "SBH": "Secondary Ball-Handler",
    "TRA": "Transition Runner",
    "PBH": "Primary Ball-Handler",
    "SUS": "Spot-Up Shooter",
    "RCB": "Roll/Cut Big",
    "OSS": "Off-Screen Scorer",
    "WWH": "Wing Versatile Handler",
}


async def generate_ai_issues(weak_links: List[dict], demand_map: Dict[str, float]) -> List[dict]:
    """Use Gemini to write natural-language coaching explanations for each substitution."""
    if not weak_links:
        return weak_links

    gemini_api_key = os.getenv("GEMINI_API_KEY", "")

    top_demands = sorted(demand_map.items(), key=lambda x: x[1], reverse=True)[:2]

    def _fallback(wl: dict) -> str:
        current_tag = wl.get("current_tag", "")
        suggest_tag = wl.get("suggestion", "")
        current_name = ROLE_FULL_NAME.get(current_tag, current_tag)
        suggest_name = ROLE_FULL_NAME.get(suggest_tag, suggest_tag)

        if not top_demands:
            return (
                f"In this lineup, **{current_name}** does not align well with the current action focus. "
                f"Switching to **{suggest_name}** is projected to raise fit to {wl.get('expected_score', 0)}% (+{wl.get('delta_score', 0)}%)."
            )

        dim_names = [dim for dim, demand in top_demands]
        if not dim_names:
            return (
                f"In this lineup, **{current_name}** does not align well with the current action focus. "
                f"Switching to **{suggest_name}** provides a much stronger tactical fit."
            )

        dim_string = " and ".join(dim.replace("_", " ") for dim in dim_names)
        return f"Swapping **{current_name}** for **{suggest_name}** upgrades our {dim_string} capabilities, perfectly matching the tactic's core engine and lifting fit to {wl.get('expected_score', 0)}% (+{wl.get('delta_score', 0)}%)."

    if not gemini_api_key:
        print("[AI Issues] GEMINI_API_KEY missing, fallback to deterministic text.", flush=True)
        for wl in weak_links:
            wl["issue"] = _fallback(wl)
        return weak_links

    top_dims = sorted(demand_map.items(), key=lambda x: x[1], reverse=True)[:3]
    demand_desc = ", ".join(f"{k}({v*100:.0f}%)" for k, v in top_dims)

    lines = []
    for i, wl in enumerate(weak_links, 1):
        cur = ROLE_FULL_NAME.get(wl["current_tag"], wl["current_tag"])
        sug = ROLE_FULL_NAME.get(wl["suggestion"], wl["suggestion"])
        lines.append(
            f"{i}. Position {wl['position']}: {cur} → {sug} (fit +{wl['delta_score']}%, expected {wl['expected_score']}%)"
        )

    prompt = (
        f"You are a basketball tactics analyst.\n"
        f"The tactic's top demands are: {demand_desc}.\n"
        f"For each substitution below, write a punchy, direct tactical insight (maximum 2 sentences, 20-35 words). "
        f"State exactly WHICH tactical demand (e.g., Cut, Spot_Up) is upgraded and why. "
        f"Be high-level and concise. Use **bold** markdown for role names.\n\n"
        + "\n".join(lines)
        + "\n\nReturn ONLY a JSON array of strings, one per substitution, same order. "
        + 'Example: ["Sentence 1."]'
    )

    def _parse_issues(content: str, expected_len: int) -> List[str]:
        text = (content or "").strip()
        if text.startswith("```"):
            text = "\n".join(text.split("\n")[1:])
            if "```" in text:
                text = text[:text.rfind("```")]
        text = text.strip()

        # Try direct JSON first
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed][:expected_len]
        except Exception:
            pass

        # Try extracting the first JSON-like array block
        match = re.search(r"\[[\s\S]*\]", text)
        if match:
            block = match.group(0)
            try:
                parsed = json.loads(block)
                if isinstance(parsed, list):
                    return [str(x).strip() for x in parsed][:expected_len]
            except Exception:
                try:
                    parsed = ast.literal_eval(block)
                    if isinstance(parsed, list):
                        return [str(x).strip() for x in parsed][:expected_len]
                except Exception:
                    pass

        # Last fallback: split non-empty lines as plain sentences
        line_items = [ln.strip(" -\t") for ln in text.splitlines() if ln.strip()]
        return line_items[:expected_len]

    def _clean_issue_text(text: str) -> str:
        t = (text or "").strip().strip('"').strip("'")
        t = re.sub(r"^\d+[\.)]\s*", "", t)
        t = re.sub(r"^[-*]\s*", "", t)
        return t.strip()

    def _is_valid_issue(text: str) -> bool:
        t = _clean_issue_text(text)
        lower = t.lower()
        if not t or t == "..." or len(t) < 25:
            return False
        bad_markers = [
            "here is the json",
            "json requested",
            "json array",
            "```",
        ]
        if any(m in lower for m in bad_markers):
            return False
        # Reject obvious raw JSON payloads, but allow normal prose that may contain brackets.
        if (t.startswith("[") and t.endswith("]")) or (t.startswith("{") and t.endswith("}")):
            return False
        # Must look like a complete analysis sentence block
        if not any(p in t for p in [".", "!", "?", "。", "！", "？"]):
            return False
        if t.endswith((":", "-", "→", "to", "for", "with", "and", "or")):
            return False
        return True

    def _extract_text_from_gemini(data: dict) -> str:
        candidates = data.get("candidates", [])
        if not candidates:
            raise ValueError("Gemini returned no candidates")
        candidate0 = candidates[0] or {}
        parts = candidate0.get("content", {}).get("parts", []) or []
        text_chunks = [p.get("text", "") for p in parts if isinstance(p, dict) and p.get("text")]
        if not text_chunks:
            finish_reason = candidate0.get("finishReason", "UNKNOWN")
            prompt_feedback = data.get("promptFeedback", {})
            raise ValueError(
                f"Gemini returned empty parts (finishReason={finish_reason}, promptFeedback={prompt_feedback})"
            )
        return "\n".join(text_chunks).strip()

    def _parse_plain_items(content: str, expected_len: int) -> List[str]:
        """Parse attempt#3 plain-text response using explicit ITEM headers first."""
        text = (content or "").strip()
        if not text:
            return []

        # Preferred format: ITEM 1: ... ITEM 2: ...
        header_regex = re.compile(r"(?:^|\n)\s*ITEM\s*(\d+)\s*:\s*", re.IGNORECASE)
        matches = list(header_regex.finditer(text))
        if matches:
            items: List[str] = []
            for i, m in enumerate(matches):
                start = m.end()
                end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
                segment = text[start:end].strip()
                if segment:
                    items.append(segment)
            return items[:expected_len]

        # Fallback: non-empty lines
        return [ln.strip(" -\t") for ln in text.splitlines() if ln.strip()][:expected_len]

    try:
        gemini_url = GEMINI_URL_TEMPLATE.format(model=GEMINI_MODEL, key=gemini_api_key)
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Attempt 1: ask for strict JSON
            resp = await client.post(
                gemini_url,
                headers={"Content-Type": "application/json"},
                json={
                    "contents": [
                        {
                            "parts": [
                                {"text": prompt}
                            ]
                        }
                    ],
                    "generationConfig": {
                        "temperature": 0.7,
                        "maxOutputTokens": 300,
                        "responseMimeType": "application/json",
                    },
                },
            )
            resp.raise_for_status()
            data = resp.json()

            try:
                content = _extract_text_from_gemini(data)
            except Exception as first_err:
                print(f"[AI Issues] Gemini attempt#1 no text: {first_err}", flush=True)
                # Attempt 2: relaxed request (no responseMimeType)
                resp2 = await client.post(
                    gemini_url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [
                            {
                                "parts": [
                                    {"text": prompt}
                                ]
                            }
                        ],
                        "generationConfig": {
                            "temperature": 0.6,
                            "maxOutputTokens": 300,
                        },
                    },
                )
                resp2.raise_for_status()
                data2 = resp2.json()
                content = _extract_text_from_gemini(data2)

            issues: List[str] = _parse_issues(content, len(weak_links))
            valid_count = 0
            for i, wl in enumerate(weak_links):
                candidate = issues[i] if i < len(issues) else ""
                if _is_valid_issue(candidate):
                    wl["issue"] = _clean_issue_text(candidate)
                    valid_count += 1
                else:
                    if candidate:
                        print(
                            f"[AI Issues] Invalid candidate#{i+1} (attempt#1/2): {candidate[:180]}",
                            flush=True,
                        )
                    wl["issue"] = ""

            # Attempt 3: regenerate missing items in plain-line mode
            if valid_count < len(weak_links):
                missing_idx = [idx for idx, wl in enumerate(weak_links) if not wl.get("issue")]
                plain_lines = []
                for n, idx in enumerate(missing_idx, 1):
                    wl = weak_links[idx]
                    cur = ROLE_FULL_NAME.get(wl["current_tag"], wl["current_tag"])
                    sug = ROLE_FULL_NAME.get(wl["suggestion"], wl["suggestion"])
                    plain_lines.append(
                        f"{n}. Position {wl['position']}: {cur} → {sug} (fit +{wl['delta_score']}%, expected {wl['expected_score']}%)"
                    )

                prompt_plain = (
                    f"You are a basketball tactics analyst.\n"
                    f"The tactic's top demands are: {demand_desc}.\n"
                    f"Write a punchy, direct tactical insight per item (max 2 sentences, 20-35 words).\n"
                    f"Focus only on the key capability upgraded. Use **bold** for role names. No JSON, no bullets.\n\n"
                    + "\n".join(plain_lines)
                    + "\n\n"
                    + "Return each item with an explicit header in this exact format:\n"
                    + "ITEM 1: <two sentences>\n"
                    + "ITEM 2: <two sentences>\n"
                    + "ITEM 3: <two sentences>"
                )

                resp3 = await client.post(
                    gemini_url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [
                            {
                                "parts": [
                                    {"text": prompt_plain}
                                ]
                            }
                        ],
                        "generationConfig": {
                            "temperature": 0.6,
                            "maxOutputTokens": 240,
                        },
                    },
                )
                resp3.raise_for_status()
                data3 = resp3.json()
                content3 = _extract_text_from_gemini(data3)
                lines3 = _parse_plain_items(content3, len(missing_idx))

                for offset, idx in enumerate(missing_idx):
                    candidate = lines3[offset] if offset < len(lines3) else ""
                    if _is_valid_issue(candidate):
                        weak_links[idx]["issue"] = _clean_issue_text(candidate)
                    elif candidate:
                        print(
                            f"[AI Issues] Invalid candidate#{idx+1} (attempt#3): {candidate[:180]}",
                            flush=True,
                        )

            fallback_count = 0
            for wl in weak_links:
                if not wl.get("issue") or not _is_valid_issue(wl.get("issue", "")):
                    wl["issue"] = _fallback(wl)
                    fallback_count += 1

        print(
            f"[AI Issues] Gemini generated {len(weak_links) - fallback_count}/{len(weak_links)} explanation(s), fallback={fallback_count}.",
            flush=True,
        )
    except Exception as e:
        print(f"[AI Issues] Gemini failed, fallback due to: {e}", flush=True)
        for wl in weak_links:
            if not wl["issue"]:
                wl["issue"] = _fallback(wl)

    return weak_links



@router.post("")
async def diagnose_lineup(request: DiagnoseRequest):
    """Deterministic lineup diagnostics: rank-weighted fit score + best substitution search."""

    started_at = time.perf_counter()
    lineup_preview = ", ".join([f"{p.position}:{p.player_tag}" for p in request.current_lineup])
    print(
        f"[AI Diagnostics] START tactic='{request.target_tactic.name}' "
        f"actions={request.target_tactic.action_requirements} lineup=[{lineup_preview}]",
        flush=True,
    )

    try:
        action_requirements = request.target_tactic.action_requirements or []
        action_requirements_detailed = request.target_tactic.action_requirements_detailed or []
        score_metric = (request.target_tactic.score_metric or "cosine").lower()
        demand_map = compute_demand(action_requirements, action_requirements_detailed)
        role_tags = [normalize_role_tag(p.player_tag) for p in request.current_lineup]
        supply_map = compute_rank_weighted_supply(role_tags)
        fit_score = compute_fit_score(demand_map, role_tags, score_metric)

        dimensions = build_dimensions(action_requirements, demand_map, supply_map)
        weak_links = generate_weak_links(request.current_lineup, demand_map, fit_score, score_metric)

        weak_links = await generate_ai_issues(weak_links, demand_map)

        if demand_map:
            demand_desc = ", ".join([f"{k}:{v * 100:.1f}%" for k, v in sorted(demand_map.items(), key=lambda x: x[1], reverse=True)])
            summary = (
                f"Deterministic {score_metric.upper()} fit={fit_score}%. Demand concentrates on [{demand_desc}]. "
                f"Substitution suggestions are ranked by real score lift under the same fit formula."
            )
        else:
            summary = "No recognized action demand in tactic requirements; fit defaults to 0 and substitution suggestions are disabled."

        elapsed = time.perf_counter() - started_at
        print(f"[AI Diagnostics] DONE (deterministic) in {elapsed:.2f}s", flush=True)
        return {
            "tactic_summary": summary,
            "dimensions": dimensions,
            "weak_links": weak_links,
            "score_metric": score_metric,
            "base_score": fit_score,
        }

    except HTTPException as e:
        elapsed = time.perf_counter() - started_at
        print(f"[AI Diagnostics] HTTPException after {elapsed:.2f}s: {e.detail}", flush=True)
        raise
    except Exception as e:
        elapsed = time.perf_counter() - started_at
        print(f"[AI Diagnostics] Unexpected error after {elapsed:.2f}s: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=str(e))

