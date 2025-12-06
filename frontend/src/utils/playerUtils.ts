import { Player, Position, Ball } from '../types';
import { COURT_WIDTH, COURT_HEIGHT, SCALE } from './constants';

/**
 * Calculates the visual radius of a player based on their physical stats.
 * Base radius is 14px.
 * Height bonus: +0.3px per inch over 6'0".
 * Weight bonus: +0.05px per lb over 180lbs.
 * Max radius capped at 22px.
 */
export const getPlayerRadius = (player: Player): number => {
  const baseRadius = 14;
  if (!player.profile?.stats) return baseRadius;

  const { height, weight } = player.profile.stats;
  let bonus = 0;

  // Parse Height (e.g., "6'3")
  if (height) {
    const parts = height.split("'");
    if (parts.length === 2) {
      const feet = parseInt(parts[0]);
      const inches = parseInt(parts[1]);
      const totalInches = feet * 12 + inches;
      // Base height ~ 6'0 (72 inches)
      if (totalInches > 72) {
        bonus += (totalInches - 72) * 0.3;
      }
    }
  }

  // Parse Weight (e.g., "185")
  if (weight) {
    const lbs = parseInt(weight);
    // Base weight ~ 180 lbs
    if (!isNaN(lbs) && lbs > 180) {
      bonus += (lbs - 180) * 0.05;
    }
  }

  // Cap the bonus to avoid overly large players
  return Math.min(baseRadius + 8, baseRadius + bonus);
};

export const getZoneName = (pos: Position, basketPos: Position, viewMode: 'full' | 'half'): string => {
  const dx = pos.x - basketPos.x;
  const dy = pos.y - basketPos.y;
  const distPixels = Math.sqrt(dx * dx + dy * dy);
  const distMeters = distPixels / SCALE;

  if (distMeters < 1.25) return "Restricted Area";
  if (distMeters < 4.75) return "In The Paint (Non-RA)";
  
  const isCorner = distMeters > 6.7 && distMeters < 8.5 && 
    (viewMode === 'half' ? Math.abs(pos.x - basketPos.x) > (COURT_WIDTH/2 * 0.8) : Math.abs(pos.y - basketPos.y) > (COURT_HEIGHT/2 * 0.8));

  if (isCorner) return distMeters > 6.7 ? (pos.x < basketPos.x ? "Left Corner 3" : "Right Corner 3") : "Mid-Range";
  
  if (distMeters < 7.24) return "Mid-Range";
  return "Above the Break 3";
};

