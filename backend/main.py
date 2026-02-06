from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
import pandas as pd
import uvicorn
import json
import asyncio
import os
from uuid import uuid4
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

from nba_api.stats.static import players as nba_players_static
from nba_api.stats.endpoints import commonplayerinfo, playercareerstats

from epv_analytics import calculate_epv_series
from fetch_shot_chart import fetch_player_shot_chart, fetch_shot_chart_by_id

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TrajectoryFrame(BaseModel):
    timestamp: float
    entities: List[Dict[str, Any]]

class AnalysisRequest(BaseModel):
    trajectory: List[TrajectoryFrame]
    court_type: Optional[str] = "full"
    player_id: Optional[int] = None
    player_map: Optional[Dict[str, int]] = None
    sliders: Optional[Dict[str, float]] = None

@app.get("/")
async def root():
    return {"message": "Basketball Tactics Board Backend is running"}

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }

@app.get("/api/players/search")
async def search_players(name: str):
    try:
        all_players = nba_players_static.get_players()
        results = [
            {
                "id": p['id'],
                "name": p['full_name'],
                "team": "NBA", # Placeholder
                "position": "Unknown", # Placeholder
                "photoUrl": f"https://ak-static.cms.nba.com/wp-content/uploads/headshots/nba/latest/260x190/{p['id']}.png",
                "isActive": p['is_active']
            }
            for p in all_players if name.lower() in p['full_name'].lower()
        ]
        return results[:10] # Limit to 10 results
    except Exception as e:
        print(f"Error searching players: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/players/{player_id}/stats")
async def get_player_stats(player_id: int):
    try:
        # Fetch basic info
        info = commonplayerinfo.CommonPlayerInfo(player_id=player_id)
        data = info.get_dict()['resultSets'][0]['rowSet'][0]
        headers = info.get_dict()['resultSets'][0]['headers']
        player_info = dict(zip(headers, data))
        
        career = playercareerstats.PlayerCareerStats(player_id=player_id)
        career_df = career.get_data_frames()[0]
        
        print(f"Fetching stats for player {player_id}")
        
        stats = {
            "ppg": "-", "rpg": "-", "apg": "-", 
            "fg_pct": "-", "fg2_pct": "-", "fg3_pct": "-"
        }
        
        if not career_df.empty:
            latest = career_df.iloc[-1]
            
            gp = latest['GP']
            if gp > 0:
                stats['ppg'] = round(latest['PTS'] / gp, 1)
                stats['rpg'] = round(latest['REB'] / gp, 1)
                stats['apg'] = round(latest['AST'] / gp, 1)
                stats['fg_pct'] = round(latest['FG_PCT'] * 100, 1)
                stats['fg3_pct'] = round(latest['FG3_PCT'] * 100, 1)
                
                # Calculate 2PT%
                fg2m = latest['FGM'] - latest['FG3M']
                fg2a = latest['FGA'] - latest['FG3A']
                if fg2a > 0:
                    stats['fg2_pct'] = round((fg2m / fg2a) * 100, 1)
        
        print(f"Returning stats: {stats}")

        # Calculate age
        age = "N/A"
        birthdate_str = player_info.get('BIRTHDATE', '')
        if birthdate_str:
            try:
                # Format is usually YYYY-MM-DDTHH:MM:SS
                birthdate = datetime.strptime(birthdate_str[:10], "%Y-%m-%d")
                today = datetime.today()
                age = today.year - birthdate.year - ((today.month, today.day) < (birthdate.month, birthdate.day))
            except Exception as e:
                print(f"Error calculating age: {e}")

        return {
            "height": player_info.get('HEIGHT', ''),
            "weight": player_info.get('WEIGHT', ''),
            "position": player_info.get('POSITION', ''),
            "team": player_info.get('TEAM_ABBREVIATION', ''),
            "jersey": player_info.get('JERSEY', ''),
            "age": str(age),
            "stats": stats
        }
    except Exception as e:
        print(f"Error fetching player stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/epv/analyze")
async def analyze_epv(request: AnalysisRequest):
    try:
        # Convert to format expected by calculate_epv_series
        # calculate_epv_series expects a DataFrame with columns: frame, timestamp, id, type, x, y
        
        frames_data = []
        for i, frame in enumerate(request.trajectory):
            for entity in frame.entities:
                frames_data.append({
                    "frame": i,
                    "timestamp": frame.timestamp,
                    "id": entity.get("id"),
                    "type": entity.get("type"),
                    "team": entity.get("team"),
                    "x": entity.get("x"),
                    "y": entity.get("y"),
                    "ownerId": entity.get("ownerId") # Pass ownerId
                })
        
        kinematics_df = pd.DataFrame(frames_data)
        
        # Fetch Shot Charts for ALL involved players
        shot_charts_map = {}
        
        # 1. Handle new player_map (Multiple players)
        if request.player_map:
            print(f"Loading data for {len(request.player_map)} players...")
            for entity_id, nba_id in request.player_map.items():
                print(f"Fetching data for Entity {entity_id} -> NBA ID {nba_id}")
                chart = fetch_shot_chart_by_id(nba_id)
                if chart:
                    shot_charts_map[entity_id] = chart
        
        # 2. Handle legacy single player_id (Fallback)
        elif request.player_id:
            print(f"Legacy mode: Analyzing for single Player ID: {request.player_id}")
            chart = fetch_shot_chart_by_id(request.player_id)
            if chart:
                # We don't know which entity this belongs to, so we might need to pass it as a default
                # For now, let's just store it with a special key or handle it in calculate_epv_series
                shot_charts_map['default'] = chart

        # Run Analysis
        epv_series = calculate_epv_series(
            kinematics_df, 
            shot_charts_map=shot_charts_map,
            sliders=request.sliders
        )
        
        # Return format expected by frontend: { epv_curve: [...], kinematics: ... }
        return {
            "epv_curve": epv_series,
            "kinematics": {} # Placeholder
        }
    except Exception as e:
        print(f"Error in analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/match-tactic")
async def match_tactic(request: Dict[str, Any]):
    return {"matches": []} # Dummy response



@app.get("/shotchart/{player_name}")
async def get_shot_chart(player_name: str):
    try:
        chart_data = fetch_player_shot_chart(player_name)
        if chart_data is None:
            raise HTTPException(status_code=404, detail="Player not found or no data")
        
        # Convert DataFrame to JSON-friendly format (records)
        # fetch_player_shot_chart returns a DataFrame
        result = chart_data.to_dict(orient='records')
        return result
    except Exception as e:
        print(f"Error fetching shot chart: {e}")
        raise HTTPException(status_code=500, detail=str(e))

import os

# --- Tactics Library Endpoints ---

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
TACTICS_DIR = os.path.join(DATA_DIR, 'tactics')
os.makedirs(TACTICS_DIR, exist_ok=True)

class TacticExternalLinks(BaseModel):
    video: Optional[str] = None
    article: Optional[str] = None

class TacticMetadata(BaseModel):
    id: str
    name: str = "Untitled Tactic"
    category: str = "Strategy & Concepts"  # Offense, Defense, Strategy & Concepts
    sub_category: Optional[str] = None # Set Offense, Motion Offense, Actions, Man, Zone, Press
    description: str = ""
    tags: List[str] = []
    external_links: TacticExternalLinks = Field(default_factory=TacticExternalLinks)
    preview_image: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

class Tactic(TacticMetadata):
    animation_data: Dict[str, Any] = {}

class SaveTacticRequest(BaseModel):
    tactic: Tactic

def auto_categorize(name: str) -> str:
    lower_name = name.lower()
    if "offense" in lower_name or "pick" in lower_name or "iso" in lower_name:
        return "Offense"
    if "defense" in lower_name or "zone" in lower_name or "press" in lower_name:
        return "Defense"
    return "Other"

