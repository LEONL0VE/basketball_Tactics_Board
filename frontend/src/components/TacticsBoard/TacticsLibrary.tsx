import React, { useEffect, useState, useMemo } from 'react';
import { 
  Drawer, Input, Card, Tag, Button, Typography, 
  Space, Select, Empty, Spin, message, Row, Col, Badge, Tabs, Dropdown, Menu, Tooltip, Modal
} from 'antd';
import { 
  SearchOutlined, PlayCircleOutlined, DeleteOutlined, EditOutlined, 
  ReadOutlined, YoutubeOutlined, MoreOutlined
} from '@ant-design/icons';
import { API_ENDPOINTS } from '../../config/api';
import { Tactic } from '../../types';

const { Text, Paragraph } = Typography;
const { Search } = Input;
const { TabPane } = Tabs;

interface TacticsLibraryProps {
  visible: boolean;
  onClose: () => void;
  onSelectTactic: (tacticId: string, mode?: 'play' | 'edit') => void;
}

const CATEGORIES = ['All', 'Offense', 'Defense', 'Strategy & Concepts'];

const CATEGORY_TOOLTIPS: Record<string, string> = {
  'Offense': 'Strategies to score points (e.g., Motion, Set)',
  'Defense': 'Strategies to stop opponents (e.g., Man, Zone)',
  'Strategy & Concepts': 'General game plans, philosophies, and learning modules',
  'All': 'View all tactics'
};

const SUB_CATEGORY_TOOLTIPS: Record<string, string> = {
  'Actions': 'Basic building blocks (Pick & Roll, cuts)',
  'Motion': 'Read & React offense (Fluid, 4-Out, 5-Out)',
  'Set': 'Fixed plays for specific shots (Horns, Quick hitters)',
  'Continuity': 'Repeating structured patterns (Flex, Princeton)',
  'Zone': 'Offense designed to beat Zone Defense / Defense guarding areas',
  'Man': 'Man-to-Man defense assignments',
  'Press': 'High-pressure full/half court defense',
  'General Strategy': 'Overarching game plans',
  'Concept': 'Theoretical ideas and principles',
  'Lineup': 'Player combinations'
};

