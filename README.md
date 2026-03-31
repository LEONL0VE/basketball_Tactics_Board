# AI Basketball Tactics Board & Lineup Diagnostic System

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![React](https://img.shields.io/badge/Frontend-React%20%7C%20Konva-61DAFB?logo=react&logoColor=white)
![FastAPI](https://img.shields.io/badge/Backend-FastAPI%20%7C%20Python-009688?logo=fastapi&logoColor=white)

An interactive, AI-powered 2D basketball tactics board that bridges the gap between coaching intuition and advanced analytics. It automatically translates hand-drawn actions on a digital canvas into quantifiable Synergy Sports playtypes, evaluating court spacing and calculating lineup-tactic congruence via mathematical algorithms.

## ?? Core Features

- **Interactive 2D Tactics Canvas:** Built with React-Konva. Draw screens, passes, dribbles, and off-ball cuts across a full/half-court representation. Provides an automatic animation interpolation engine bridging positional gaps frame-by-frame.
- **Semantic Playtype Tagging:** The drawing engine automatically detects X/Y coordinates and context (e.g., painting an outward curve from the paint implies an Off_Screen) and maps canvas drawings strictly into **Synergy Playtype Dimensions** (PnR_BH, Spot_Up, Isolation, etc.).
- **Histogram Intersection Fit Scoring:** Evaluates how much a 5-man player lineup matches the drawn tactic sequence. Instead of using a loose Cosine Similarity, it applies a rigid Short-board (Histogram Intersection) formula: ¡Æ min(Demand_k, Supply_k) / ¡Æ Demand. Overflow skills do NOT provide bonus scores.
- **Alpha Positional Decay:** Simulates "ball possession conflict" using geometric series decay weightings¡ªputting two Primary Ball Handlers (PBHs) simultaneously weakens the redundant player's functional impact.
- **AI Roster Diagnostics:** Integrates LLM assistance to automatically suggest which specific player is limiting the tactics score and pinpoints the required archetype to replace them.

## ??? Tech Stack

- **Frontend:** React + TypeScript + Vite, Konva for 2D Canvas, Zustand.
- **Backend:** Python + FastAPI + Uvicorn.
- **Algorithms:** Custom spatial mapping algorithms & Array Intersection logic.

## ?? Quick Start

### 1. Launch Backend API
Require Python 3.8+
\\\ash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
\\\

### 2. Launch Frontend Web App
Require Node.js 18+
\\\ash
cd frontend
npm install
npm run dev
\\\

## ?? License
This project is under the MIT License.