@app.get("/api/tactics", response_model=List[TacticMetadata])
async def get_tactics_list():
    tactics = []
    
    # Load custom user tactics from data/tactics/*.json
    try:
        if os.path.exists(TACTICS_DIR):
            for filename in os.listdir(TACTICS_DIR):
                if filename.endswith(".json"):
                    file_path = os.path.join(TACTICS_DIR, filename)
                    try:
                        with open(file_path, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            
                        # Check if it's the new schema (has animation_data) or old schema
                        if "animation_data" in data or "id" in data:
                            # New format (or partially migrated)
                            tactic = TacticMetadata(
                                id=data.get("id", filename.replace(".json", "")),
                                name=data.get("name", "Untitled"),
                                category=data.get("category", auto_categorize(data.get("name", ""))),
                                sub_category=data.get("sub_category"),
                                description=data.get("description", ""),
                                tags=data.get("tags", []),
                                external_links=data.get("external_links", {}),
                                preview_image=data.get("preview_image"),
                                created_at=data.get("created_at"),
                                updated_at=data.get("updated_at")
                            )
                        else:
                            # Old format
                            meta = data.get("meta", {})
                            name = meta.get("name", filename.replace(".json", "").replace("_", " ").title())
                            tactic = TacticMetadata(
                                id=filename.replace(".json", ""),
                                name=name,
                                category=auto_categorize(name),
                                sub_category="Concept", # Default for legacy
                                description=meta.get("description", ""),
                                tags=[],
                                external_links={},
                                preview_image=None
                            )
                        
                        tactics.append(tactic)
                    except Exception as e:
                        print(f"Error loading custom tactic {filename}: {e}")
    except Exception as e:
        print(f"Error scanning tactics directory: {e}")

    return tactics

@app.get("/api/tactics/{tactic_id}")
async def get_tactic_detail(tactic_id: str):
    try:
        # Custom Tactics
        # Try finding by ID (filename match)
        file_path = os.path.join(TACTICS_DIR, f"{tactic_id}.json")
        
        if os.path.exists(file_path):
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            # If it's old format, wrap it
            if "animation_data" not in data and "frames" in data:
                # This is a legacy file return it as "animation_data" for the frontend to handle?
                # Or upgrade it in memory
                meta = data.get("meta", {})
                name = meta.get("name", tactic_id.replace("_", " ").title())
                
                return {
                    "id": tactic_id,
                    "name": name,
                    "category": auto_categorize(name),
                    "sub_category": "Concept",
                    "description": meta.get("description", ""),
                    "tags": [],
                    "external_links": {},
                    "preview_image": None,
                    "animation_data": data # The whole file is valid animation data in the old version
                }
            return data
            
        # Check Built-in Mappings (legacy) - Removed as files migrated
        # filename = None
        # if tactic_id == "1_3_1_offense":
        #    filename = "131_offense.json"
        
        # if filename:
             # Legacy builtin path
        #    file_path = os.path.join(DATA_DIR, filename)
        #    if os.path.exists(file_path):
        #         with open(file_path, "r", encoding="utf-8") as f:
        #            data = json.load(f)
        #            return {
        #                "id": tactic_id,
        #                "name": tactic_id.replace("_", " ").title(),
        #                "category": "Offense",
        #                "description": "Built-in tactic",
        #                "animation_data": data
        #            }

        raise HTTPException(status_code=404, detail="Tactic not found")

    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading tactic detail: {str(e)}")

@app.post("/api/tactics")
async def save_tactic(request: Dict[str, Any]):
    try:
        # We accept a raw dict to allow flexible validation handles or just use the model
        # using the model:
        tactic_data = request
        
        if "id" not in tactic_data or not tactic_data["id"]:
            tactic_data["id"] = str(uuid4())
            
        tactic_data["updated_at"] = datetime.utcnow().isoformat()
        if "created_at" not in tactic_data:
             tactic_data["created_at"] = datetime.utcnow().isoformat()
             
        file_path = os.path.join(TACTICS_DIR, f"{tactic_data['id']}.json")
        
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(tactic_data, f, indent=2)
            
        return {"id": tactic_data["id"], "message": "Tactic saved successfully"}
    except Exception as e:
        print(f"Error saving tactic: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/tactics/{tactic_id}")
async def delete_tactic(tactic_id: str):
    try:
        file_path = os.path.join(TACTICS_DIR, f"{tactic_id}.json")
        if os.path.exists(file_path):
            os.remove(file_path)
            return {"message": "Tactic deleted"}
        raise HTTPException(status_code=404, detail="Tactic not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# --- AI Chat Endpoints ---

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    current_tactic: Optional[Dict[str, Any]] = None
    stream: bool = True


class GenerateTacticRequest(BaseModel):
    prompt: str
    stream: bool = True


class ExplainTacticRequest(BaseModel):
    tactic_data: Dict[str, Any]
    stream: bool = True


class AgentMessage(BaseModel):
    role: str
    content: str


class AgentRequest(BaseModel):
    messages: List[AgentMessage]
    board_state: Optional[Dict[str, Any]] = None
    max_steps: int = 6


# Try to import AI service
try:
    from ai_chat import (
        get_ai_service,
        AIConfig,
        AIProvider,
        TACTIC_TEMPLATES,
        get_court_region,
        get_position_role,
        run_agent,
    )
    AI_AVAILABLE = True
except ImportError as e:
    print(f"Warning: AI chat module not available: {e}")
    AI_AVAILABLE = False


@app.get("/api/ai/status")
async def get_ai_status():
    """Check if AI service is available and configured"""
    if not AI_AVAILABLE:
        return {
            "available": False,
            "error": "AI module not installed",
            "providers": []
        }
    
    providers = []
    if os.getenv("GEMINI_API_KEY"):
        providers.append("gemini")
    if os.getenv("OPENAI_API_KEY"):
        providers.append("openai")
    if os.getenv("DEEPSEEK_API_KEY"):
        providers.append("deepseek")
    
    return {
        "available": len(providers) > 0,
        "providers": providers,
        "default_provider": providers[0] if providers else None
    }


@app.post("/api/agent")
async def agent_chat(request: AgentRequest):
    """Agent chat with tool use (SSE)."""
    if not AI_AVAILABLE:
        raise HTTPException(status_code=503, detail="AI service not available")

    try:
        _ = get_ai_service()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI service initialization failed: {str(e)}")

    formatted_messages = [{"role": m.role, "content": m.content} for m in request.messages]

    async def event_stream():
        try:
            async for event in run_agent(
                formatted_messages,
                board_state=request.board_state,
                max_steps=request.max_steps,
            ):
                yield "data: " + json.dumps(event) + "\n\n"
        except Exception as e:
            yield "data: " + json.dumps({"type": "error", "error": str(e)}) + "\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.post("/api/ai/chat")
async def ai_chat(request: ChatRequest):
    """Chat with AI assistant (supports streaming)"""
    if not AI_AVAILABLE:
        raise HTTPException(status_code=503, detail="AI service not available")
    
    try:
        ai_service = get_ai_service()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI service initialization failed: {str(e)}")
    
    messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]
    current_tactic = request.current_tactic
    
    if request.stream:
        async def generate():
            try:
                async for chunk in ai_service.chat(messages, current_tactic):
                    # Send as NDJSON (newline-delimited JSON)
                    yield json.dumps({"type": "text-delta", "content": chunk}) + "\n"
                yield json.dumps({"type": "done"}) + "\n"
            except Exception as e:
                yield json.dumps({"type": "error", "content": str(e)}) + "\n"
        
        return StreamingResponse(
            generate(),
            media_type="application/x-ndjson",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            }
        )
    else:
        # Non-streaming response
        full_response = ""
        try:
            async for chunk in ai_service.chat(messages, current_tactic):
                full_response += chunk
            return {"response": full_response}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/generate-tactic")
async def ai_generate_tactic(request: GenerateTacticRequest):
    """Generate a tactic from natural language description"""
    if not AI_AVAILABLE:
        raise HTTPException(status_code=503, detail="AI service not available")
    
    try:
        ai_service = get_ai_service()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI service initialization failed: {str(e)}")
    
    if request.stream:
        async def generate():
            try:
                async for chunk in ai_service.generate_tactic(request.prompt):
                    yield json.dumps({"type": "text-delta", "content": chunk}) + "\n"
                yield json.dumps({"type": "done"}) + "\n"
            except Exception as e:
                yield json.dumps({"type": "error", "content": str(e)}) + "\n"
        
        return StreamingResponse(
            generate(),
            media_type="application/x-ndjson"
        )
    else:
        full_response = ""
        try:
            async for chunk in ai_service.generate_tactic(request.prompt):
                full_response += chunk
            
            # Try to parse as JSON
            try:
                tactic_data = json.loads(full_response)
                return {"success": True, "tactic": tactic_data}
            except json.JSONDecodeError:
                return {"success": False, "raw_response": full_response}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/explain-tactic")
async def ai_explain_tactic(request: ExplainTacticRequest):
    """Explain a tactic in natural language"""
    if not AI_AVAILABLE:
        raise HTTPException(status_code=503, detail="AI service not available")
    
    try:
        ai_service = get_ai_service()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"AI service initialization failed: {str(e)}")
    
    if request.stream:
        async def generate():
            try:
                async for chunk in ai_service.explain_tactic(request.tactic_data):
                    yield json.dumps({"type": "text-delta", "content": chunk}) + "\n"
                yield json.dumps({"type": "done"}) + "\n"
            except Exception as e:
                yield json.dumps({"type": "error", "content": str(e)}) + "\n"
        
        return StreamingResponse(
            generate(),
            media_type="application/x-ndjson"
        )
    else:
        full_response = ""
        try:
            async for chunk in ai_service.explain_tactic(request.tactic_data):
                full_response += chunk
            return {"explanation": full_response}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ai/templates")
