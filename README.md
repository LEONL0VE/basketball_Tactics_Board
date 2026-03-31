# AI Basketball Tactics Board & Lineup Diagnostic System

An interactive, AI-powered 2D basketball tactics board. It automatically translates hand-drawn actions on a digital canvas into quantifiable Synergy Sports playtypes, evaluating court spacing and calculating lineup-tactic congruence via mathematical algorithms.

## Author
**Leon** (Initial Draft Version)

## Repo Link
https://github.com/LEONL0VE/basketball_Tactics_Board

## Core Features
* Interactive 2D Tactics Canvas: Built with React-Konva. Draw screens, passes, dribbles, and off-ball cuts across a full/half-court representation. 
* Semantic Playtype Tagging: The drawing engine automatically detects actions and maps canvas drawings strictly into Synergy Playtype Dimensions (PnR_BH, Spot_Up, Isolation, etc.).
* Histogram Intersection Fit Scoring: Evaluates how much a 5-man player lineup matches the drawn tactic sequence using a rigid formula: sum(min(Demand_k, Supply_k)) / sum(Demand).
* Alpha Positional Decay: Simulates ball possession conflict using geometric series decay weightings.
* AI Roster Diagnostics: Integrates LLM assistance to automatically suggest which specific player is limiting the tactics score and pinpoints the required archetype to replace them.

## Tech Stack
* Frontend: React, Konva, Vite
* Backend: Python, FastAPI

## Quick Start
1. Launch Backend: cd backend -> pip install -r requirements.txt -> uvicorn main:app --reload --port 8000
2. Launch Frontend: cd frontend -> npm install -> npm run dev
