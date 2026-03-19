import React from 'react';
import { Card, Typography, Empty, Tag, Space, Tooltip } from 'antd';
import { Player } from '../../types';
import { TEAM_COLORS } from '../../utils/constants';

const { Title, Text } = Typography;

interface PlayerInfoPanelProps {
  players: Player[];
  mode?: 'sidebar' | 'bottom';
  onTagClick?: (playerId: string) => void;
}

const PlayerInfoPanel: React.FC<PlayerInfoPanelProps> = ({ players, mode = 'sidebar', onTagClick }) => {
  if (players.length === 0) {
    if (mode === 'bottom') {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#A5A6AA', fontSize: '13px' }}>
                Drag players from the right panel →
            </div>
        );
    }
    return (
      <Card
        title={<span style={{ color: '#E5E5E5' }}>Team Roster</span>}
        style={{
            width: '100%', height: '100%', textAlign: 'center', background: '#1E1F22',
            border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', boxShadow: '0 4px 18px rgba(0,0,0,0.3)'
        }}
        headStyle={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <Empty description={<span style={{ color: '#A5A6AA' }}>No players on the board</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </Card>
    );
  }

  // Group by team
  const uniqueTeams = Array.from(new Set(players.map(p => p.team)));
  const homeTeam = uniqueTeams[0] || 'red';
  const awayTeam = uniqueTeams[1] || 'blue';

  const homePlayers = Object.values(players).filter(p => p.team === homeTeam);
  const awayPlayers = Object.values(players).filter(p => p.team === awayTeam);

  const isBottom = mode === 'bottom';

  const renderPlayerCard = (player: Player) => {
    const teamColor = TEAM_COLORS[player.team] || '#8CA3B0';
    
    if (isBottom) {
      // Horizontal compact card for drawer
      return (
        <div
          key={player.id}
          style={{
            flexShrink: 0,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            minWidth: '180px',
            maxWidth: '220px',
            transition: 'all 0.3s ease',
            cursor: 'default'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: teamColor, color: '#fff',
            display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '14px', fontWeight: 'bold',
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)', border: '2px solid rgba(255,255,255,0.15)', marginRight: '10px'
          }}>
              {player.number}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <Text style={{ color: '#E5E5E5', fontSize: '12px', fontWeight: '500', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
               {player.role || 'Unassigned'}
            </Text>
            <Tooltip title={player.playerTag ? `Role: ${player.playerTag}` : 'Assign Role Tag'}>
                <Tag 
                  color={player.playerTag ? "processing" : "default"} 
                  style={{ 
                    marginTop: '4px', padding: '0 6px', fontSize: '10px', cursor: 'pointer', display: 'inline-block',
                    border: player.playerTag ? '1px solid #1677ff' : '1px solid rgba(255,255,255,0.2)',
                    background: player.playerTag ? 'rgba(22, 119, 255, 0.1)' : 'transparent',
                    color: player.playerTag ? '#fff' : '#A5A6AA', width: 'fit-content', transition: 'all 0.2s', margin: 0
                  }}
                  onClick={() => onTagClick?.(player.id)}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#faad14'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = player.playerTag ? '#1677ff' : 'rgba(255,255,255,0.2)'}
                >
                  {player.playerTag ? player.playerTag : '+ Tag'}
                </Tag>
            </Tooltip>
          </div>
        </div>
      );
    }

    return (
      <div
        key={player.id}
        style={{
            marginBottom: 8, background: '#2A2B2F', borderRadius: '8px', padding: '10px 14px',
            display: 'flex', alignItems: 'center', transition: 'background 0.3s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#333438'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#2A2B2F'}
      >
        <div style={{
            width: 28, height: 28, borderRadius: '50%', background: teamColor, color: '#fff',
            display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: 15, fontSize: '12px',
            fontWeight: 'bold', boxShadow: '0 2px 4px rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0
        }}>
            {player.number}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ width: '40%', color: '#E5E5E5', fontSize: '14px', fontWeight: '500' }}>
               {player.role ? `Position: ${player.role}` : 'Position: Unassigned'}
            </Text>
            <div style={{ width: '60%', textAlign: 'right' }}>
              <Tag 
                color={player.playerTag ? "processing" : "default"} 
                style={{ 
                  margin: 0, padding: '4px 10px', fontSize: '12px', cursor: 'pointer',
                  border: player.playerTag ? '1px solid #1677ff' : '1px solid rgba(255,255,255,0.2)',
                  background: player.playerTag ? 'rgba(22, 119, 255, 0.1)' : 'rgba(255,255,255,0.05)',
                  color: player.playerTag ? '#fff' : '#A5A6AA', transition: 'all 0.2s ease'
                }}
                onClick={() => onTagClick?.(player.id)}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#faad14'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = player.playerTag ? '#1677ff' : 'rgba(255,255,255,0.2)'}
              >
                {player.playerTag ? player.playerTag : '+ Assign Role Tag'}
              </Tag>
            </div>
        </div>
      </div>
    );
  };

  if (isBottom) {
    return (
        <div style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%', gap: '16px', overflowX: 'auto', padding: '0 4px', alignItems: 'center' }}>
            {/* Custom scrollbar styles can be injected globally, but here we just rely on standard scroll */}
            <div style={{ display: 'flex', gap: '12px' }}>
                {homePlayers.length > 0 && homePlayers.map(renderPlayerCard)}
                {awayPlayers.length > 0 && awayPlayers.map(renderPlayerCard)}
            </div>
        </div>
    );
  }

  return (
    <Card
      title={<span style={{ color: '#E5E5E5' }}>Team Roster & Tags</span>}
      style={{
          width: '100%', height: '100%', background: '#1E1F22', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '12px', boxShadow: '0 4px 18px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column'
      }}
      headStyle={{ borderBottom: '1px solid rgba(255,255,255,0.06)', minHeight: '48px', padding: '0 16px' }}
      bodyStyle={{ padding: '12px', flex: 1, overflowY: 'auto' }}
    >
        <div>
            <Title level={5} style={{ marginTop: 0, marginBottom: 12, color: '#A5A6AA', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {homeTeam.toUpperCase()} TEAM
            </Title>
            {homePlayers.length > 0 ? homePlayers.map(renderPlayerCard) : <Text type="secondary" style={{color: '#666', fontSize: '12px'}}>No players placed</Text>}
        </div>

        {awayPlayers.length > 0 && (
            <div style={{ marginTop: '20px' }}>
                <Title level={5} style={{ marginTop: 0, marginBottom: 12, color: '#A5A6AA', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {awayTeam.toUpperCase()} TEAM
                </Title>
                {awayPlayers.map(renderPlayerCard)}
            </div>
        )}
    </Card>
  );
};

export default PlayerInfoPanel;

