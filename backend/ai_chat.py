"""
AI Chat Service for Basketball Tactics Board
Supports: Gemini (Google), OpenAI GPT-4, DeepSeek

This module provides:
1. Text-to-Tactics: Generate tactics from natural language
2. Tactics-to-Text: Explain existing tactics in natural language
3. Interactive Chat: Answer basketball-related questions
"""

import os
import json
import asyncio
from typing import List, Dict, Any, Optional, AsyncGenerator
from dataclasses import dataclass
from enum import Enum

# Try to import AI libraries
try:
    import google.genai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("Warning: google.genai not installed. Gemini will not be available.")

try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    print("Warning: openai not installed. OpenAI/DeepSeek will not be available.")


# ============== Configuration ==============

class AIProvider(Enum):
    GEMINI = "gemini"
    OPENAI = "openai"
    DEEPSEEK = "deepseek"


@dataclass
class AIConfig:
    provider: AIProvider = AIProvider.GEMINI
    gemini_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    deepseek_api_key: Optional[str] = None
    model_name: str = "gemini-3-flash-preview"  # Changed to 1.5-flash for better stability
    temperature: float = 0.7
    max_tokens: int = 4096


# ============== Court Spatial Semantics ==============

COURT_REGIONS = {
    # Full court regions (800x682 canvas, hoop at ~(400, 620))
    "backcourt": {"x_range": (0, 800), "y_range": (0, 200), "name": "Backcourt"},
    "midcourt": {"x_range": (0, 800), "y_range": (200, 350), "name": "Midcourt"},
    "top_of_key": {"x_range": (300, 500), "y_range": (350, 450), "name": "Top of Key"},
    "left_wing": {"x_range": (0, 200), "y_range": (350, 550), "name": "Left Wing"},
    "right_wing": {"x_range": (600, 800), "y_range": (350, 550), "name": "Right Wing"},
    "left_corner": {"x_range": (0, 150), "y_range": (550, 682), "name": "Left Corner"},
    "right_corner": {"x_range": (650, 800), "y_range": (550, 682), "name": "Right Corner"},
    "paint": {"x_range": (280, 520), "y_range": (500, 682), "name": "Paint"},
    "low_post_left": {"x_range": (200, 320), "y_range": (520, 620), "name": "Left Low Post"},
    "low_post_right": {"x_range": (480, 600), "y_range": (520, 620), "name": "Right Low Post"},
    "high_post": {"x_range": (320, 480), "y_range": (450, 520), "name": "High Post"},
    "basket": {"x_range": (350, 450), "y_range": (580, 682), "name": "Under Basket"},
}


def get_court_region(x: float, y: float) -> str:
    """Convert x,y coordinates to semantic court region name"""
    for region_id, region in COURT_REGIONS.items():
        x_min, x_max = region["x_range"]
        y_min, y_max = region["y_range"]
        if x_min <= x <= x_max and y_min <= y <= y_max:
            return region["name"]
    return "On Court"


def get_position_role(number: str) -> str:
    """Map player number to position role"""
    roles = {
        "1": "Point Guard (PG)",
        "2": "Shooting Guard (SG)", 
        "3": "Small Forward (SF)",
        "4": "Power Forward (PF)",
        "5": "Center (C)"
    }
    return roles.get(number, f"Player {number}")


# ============== System Prompts ==============

SYSTEM_PROMPT_GENERATE = """You are a professional basketball tactics analyst and coaching assistant. Your task is to generate basketball tactics based on user's natural language description.

## Court Coordinate System
- Canvas size: 800 x 682 pixels
- Basket position: approximately (400, 620)
- Three-point arc top: approximately y=400
- Half-court line: approximately y=200
- Origin (0,0) is at top-left corner

## Court Regions
- Backcourt: y < 200
- Midcourt: 200 < y < 350  
- Top of Key: x=300-500, y=350-450
- Left Wing: x < 200, y=350-550
- Right Wing: x > 600, y=350-550
- Left Corner: x < 150, y > 550
- Right Corner: x > 650, y > 550
- Paint: x=280-520, y > 500
- High Post: x=320-480, y=450-520
- Under Basket: x=350-450, y > 580

## Player Numbers to Positions
- #1: Point Guard (PG)
- #2: Shooting Guard (SG)
- #3: Small Forward (SF)
- #4: Power Forward (PF)
- #5: Center (C)

## Action Types
- move: Off-ball movement
- dribble: Ball handling movement
- pass: Pass the ball
- shoot: Take a shot
- screen: Set a screen
- cut: Cutting to basket

## Output Format
You must output a valid JSON object in the following format:
```json
{
  "tactic_name": "Tactic Name",
  "description": "Brief description of the tactic",
  "steps": [
    {
      "order": 1,
      "player_number": "1",
      "action": "dribble",
      "start_pos": {"x": 400, "y": 300},
      "end_pos": {"x": 400, "y": 450},
      "description": "PG dribbles to top of key"
    }
  ]
}
```

## Important Rules
1. Each step must contain: order, player_number, action, start_pos, end_pos, description
2. Coordinates must be within court bounds (0-800, 0-682)
3. Action must be one of the valid types
4. Steps should be in chronological order
5. Output ONLY the JSON, no other text

User Request:"""

SYSTEM_PROMPT_EXPLAIN = """You are a professional basketball tactics analyst. Your task is to analyze given tactical data and explain it in natural language.

## Court Coordinate System
- Canvas size: 800 x 682 pixels
- Basket position: approximately (400, 620)
- Three-point arc top: approximately y=400
- Origin (0,0) is at top-left corner

## Player Numbers to Positions
- #1: Point Guard (PG)
- #2: Shooting Guard (SG)
- #3: Small Forward (SF)
- #4: Power Forward (PF)
- #5: Center (C)

## Your Tasks
1. Analyze player positioning and movement patterns
2. Identify key tactical elements (pick and roll, cuts, screens, etc.)
3. Explain the tactical intent and execution points
4. Provide coaching suggestions

Please respond in English with professional but accessible language."""

SYSTEM_PROMPT_CHAT = """You are a professional basketball tactics analyst and coaching assistant. You can:

1. **Generate Tactics**: When user says "draw a...", "generate...", "create...", generate tactic JSON
2. **Explain Tactics**: When user says "explain...", "analyze...", analyze tactical intent
3. **Answer Questions**: Answer basketball-related questions

## Available Tools
You can call the following tools to operate the tactics board:

### generate_tactic
Generate new tactical configuration. Returns JSON data with player positions and actions.

### explain_tactic  
Explain the content on current tactics board.

### add_player
Add a player at specified position.
Parameters: team (red/blue), number (1-5), x, y

### move_player
Move specified player to new position.
Parameters: player_number, x, y

### add_action
Add action path for a player.
Parameters: player_number, action_type (move/pass/dribble/screen/shoot), path (array of positions)

### clear_board
Clear the tactics board.

## Response Format
- If you need to call a tool, use JSON format: {"tool": "tool_name", "params": {...}}
- If just chatting, reply with text directly

Please respond in English."""


# ============== AI Service Class ==============