async def get_tactic_templates():
    """Get available predefined tactic templates"""
    if not AI_AVAILABLE:
        return {"templates": {}}
    
    return {"templates": TACTIC_TEMPLATES}


@app.post("/api/ai/save-tactic")
async def save_generated_tactic(request: Dict[str, Any]):
    """Save a generated tactic to the tactics library"""
    tactic_data = request.get("tactic_data")
    name = request.get("name", "AI Generated Tactic")
    
    if not tactic_data:
        raise HTTPException(status_code=400, detail="Missing tactic_data")
    
    # Generate filename
    filename = name.replace(" ", "_").lower()
    filename = "".join(c for c in filename if c.isalnum() or c == "_")
    filename = f"ai_{filename}_{int(datetime.now().timestamp())}.json"
    
    # Wrap in proper format
    full_tactic = {
        "meta": {
            "version": "1.0",
            "timestamp": datetime.now().isoformat(),
            "viewMode": "full",
            "frameCount": 1,
            "name": name,
            "description": tactic_data.get("description", "AI generated tactic"),
            "source": "ai_generated"
        },
        "frames": [
            {
                "id": "1",
                "index": 0,
                "entities": [],
                "actionsMap": {"full": [], "half": []}
            }
        ]
    }
    
    # Convert steps to entities and actions
    steps = tactic_data.get("steps", [])
    players_added = set()
    actions = []
    
    for step in steps:
        player_num = step.get("player_number", "1")
        player_id = f"ai_player_{player_num}"
        
        # Add player if not already added
        if player_num not in players_added:
            full_tactic["frames"][0]["entities"].append({
                "id": player_id,
                "type": "player",
                "team": "red",
                "number": player_num,
                "position": step.get("start_pos", {"x": 400, "y": 400}),
                "rotation": 0
            })
            players_added.add(player_num)
        
        # Add action
        start = step.get("start_pos", {"x": 400, "y": 400})
        end = step.get("end_pos", {"x": 400, "y": 500})
        actions.append({
            "id": f"action_{step.get('order', 1)}",
            "type": step.get("action", "move"),
            "playerId": player_id,
            "path": [start, end],
            "speed": "jog"
        })
    
    full_tactic["frames"][0]["actionsMap"]["full"] = actions
    
    # Add ball to first player
    if players_added:
        first_player = f"ai_player_{min(players_added)}"
        first_player_entity = next(
            (e for e in full_tactic["frames"][0]["entities"] if e["id"] == first_player),
            None
        )
        if first_player_entity:
            full_tactic["frames"][0]["entities"].append({
                "id": "ball",
                "type": "ball",
                "position": first_player_entity["position"],
                "ownerId": first_player
            })
    
    # Save to file
    file_path = os.path.join(TACTICS_DIR, filename)
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(full_tactic, f, indent=2, ensure_ascii=False)
    
    return {
        "success": True,
        "filename": filename,
        "tactic_id": filename.replace(".json", "")
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
