import React from 'react';
import { Circle, Text, Group, Path, Image as KonvaImage, Ellipse, Label, Tag, Rect } from 'react-konva';
import { Player as PlayerType, ViewMode } from '../../types';
import { TEAM_COLORS } from '../../utils/constants';
import { getPlayerRadius } from '../../utils/playerUtils';

interface PlayerProps {
  player: PlayerType;
  onDragMove: (id: string, x: number, y: number) => void;
  rotationOffset?: number;
  draggable?: boolean;
  isSelected?: boolean;
  hasBall?: boolean;
  onSelect?: () => void;
  onRotate?: (id: string, rotation: number) => void;
  onContextMenu?: (e: any, id: string) => void;
  opacity?: number;
  stageWidth?: number;
  stageHeight?: number;
  viewMode?: ViewMode;
  scale?: number;
  armExtension?: number; // 0 to 1, for steal animation
}

const Player: React.FC<PlayerProps> = ({ 
  player, 
  onDragMove, 
  rotationOffset = 0, 
  draggable = true,
  isSelected = false,
  hasBall = false,
  onSelect,
  onRotate,
  onContextMenu,
  opacity = 1,
  stageWidth,
  stageHeight,
  viewMode = 'full',
  scale = 1,
  armExtension = 0
}) => {
  const color = TEAM_COLORS[player.team] || '#999';
  const isLightColor = ['white', 'yellow', 'grey'].includes(player.team);
  const textColor = isLightColor ? 'black' : 'white';
  
  const rotation = player.rotation || 0;
  const [image, setImage] = React.useState<HTMLImageElement | null>(null);
  const [isHovered, setIsHovered] = React.useState(false);

  React.useEffect(() => {
    if (player.profile?.photoUrl) {
      const img = new window.Image();
      img.src = player.profile.photoUrl;
      img.crossOrigin = 'Anonymous';
      img.onload = () => setImage(img);
    } else {
      setImage(null);
    }
  }, [player.profile?.photoUrl]);

  // Standard 2D Logic
  let renderX = player.position.x;
  let renderY = player.position.y;

  const handleDragMove = (e: any) => {
      onDragMove(player.id, e.target.x(), e.target.y());
  };

  const handleRotateStart = (e: any) => {
    e.cancelBubble = true;
    const stage = e.target.getStage();
    const parent = e.target && e.target.getParent ? e.target.getParent() : null;
    const playerGroup = parent && parent.getParent ? parent.getParent() : null; // HandleGroup -> SelectionGroup -> PlayerGroup
    
    if (!playerGroup || !stage) return;

    const moveHandler = () => {
       const pointerPos = stage.getPointerPosition();
       if (!pointerPos) return;
       
       const playerPos = playerGroup.getAbsolutePosition();
       const dx = pointerPos.x - playerPos.x;
       const dy = pointerPos.y - playerPos.y;
       
       // Calculate angle relative to Screen Up (negative Y)
       let angleDeg = (Math.atan2(dy, dx) * 180 / Math.PI) + 90;
       
       // Adjust for Layer rotation
       if (onRotate) {
         onRotate(player.id, angleDeg + rotationOffset);
       }
    };
    
    const upHandler = () => {
      window.removeEventListener('mousemove', moveHandler);
      window.removeEventListener('mouseup', upHandler);
    };
    
    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
  };

  const radius = getPlayerRadius(player);

  // Calculate handle position based on rotationOffset (Layer rotation)
  // We want handle at Screen Up (0, -35) relative to player center on screen
  const rad = (rotationOffset * Math.PI) / 180;
  const handleDist = radius + 21; // Dynamic handle distance
  const handleX = handleDist * Math.sin(rad);
  const handleY = -handleDist * Math.cos(rad);

  // Position Mapping
  const getPositionLabel = (num: string) => {
    switch(num) {
      case '1': return 'PG';
      case '2': return 'SG';
      case '3': return 'SF';
      case '4': return 'PF';
      case '5': return 'C';
      default: return num;
    }
  };

  const label = getPositionLabel(player.number);
  const fontSize = label.length > 1 ? 11 : 14;

  // Hand Animation Logic
  const baseHandY = -6;
  const maxExtension = 14; // How far arms extend
  const currentExtension = armExtension * maxExtension;
  
  // Jitter/Flap effect when extending (simulating rapid hand movement)
  // We use a pseudo-random jitter based on extension to avoid needing time state if possible,
  // but for animation loop, we can use a simple oscillation if we had time.
  // Since we don't have 'time' prop, we can use the fact that armExtension changes over time.
  // Or just use a static spread based on extension.
  // Let's use a spread effect: arms open wide then close?
  // Or just jitter x.
  const jitter = armExtension > 0.1 ? (Math.random() - 0.5) * 3 : 0; 
  // Note: Math.random() will cause jitter on every render (frame), which is what we want for "rapid movement".

  const handY = baseHandY - currentExtension;

  return (
    <Group
      x={renderX}
      y={renderY}
      scaleX={scale}
      scaleY={scale}
      name="entity-group"
      draggable={draggable}
      opacity={opacity}
      dragBoundFunc={(pos) => {
        if (stageWidth && stageHeight) {
           const radius = 15 * scale; // Approximate player radius scaled
           return {
             x: Math.max(radius, Math.min(pos.x, stageWidth - radius)),
             y: Math.max(radius, Math.min(pos.y, stageHeight - radius))
           };
        }
        return pos;
      }}
      onClick={(e) => {
        if (onSelect) {
          onSelect();
          e.cancelBubble = true;
        }
      }}
      onTap={(e) => {
        if (onSelect) {
          onSelect();
          e.cancelBubble = true;
        }
      }}
      onDragMove={handleDragMove}
      onMouseEnter={(e) => {
        setIsHovered(true);
        const stage = e.target && e.target.getStage ? e.target.getStage() : null;
        const container = stage ? stage.container() : null;
        if (container) container.style.cursor = 'move';
      }}
      onMouseLeave={(e) => {
        setIsHovered(false);
        const stage = e.target && e.target.getStage ? e.target.getStage() : null;
        const container = stage ? stage.container() : null;
        if (container) container.style.cursor = 'default';
      }}
      onContextMenu={(e) => {
        e.evt.preventDefault(); // Prevent default browser context menu
        if (onContextMenu) {
          onContextMenu(e, player.id);
        }
      }}
    >
      {/* Info Tooltip - Premium Data Card */}
      {/* Only show on hover to avoid conflict with Action Menu or Drawing Path */}
      {isHovered && player.profile && (
        <Group
          y={-radius - 12}
          rotation={-rotation + rotationOffset} // Keep upright
          listening={false}
        >
          {/* Card Background */}
          <Group
             offsetX={85} // Center horizontally (Width 170 / 2)
             offsetY={100} // Position above anchor
          >
              {/* Shadow & Main Body */}
              <Rect
                width={170}
                height={94}
                fill="rgba(15, 15, 18, 0.95)"
                cornerRadius={12}
                shadowColor="black"
                shadowBlur={20}
                shadowOpacity={0.4}
                shadowOffsetY={8}
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth={1}
              />
              
              {/* Content Container */}
              <Group x={14} y={12}>
                  {/* Name */}
                  <Text
                    text={player.profile.name}
                    fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                    fontSize={14}
                    fontStyle="700"
                    fill="#FFFFFF"
                    width={142}
                    ellipsis={true}
                    wrap="none"
                  />
                  
                  {/* Sub-info: Team | Pos | #Num */}
                  <Text
                    y={18}
                    text={`${(player.profile.stats as any)?.team || 'NBA'} · ${(player.profile.stats as any)?.position || 'G'} · #${(player.profile.stats as any)?.jersey || player.number}`}
                    fontFamily="Inter, sans-serif"
                    fontSize={11}
                    fill="rgba(255, 255, 255, 0.6)"
                    width={142}
                  />

                  {/* Divider Line */}
                  <Rect
                    y={40}
                    width={142}
                    height={1}
                    fill="rgba(255, 255, 255, 0.1)"
                  />

                  {/* Stats Row 1: PTS / REB / AST */}
                  <Group y={50}>
                      {/* PTS */}
                      <Group x={0}>
                          <Text text="PTS" fontSize={9} fill="rgba(255,255,255,0.5)" />
                          <Text y={12} text={`${(player.profile.stats as any)?.stats?.ppg ?? '-'}`} fontSize={13} fontStyle="600" fill="#fff" />
                      </Group>
                      {/* REB */}
                      <Group x={50}>
                          <Text text="REB" fontSize={9} fill="rgba(255,255,255,0.5)" />
                          <Text y={12} text={`${(player.profile.stats as any)?.stats?.rpg ?? '-'}`} fontSize={13} fontStyle="600" fill="#fff" />
                      </Group>
                      {/* AST */}
                      <Group x={100}>
                          <Text text="AST" fontSize={9} fill="rgba(255,255,255,0.5)" />
                          <Text y={12} text={`${(player.profile.stats as any)?.stats?.apg ?? '-'}`} fontSize={13} fontStyle="600" fill="#fff" />
                      </Group>
                  </Group>
              </Group>

              {/* Arrow Pointer */}
              <Path
                data="M0 0 L8 8 L16 0"
                x={85 - 8} // Center of card (85) - half arrow width (8)
                y={94} // Bottom of card
                fill="rgba(15, 15, 18, 0.95)"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth={1}
                closed={true} // Actually we want a filled triangle that merges with the box
                // To make it look seamless with border is tricky in Konva without complex path operations.
                // Simple approach: Draw a triangle, and cover the top border line?
                // Or just a simple triangle below.
              />
              {/* Cover the border seam of the arrow */}
              <Rect x={85-7} y={93} width={14} height={2} fill="rgba(15, 15, 18, 0.95)" />
          </Group>
        </Group>
      )}

      {/* Rotatable Body Group */}
      <Group rotation={rotation}>
        {/* Hands/Shoulders - Indicate facing "Up" in local space (-Y) */}
        {/* Left Hand - Angled slightly forward (-Y) */}
        <Circle 
            x={-radius + 1 + jitter} 
            y={handY} 
            radius={radius * 0.4} 
            fill={color} 
            stroke="white" 
            strokeWidth={1} 
        />
        {/* Right Hand - Angled slightly forward (-Y) */}
        <Circle 
            x={radius - 1 - jitter} 
            y={handY} 
            radius={radius * 0.4} 
            fill={color} 
            stroke="white" 
            strokeWidth={1} 
        />
        
        {/* Main Body */}
        <Circle
          radius={radius}
          fill={color}
          stroke="white"
          strokeWidth={2}
          shadowColor="black"
          shadowBlur={2}
          shadowOpacity={0.3}
        />
        
        {/* Player Photo or Number */}
        {image ? (
          <Group 
            clipFunc={(ctx) => ctx.arc(0, 0, radius, 0, Math.PI * 2, false)}
            rotation={-rotation + rotationOffset} // Keep photo upright
          >
             <KonvaImage 
               image={image} 
               width={radius * 2} 
               height={radius * 2} 
               x={-radius} 
               y={-radius} 
             />
          </Group>
        ) : (
          <Text
            text={label}
            fontSize={fontSize}
            fontStyle="bold"
            fill={textColor}
            align="center"
            verticalAlign="middle"
            width={radius * 2 + 2}
            height={radius * 2 + 2}
            offsetX={radius + 1}
            offsetY={radius + 1}
            rotation={-rotation + rotationOffset} // Counter rotate
            listening={false}
          />
        )}
      </Group>

      {/* Selection & Rotation Handle */}
      {(isSelected || hasBall) && (
        <Group>
           {/* Selection Ring (Blue for selection, Orange for Ball Handler) */}
           <Circle 
             radius={radius + 8} 
             stroke={hasBall ? "#e67e22" : "#1890ff"} 
             strokeWidth={hasBall ? 3 : 2} 
             dash={hasBall ? undefined : [5, 5]} 
             listening={false} 
           />
           
           {/* Rotation Handle - Only if selected */}
           {isSelected && (
             <Group 
               x={handleX}
               y={handleY}
               onMouseDown={handleRotateStart}
               onTouchStart={handleRotateStart}
               rotation={rotationOffset} // Counter rotate icon
               onMouseEnter={(e) => {
                 const container = e.target.getStage()?.container();
                 if (container) container.style.cursor = 'pointer';
               }}
               onMouseLeave={(e) => {
                 const container = e.target.getStage()?.container();
                 if (container) container.style.cursor = 'default';
               }}
             >
               <Circle radius={9} fill="white" stroke="#1890ff" strokeWidth={1} shadowBlur={2} />
               {/* Rotate Icon (Circular Arrow) */}
               <Path 
                 data="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"
                 fill="#1890ff"
                 scaleX={0.7}
                 scaleY={0.7}
                 x={-8.5}
                 y={-8.5}
               />
             </Group>
           )}
        </Group>
      )}
    </Group>
  );
};

export default Player;