class AIService:
    """AI Service for basketball tactics generation and explanation"""
    
    def __init__(self, config: AIConfig):
        self.config = config
        self._setup_client()
    
    def _setup_client(self):
        """Initialize the AI client based on provider"""
        if self.config.provider == AIProvider.GEMINI:
            if not GEMINI_AVAILABLE:
                raise ImportError("google.genai is not installed")
            
            api_key = self.config.gemini_api_key or os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("GEMINI_API_KEY not provided")
            
            # Use google.genai Client (new V1 SDK)
            self.client = genai.Client(api_key=api_key)
            
        elif self.config.provider == AIProvider.OPENAI:
            if not OPENAI_AVAILABLE:
                raise ImportError("openai is not installed")
            
            api_key = self.config.openai_api_key or os.getenv("OPENAI_API_KEY")
            if not api_key:
                raise ValueError("OPENAI_API_KEY not provided")
            
            self.client = openai.AsyncOpenAI(api_key=api_key)
            
        elif self.config.provider == AIProvider.DEEPSEEK:
            if not OPENAI_AVAILABLE:
                raise ImportError("openai is not installed (needed for DeepSeek)")
            
            api_key = self.config.deepseek_api_key or os.getenv("DEEPSEEK_API_KEY")
            if not api_key:
                raise ValueError("DEEPSEEK_API_KEY not provided")
            
            self.client = openai.AsyncOpenAI(
                api_key=api_key,
                base_url="https://api.deepseek.com/v1"
            )
    
    async def generate_tactic(self, user_prompt: str) -> AsyncGenerator[str, None]:
        """Generate tactics from natural language description (streaming)"""
        full_prompt = SYSTEM_PROMPT_GENERATE + "\n" + user_prompt
        
        async for chunk in self._stream_response(full_prompt):
            yield chunk
    
    async def explain_tactic(self, tactic_data: Dict[str, Any]) -> AsyncGenerator[str, None]:
        """Explain a tactic in natural language (streaming)"""
        # Convert tactic data to semantic description
        semantic_desc = self._convert_to_semantic(tactic_data)
        
        prompt = f"{SYSTEM_PROMPT_EXPLAIN}\n\n## Tactic Data\n{semantic_desc}\n\nPlease analyze this tactic:"
        
        async for chunk in self._stream_response(prompt):
            yield chunk
    
    async def chat(self, messages: List[Dict[str, str]], current_tactic: Optional[Dict] = None) -> AsyncGenerator[str, None]:
        """Interactive chat with context (streaming)"""
        context = ""
        if current_tactic:
            context = f"\n\n## Current Tactics Board State\n{self._convert_to_semantic(current_tactic)}"
        
        system_msg = SYSTEM_PROMPT_CHAT + context
        
        if self.config.provider == AIProvider.GEMINI:
            try:
                # Combine messages into a single prompt for V1 SDK simplicity
                full_prompt = f"System: {system_msg}\n\n"
                for msg in messages:
                    role = "User" if msg["role"] == "user" else "Assistant"
                    full_prompt += f"{role}: {msg['content']}\n"
                
                full_prompt += "Assistant: "

                loop = asyncio.get_running_loop()
                
                def generate():
                    return self.client.models.generate_content(
                        model=self.config.model_name,
                        contents=full_prompt,
                        config=genai.types.GenerateContentConfig(
                            temperature=self.config.temperature,
                            max_output_tokens=self.config.max_tokens
                        )
                    )
                
                response = await loop.run_in_executor(None, generate)
                
                if response.text:
                    full_text = response.text
                    chunk_size = 50
                    for i in range(0, len(full_text), chunk_size):
                        chunk = full_text[i:i+chunk_size]
                        if chunk:
                            yield chunk
                        await asyncio.sleep(0.01)

            except Exception as e:
                yield f"Error: {str(e)}"
                
        else:
            # OpenAI/DeepSeek format
            full_messages = [{"role": "system", "content": system_msg}]
            full_messages.extend(messages)
            
            try:
                response = await self.client.chat.completions.create(
                    model=self.config.model_name,
                    messages=full_messages,
                    temperature=self.config.temperature,
                    max_tokens=self.config.max_tokens,
                    stream=True
                )
                
                async for chunk in response:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
                        
            except Exception as e:
                yield f"Error: {str(e)}"
    
    async def _stream_response(self, prompt: str) -> AsyncGenerator[str, None]:
        """Stream response from AI provider"""
        if self.config.provider == AIProvider.GEMINI:
            try:
                # Use google.genai Client generate (stream=True)
                # Note: 'model' in generate refers to model name string
                response = self.client.models.generate_content(
                    model=self.config.model_name,
                    contents=prompt,
                    config=genai.types.GenerateContentConfig(
                        temperature=self.config.temperature,
                        max_output_tokens=self.config.max_tokens
                    )
                )
                
                # In google.genai, streaming might be different or we need check documentation.
                # Actually, the non-async version usually returns a response object.
                # For stream=True, pass config.
                
                # Let's try synchronous call first for simplicity if async is tricky in V1
                # But we need streaming.
                
                # Correction: V1 SDK client.models.generate_content is synchronous but can return stream.
                # However we are in async function.
                
                # Let's run it in a thread executor to avoid blocking the event loop
                loop = asyncio.get_running_loop()
                
                def generate():
                    return self.client.models.generate_content(
                        model=self.config.model_name,
                        contents=prompt,
                        config=genai.types.GenerateContentConfig(
                            temperature=self.config.temperature,
                            max_output_tokens=self.config.max_tokens
                        )
                    )
                
                response = await loop.run_in_executor(None, generate)
                
                if response.text:
                    # Simulating stream by chunking the full response
                    full_text = response.text
                    chunk_size = 50
                    for i in range(0, len(full_text), chunk_size):
                        chunk = full_text[i:i+chunk_size]
                        if chunk:
                            yield chunk
                        await asyncio.sleep(0.01)

            except Exception as e:
                yield f"Error: {str(e)}"
                
        else:
            # OpenAI/DeepSeek
            try:
                response = await self.client.chat.completions.create(
                    model=self.config.model_name,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=self.config.temperature,
                    max_tokens=self.config.max_tokens,
                    stream=True
                )
                
                async for chunk in response:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
                        
            except Exception as e:
                yield f"Error: {str(e)}"
    
    def _convert_to_semantic(self, tactic_data: Dict[str, Any]) -> str:
        """Convert tactic JSON to semantic description for LLM"""
        lines = []
        
        # Meta info
        meta = tactic_data.get("meta", {})
        if meta:
            lines.append(f"Tactic Name: {meta.get('name', 'Unnamed')}")
            lines.append(f"Description: {meta.get('description', 'None')}")
            lines.append(f"Frame Count: {meta.get('frameCount', 1)}")
            lines.append("")
        
        # Process frames
        frames = tactic_data.get("frames", [])
        for i, frame in enumerate(frames):
            lines.append(f"### Frame {i+1}")
            
            entities = frame.get("entities", [])
            players = [e for e in entities if e.get("type") == "player"]
            ball = next((e for e in entities if e.get("type") == "ball"), None)
            
            # Player positions
            for player in players:
                pos = player.get("position", {})
                x, y = pos.get("x", 0), pos.get("y", 0)
                region = get_court_region(x, y)
                role = get_position_role(player.get("number", ""))
                team = "Offense" if player.get("team") == "red" else "Defense"
                lines.append(f"- {team} {role}: at {region} ({x:.0f}, {y:.0f})")
            
            # Ball position
            if ball:
                pos = ball.get("position", {})
                owner_id = ball.get("ownerId")
                if owner_id:
                    owner = next((p for p in players if p.get("id") == owner_id), None)
                    if owner:
                        lines.append(f"- Ball: held by {get_position_role(owner.get('number', ''))}")
                else:
                    lines.append(f"- Ball: at ({pos.get('x', 0):.0f}, {pos.get('y', 0):.0f})")
            
            # Actions
            actions = frame.get("actionsMap", {}).get("full", [])
            if actions:
                lines.append("\nActions:")
                for action in actions:
                    action_type = action.get("type", "")
                    player_id = action.get("playerId", "")
                    path = action.get("path", [])
                    
                    # Find player
                    player = next((p for p in players if p.get("id") == player_id), None)
                    player_name = get_position_role(player.get("number", "")) if player else "Player"
                    
                    if len(path) >= 2:
                        start = path[0]
                        end = path[-1]
                        start_region = get_court_region(start.get("x", 0), start.get("y", 0))
                        end_region = get_court_region(end.get("x", 0), end.get("y", 0))
                        
                        action_desc = {
                            "move": "moves",
                            "dribble": "dribbles",
                            "pass": "passes",
                            "shoot": "shoots",
                            "screen": "screens",
                            "cut": "cuts"
                        }.get(action_type, action_type)
                        
                        lines.append(f"  - {player_name} {action_desc}: from {start_region} to {end_region}")
            
            lines.append("")
        
        return "\n".join(lines)


