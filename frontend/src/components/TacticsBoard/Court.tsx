import React from 'react';
import { Rect, Circle, Line, Group, Arc, Shape } from 'react-konva';
import { COURT_WIDTH, COURT_HEIGHT, SCALE, COURT_COLOR, LINE_COLOR } from '../../utils/constants';
import { ViewMode } from '../../types';

interface CourtProps {
  viewMode: ViewMode;
}

const Court: React.FC<CourtProps> = ({ viewMode }) => {
  const isHalf = viewMode === 'half';
  const width = isHalf ? COURT_WIDTH / 2 : COURT_WIDTH;
  const height = COURT_HEIGHT;

  // Helper to draw a half court (left side)
  const HalfCourtLines = () => (
    <Group>
      {/* 3-Point Line (Arc part) */}
      <Arc
        x={1.575 * SCALE}
        y={COURT_HEIGHT / 2}
        innerRadius={6.75 * SCALE}
        outerRadius={6.75 * SCALE}
        angle={180}
        rotation={-90}
        stroke={LINE_COLOR}
        strokeWidth={2}
      />
      {/* 3-Point Line Straight parts (Top and Bottom) */}
      <Line
        points={[0, COURT_HEIGHT / 2 - 6.75 * SCALE, 1.575 * SCALE, COURT_HEIGHT / 2 - 6.75 * SCALE]}
        stroke={LINE_COLOR}
        strokeWidth={2}
      />
      <Line
        points={[0, COURT_HEIGHT / 2 + 6.75 * SCALE, 1.575 * SCALE, COURT_HEIGHT / 2 + 6.75 * SCALE]}
        stroke={LINE_COLOR}
        strokeWidth={2}
      />
      
      {/* Key Area (Paint) */}
      <Rect
        x={0}
        y={COURT_HEIGHT / 2 - 2.45 * SCALE}
        width={5.8 * SCALE}
        height={4.9 * SCALE}
        stroke={LINE_COLOR}
        strokeWidth={2}
      />

      {/* Free Throw Circle (Top half - Solid) */}
      <Arc
        x={5.8 * SCALE}
        y={COURT_HEIGHT / 2}
        innerRadius={1.8 * SCALE}
        outerRadius={1.8 * SCALE}
        angle={180}
        rotation={-90}
        stroke={LINE_COLOR}
        strokeWidth={2}
      />

      {/* Lane Marks (Hash marks) */}
      {/* Top side */}
      <Line points={[1.75 * SCALE, COURT_HEIGHT / 2 - 2.45 * SCALE, 1.75 * SCALE, COURT_HEIGHT / 2 - 2.55 * SCALE]} stroke={LINE_COLOR} strokeWidth={2} />
      <Line points={[2.60 * SCALE, COURT_HEIGHT / 2 - 2.45 * SCALE, 2.60 * SCALE, COURT_HEIGHT / 2 - 2.55 * SCALE]} stroke={LINE_COLOR} strokeWidth={2} />
      <Line points={[3.45 * SCALE, COURT_HEIGHT / 2 - 2.45 * SCALE, 3.45 * SCALE, COURT_HEIGHT / 2 - 2.55 * SCALE]} stroke={LINE_COLOR} strokeWidth={2} />
      <Line points={[4.30 * SCALE, COURT_HEIGHT / 2 - 2.45 * SCALE, 4.30 * SCALE, COURT_HEIGHT / 2 - 2.55 * SCALE]} stroke={LINE_COLOR} strokeWidth={2} />
      
      {/* Bottom side */}
      <Line points={[1.75 * SCALE, COURT_HEIGHT / 2 + 2.45 * SCALE, 1.75 * SCALE, COURT_HEIGHT / 2 + 2.55 * SCALE]} stroke={LINE_COLOR} strokeWidth={2} />
      <Line points={[2.60 * SCALE, COURT_HEIGHT / 2 + 2.45 * SCALE, 2.60 * SCALE, COURT_HEIGHT / 2 + 2.55 * SCALE]} stroke={LINE_COLOR} strokeWidth={2} />
      <Line points={[3.45 * SCALE, COURT_HEIGHT / 2 + 2.45 * SCALE, 3.45 * SCALE, COURT_HEIGHT / 2 + 2.55 * SCALE]} stroke={LINE_COLOR} strokeWidth={2} />
      <Line points={[4.30 * SCALE, COURT_HEIGHT / 2 + 2.45 * SCALE, 4.30 * SCALE, COURT_HEIGHT / 2 + 2.55 * SCALE]} stroke={LINE_COLOR} strokeWidth={2} />


      {/* Backboard */}
      <Line
        points={[1.2 * SCALE, COURT_HEIGHT / 2 - 0.9 * SCALE, 1.2 * SCALE, COURT_HEIGHT / 2 + 0.9 * SCALE]}
        stroke={LINE_COLOR}
        strokeWidth={2}
      />

      {/* Rim */}
      <Circle
        x={1.575 * SCALE}
        y={COURT_HEIGHT / 2}
        radius={0.23 * SCALE}
        stroke="#ecf0f1" 
        strokeWidth={2}
      />
      
      {/* Restricted Area Arc */}
      <Arc
        x={1.575 * SCALE}
        y={COURT_HEIGHT / 2}
        innerRadius={1.25 * SCALE}
        outerRadius={1.25 * SCALE}
        angle={180}
        rotation={-90}
        stroke={LINE_COLOR}
        strokeWidth={2}
      />
    </Group>
  );

  // Generate wood planks
  const renderWoodPlanks = () => {
    const planks = [];
    const plankHeight = 0.3 * SCALE; // Approx 30cm planks
    const numPlanks = Math.ceil(height / plankHeight);
    
    for (let i = 0; i < numPlanks; i++) {
      // Alternate slightly between two wood shades to create texture
      const isEven = i % 2 === 0;
      const plankColor = isEven ? '#C68E56' : '#BC854F'; // Deep Orange-Brown Variation
      
      // Add some random variation to make it look more natural
      // We can split each row into multiple segments if we want, but simple horizontal planks look good too
      // Let's just do horizontal strips for performance and clean look
      planks.push(
        <Rect
          key={`plank-${i}`}
          x={0}
          y={i * plankHeight}
          width={width}
          height={plankHeight}
          fill={plankColor}
          stroke="rgba(0,0,0,0.03)" // Very faint line between planks
          strokeWidth={1}
        />
      );
    }
    return planks;
  };

  return (
    <Group>
      {/* Floor Background (Base) */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill={COURT_COLOR}
        name="court-base"
      />

      {/* Wood Texture Layer */}
      <Group name="wood-texture">
        {renderWoodPlanks()}
      </Group>

      {/* Outer Border */}
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        stroke={LINE_COLOR}
        strokeWidth={5}
        listening={false}
      />

      {/* Left Half */}
      <HalfCourtLines />

      {/* Right Half (Only if full court) */}
      {!isHalf && (
        <Group
          x={COURT_WIDTH}
          y={COURT_HEIGHT}
          rotation={180}
        >
          <HalfCourtLines />
        </Group>
      )}

      {/* Center Line */}
      <Line
        points={[COURT_WIDTH / 2, 0, COURT_WIDTH / 2, COURT_HEIGHT]}
        stroke={LINE_COLOR}
        strokeWidth={2}
      />

      {/* Center Circle */}
      <Circle
        x={COURT_WIDTH / 2}
        y={COURT_HEIGHT / 2}
        radius={1.8 * SCALE}
        stroke={LINE_COLOR}
        strokeWidth={2}
      />
    </Group>
  );
};

export default Court;