/**
 * actionTagging.ts
 * Translation State Machine — maps canvas draw gestures to Synergy playtypes.
 *
 * Reference: Table 1 — Playtype definitions (Synergy Sports Technology)
 *
 * Playtype            Definition
 * ──────────────────── ─────────────────────────────────────────────────
 * PnR_BH              Uses an on-ball screen (including reject action)
 * PnR_RM              Makes a pick then rolls, pops, slips, etc.
 * Transition          Attacks when defense is not set
 * Off_Screen          Uses an off-ball screen
 * Spot_Up             Stands still or moves without an off-ball screen
 * Isolation           Performs 1-on-1
 * Hand_Off            Receives the ball in a hand-off
 * Cut                 Cuts without a screen (UCLA, flex, etc.)
 * Putback             Shoots immediately after an offensive rebound
 * Post_Up             Performs post play (back-to-basket, low block)
 * Misc                Offense that doesn't fit any above (excluded from auto-tag)
 *
 * Court zone reference (full-court canvas at SCALE=45):
 *   COURT_WIDTH  ≈ 1289 px  (left = attacking baseline / frontcourt)
 *   COURT_HEIGHT ≈  686 px
 *   Paint:       x < 22%W, |y - center| < 18%H
 *   Mid-range:   between paint and perimeter
 *   Perimeter:   x > 35%W  OR  |y - center| > 42%H
 *   Backcourt:   x > 50%W  (defensive half)
 */

import { ActionType } from '../types';
import { COURT_HEIGHT, COURT_WIDTH } from './constants';

// ─── Zone Helpers ────────────────────────────────────────────────────────────

/** Returns true when the point is inside the left paint (attacking basket area). */
export function isPaintArea(x: number, y: number): boolean {
  const rimY = COURT_HEIGHT / 2;
  return x < COURT_WIDTH * 0.22 && Math.abs(y - rimY) < COURT_HEIGHT * 0.18;
}

/** Returns true when the point is in 3-point territory (perimeter / deep). */
export function isPerimeter(x: number, y: number): boolean {
  const rimY = COURT_HEIGHT / 2;
  return x > COURT_WIDTH * 0.35 || Math.abs(y - rimY) > COURT_HEIGHT * 0.42;
}

/** Returns true when the point is in mid-range (between paint and perimeter). */
export function isMidRange(x: number, y: number): boolean {
  return !isPaintArea(x, y) && !isPerimeter(x, y);
}

/** Returns true when the point is in the defensive half (backcourt). */
export function isBackcourt(x: number, y: number): boolean {
  return x > COURT_WIDTH * 0.50;
}

// ─── Per-Action State Machine ─────────────────────────────────────────────────

/**
 * Derive an atomic action code from a completed draw gesture.
 *
 * NOTE on PnR_BH: This function cannot detect PnR_BH because it requires
 * cross-action context (a screen must exist on the same frame). Per-action,
 * a perimeter ball-handler defaults to Isolation. Use `refineFrameActionTags()`
 * after all per-action tags are derived to upgrade Isolation → PnR_BH when
 * a screen is present on the same frame.
 */
export function deriveActionTag(
  actionType: ActionType,
  hasBall: boolean,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): string | undefined {
  const dist = Math.hypot(endX - startX, endY - startY);

  switch (actionType) {
    // ── Screen ──────────────────────────────────────────────────────────
    // "Player makes a pick and then rolls, pops, slips, etc."
    case 'screen':
      return 'PnR_RM';

    // ── Pass ────────────────────────────────────────────────────────────
    case 'pass': {
      if (!hasBall) return undefined;

      // Very short pass = hand-off: "player receives the ball in a hand-off"
      // Hand-offs are short-range exchanges regardless of court area
      if (dist < COURT_WIDTH * 0.10) return 'Hand_Off';

      // Outlet/advance pass crossing half-court = transition play
      if (isBackcourt(startX, startY) && !isBackcourt(endX, endY)) return 'Transition';

      // Pass from low post = part of post-up play (post kick-out)
      if (isPaintArea(startX, startY)) return 'Post_Up';

      // General perimeter/mid-range pass doesn't map to a specific playtype
      // The playtype is determined by the ball-handler's action, not the pass itself
      return undefined;
    }

    // ── Dribble / Move ──────────────────────────────────────────────────
    case 'dribble':
    case 'move': {
      if (hasBall) {
        // Cross half-court push = transition / fast break
        // "Attacks when defense is not set"
        if (isBackcourt(startX, startY) && !isBackcourt(endX, endY)) return 'Transition';

        // Movement within paint or ending in paint from mid-range = post play
        // "Performs post play (back-to-basket, low block)"
        if (isPaintArea(startX, startY) && (isPaintArea(endX, endY) || isMidRange(endX, endY)))
          return 'Post_Up';
        
        // Drive from mid-range or perimeter into paint = isolation drive
        // "Performs 1-on-1"
        if (isMidRange(startX, startY) && isPaintArea(endX, endY))
          return 'Isolation';

        // Perimeter to perimeter ball handling = could be PnR_BH or Isolation
        // Without screen context, default to Isolation (upgraded by refineFrameActionTags)
        return 'Isolation';
      }

      // ── Without ball ──────────────────────────────────────────────────
      // Move ending at paint = cut to the basket
      // "Player cuts without a screen (including UCLA, flex, etc.)"
      if (isPaintArea(endX, endY)) return 'Cut';

      // Interior → perimeter = using an off-ball screen to get open
      // "Player uses an off-ball screen"
      if ((isPaintArea(startX, startY) || isMidRange(startX, startY)) && isPerimeter(endX, endY))
        return 'Off_Screen';

      // Staying/drifting on perimeter without ball = spot-up positioning
      // "Stands still or moves without using an off-ball screen"
      return 'Spot_Up';
    }

    // ── Shoot ───────────────────────────────────────────────────────────
    case 'shoot': {
      if (!hasBall) return undefined;

      // Very short shot in paint = putback (offensive rebound tip-in)
      // "Shoots immediately after an offensive rebound"
      if (isPaintArea(startX, startY) && isPaintArea(endX, endY) && dist < COURT_WIDTH * 0.06)
        return 'Putback';

      // Shot from/at perimeter = catch-and-shoot / spot-up
      // "Stands still or moves without using an off-ball screen"
      if (isPerimeter(endX, endY)) return 'Spot_Up';

      // Shot at paint = post-up finish
      // "Performs post play"
      if (isPaintArea(endX, endY)) return 'Post_Up';

      // Mid-range pull-up = isolation scoring
      // "Performs 1-on-1"
      return 'Isolation';
    }

    default:
      return undefined;
  }
}

// ─── Frame-Level Refinement ──────────────────────────────────────────────────

/**
 * PnR_BH requires cross-action context: a ball-handler using a screen.
 *
 * After deriving per-action tags for a frame, call this function to upgrade
 * ball-handler Isolation actions to PnR_BH when a screen (PnR_RM) is also
 * present on the same frame.
 *
 * "PnR ball-handler: uses an on-ball screen (including reject action)"
 *
 * @param actions  All actions on the current frame (must have actionTag set)
 * @param hasBallMap  Map of playerId → boolean indicating if the player has the ball
 * @returns Updated actions array with PnR_BH upgrades applied
 */
export function refineFrameActionTags<T extends { actionTag?: string; playerId: string }>(
  actions: T[],
  hasBallMap: Map<string, boolean>,
): T[] {
  // Check if any screen (PnR_RM) exists on this frame
  const hasScreen = actions.some(a => a.actionTag === 'PnR_RM');

  return actions.map(a => {
    // If a screen exists and this action is a ball-handler tagged as Isolation,
    // upgrade to PnR_BH — the ball-handler is using the screen
    if (hasScreen && hasBallMap.get(a.playerId) && a.actionTag === 'Isolation') {
      return { ...a, actionTag: 'PnR_BH' };
    }
    // If no screen exists on the frame but a player has PnR_BH, downgrade to Isolation
    // to keep the live diagnostic panel actively in sync when screens are deleted
    if (!hasScreen && hasBallMap.get(a.playerId) && a.actionTag === 'PnR_BH') {
      return { ...a, actionTag: 'Isolation' };
    }
    return a;
  });
}