# ============== Tool Definitions ==============

TOOLS = [
    {
        "name": "generate_tactic",
        "description": "Generate basketball tactics based on user description. Returns JSON data with player positions and actions.",
        "parameters": {
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "Tactic description, e.g., 'pick and roll', 'triangle offense'"
                }
            },
            "required": ["description"]
        }
    },
    {
        "name": "explain_tactic",
        "description": "Explain the tactical content and intent on current tactics board.",
        "parameters": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "add_player",
        "description": "Add a player to the tactics board.",
        "parameters": {
            "type": "object",
            "properties": {
                "team": {
                    "type": "string",
                    "enum": ["red", "blue"],
                    "description": "Team color, red for offense, blue for defense"
                },
                "number": {
                    "type": "string",
                    "enum": ["1", "2", "3", "4", "5"],
                    "description": "Player number, corresponds to position"
                },
                "x": {
                    "type": "number",
                    "description": "X coordinate (0-800)"
                },
                "y": {
                    "type": "number",
                    "description": "Y coordinate (0-682)"
                }
            },
            "required": ["team", "number", "x", "y"]
        }
    },
    {
        "name": "move_player",
        "description": "Move specified player to new position.",
        "parameters": {
            "type": "object",
            "properties": {
                "player_id": {
                    "type": "string",
                    "description": "Player ID or number"
                },
                "x": {
                    "type": "number",
                    "description": "New X coordinate"
                },
                "y": {
                    "type": "number",
                    "description": "New Y coordinate"
                }
            },
            "required": ["player_id", "x", "y"]
        }
    },
    {
        "name": "add_action",
        "description": "Add action path for a player (e.g., movement, pass).",
        "parameters": {
            "type": "object",
            "properties": {
                "player_id": {
                    "type": "string",
                    "description": "Player ID or number"
                },
                "action_type": {
                    "type": "string",
                    "enum": ["move", "dribble", "pass", "screen", "shoot", "cut"],
                    "description": "Action type"
                },
                "path": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "x": {"type": "number"},
                            "y": {"type": "number"}
                        }
                    },
                    "description": "Array of path points"
                }
            },
            "required": ["player_id", "action_type", "path"]
        }
    },
    {
        "name": "clear_board",
        "description": "Clear all content on the tactics board.",
        "parameters": {
            "type": "object",
            "properties": {}
        }
    }
]


