// Court dimensions (Unit: pixels, assuming 1 meter = 15 pixels)
// NBA Court: 94 x 50 feet (28.65m x 15.24m)
export const SCALE = 45; 
export const COURT_WIDTH = 28.65 * SCALE;
export const COURT_HEIGHT = 15.24 * SCALE;
export const RIM_X = 1.575 * SCALE; // Distance from baseline to rim center
export const RIM_Y = COURT_HEIGHT / 2;

// Colors
export const APP_BACKGROUND = '#1F1F1F'; // Dark Grey Sports Style
export const COURT_COLOR = '#C68E56'; // Deep Orange-Brown Wood
export const LINE_COLOR = '#ffffff';  // 线条颜色
export const BORDER_COLOR = '#333333'; // 边框颜色
export const ACCENT_COLOR = '#3A7AFE'; // Unified Accent Color (Sports Blue)

export const TEAM_COLORS: Record<string, string> = {
  red: '#E74C3C', // Home/Away Red
  blue: '#3A7AFE', // Home/Away Blue (Accent)
  green: '#58C491', // Low Sat Green
  yellow: '#F3C45A', // Low Sat Yellow
  purple: '#AE7BFA', // Low Sat Purple
  orange: '#d35400',
  black: '#2c3e50',
  white: '#ecf0f1',
  grey: '#8CA3B0', // Low Sat Grey Blue
  cyan: '#1abc9c'
};