// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://basketball-tactics-board.onrender.com';

export const API_ENDPOINTS = {
  BASE_URL: API_BASE_URL,
  SEARCH_PLAYERS: `${API_BASE_URL}/api/players/search`,
  GET_PLAYER_STATS: (playerId: string) => `${API_BASE_URL}/api/players/${playerId}/stats`,
  MATCH_TACTIC: `${API_BASE_URL}/api/match-tactic`,
  ANALYZE_EPV: `${API_BASE_URL}/api/epv/analyze`,
  
  // AI Endpoints
  AI_STATUS: `${API_BASE_URL}/api/ai/status`,
  AI_CHAT: `${API_BASE_URL}/api/ai/chat`,
  AI_GENERATE_TACTIC: `${API_BASE_URL}/api/ai/generate-tactic`,
  AI_EXPLAIN_TACTIC: `${API_BASE_URL}/api/ai/explain-tactic`,
  AI_TEMPLATES: `${API_BASE_URL}/api/ai/templates`,
  AI_SAVE_TACTIC: `${API_BASE_URL}/api/ai/save-tactic`,
  
  // Tactics Gallery
  TACTICS: `${API_BASE_URL}/api/tactics`,
};

export default API_BASE_URL;
