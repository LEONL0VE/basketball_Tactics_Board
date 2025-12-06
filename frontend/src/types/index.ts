export interface Position {
  x: number;
  y: number;
}

export type TeamType = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'black' | 'white' | 'grey' | 'cyan';
export type ViewMode = 'full' | 'half';

export interface PlayerProfile {
  id: number;
  name: string;
  photoUrl: string;
  stats?: {
    fgPct: number;
    twoPct?: number;
    threePct: number;
    ppg?: number;
    rpg?: number;
    apg?: number;
    position: string;
    height?: string;
    weight?: string;
    age?: string;
    hotZones?: { 
      [key: string]: {
        pct: number;
        fga: number;
        fgm: number;
      } 
    };
  };
}

export interface Player {
  id: string;
  type: 'player';
  number: string;
  team: TeamType;
  position: Position;
  rotation?: number;
  role?: string; // PG, SG, SF, PF, C
  profile?: PlayerProfile;
}

export interface Ball {
  id: string;
  type: 'ball';
  position: Position;
  ownerId?: string; // ID of the player holding the ball
}

export type ActionType = 'move' | 'dribble' | 'pass' | 'shoot' | 'screen' | 'steal' | 'block';

export type SpeedLevel = 'walk' | 'jog' | 'sprint';

export interface Action {
  id: string;
  type: ActionType;
  playerId: string;
  path: Position[];
  color?: string;
  speed?: SpeedLevel;
}

export type BoardEntity = Player | Ball;

export type ToolType = 'move' | 'pass' | 'dribble' | 'screen' | 'steal' | 'block' | 'select';