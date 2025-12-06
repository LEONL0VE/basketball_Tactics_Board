import React from 'react';
import { Circle, Group, Path, Ellipse } from 'react-konva';
import { Ball as BallType, ViewMode } from '../../types';

interface BallProps {
  ball: BallType;
  onDragMove: (id: string, x: number, y: number) => void;
  draggable?: boolean;
  stageWidth?: number;
  stageHeight?: number;
  onSelect?: () => void;
  isSelected?: boolean;
  viewMode?: ViewMode;
}

const Ball: React.FC<BallProps> = ({ 
    ball, 
    onDragMove, 
    draggable = true, 
    stageWidth, 
    stageHeight, 
    onSelect, 
    isSelected,
    viewMode = 'full'
}) => {
  
  // Standard 2D Logic
  let renderX = ball.position.x;
  let renderY = ball.position.y;
  let scale = 1;

  const handleDragMove = (e: any) => {
      onDragMove(ball.id, e.target.x(), e.target.y());
  };

  return (
    <Group
      x={renderX}
      y={renderY}
      scaleX={scale}
      scaleY={scale}
      name="entity-group"
      draggable={draggable}
      onClick={(e) => {
        e.cancelBubble = true;
        if (onSelect) onSelect();
      }}
      onTap={(e) => {
        e.cancelBubble = true;
        if (onSelect) onSelect();
      }}
      dragBoundFunc={(pos) => {
        if (stageWidth && stageHeight) {
           const radius = 12 * scale; // Ball radius
           return {
             x: Math.max(radius, Math.min(pos.x, stageWidth - radius)),
             y: Math.max(radius, Math.min(pos.y, stageHeight - radius))
           };
        }
        return pos;
      }}
      onDragMove={handleDragMove}
      onMouseEnter={(e) => {
        const stage = e.target && e.target.getStage ? e.target.getStage() : null;
        const container = stage ? stage.container() : null;
        if (container) container.style.cursor = 'move';
      }}
      onMouseLeave={(e) => {
        const stage = e.target && e.target.getStage ? e.target.getStage() : null;
        const container = stage ? stage.container() : null;
        if (container) container.style.cursor = 'default';
      }}
    >

      {/* Selection Ring */}
      {isSelected && (
        <Circle
          radius={16}
          stroke="#1890ff"
          strokeWidth={2}
          dash={[5, 5]}
        />
      )}

      {/* Main Body Orange */}
      <Circle
        radius={12}
        fill="#e67e22"
        stroke="black"
        strokeWidth={1}
        shadowColor="black"
        shadowBlur={2}
        shadowOpacity={0.3}
      />
      
      {/* Ball Texture/Lines - Curved lines to look like a real basketball */}
      <Group>
        {/* Horizontal line */}
        <Path
            data="M -12 0 Q 0 0 12 0"
            stroke="#1a1a1a"
            strokeWidth={1.5}
        />
        {/* Vertical line */}
        <Path
            data="M 0 -12 Q 0 0 0 12"
            stroke="#1a1a1a"
            strokeWidth={1.5}
        />
        {/* Side curves */}
        <Path
            data="M -8 -8 Q 0 0 -8 8"
            stroke="#1a1a1a"
            strokeWidth={1.5}
        />
        <Path
            data="M 8 -8 Q 0 0 8 8"
            stroke="#1a1a1a"
            strokeWidth={1.5}
        />
      </Group>
    </Group>
  );
};

export default Ball;