import React, { useState } from 'react';
import { TeamType } from '../../types';
import { TEAM_COLORS } from '../../utils/constants';
import { Typography, Divider } from 'antd';

const { Text } = Typography;

interface AssetsBarProps {
  onDragStart: (type: 'player' | 'ball', data?: any) => void;
  vertical?: boolean;
}

const AssetsBar: React.FC<AssetsBarProps> = ({ onDragStart, vertical = false }) => {
  const teams: TeamType[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'black', 'white', 'grey', 'cyan'];
  const [selectedTeam, setSelectedTeam] = useState<TeamType>('red');
  const playerNumbers = ['1', '2', '3', '4', '5'];

  const handleDragStart = (e: React.DragEvent, type: 'player' | 'ball', data?: any) => {
    e.dataTransfer.setData('type', type);
    if (data) {
      e.dataTransfer.setData('data', JSON.stringify(data));
    }
    onDragStart(type, data);
  };

  return (
    <div style={{
      display: 'flex',
      gap: '10px',
      padding: '15px',
      background: 'rgba(0,0,0,0.25)', // Transparent Dark
      borderRadius: '16px',
      marginTop: vertical ? '0' : '20px',
      marginLeft: vertical ? '20px' : '0',
      flexDirection: vertical ? 'column' : 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      boxShadow: '0 4px 15px rgba(0,0,0,0.1)', // Softer shadow
      backdropFilter: 'blur(6px)', // Glassmorphism
      height: vertical ? '100%' : 'auto',
      overflowY: vertical ? 'auto' : 'visible',
      border: '1px solid rgba(255,255,255,0.05)' // Subtle border
    }}>
      
      {/* Color Picker Section */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <Text style={{ color: '#ccc', fontSize: '12px', fontWeight: 'bold' }}>COLORS</Text>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(2, 1fr)', 
          gap: '8px' 
        }}>
          {teams.map((team) => (
            <div
              key={team}
              onClick={() => setSelectedTeam(team)}
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: TEAM_COLORS[team],
                border: selectedTeam === team ? '2px solid white' : '1px solid rgba(255,255,255,0.3)',
                cursor: 'pointer',
                boxShadow: selectedTeam === team ? '0 0 8px rgba(255,255,255,0.5)' : 'none',
                transition: 'all 0.2s'
              }}
              title={team}
            />
          ))}
        </div>
      </div>

      <div style={{ 
        width: vertical ? '80%' : '1px', 
        height: vertical ? '1px' : '30px', 
        background: 'rgba(255,255,255,0.2)', 
        margin: vertical ? '10px 0' : '0 10px' 
      }}></div>

      {/* Player Pieces Section */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        <Text style={{ color: '#ccc', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>PLAYERS</Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flexWrap: 'nowrap' }}>
          {playerNumbers.map((num) => (
            <div
              key={num}
              draggable
              onDragStart={(e) => handleDragStart(e, 'player', { team: selectedTeam, number: num })}
              style={{ 
                cursor: 'grab', 
                transition: 'transform 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: TEAM_COLORS[selectedTeam],
                border: '2px solid white',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: ['white', 'yellow', 'grey'].includes(selectedTeam) ? 'black' : 'white',
                fontWeight: 'bold',
                fontSize: '16px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
              }}>
                {num}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ 
        width: vertical ? '80%' : '1px', 
        height: vertical ? '1px' : '30px', 
        background: 'rgba(255,255,255,0.2)', 
        margin: vertical ? '10px 0' : '0 10px' 
      }}></div>

      {/* Ball Asset */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <Text style={{ color: '#ccc', fontSize: '12px', fontWeight: 'bold' }}>BALL</Text>
        <div
          draggable
          onDragStart={(e) => handleDragStart(e, 'ball')}
          style={{ 
            cursor: 'grab', 
            transition: 'transform 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: '#e67e22',
            border: '1px solid black',
            position: 'relative',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
          }}>
             {/* Simple CSS representation of ball lines for the icon */}
             <div style={{position: 'absolute', top: '50%', left: 0, right: 0, height: '1px', background: 'black', opacity: 0.7}}></div>
             <div style={{position: 'absolute', left: '50%', top: 0, bottom: 0, width: '1px', background: 'black', opacity: 0.7}}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetsBar;