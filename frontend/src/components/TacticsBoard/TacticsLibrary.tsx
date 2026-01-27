import React, { useEffect, useState } from 'react';
import { Drawer, List, Button, Typography, Tag, Space, Spin, message } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { API_ENDPOINTS } from '../../config/api';

const { Text, Title } = Typography;

interface Tactic {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface TacticsLibraryProps {
  visible: boolean;
  onClose: () => void;
  onSelectTactic: (tacticId: string) => void;
}

const TacticsLibrary: React.FC<TacticsLibraryProps> = ({ visible, onClose, onSelectTactic }) => {
  const [tactics, setTactics] = useState<Tactic[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchTactics();
    }
  }, [visible]);

  const fetchTactics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_ENDPOINTS.BASE_URL}/api/tactics`);
      if (!response.ok) throw new Error('Failed to fetch tactics');
      const data = await response.json();
      setTactics(data);
    } catch (error) {
      console.error('Error fetching tactics:', error);
      message.error('Failed to load tactics library');
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = (tacticId: string) => {
    onSelectTactic(tacticId);
    onClose();
  };

  return (
    <Drawer
      title="Tactics Library"
      placement="right"
      onClose={onClose}
      visible={visible}
      width={400}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
          <Spin size="large" />
        </div>
      ) : (
        <List
          itemLayout="vertical"
          dataSource={tactics}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button 
                  type="primary" 
                  icon={<PlayCircleOutlined />} 
                  onClick={() => handlePlay(item.id)}
                  // Enable all tactics returned by the backend
                >
                  Load & Play
                </Button>
              ]}
            >
              <List.Item.Meta
                title={
                  <Space>
                    {item.name}
                    <Tag color="blue">{item.category}</Tag>
                  </Space>
                }
                description={item.description}
              />
            </List.Item>
          )}
        />
      )}
    </Drawer>
  );
};

export default TacticsLibrary;
