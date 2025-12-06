from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import pandas as pd
import uvicorn
import json
from datetime import datetime

from nba_api.stats.static import players as nba_players_static
from nba_api.stats.endpoints import commonplayerinfo, playercareerstats

# Import local modules
from epv_analytics import calculate_epv_series
from fetch_shot_chart import fetch_player_shot_chart

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Data Models ---

class TrajectoryFrame(BaseModel):
    timestamp: float
    entities: List[Dict[str, Any]]

class AnalysisRequest(BaseModel):
    trajectory: List[TrajectoryFrame]
    court_type: Optional[str] = "full"

# --- Endpoints ---

@app.get("/")
async def root():
    return {"message": "Basketball Tactics Board Backend is running"}

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
        
        # Fetch career stats for averages
        career = playercareerstats.PlayerCareerStats(player_id=player_id)
        career_df = career.get_data_frames()[0]
        
        print(f"Fetching stats for player {player_id}")
        print(f"Career DF empty? {career_df.empty}")
        
        stats = {
            "ppg": "-", "rpg": "-", "apg": "-", 
            "fg_pct": "-", "fg2_pct": "-", "fg3_pct": "-"
        }
        
        if not career_df.empty:
            # Get latest season
            latest = career_df.iloc[-1]
            print(f"Latest season data: {latest.to_dict()}")
            
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
                    "y": entity.get("y")
                })
        
        kinematics_df = pd.DataFrame(frames_data)
        
        # Run Analysis
        epv_series = calculate_epv_series(kinematics_df)
        
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

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
