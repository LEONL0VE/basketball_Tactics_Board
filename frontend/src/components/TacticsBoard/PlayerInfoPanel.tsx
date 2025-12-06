import React, { useState } from 'react';
import { Card, Avatar, Row, Col, Typography, Empty, Divider } from 'antd';
import { UserOutlined, CaretRightOutlined, CaretDownOutlined } from '@ant-design/icons';
import { Player } from '../../types';
import { TEAM_COLORS } from '../../utils/constants';

const { Title, Text } = Typography;

interface PlayerInfoPanelProps {
  players: Player[];
  mode?: 'sidebar' | 'bottom';
}

const PlayerInfoPanel: React.FC<PlayerInfoPanelProps> = ({ players, mode = 'sidebar' }) => {
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedPlayerIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedPlayerIds(newSet);
  };

  // Filter players that have an assigned profile
  const assignedPlayers = players.filter(p => p.profile);

  if (assignedPlayers.length === 0) {
    return (
      <Card 
        title={<span style={{ color: '#E5E5E5' }}>Team Roster</span>} 
        style={{ 
            width: '100%', 
            height: '100%', 
            textAlign: 'center',
            background: '#1E1F22',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '12px',
            boxShadow: '0 4px 18px rgba(0,0,0,0.3)'
        }}
        headStyle={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <Empty 
            description={<span style={{ color: '#A5A6AA' }}>No NBA players assigned</span>} 
            image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  // Group by team
  const uniqueTeams = Array.from(new Set(assignedPlayers.map(p => p.team)));
  const homeTeam = uniqueTeams[0] || 'red';
  const awayTeam = uniqueTeams[1] || 'blue';

  const homePlayers = assignedPlayers.filter(p => p.team === homeTeam);
  const awayPlayers = assignedPlayers.filter(p => p.team === awayTeam);

    const renderPlayerRow = (player: Player) => {
    const profile = player.profile!;
    const playerDetails = profile.stats; // This contains height, weight, AND a nested 'stats' object
    const performanceStats = playerDetails?.stats;
    const isExpanded = expandedPlayerIds.has(player.id);
    
    // Mock data for missing stats if needed
    // Backend returns keys: ppg, rpg, apg, fg_pct, fg2_pct, fg3_pct
    // Values are already rounded numbers or "-" strings
    const ppg = performanceStats?.ppg ?? '-';
    const rpg = performanceStats?.rpg ?? '-';
    const apg = performanceStats?.apg ?? '-';
    
    const fgPct = performanceStats?.fg_pct ? performanceStats.fg_pct + '%' : '-';
    const twoPct = performanceStats?.fg2_pct ? performanceStats.fg2_pct + '%' : '-';
    const threePct = performanceStats?.fg3_pct ? performanceStats.fg3_pct + '%' : '-';
    
    const teamColor = TEAM_COLORS[player.team] || '#8CA3B0';    return (
      <div 
        key={player.id} 
        style={{ 
            marginBottom: 8, 
            background: '#2A2B2F', // Darker content background
            borderRadius: '8px',
            padding: '10px 14px',
            transition: 'background 0.3s'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#333438'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#2A2B2F'}
      >
        {/* Header Row */}
        <div 
            onClick={() => toggleExpand(player.id)}
            style={{ 
                display: 'flex', 
                alignItems: 'center', 
                cursor: 'pointer', 
                fontSize: '13px'
            }}
        >
            <div style={{ marginRight: 8, width: 16, color: '#A5A6AA' }}>
                {isExpanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
            </div>

            {/* Board Token Indicator */}
            <div style={{ 
                width: 24, 
                height: 24, 
                borderRadius: '50%', 
                background: teamColor, 
                color: '#fff',
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                marginRight: 10,
                fontSize: '10px',
                fontWeight: 'bold',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                border: '1px solid rgba(255,255,255,0.2)',
                flexShrink: 0
            }} title={`On Board: ${player.role || player.number}`}>
                {(() => {
                    if (player.role) return player.role;
                    const map: Record<string, string> = { '1': 'PG', '2': 'SG', '3': 'SF', '4': 'PF', '5': 'C' };
                    return map[player.number] || player.number;
                })()}
            </div>

            <Avatar 
                size={32} 
                src={profile.photoUrl} 
                icon={<UserOutlined />} 
                style={{ marginRight: 8, flexShrink: 0, border: '1px solid #444' }} 
            />
            <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ width: '30%', minWidth: 60, color: '#E5E5E5' }} ellipsis>{profile.name}</Text>
                <Text style={{ width: '15%', textAlign: 'center', color: '#A5A6AA' }}>{playerDetails?.position || 'G'}</Text>
                <Text style={{ width: '15%', textAlign: 'center', color: '#A5A6AA' }}>{playerDetails?.height || `6'3`}</Text>
                <Text style={{ width: '15%', textAlign: 'center', color: '#A5A6AA' }}>{playerDetails?.weight || '190'}</Text>
                <Text style={{ width: '15%', textAlign: 'center', color: '#A5A6AA' }}>{playerDetails?.age || '-'}</Text>
            </div>
        </div>

        {/* Expanded Stats */}
        {isExpanded && (
            <div style={{ 
                background: 'rgba(0,0,0,0.2)', 
                padding: '12px', 
                borderRadius: 4, 
                marginTop: 10, 
                borderTop: '1px solid rgba(255,255,255,0.06)'
            }}>
                <div style={{ marginBottom: 8, fontWeight: 'bold', fontSize: '13px', color: '#E5E5E5' }}>{profile.name} — Stats</div>
                <Row gutter={[16, 8]}>
                    <Col span={8}><Text style={{ fontSize: '12px', color: '#7D7E82' }}>PPG:</Text> <span style={{ fontWeight: 500, color: '#E5E5E5' }}>{ppg}</span></Col>
                    <Col span={8}><Text style={{ fontSize: '12px', color: '#7D7E82' }}>RPG:</Text> <span style={{ fontWeight: 500, color: '#E5E5E5' }}>{rpg}</span></Col>
                    <Col span={8}><Text style={{ fontSize: '12px', color: '#7D7E82' }}>APG:</Text> <span style={{ fontWeight: 500, color: '#E5E5E5' }}>{apg}</span></Col>
                    
                    <Col span={8}><Text style={{ fontSize: '12px', color: '#7D7E82' }}>FG%:</Text> <span style={{ fontWeight: 500, color: '#E5E5E5' }}>{fgPct}</span></Col>
                    <Col span={8}><Text style={{ fontSize: '12px', color: '#7D7E82' }}>2PT%:</Text> <span style={{ fontWeight: 500, color: '#E5E5E5' }}>{twoPct}</span></Col>
                    <Col span={8}><Text style={{ fontSize: '12px', color: '#7D7E82' }}>3PT%:</Text> <span style={{ fontWeight: 500, color: '#E5E5E5' }}>{threePct}</span></Col>
                </Row>
            </div>
        )}
      </div>
    );
  };

  return (
    <Card 
      title={<span style={{ color: '#E5E5E5' }}>Team Roster</span>} 
      style={{ 
        width: '100%', 
        height: '100%', 
        overflowY: 'auto',
        background: '#1E1F22',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        boxShadow: '0 4px 18px rgba(0,0,0,0.3)'
      }} 
      headStyle={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      bodyStyle={{ padding: '16px' }}
    >
      <Row gutter={24}>
        <Col span={mode === 'sidebar' ? 24 : 12}>
            <div style={{ 
                borderBottom: `2px solid ${TEAM_COLORS[homeTeam] || '#ccc'}`, 
                marginBottom: 12, 
                paddingBottom: 4,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <Title level={5} style={{ margin: 0, color: '#E5E5E5' }}>Home Team</Title>
            </div>
            {homePlayers.length > 0 ? homePlayers.map(renderPlayerRow) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: '#7D7E82' }}>No players</span>} />}
        </Col>
        
        {mode === 'sidebar' && <Col span={24}><Divider style={{ borderColor: '#2C2D31' }} /></Col>}

        <Col span={mode === 'sidebar' ? 24 : 12}>
            <div style={{ 
                borderBottom: `2px solid ${TEAM_COLORS[awayTeam] || '#ccc'}`, 
                marginBottom: 12, 
                paddingBottom: 4,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <Title level={5} style={{ margin: 0, color: '#E5E5E5' }}>Away Team</Title>
            </div>
            {awayPlayers.length > 0 ? awayPlayers.map(renderPlayerRow) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ color: '#7D7E82' }}>No players</span>} />}
        </Col>
      </Row>
    </Card>
  );
};

export default PlayerInfoPanel;