const TacticsLibrary: React.FC<TacticsLibraryProps> = ({ visible, onClose, onSelectTactic }) => {
  const [tactics, setTactics] = useState<Tactic[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('All');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Preview Modal State
  const [previewModal, setPreviewModal] = useState<{ visible: boolean, url: string, title: string }>({ 
      visible: false, url: '', title: '' 
  });

  const getEmbedUrl = (url: string) => {
    if (!url) return '';
    // YouTube
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        let videoId = '';
        if (url.includes('v=')) {
            videoId = url.split('v=')[1]?.split('&')[0];
        } else if (url.includes('youtu.be/')) {
            videoId = url.split('youtu.be/')[1]?.split('?')[0];
        }
        if (videoId) return `https://www.youtube.com/embed/${videoId}`;
    }
    return url;
  };
  
  // Extract all available sub-categories from current category
  const availableSubCategories = useMemo(() => {
      if (selectedCategory === 'All') return [];
      const subs = new Set<string>();
      tactics.filter(t => t.category === selectedCategory).forEach(t => {
          if (t.sub_category) subs.add(t.sub_category);
      });
      return Array.from(subs).sort();
  }, [tactics, selectedCategory]);

  useEffect(() => {
    if (visible) {
      fetchTactics();
    }
  }, [visible]);

  const fetchTactics = async () => {
    setLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.TACTICS);
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

  const handleDelete = async (tacticId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`${API_ENDPOINTS.TACTICS}/${tacticId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete tactic');
      message.success('Tactic deleted');
      fetchTactics();
    } catch (error) {
      message.error('Failed to delete tactic');
    }
  };

  const filteredTactics = useMemo(() => {
    return tactics.filter(tactic => {
      const matchesSearch = tactic.name.toLowerCase().includes(searchText.toLowerCase()) || 
                          tactic.description.toLowerCase().includes(searchText.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || tactic.category === selectedCategory;
      const matchesSubCategory = selectedSubCategory === 'All' || tactic.sub_category === selectedSubCategory;
      const matchesTags = selectedTags.length === 0 || 
                         selectedTags.every(tag => tactic.tags?.includes(tag));
      
      return matchesSearch && matchesCategory && matchesTags && matchesSubCategory;
    });
  }, [tactics, searchText, selectedCategory, selectedTags, selectedSubCategory]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    tactics.forEach(t => t.tags?.forEach(tag => tags.add(tag)));
    return Array.from(tags).sort();
  }, [tactics]);

  const renderTacticCard = (tactic: Tactic) => {
    // Menu for Edit/Delete actions
    const menu = (
        <Menu onClick={(e) => { e.domEvent.stopPropagation(); }}>
            <Menu.Item key="edit" icon={<EditOutlined />} onClick={() => { onSelectTactic(tactic.id, 'edit'); onClose(); }}>
                Edit Tactic
            </Menu.Item>
            <Menu.Item key="delete" icon={<DeleteOutlined />} danger onClick={(e) => handleDelete(tactic.id, e as any)}>
                Delete
            </Menu.Item>
        </Menu>
    );

    return (
    <Card
      hoverable
      style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: '12px', border: '1px solid #f0f0f0' }}
      bodyStyle={{ padding: 0, flex: 1, display: 'flex', flexDirection: 'column' }}
    >
        {/* 1. Image Area (16:9 Aspect Ratio approx) */}
        <div style={{ position: 'relative', height: 140, backgroundColor: '#f5f5f5', overflow: 'hidden' }}>
            {tactic.preview_image ? (
                <img src={tactic.preview_image} alt={tactic.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d9d9d9', flexDirection: 'column' }}>
                    <PlayCircleOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                    <span style={{ fontSize: 12 }}>No Preview</span>
                </div>
            )}
            
            {/* Category Badge (Top Right) */}
            <div style={{ 
                position: 'absolute', 
                top: 8, 
                right: 8, 
                background: 'rgba(0,0,0,0.6)', 
                color: 'white', 
                padding: '2px 8px', 
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 'bold',
                backdropFilter: 'blur(4px)'
            }}>
                {tactic.category.toUpperCase()}
            </div>

             {/* Admin Menu (Top Left) */}
             <div style={{ position: 'absolute', top: 8, left: 8 }} onClick={e => e.stopPropagation()}>
                <Dropdown overlay={menu} trigger={['click']}>
                    <Button 
                        size="small" 
                        shape="circle" 
                        icon={<MoreOutlined />} 
                        style={{ border: 'none', background: 'rgba(255,255,255,0.8)', color: '#333' }}
                    />
                </Dropdown>
            </div>
        </div>

        {/* 2. Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
            
            {/* Top: Information Zone (Trigger for Hover) */}
            <div className="card-info-zone" style={{ padding: '12px 16px', flex: 1, position: 'relative' }}>
                
                {/* Default Visible Content */}
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    {/* Sub-Category */}
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#8c8c8c', letterSpacing: '1.5px', marginBottom: 2, fontWeight: 700 }}>
                        {tactic.sub_category || 'GENERAL'}
                    </div>

                    {/* Title */}
                    <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#1f1f1f', marginBottom: 6, lineHeight: 1.2 }}>
                        <Text ellipsis={{ tooltip: tactic.name }}>{tactic.name}</Text>
                    </div>

                    {/* Short Description (Trigger for Hover) */}
                    <div className="description-trigger-zone" style={{ marginBottom: 12, height: 38, position: 'static' }}>
                        <div style={{ height: '100%', overflow: 'hidden' }}>
                            <Paragraph 
                                ellipsis={{ rows: 2 }} 
                                type="secondary" 
                                style={{ fontSize: 13, lineHeight: 1.4, margin: 0 }}
                            >
                                {tactic.description || 'No description provided.'}
                            </Paragraph>
                        </div>

                         {/* Hover Overlay (Premium Popover with Actions) */}
                        <div className="hover-overlay" style={{ 
                            position: 'absolute', 
                            top: 0, left: 0, right: 0, bottom: 0, 
                            background: 'rgba(255, 255, 255, 0.98)', 
                            padding: '12px 16px 8px 16px', // Tight bottom padding (8px)
                            zIndex: 100,
                            display: 'flex', 
                            flexDirection: 'column',
                            borderRadius: 0, 
                            transition: 'all 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
                        }}>

                            {/* Scrollable Description with Custom Scrollbar */}
                            <div className="custom-scrollbar" style={{ 
                                fontSize: 13, 
                                color: '#434343', 
                                lineHeight: 1.5, 
                                overflowY: 'auto', 
                                // flex: 1,  <-- Removed to eliminate blank space between text and buttons
                                marginBottom: 0,
                                paddingRight: 4,
                                position: 'relative'
                            }}>
                                 {tactic.description || 'No description provided.'}
                            </div>

                            {/* Internal Actions (Links) */}
                            {(tactic.external_links?.article || tactic.external_links?.video) && (
                                <div style={{ 
                                    marginTop: 8,
                                    paddingTop: 8,
                                    borderTop: '1px solid #f0f0f0', 
                                    display: 'flex',
                                    gap: 8
                                }}>
                                     {tactic.external_links?.article && (
                                        <div 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setPreviewModal({
                                                    visible: true,
                                                    url: tactic.external_links.article!,
                                                    title: 'Source Article'
                                                });
                                            }}
                                            style={{ 
                                                flex: 1, 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                fontSize: 12,
                                                background: 'transparent',
                                                color: '#595959',
                                                padding: '6px 8px',
                                                borderRadius: 4,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                fontWeight: 500,
                                                userSelect: 'none'
                                            }}
                                            className="overlay-link article-link"
                                        >
                                           <ReadOutlined style={{ marginRight: 6 }} /> Source
                                        </div>
                                    )}
                                    {tactic.external_links?.video && (
                                        <div 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setPreviewModal({
                                                    visible: true,
                                                    url: tactic.external_links.video!,
                                                    title: 'Training Video'
                                                });
                                            }}
                                            style={{ 
                                                flex: 1, 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center',
                                                fontSize: 12,
                                                background: 'transparent',
                                                color: '#595959',
                                                padding: '6px 8px',
                                                borderRadius: 4,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                fontWeight: 500,
                                                userSelect: 'none'
                                            }}
                                            className="overlay-link video-link"
                                        >
                                           <YoutubeOutlined style={{ marginRight: 6 }} /> Video
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tags (Horizontal Scroll with Slim Bar) */}
                    <div className="custom-horizontal-scrollbar" style={{ 
                        display: 'flex', 
                        flexDirection: 'row', 
                        flexWrap: 'nowrap',
                        alignItems: 'center', 
                        gap: 6, 
                        marginBottom: 'auto',
                        overflowX: 'auto',
                        whiteSpace: 'nowrap',
                        paddingBottom: 4
                    }}>
                        {tactic.tags && tactic.tags.map(tag => (
                            <span key={tag} style={{ 
                                flexShrink: 0,
                                background: '#f0f2f5', 
                                color: '#595959', 
                                padding: '2px 8px', 
                                borderRadius: '12px', 
                                fontSize: '10px'
                            }}>
                                #{tag}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

             {/* 3. Footer Bar (Single Full-Width Action) */}
             <div style={{ 
                 padding: '12px 16px',
                 paddingTop: 0,
                 marginTop: 'auto',
                 display: 'flex', 
                 alignItems: 'center',
                 justifyContent: 'center'
             }}>
                 <Button 
                    type="primary" 
                    block
                    size="middle"
                    icon={<PlayCircleOutlined />} 
                    onClick={() => {
                        onSelectTactic(tactic.id, 'play');
                        onClose();
                    }}
                    style={{ 
                        fontWeight: 600, 
                        height: 36,
                        borderRadius: 6 
                    }}
                 >
                    LOAD TACTIC
                 </Button>
             </div>
        </div>
        <style>{`
            /* Premium Overlay Logic */
            .description-trigger-zone .hover-overlay { 
                opacity: 0; 
                transform: translateY(8px) scale(0.98); 
                pointer-events: none; 
                visibility: hidden;
            }
            .description-trigger-zone:hover .hover-overlay { 
                opacity: 1; 
                transform: translateY(0) scale(1); 
                pointer-events: auto; 
                visibility: visible;
                transition-delay: 0.1s;
            }

            /* Custom Slim Invisible Scrollbar */
            .custom-scrollbar::-webkit-scrollbar {
                width: 0px;
                background: transparent;
            }
            .custom-scrollbar::-webkit-scrollbar-track {
                background: transparent;
            }
            .custom-scrollbar::-webkit-scrollbar-thumb {
                background-color: transparent;
                border: none;
            }
            .custom-scrollbar {
                scrollbar-width: none;
                -ms-overflow-style: none;
            }

            /* Horizontal Scroll No Bar (Hidden) */
            .custom-horizontal-scrollbar::-webkit-scrollbar {
                display: none;
            }
            .custom-horizontal-scrollbar {
                -ms-overflow-style: none;
                scrollbar-width: none;
            }

            /* Ghost Button Hovers */
            .article-link:hover {
                background: #f3f4f6 !important; /* gray-100 */
                color: #374151 !important; /* gray-700 */
            }
            .video-link:hover {
                background: #f3f4f6 !important; /* gray-100 same as article */
                color: #374151 !important; /* gray-700 same as article */
            }
        `}</style>
    </Card>
  );
  };

  return (
    <Drawer
      title={
          <Space>
              <Typography.Title level={4} style={{ margin: 0 }}>Tactics Gallery</Typography.Title>
              <Badge count={filteredTactics.length} style={{ backgroundColor: '#52c41a' }} showZero />
          </Space>
      }
      placement="right"
      onClose={onClose}
      visible={visible}
      width={900}
      bodyStyle={{ padding: '0 24px 24px', backgroundColor: '#fafafa' }}
    >
        <div style={{ position: 'sticky', top: 0, zIndex: 1, background: '#fafafa', padding: '16px 0' }}>
            <Card size="small" bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <Row gutter={[16, 16]} align="middle">
                    <Col xs={24} md={12}>
                        <Search
                            placeholder="Search by name or description..."
                            allowClear
                            onChange={e => setSearchText(e.target.value)}
                            style={{ width: '100%' }}
                            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                        />
                    </Col>
                    <Col xs={24} md={12}>
                        <Select
                            mode="tags"
                            style={{ width: '100%' }}
                            placeholder="Filter by tags"
                            allowClear
                            onChange={setSelectedTags}
                            value={selectedTags}
                            options={allTags.map(tag => ({ label: tag, value: tag }))}
                        />
                    </Col>
                    <Col span={24}>
                         <Space direction="vertical" style={{ width: '100%' }}>
                            <Tabs activeKey={selectedCategory} onChange={(val) => {
                                setSelectedCategory(val);
                                setSelectedSubCategory('All');
                            }} type="card" size="small">
                                {CATEGORIES.map(cat => (
                                    <TabPane 
                                        tab={
                                            <Tooltip title={CATEGORY_TOOLTIPS[cat]} placement="bottom">
                                                <span>{cat}</span>
                                            </Tooltip>
                                        } 
                                        key={cat} 
                                    />
                                ))}
                            </Tabs>
                            
                            {availableSubCategories.length > 0 && (
                                <Select 
                                    style={{ width: 200 }} 
                                    value={selectedSubCategory}
                                    onChange={setSelectedSubCategory}
                                    placeholder="Sub-Category"
                                    optionLabelProp="label"
                                >
                                    <Select.Option value="All" label="All Types">All Types</Select.Option>
                                    {availableSubCategories.map(sub => (
                                        <Select.Option key={sub} value={sub} label={sub}>
                                            <Tooltip title={SUB_CATEGORY_TOOLTIPS[sub] || sub} placement="right">
                                                <div style={{ width: '100%' }}>{sub}</div>
                                            </Tooltip>
                                        </Select.Option>
                                    ))}
                                </Select>
                            )}
                         </Space>
                    </Col>
                </Row>
            </Card>
        </div>

        {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
                <Spin size="large" tip="Loading Gallery..." />
            </div>
        ) : (
             <div style={{ marginTop: 24 }}>
                {filteredTactics.length > 0 ? (
                    <Row gutter={[16, 16]}>
                        {filteredTactics.map(tactic => (
                            <Col xs={24} sm={12} md={8} lg={8} xl={6} key={tactic.id}>
                                {renderTacticCard(tactic)}
                            </Col>
                        ))}
                    </Row>
                ) : (
                    <div style={{ textAlign: 'center', padding: '100px 0' }}>
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description={
                                <span>
                                    No tactics found matching <br/>
                                    <strong>{searchText}</strong> {selectedCategory !== 'All' ? `in ${selectedCategory}` : ''}
                                </span>
                            }
                        />
                        <Button onClick={() => {
                            setSearchText('');
                            setSelectedCategory('All');
                            setSelectedTags([]);
                        }}>
                            Clear Filters
                        </Button>
                    </div>
                )}
             </div>
        )}
        {/* Content Preview Modal */}
        <Modal
            title={previewModal.title}
            open={previewModal.visible}
            onCancel={() => setPreviewModal(prev => ({ ...prev, visible: false }))}
            footer={null}
            width={900}
            centered
            destroyOnClose
            bodyStyle={{ 
                padding: 0, 
                overflow: 'hidden', 
                height: '65vh',
                background: (previewModal.url.includes('youtube') || previewModal.url.includes('youtu.be')) ? '#000' : '#fff'
            }}
        >
             <iframe
                src={getEmbedUrl(previewModal.url)}
                title={previewModal.title}
                style={{
                    width: '100%',
                    height: '100%',
                    border: 0
                }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
            />
        </Modal>

    </Drawer>
  );
};

export default TacticsLibrary;
