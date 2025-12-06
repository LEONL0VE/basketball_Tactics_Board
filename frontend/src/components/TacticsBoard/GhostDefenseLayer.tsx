import React, { useRef } from 'react';
import { Circle, Line, Text, Group, Label, Tag } from 'react-konva';
import { Position, BoardEntity, Ball, Player } from '../../types';
import { COURT_WIDTH, COURT_HEIGHT, SCALE } from '../../utils/constants';
import { calculateGhostDefender, getZoneName } from '../../utils/playerUtils';

interface GhostDefenseLayerProps {
  entities: BoardEntity[];
  viewMode: 'full' | 'half';
  currentFrameIndex?: number;
}

const GhostDefenseLayer: React.FC<GhostDefenseLayerProps> = ({ entities, viewMode, currentFrameIndex = 0 }) => {
  const isVertical = viewMode === 'half';
  const lastOpenMap = useRef<Record<string, number>>({});
  
  // Find the ball
  const ball = entities.find(e => e.type === 'ball') as Ball | undefined;
  const ballOwner = entities.find(e => e.id === ball?.ownerId) as Player | undefined;
  const ballPos = ball ? ball.position : { x: 0, y: 0 }; // Default if no ball

  // Determine Offense Team (Default to Red if no owner, or if owner is Red)
  // We assume the team with the ball is Offense.
  const offenseTeam = ballOwner ? ballOwner.team : 'red';

  // Define Basket Position (Left basket for full court, Top basket for half court vertical)
  const BASKET_POS = viewMode === 'half' 
    ? { x: COURT_WIDTH / 2, y: 35 } // Top center for half court
    : { x: 40, y: COURT_HEIGHT / 2 }; // Left center for full court

  return (
    <>
      {entities.map(entity => {
        if (entity.type !== 'player') return null;
        const player = entity as Player;
        
        // Only generate Ghost Defense for the Offensive Team
        if (player.team !== offenseTeam) return null;

        // For screening logic, only other Offensive players can set screens
        const offensePlayers = entities.filter(e => e.type === 'player' && (e as Player).team === offenseTeam) as Player[];
        
        const { position: ghostPos, gap, isRealData, pct, isScreened, screenDisplacement } = calculateGhostDefender(player, ball, viewMode, offensePlayers) as any;
        
        // Re-calculate color logic for visualization
        const zoneName = getZoneName(player.position, BASKET_POS, viewMode);
        let avgPct = 0.35;
        if (zoneName.includes("Restricted")) avgPct = 0.60;
        else if (zoneName.includes("Paint")) avgPct = 0.50;
        else if (zoneName.includes("Mid")) avgPct = 0.40;
        
        const diff = pct - avgPct;
        let color = "rgba(100, 100, 100, 0.3)";
        
        if (ball?.ownerId === player.id) {
             if (diff > 0.05) color = "rgba(231, 76, 60, 0.5)"; // Red
             else if (diff < -0.05) color = "rgba(46, 204, 113, 0.5)"; // Green
             else color = "rgba(241, 196, 15, 0.5)"; // Yellow
        }

        const hasBall = ball?.ownerId === player.id;
        
        // Calculate Effective Openness
        const isOpen = isScreened && screenDisplacement > 5;
        const isRecovered = screenDisplacement < 2; // Defender has recovered

        // Persistence Logic for "OPEN" indicator
        // Use Frame Index for persistence so it works when paused
        if (isOpen) {
            lastOpenMap.current[player.id] = currentFrameIndex;
        } else if (isRecovered) {
            // If recovered, clear the persistence so it doesn't linger on the last frame
            delete lastOpenMap.current[player.id];
        }
        
        const lastFrame = lastOpenMap.current[player.id] || -999;
        const framesSinceOpen = currentFrameIndex - lastFrame;
        
        // Show for 90 frames (approx 1.5-3 seconds depending on playback speed)
        // Also handle case where user scrubs backwards (framesSinceOpen < 0) -> reset
        const isLingering = framesSinceOpen > 0 && framesSinceOpen < 90; 
        const showOpen = isOpen || isLingering;
        
        // Fade out opacity
        let indicatorOpacity = 1;
        if (!isOpen && isLingering) {
            indicatorOpacity = Math.max(0, 1 - framesSinceOpen / 90);
        }

        // Standard 2D Logic
        let renderPlayerX = player.position.x;
        let renderPlayerY = player.position.y;
        let renderGhostX = ghostPos.x;
        let renderGhostY = ghostPos.y;
        let scale = 1;

        return (
          <Group key={`ghost-${player.id}`}>
            {/* Connection Line */}
            <Line
              points={[renderPlayerX, renderPlayerY, renderGhostX, renderGhostY]}
              stroke={showOpen ? "#2ecc71" : color}
              strokeWidth={showOpen ? 3 : 2}
              dash={showOpen ? [] : [5, 5]}
              opacity={showOpen ? Math.max(0.3, indicatorOpacity) : 1}
            />
            
            {/* Ghost Defender Body */}
            <Circle
              x={renderGhostX}
              y={renderGhostY}
              radius={14 * scale}
              fill={color}
              stroke={showOpen ? "#2ecc71" : "white"}
              strokeWidth={showOpen ? 3 : 1}
              opacity={showOpen ? Math.max(0.6, indicatorOpacity) : 1}
            />

            {/* Info Text */}
            <Text
              x={renderGhostX - 20}
              y={renderGhostY - 30}
              text={`${(gap / SCALE).toFixed(1)}m`}
              fontSize={10}
              fill="white"
            />
            
            {/* Real Data Indicator */}
            <Circle
                x={renderGhostX + 10 * scale}
                y={renderGhostY - 10 * scale}
                radius={4 * scale}
                fill={isRealData ? "#2ecc71" : "#95a5a6"}
                stroke="white"
                strokeWidth={1}
            />
             {/* Debug Info (Optional: Show Zone/Pct on hover or always) */}
            {hasBall && (
                <Group x={renderGhostX + 15 * scale} y={renderGhostY - 15 * scale}>
                    <Text 
                        text={`${isRealData ? 'Real' : 'Avg'}: ${(pct * 100).toFixed(1)}%`}
                        fontSize={10}
                        fill={isRealData ? "#4cd137" : "#dcdde1"} // Green for Real, Grey for Avg
                        fontStyle={isRealData ? "bold" : "normal"}
                    />
                    <Text 
                        text={zoneName}
                        y={12}
                        fontSize={8}
                        fill="#7f8fa6"
                    />
                </Group>
            )}

            {/* OPEN SHOT INDICATOR */}
            {showOpen && (
                <Label 
                    x={renderPlayerX} 
                    y={renderPlayerY - 50 * scale} 
                    opacity={indicatorOpacity}
                    scaleX={scale}
                    scaleY={scale}
                >
                    <Tag 
                        fill="#2ecc71" 
                        pointerDirection="down" 
                        pointerWidth={12} 
                        pointerHeight={12} 
                        lineJoin="round"
                        shadowColor="black"
                        shadowBlur={10}
                        shadowOpacity={0.5}
                        stroke="white"
                        strokeWidth={2}
                    />
                    <Text
                        text={hasBall ? "OPEN SHOT!" : "OPEN!"}
                        fontSize={16}
                        fontStyle="bold"
                        fill="white"
                        padding={10}
                    />
                </Label>
            )}
          </Group>
        );
      })}
    </>
  );
};

export default GhostDefenseLayer;