# ============== Predefined Tactics Templates ==============

TACTIC_TEMPLATES = {
    "pick_and_roll": {
        "name": "High Pick and Roll",
        "description": "Classic high pick and roll play between PG and Center",
        "steps": [
            {
                "order": 1,
                "player_number": "1",
                "action": "dribble",
                "start_pos": {"x": 400, "y": 300},
                "end_pos": {"x": 400, "y": 420},
                "description": "PG dribbles to three-point line"
            },
            {
                "order": 2,
                "player_number": "5",
                "action": "move",
                "start_pos": {"x": 400, "y": 550},
                "end_pos": {"x": 420, "y": 430},
                "description": "Center comes up to set screen"
            },
            {
                "order": 3,
                "player_number": "5",
                "action": "screen",
                "start_pos": {"x": 420, "y": 430},
                "end_pos": {"x": 420, "y": 430},
                "description": "Center sets the screen"
            },
            {
                "order": 4,
                "player_number": "1",
                "action": "dribble",
                "start_pos": {"x": 400, "y": 420},
                "end_pos": {"x": 550, "y": 450},
                "description": "PG uses screen to drive"
            },
            {
                "order": 5,
                "player_number": "5",
                "action": "move",
                "start_pos": {"x": 420, "y": 430},
                "end_pos": {"x": 400, "y": 580},
                "description": "Center rolls to basket"
            }
        ]
    },
    "triangle_offense": {
        "name": "Triangle Offense",
        "description": "Classic triangle offense positioning",
        "steps": [
            {
                "order": 1,
                "player_number": "1",
                "action": "move",
                "start_pos": {"x": 400, "y": 300},
                "end_pos": {"x": 300, "y": 400},
                "description": "PG moves to left wing"
            },
            {
                "order": 2,
                "player_number": "5",
                "action": "move",
                "start_pos": {"x": 400, "y": 550},
                "end_pos": {"x": 280, "y": 540},
                "description": "Center posts up on left block"
            },
            {
                "order": 3,
                "player_number": "3",
                "action": "move",
                "start_pos": {"x": 200, "y": 400},
                "end_pos": {"x": 150, "y": 600},
                "description": "SF moves to left corner"
            }
        ]
    },
    "fast_break": {
        "name": "Fast Break",
        "description": "Quick transition offense",
        "steps": [
            {
                "order": 1,
                "player_number": "1",
                "action": "dribble",
                "start_pos": {"x": 400, "y": 150},
                "end_pos": {"x": 400, "y": 500},
                "description": "PG pushes the ball up court"
            },
            {
                "order": 2,
                "player_number": "2",
                "action": "move",
                "start_pos": {"x": 200, "y": 200},
                "end_pos": {"x": 150, "y": 550},
                "description": "SG runs left lane"
            },
            {
                "order": 3,
                "player_number": "3",
                "action": "move",
                "start_pos": {"x": 600, "y": 200},
                "end_pos": {"x": 650, "y": 550},
                "description": "SF runs right lane"
            }
        ]
    }
}


def get_tactic_template(tactic_type: str) -> Optional[Dict]:
    """Get a predefined tactic template"""
    return TACTIC_TEMPLATES.get(tactic_type)


# ============== Singleton Service Instance ==============

_ai_service: Optional[AIService] = None


def get_ai_service(config: Optional[AIConfig] = None) -> AIService:
    """Get or create AI service instance"""
    global _ai_service
    
    if _ai_service is None:
        if config is None:
            # Try to auto-detect available provider
            if os.getenv("GEMINI_API_KEY"):
                config = AIConfig(provider=AIProvider.GEMINI)
            elif os.getenv("OPENAI_API_KEY"):
                config = AIConfig(provider=AIProvider.OPENAI, model_name="gpt-4o")
            elif os.getenv("DEEPSEEK_API_KEY"):
                config = AIConfig(provider=AIProvider.DEEPSEEK, model_name="deepseek-chat")
            else:
                raise ValueError("No AI API key found in environment variables")
        
        _ai_service = AIService(config)
    
    return _ai_service


def reset_ai_service():
    """Reset the AI service (useful for changing configuration)"""
    global _ai_service
    _ai_service = None
