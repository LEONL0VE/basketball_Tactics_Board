import React from 'react';
import { Arrow, Line, Group, Circle } from 'react-konva';
import { Action, Position, ViewMode } from '../../types';

interface ActionLayerProps {
  actions: Action[];
  currentAction?: Action | null;
  selectedActionId?: string | null;
  onSelectAction?: (id: string) => void;
  onActionPointChange?: (id: string, index: number, pos: Position) => void;
  viewMode?: ViewMode;
}

const ActionLayer: React.FC<ActionLayerProps> = ({ 
  actions, 
  currentAction, 
  selectedActionId,
  onSelectAction,
  onActionPointChange,
  viewMode = 'full'
}) => {
  
  // Helper to project points (Standard 2D)
  const toScreen = (x: number, y: number) => {
      return { x, y, scale: 1 };
  };

  // Helper to inverse project points (Standard 2D)
  const toLogical = (sx: number, sy: number) => {
      return { x: sx, y: sy };
  };

  const renderAction = (action: Action) => {
    const { id, type, path, color: actionColor } = action;
    const isSelected = id === selectedActionId;
    
    const baseColor = actionColor || '#ff4d4f';
    const color = isSelected ? '#1890ff' : baseColor; 
    
    // Hit area stroke width (invisible but clickable)
    const hitStrokeWidth = 20;
    
    // Project path points for rendering
    const screenPath = path.map(p => toScreen(p.x, p.y));
    const flatPoints = screenPath.flatMap(p => [p.x, p.y]);

    const commonProps = {
      onClick: () => onSelectAction && onSelectAction(id),
      onTap: () => onSelectAction && onSelectAction(id),
      onMouseEnter: (e: any) => {
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = 'pointer';
      },
      onMouseLeave: (e: any) => {
        const container = e.target.getStage()?.container();
        if (container) container.style.cursor = 'default';
      }
    };

    // Render Handles if selected
    const renderHandles = () => {
      if (!isSelected || !onActionPointChange) return null;
      return path.map((p, i) => {
        const sp = toScreen(p.x, p.y);
        return (
            <Circle
            key={i}
            x={sp.x}
            y={sp.y}
            radius={6 * sp.scale}
            fill="white"
            stroke="#1890ff"
            strokeWidth={2}
            draggable
            onDragMove={(e) => {
                const logical = toLogical(e.target.x(), e.target.y());
                onActionPointChange(id, i, { x: logical.x, y: logical.y });
            }}
            onMouseEnter={(e) => {
                const container = e.target.getStage()?.container();
                if (container) container.style.cursor = 'move';
            }}
            onMouseLeave={(e) => {
                const container = e.target.getStage()?.container();
                if (container) container.style.cursor = 'default';
            }}
            />
        );
      });
    };

    // Screen Logic (Curve with T-bar)
    if (type === 'screen') {
        const end = path[path.length - 1];
        // Calculate angle based on the last segment (between last control point and end)
        // path has at least 2 points.
        const prev = path[path.length - 2];
        const angle = Math.atan2(end.y - prev.y, end.x - prev.x);
        
        const tLen = 15;
        const p1x = end.x + tLen * Math.cos(angle + Math.PI / 2);
        const p1y = end.y + tLen * Math.sin(angle + Math.PI / 2);
        const p2x = end.x + tLen * Math.cos(angle - Math.PI / 2);
        const p2y = end.y + tLen * Math.sin(angle - Math.PI / 2);
        
        // Project T-bar points
        const sp1 = toScreen(p1x, p1y);
        const sp2 = toScreen(p2x, p2y);

        return (
            <Group key={id} {...commonProps}>
                <Line points={flatPoints} stroke="transparent" strokeWidth={hitStrokeWidth} tension={0.5} />
                <Line points={flatPoints} stroke={color} strokeWidth={2} tension={0.5} />
                <Line points={[sp1.x, sp1.y, sp2.x, sp2.y]} stroke={color} strokeWidth={2} />
                {renderHandles()}
            </Group>
        );
    }

    // Dribble Logic (ZigZag)
    if (type === 'dribble') {
        const zigzag: number[] = [];
        const step = 15;
        const amp = 8;
        
        // Create a piecewise zig-zag path through all control points
        for (let i = 0; i < path.length - 1; i++) {
            const p1 = path[i];
            const p2 = path[i+1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const count = Math.floor(dist / step);
            
            const ux = dx / dist;
            const uy = dy / dist;
            const nx = -uy;
            const ny = ux;

            for (let j = 0; j < count; j++) {
                const t = j / count;
                const cx = p1.x + dx * t;
                const cy = p1.y + dy * t;
                // Alternate side
                const sign = (i + j) % 2 === 0 ? 1 : -1;
                const zx = cx + nx * amp * sign;
                const zy = cy + ny * amp * sign;
                
                // Project point
                const sp = toScreen(zx, zy);
                zigzag.push(sp.x, sp.y);
            }
        }
        // Add last point
        const last = path[path.length - 1];
        const slast = toScreen(last.x, last.y);
        zigzag.push(slast.x, slast.y);

        return (
            <Group key={id} {...commonProps}>
                {/* Hit Area - Use the smooth curve for hit detection as it covers the area better */}
                <Line
                    points={flatPoints}
                    stroke="transparent"
                    strokeWidth={hitStrokeWidth}
                    tension={0.5}
                />
                <Arrow
                    points={zigzag}
                    stroke={color}
                    strokeWidth={2}
                    fill={color}
                    pointerLength={10}
                    pointerWidth={10}
                    tension={0.5} // Smooth wave
                />
                {renderHandles()}
            </Group>
        );
    }

    // Shoot Logic (Dashed with 2 vertical lines in middle)
    if (type === 'shoot') {
        // Calculate midpoint and orientation for the two lines
        let m1, m2;
        if (path.length >= 4) {
            m1 = path[1];
            m2 = path[2];
        } else if (path.length >= 2) {
            m1 = path[0];
            m2 = path[1];
        } else {
            m1 = {x:0, y:0}; m2 = {x:0, y:0};
        }

        const mx = (m1.x + m2.x) / 2;
        const my = (m1.y + m2.y) / 2;
        
        const dx = m2.x - m1.x;
        const dy = m2.y - m1.y;
        const angle = Math.atan2(dy, dx);
        
        // Normal vector
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        
        // Line dimensions
        const len = 10; // Length of the vertical lines
        const gap = 4;  // Gap between the two lines
        
        // Line 1
        const l1x1 = mx - gap/2 * Math.cos(angle) + nx * len/2;
        const l1y1 = my - gap/2 * Math.sin(angle) + ny * len/2;
        const l1x2 = mx - gap/2 * Math.cos(angle) - nx * len/2;
        const l1y2 = my - gap/2 * Math.sin(angle) - ny * len/2;

        // Line 2
        const l2x1 = mx + gap/2 * Math.cos(angle) + nx * len/2;
        const l2y1 = my + gap/2 * Math.sin(angle) + ny * len/2;
        const l2x2 = mx + gap/2 * Math.cos(angle) - nx * len/2;
        const l2y2 = my + gap/2 * Math.sin(angle) - ny * len/2;
        
        // Project lines
        const sl1p1 = toScreen(l1x1, l1y1);
        const sl1p2 = toScreen(l1x2, l1y2);
        const sl2p1 = toScreen(l2x1, l2y1);
        const sl2p2 = toScreen(l2x2, l2y2);

        return (
            <Group key={id} {...commonProps}>
                <Line
                    points={flatPoints}
                    stroke="transparent"
                    strokeWidth={hitStrokeWidth}
                    tension={0.5}
                />
                <Arrow
                    points={flatPoints}
                    stroke={color}
                    strokeWidth={2}
                    fill={color}
                    dash={[10, 10]}
                    pointerLength={10}
                    pointerWidth={10}
                    tension={0.5}
                />
                {/* The two vertical lines */}
                <Line points={[sl1p1.x, sl1p1.y, sl1p2.x, sl1p2.y]} stroke={color} strokeWidth={2} />
                <Line points={[sl2p1.x, sl2p1.y, sl2p2.x, sl2p2.y]} stroke={color} strokeWidth={2} />
                {renderHandles()}
            </Group>
        );
    }

    // Steal Logic (Aggressive Dashed Arrow)
    if (type === 'steal') {
        return (
            <Group key={id} {...commonProps}>
                <Line
                    points={flatPoints}
                    stroke="transparent"
                    strokeWidth={hitStrokeWidth}
                    tension={0.5}
                />
                <Arrow
                    points={flatPoints}
                    stroke={color}
                    strokeWidth={2}
                    fill={color}
                    dash={[15, 5]}
                    pointerLength={10}
                    pointerWidth={10}
                    tension={0.5}
                />
                {renderHandles()}
            </Group>
        );
    }

    // Block Logic (Dotted Arrow)
    if (type === 'block') {
        return (
            <Group key={id} {...commonProps}>
                <Line
                    points={flatPoints}
                    stroke="transparent"
                    strokeWidth={hitStrokeWidth}
                    tension={0.5}
                />
                <Arrow
                    points={flatPoints}
                    stroke={color}
                    strokeWidth={2}
                    fill={color}
                    dash={[2, 2]}
                    pointerLength={10}
                    pointerWidth={10}
                    tension={0.5}
                />
                {renderHandles()}
            </Group>
        );
    }

    let dash = undefined;
    if (type === 'pass') dash = [5, 5]; // Dotted line for pass
    
    return (
      <Group key={id} {...commonProps}>
        <Line
          points={flatPoints}
          stroke="transparent"
          strokeWidth={hitStrokeWidth}
          tension={0.5}
        />
        <Arrow
          points={flatPoints}
          stroke={color}
          strokeWidth={2}
          fill={color}
          dash={dash}
          pointerLength={10}
          pointerWidth={10}
          tension={0.5}
        />
        {renderHandles()}
      </Group>
    );
  };

  return (
    <Group>
      {actions.map(renderAction)}
      {currentAction && renderAction(currentAction)}
    </Group>
  );
};

export default ActionLayer;