export const calculateGhostDefender = (
  attacker: Player, 
  ball: Ball | undefined, 
  viewMode: 'full' | 'half',
  allPlayers: Player[] = []
): { position: Position, radius: number, gap: number, isRealData: boolean, pct: number, isScreened: boolean, screenDisplacement: number } => {
  const BASKET_POS = viewMode === 'half' 
    ? { x: COURT_WIDTH / 2, y: 35 } 
    : { x: 40, y: COURT_HEIGHT / 2 };

  const attackerPos = attacker.position;
  
  // Vector from Attacker to Basket
  const vecToBasket = {
    x: BASKET_POS.x - attackerPos.x,
    y: BASKET_POS.y - attackerPos.y
  };
  const distToBasket = Math.sqrt(vecToBasket.x ** 2 + vecToBasket.y ** 2);
  const dirToBasket = {
    x: vecToBasket.x / (distToBasket || 1),
    y: vecToBasket.y / (distToBasket || 1)
  };

  const RIM_PROTECTION_BUFFER = 15; 
  const maxDist = Math.max(0, distToBasket - RIM_PROTECTION_BUFFER);

  // Get Zone and Stats
  const zoneName = getZoneName(attackerPos, BASKET_POS, viewMode);
  
  let pct = 0.35; // Default league average
  let isRealData = false;

  // Use player real stats if available
  if (attacker.profile?.stats?.hotZones) {
      const zones = attacker.profile.stats.hotZones;
      const key = Object.keys(zones).find(k => k.includes(zoneName));
      if (key && zones[key]) {
          pct = zones[key].pct;
          isRealData = true;
      }
  }

  let gap = 45; // Base gap ~1m

  const hasBall = ball?.ownerId === attacker.id;
  const ballPos = ball?.position || { x: 0, y: 0 };

  if (hasBall) {
    let avgPct = 0.35;
    if (zoneName.includes("Restricted")) avgPct = 0.60;
    else if (zoneName.includes("Paint")) avgPct = 0.50;
    else if (zoneName.includes("Mid")) avgPct = 0.40;
    
    const diff = pct - avgPct;
    // Factor: 10% diff -> 30px change
    gap = 45 - (diff * 300); 
    
    // Clamp gap
    gap = Math.max(30, Math.min(gap, 150));
    gap = Math.min(gap, maxDist);
  } else {
    // Off-Ball Defense (Sagging)
    const distToBall = Math.sqrt((attackerPos.x - ballPos.x) ** 2 + (attackerPos.y - ballPos.y) ** 2);
    let sagDistance = 60;
    if (distToBall > 300) sagDistance = 120; 
    else if (distToBall > 150) sagDistance = 80;
    
    // Adjust sag based on shooting threat too!
    if (pct > 0.40) sagDistance *= 0.7; // Stay closer
    
    sagDistance = Math.min(sagDistance, maxDist);
    gap = sagDistance;
  }

  let ghostPos = {
    x: attackerPos.x + dirToBasket.x * gap,
    y: attackerPos.y + dirToBasket.y * gap
  };

  // --- Screen / Obstacle Logic for Ghost Defender ---
  // If there is another player (Screener) in the way, the Ghost Defender gets blocked/delayed.
  const ghostRadius = 14;
  let isScreened = false;
  let screenDisplacement = 0;

  // Helper for segment distance
  const distToSegmentSq = (p: Position, v: Position, w: Position) => {
    const l2 = (v.x - w.x)**2 + (v.y - w.y)**2;
    if (l2 === 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = v.x + t * (w.x - v.x);
    const projY = v.y + t * (w.y - v.y);
    return (p.x - projX)**2 + (p.y - projY)**2;
  };

  allPlayers.forEach(other => {
    if (other.id === attacker.id) return; // Don't collide with the person we are guarding

    const otherRadius = getPlayerRadius(other);
    const minDist = ghostRadius + otherRadius;
    
    // 1. Direct Collision Check (Existing)
    const dx = ghostPos.x - other.position.x;
    const dy = ghostPos.y - other.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDist && dist > 0) {
       // Collision with Screener!
       const overlap = minDist - dist;
       const pushX = (dx / dist) * overlap;
       const pushY = (dy / dist) * overlap;
       
       ghostPos.x += pushX;
       ghostPos.y += pushY;
       
       isScreened = true;
       screenDisplacement += overlap;
    }

    // 2. Path Obstruction Check (New)
    // Even if not colliding directly, check if the screener blocks the path to the attacker
    if (!isScreened) {
        const distSq = distToSegmentSq(other.position, ghostPos, attackerPos);
        const dist = Math.sqrt(distSq);
        
        if (dist < minDist) {
            isScreened = true;
            // Calculate virtual overlap (how much the screener blocks the path)
            // This makes the "Open" detection proportional to how centered the screener is on the path
            const virtualOverlap = minDist - dist;
            screenDisplacement += virtualOverlap; 
        }
    }
  });

  return {
    position: ghostPos,
    radius: ghostRadius,
    gap,
    isRealData,
    pct,
    isScreened,
    screenDisplacement
  } as any;
};

/**
 * Resolves collision between an active player (being dragged) and other players.
 * Returns the corrected position for the active player.
 */
export const resolveCollisions = (
  activePlayerId: string,
  newX: number,
  newY: number,
  allPlayers: Player[],
  obstacles: { position: Position, radius: number }[] = []
): { x: number, y: number } => {
  let correctedX = newX;
  let correctedY = newY;

  const activePlayer = allPlayers.find(p => p.id === activePlayerId);
  if (!activePlayer) return { x: newX, y: newY };

  const activeRadius = getPlayerRadius(activePlayer);

  // Check against all other players
  for (const other of allPlayers) {
    if (other.id === activePlayerId) continue;

    const otherRadius = getPlayerRadius(other);
    const minDist = activeRadius + otherRadius; // Minimum distance to avoid overlap

    const dx = correctedX - other.position.x;
    const dy = correctedY - other.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDist && dist > 0) {
      // Collision detected!
      // Push active player out along the vector connecting centers
      const overlap = minDist - dist;
      const pushX = (dx / dist) * overlap;
      const pushY = (dy / dist) * overlap;

      correctedX += pushX;
      correctedY += pushY;
    }
  }

  // Check against obstacles (Ghost Defenders)
  for (const obs of obstacles) {
    const obsRadius = obs.radius;
    const minDist = activeRadius + obsRadius;

    const dx = correctedX - obs.position.x;
    const dy = correctedY - obs.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDist && dist > 0) {
      const overlap = minDist - dist;
      const pushX = (dx / dist) * overlap;
      const pushY = (dy / dist) * overlap;

      correctedX += pushX;
      correctedY += pushY;
    }
  }

  return { x: correctedX, y: correctedY };
};
