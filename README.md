# Basketball Tactics Board Project

## Project Introduction
This is a basketball tactics board frontend project based on React + TypeScript + Konva.

**Live Demo**: [https://basketball-tactics-board.vercel.app/](https://basketball-tactics-board.vercel.app/)

## Quick Start

### 1. Enter Frontend Directory
Open terminal and enter the `frontend` directory:
```bash
cd frontend
```

### 2. Install Dependencies
Install project dependencies using npm or yarn:
```bash
npm install
# or
yarn
```

### 3. Start Development Server
```bash
npm run dev
# or
yarn dev
```

After starting, open your browser and visit the address output in the console (usually http://localhost:5173) to see the tactics board.

## Features
- **Court Drawing**: Includes standard basketball court lines (center line, three-point line, paint area, etc.).
- **Player Interaction**: Supports dragging 10 players (5 offense, 5 defense).

## Roadmap
1. **Toolbar Development**: Add drawing tools (movement paths, passing paths, pick-and-roll symbols).
2. **Drawing Logic**: Implement `onMouseDown`, `onMouseMove`, `onMouseUp` events to draw lines.
3. **Animation Playback**: Record keyframes and implement interpolation animation.
