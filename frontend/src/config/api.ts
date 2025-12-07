// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://basketball-tactics-board.onrender.com';

export const API_ENDPOINTS = {
  SEARCH_PLAYERS: `${API_BASE_URL}/api/players/search`,
  GET_PLAYER_STATS: (playerId: string) => `${API_BASE_URL}/api/players/${playerId}/stats`,
  MATCH_TACTIC: `${API_BASE_URL}/api/match-tactic`,
  ANALYZE_EPV: `${API_BASE_URL}/api/epv/analyze`,
};

export default API_BASE_URL;
