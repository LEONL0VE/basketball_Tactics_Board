import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer } from 'react-konva';
import { v4 as uuidv4 } from 'uuid';
import Court from './Court';
import Player from './Player';
import Ball from './Ball';
import AssetsBar from './AssetsBar';
import ActionLayer from './ActionLayer';
import PlayerInfoPanel from './PlayerInfoPanel';
import { BoardEntity, ViewMode, Player as PlayerType, Ball as BallType, TeamType, Action, ActionType, Position } from '../../types';
import { COURT_WIDTH, COURT_HEIGHT, APP_BACKGROUND } from '../../utils/constants';
import { Button, Tooltip, Menu, Dropdown, Slider, message, Modal, List, Card, Tag, Spin, Input, Avatar, Form, Select, Row, Col, Upload, Space, Radio } from 'antd';
// import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { 
  ExpandOutlined, 
  CompressOutlined, 
  DeleteOutlined, 
  FullscreenOutlined,
  EditOutlined,
  CaretRightOutlined,
  PauseOutlined,
  StepForwardOutlined,
  StepBackwardOutlined,
  PlusOutlined,
  UndoOutlined,
  SaveOutlined,
  ScissorOutlined,
  CameraOutlined,
  LinkOutlined,
  PlayCircleOutlined,
  DownloadOutlined,
  RetweetOutlined,
  LineChartOutlined,
  StopOutlined,
  BulbOutlined,
  FileTextOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  UserOutlined,
  SearchOutlined,
  ReloadOutlined
} from '@ant-design/icons';

import GhostDefenseLayer from './GhostDefenseLayer';
import TacticsLibrary from './TacticsLibrary';
import ChatPanel from './ChatPanel';
import { resolveCollisions, calculateGhostDefender } from '../../utils/playerUtils';
import { API_ENDPOINTS } from '../../config/api';
import { BookOutlined, RobotOutlined } from '@ant-design/icons';

interface Frame {
  id: string;
  entitiesMap: Record<ViewMode, BoardEntity[]>;
  actionsMap: Record<ViewMode, Action[]>;
  description?: string;
}

const TacticsBoard: React.FC = () => {
  // Animation State
  const [frames, setFrames] = useState<Frame[]>([{ 
    id: '1', 
    entitiesMap: { full: [], half: [] }, 
    actionsMap: { full: [], half: [] } 
  }]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x speed
  const [animationProgress, setAnimationProgress] = useState(0); // 0 to 1 for interpolation
  const [isAnimationMode, setIsAnimationMode] = useState(false); // New state for UI mode

  const [entitiesMap, setEntitiesMap] = useState<Record<ViewMode, BoardEntity[]>>({
    full: [],
    half: []
  });

  // Ref to track entitiesMap for event handlers without triggering re-renders
  const entitiesMapRef = useRef(entitiesMap);
  useEffect(() => {
    entitiesMapRef.current = entitiesMap;
  }, [entitiesMap]);

  const [actionsMap, setActionsMap] = useState<Record<ViewMode, Action[]>>({
    full: [],
    half: []
  });
  const [viewMode, setViewMode] = useState<ViewMode>('full');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ActionType | null>(null);
  const [currentAction, setCurrentAction] = useState<Action | null>(null);
  
  const stageRef = useRef<any>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();
  const isSwitchingFrame = useRef(false); // Ref to track frame switching to prevent race conditions in useEffect
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);

  // Recommendation State
  const [isRecommendationModalVisible, setIsRecommendationModalVisible] = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  // Ghost Defense State
  const [showGhostDefense, setShowGhostDefense] = useState(false);

  // Tactics Library State
  const [isTacticsLibraryVisible, setIsTacticsLibraryVisible] = useState(false);
  const [currentTacticDescription, setCurrentTacticDescription] = useState<string>('');
  
  // Save Tactic State
  const [isSaveModalVisible, setIsSaveModalVisible] = useState(false);
  const [saveForm] = Form.useForm();
  const [saveLoading, setSaveLoading] = useState(false);
  const [savePreviewImage, setSavePreviewImage] = useState<string>('');
  // Edit Mode State
  const [currentTacticId, setCurrentTacticId] = useState<string | null>(null);
  const [currentTacticMetadata, setCurrentTacticMetadata] = useState<any>(null);

  // AI Chat State
  const [isChatPanelVisible, setIsChatPanelVisible] = useState(false);


  // Player Assignment State
  const [isPlayerSearchModalVisible, setIsPlayerSearchModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [targetPlayerId, setTargetPlayerId] = useState<string | null>(null);

  /* 
  // EPV Analysis State
  const [epvData, setEpvData] = useState<any>(null);
  const [isEpvModalVisible, setIsEpvModalVisible] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false); // Toggle for right panel
  
  // EPV Sliders State
  const [epvSliders, setEpvSliders] = useState({
    base: 0.0,
    dribble: -0.5,
    defense: 0.5
  });
  */
  // Commented out to hide analysis feature
  const isAnalyzing = false;
  const showAnalysisPanel = false;
  const epvData = null;

  // Sync current state to current frame when it changes
  React.useEffect(() => {
    if (isPlaying) return; // Don't update frames during playback interpolation
    
    // If we are switching frames, do NOT sync the (potentially stale) state back to the frames array
    if (isSwitchingFrame.current) {
      isSwitchingFrame.current = false;
      return;
    }

    setFrames(prev => {
      const newFrames = [...prev];
      // Safety check
      if (!newFrames[currentFrameIndex]) return prev;

      newFrames[currentFrameIndex] = {
        ...newFrames[currentFrameIndex],
        entitiesMap,
        actionsMap
      };
      return newFrames;
    });
  }, [entitiesMap, actionsMap, currentFrameIndex, isPlaying]);

  // Animation Loop
  React.useEffect(() => {
    if (isPlaying) {
      let lastTime = performance.now();
      
      const animate = (time: number) => {
        const dt = (time - lastTime) / 1000; // seconds
        lastTime = time;
        
        setAnimationProgress(prev => {
          const next = prev + dt * playbackSpeed;
          if (next >= 1) {
            // Move to next frame
            if (currentFrameIndex < frames.length - 1) {
              const nextIndex = currentFrameIndex + 1;
              setCurrentFrameIndex(nextIndex);
              setEntitiesMap(frames[nextIndex].entitiesMap);
              setActionsMap(frames[nextIndex].actionsMap);
              return 0;
            } else {
              // End of animation
              setIsPlaying(false);
              setIsAnimationMode(false); // Exit animation mode when done
              
              // Stop recording if active
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
              }
              return 0;
            }
          }
          return next;
        });
        
        animationRef.current = requestAnimationFrame(animate);
      };
      
      animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
    
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, playbackSpeed, currentFrameIndex, frames.length]);

  // Catmull-Rom Spline Interpolation Helper
  const getPointOnSpline = (points: Position[], t: number): Position => {
    if (!points || points.length === 0) return { x: 0, y: 0 };
    if (points.length === 1) return points[0];
    
    if (points.length === 2) {
      return {
        x: points[0].x + (points[1].x - points[0].x) * t,
        y: points[0].y + (points[1].y - points[0].y) * t
      };
    }

    const totalSegments = points.length - 1;
    const segmentT = t * totalSegments;
    const index = Math.floor(segmentT);
    const localT = segmentT - index;
    
    const i = Math.min(Math.max(index, 0), totalSegments - 1);
    
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 >= points.length ? points.length - 1 : i + 2];
    
    const tt = localT * localT;
    const ttt = tt * localT;
    
    const x = 0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * localT +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * tt +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * ttt
    );
    
    const y = 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * localT +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * tt +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * ttt
    );
    
    return { x, y };
  };

  // Actions for current viewMode (MUST be before getRenderEntities)
  const actions = actionsMap[viewMode];

  // Interpolated Entities for Rendering
  const getRenderEntities = () => {
    // If not in animation mode, or if we are at the very end of the animation sequence
    if (!isAnimationMode || currentFrameIndex >= frames.length - 1) {
      return entitiesMap[viewMode];
    }

    const currentFrame = frames[currentFrameIndex];
    const nextFrame = frames[currentFrameIndex + 1];
    
    const currentEntities = currentFrame.entitiesMap[viewMode];
    const nextEntities = nextFrame.entitiesMap[viewMode];
    const currentActions = currentFrame.actionsMap[viewMode];

    let renderedEntities = currentEntities.map(entity => {
      const nextEntity = nextEntities.find(e => e.id === entity.id);
      if (!nextEntity) return entity;

      let pos = { ...entity.position };
      let rot = entity.type === 'player' ? (entity as PlayerType).rotation : 0;
      let scale = 1;
      let armExtension = 0;
      let actionType: ActionType | undefined;

      // Check for Action-based movement
      let action: Action | undefined;
      
      if (entity.type === 'player') {
         action = currentActions.find(a => a.playerId === entity.id && ['move', 'dribble', 'screen', 'steal', 'block'].includes(a.type));
         actionType = action?.type;
         
         // Handle Block Jump Animation
         if (action && action.type === 'block') {
             // Parabolic jump: 4 * t * (1 - t) peaks at 1 when t=0.5
             // We want a scale increase, e.g., from 1 to 1.3
             const jumpHeight = 0.3;
             scale = 1 + jumpHeight * (4 * animationProgress * (1 - animationProgress));
         }

         // Handle Steal Animation (Arm Extension + Fast Movement)
         if (action && action.type === 'steal') {
             // Logic moved down to use local 't'
         }

      } else if (entity.type === 'ball') {
         const ball = entity as BallType;
         if (ball.ownerId) {
           // 1. Check for Pass/Shoot (Ball follows its own path independent of player)
           action = currentActions.find(a => a.playerId === ball.ownerId && (a.type === 'pass' || a.type === 'shoot'));
           
           // 2. If not passing/shooting, Ball MUST follow Owner's movement (Dribble/Move/Steal)
           // This ensures the ball respects the owner's speed/acceleration settings
           if (!action) {
               const ownerAction = currentActions.find(a => a.playerId === ball.ownerId && ['move', 'dribble', 'steal', 'screen', 'block'].includes(a.type));
               if (ownerAction) {
                   action = ownerAction;
               }
           }
         }
      }

      if (action && action.path.length >= 2) {
         // Determine interpolation 't'
         let t = animationProgress;
         
         // Apply Speed Multiplier
         // Walk: 1.0x (Base speed - uses full frame time to reach destination)
         // Jog: 1.5x (Normal - finishes at ~66% of frame time)
         // Sprint: 2.5x (Fast - finishes at ~40% of frame time)
         
         let speedMultiplier = 1.5; // Default (Jog)
         if (action.speed === 'walk') speedMultiplier = 1.0;
         if (action.speed === 'sprint') speedMultiplier = 2.5;
         
         // Calculate local progress based on speed
         let localProgress = Math.min(1, animationProgress * speedMultiplier);
         
         t = localProgress;

         // For Steal, use Ease-In (Acceleration) to simulate burst speed
         if (action.type === 'steal') {
             t = t * t; // Quadratic Ease-In
         }
         
         // Update Arm Extension based on t (local progress)
         if (action.type === 'steal') {
             if (t > 0.3) {
                 armExtension = (t - 0.3) / 0.7;
             }
             scale = 1 + 0.1 * t;
         }

         // Use Spline Interpolation
         // FIX: If t >= 1, explicitly use the last point to avoid spline calculation errors
         if (t >= 1) {
             pos = action.path[action.path.length - 1];
         } else {
             pos = getPointOnSpline(action.path, t);
         }
         
         // Rotation for players
         if (entity.type === 'player' && nextEntity.type === 'player') {
            const p1 = entity as PlayerType;
            const p2 = nextEntity as PlayerType;
            if (p1.rotation !== undefined && p2.rotation !== undefined) {
              // Rotation should follow shortest path
              let delta = p2.rotation - p1.rotation;
              if (delta > 180) delta -= 360;
              if (delta < -180) delta += 360;
              rot = p1.rotation + delta * t;
            }
         }
      } else {
         // Linear Interpolation (Fallback)
         pos = {
          x: entity.position.x + (nextEntity.position.x - entity.position.x) * animationProgress,
          y: entity.position.y + (nextEntity.position.y - entity.position.y) * animationProgress
        };
        
        if (entity.type === 'player' && nextEntity.type === 'player') {
            const p1 = entity as PlayerType;
            const p2 = nextEntity as PlayerType;
            if (p1.rotation !== undefined && p2.rotation !== undefined) {
              let delta = p2.rotation - p1.rotation;
              if (delta > 180) delta -= 360;
              if (delta < -180) delta += 360;
              rot = p1.rotation + delta * animationProgress;
            }
        }
      }

      return {
        ...entity,
        position: pos,
        rotation: rot,
        scale: scale,
        armExtension: armExtension,
        actionType: actionType
      };
    });

    // --- Collision Resolution for Animation ---
    if (isPlaying) {
      const players = renderedEntities.filter(e => e.type === 'player') as PlayerType[];
      const ball = renderedEntities.find(e => e.type === 'ball') as BallType;

      // Generate Ghost Defenders as Obstacles
      const ghostObstacles = players.map(p => {
          const { position, radius } = calculateGhostDefender(p, ball, viewMode, players);
          return { position, radius };
      });

      // Multi-pass resolution for stability
      for (let i = 0; i < 2; i++) {
        players.forEach(p => {
          const { x, y } = resolveCollisions(p.id, p.position.x, p.position.y, players, ghostObstacles);
          p.position.x = x;
          p.position.y = y;
        });
      }

      // --- Ball Offset from Owner (Prevent overlapping with player number) ---
      if (ball && ball.ownerId) {
              // Pass/Shoot logic: Ball moves independently of player
              const ballAction = actions.find(a => a.playerId === ball.ownerId && (a.type === 'pass' || a.type === 'shoot'));
              if (ballAction && ballAction.path.length >= 2 && isPlaying) {
                // Interpolate ball movement
                let t = animationProgress;
                let speedMultiplier = 1.5;
                if (ballAction.speed === 'walk') speedMultiplier = 1.0;
                if (ballAction.speed === 'sprint') speedMultiplier = 2.5;
                let localProgress = Math.min(1, animationProgress * speedMultiplier);
                t = localProgress;
                if (t >= 1) {
                  ball.position = ballAction.path[ballAction.path.length - 1];
                } else {
                  ball.position = getPointOnSpline(ballAction.path, t);
                }
              } else {
                // Ball following owner logic
                const owner = renderedEntities.find(e => e.id === ball.ownerId) as PlayerType | undefined;
                if (owner) {
                  // --- FIX START: Improved ball positioning logic ---
                  
                  // 1. Set ball distance from player center (pixels)
                  // Increased slightly to prevent overlap with body
                  const offsetDistance = 22; 

                  // 2. Get current player rotation (default 0)
                  const rotation = owner.rotation || 0;

                  // 3. Set dribble offset angle relative to player facing direction
                  // +50 degrees puts the ball to the front-right side
                  // This ensures the ball is always on the side, never behind
                  const dribbleAngleOffset = -50; 

                  // 4. Convert total angle to radians for calculation
                  // Simple addition handles all quadrants correctly
                  const totalAngleRad = ((rotation + dribbleAngleOffset) * Math.PI) / 180;

                  // 5. Calculate new ball coordinates
                  ball.position = {
                    x: owner.position.x + Math.cos(totalAngleRad) * offsetDistance,
                    y: owner.position.y + Math.sin(totalAngleRad) * offsetDistance
                  };
                  
                  // --- FIX END ---
                }
              }
      }
    }

    return renderedEntities;
  };

  const renderEntities = getRenderEntities();
  const entities = renderEntities; // Override for rendering

  const isVertical = viewMode === 'half';
  const stageWidth = isVertical ? COURT_HEIGHT : COURT_WIDTH;
  const stageHeight = viewMode === 'half' ? COURT_WIDTH / 2 : COURT_HEIGHT;

  // Get selected entity
  const selectedEntity = entities.find(e => e.id === selectedId);
  const isBallHandler = selectedEntity?.type === 'player' && 
    entities.some(e => e.type === 'ball' && (e as BallType).ownerId === selectedEntity.id);

  // Get selected action
  const selectedAction = actions.find(a => a.id === selectedActionId);

  // Handle dragging entities on the board
  const handleEntityDrag = React.useCallback((id: string, x: number, y: number) => {
    // If we are in drawing mode, do NOT move the entity
    if (activeTool) return;

    // Boundary Check
    const maxX = viewMode === 'half' ? COURT_WIDTH / 2 : COURT_WIDTH;
    const maxY = COURT_HEIGHT;
    
    // Clamp values
    const clampedX = Math.max(0, Math.min(x, maxX));
    const clampedY = Math.max(0, Math.min(y, maxY));

    // Calculate delta using ref to avoid dependency on entitiesMap
    const currentEntities = entitiesMapRef.current[viewMode];
    const oldEntity = currentEntities.find(e => e.id === id);
    
    if (oldEntity) {
        const dx = clampedX - oldEntity.position.x;
        const dy = clampedY - oldEntity.position.y;

        // Update Actions if it's a player
        if (oldEntity.type === 'player' && (dx !== 0 || dy !== 0)) {
            setActionsMap(prev => {
                const currentActions = prev[viewMode];
                const updatedActions = currentActions.map(a => {
                    if (a.playerId === id) {
                        return {
                            ...a,
                            path: a.path.map(p => ({ x: p.x + dx, y: p.y + dy }))
                        };
                    }
                    return a;
                });
                return { ...prev, [viewMode]: updatedActions };
            });
        }
    }

    setEntitiesMap(prev => {
      const currentEntities = prev[viewMode];
      const entity = currentEntities.find(e => e.id === id);
      
      if (!entity) return prev;

      let updatedEntities = currentEntities.map(e => e.id === id ? { ...e, position: { x: clampedX, y: clampedY } } : e);

      // Logic for Ball Handler (Magnetic Ball)
      if (entity.type === 'player') {
        // If moving a player, check if they have the ball
        // If yes, move the ball with them
        const ball = updatedEntities.find(e => e.type === 'ball' && (e as BallType).ownerId === id) as BallType | undefined;
        if (ball) {
          // Calculate delta using clamped values
          const dx = clampedX - entity.position.x;
          const dy = clampedY - entity.position.y;
          
          updatedEntities = updatedEntities.map(e => {
            if (e.id === ball.id) {
              return {
                ...e,
                position: {
                  x: e.position.x + dx,
                  y: e.position.y + dy
                }
              };
            }
            return e;
          });
        }
      } else if (entity.type === 'ball') {
        // If moving the ball, check for proximity to players to attach
        // Threshold distance to snap to player (e.g. 30px)
        const SNAP_DISTANCE = 30;
        let nearestPlayerId: string | undefined;
        let minDistance = Infinity;

        updatedEntities.forEach(e => {
          if (e.type === 'player') {
            const dist = Math.sqrt(Math.pow(e.position.x - clampedX, 2) + Math.pow(e.position.y - clampedY, 2));
            if (dist < minDistance) {
              minDistance = dist;
              nearestPlayerId = e.id;
            }
          }
        });

        if (nearestPlayerId && minDistance < SNAP_DISTANCE) {
          // Snap to player
          // We can optionally snap the position visually too, or just set the owner
          // Let's set the owner.
          updatedEntities = updatedEntities.map(e => {
            if (e.id === id) {
              return { ...e, ownerId: nearestPlayerId };
            }
            return e;
          });
        } else {
          // Release ownership if dragged away
          updatedEntities = updatedEntities.map(e => {
            if (e.id === id) {
              const ball = e as BallType;
              // Only clear if it WAS owned
              if (ball.ownerId) {
                 return { ...e, ownerId: undefined };
              }
            }
            return e;
          });
        }
      }

      return {
        ...prev,
        [viewMode]: updatedEntities
      };
    });
  }, [viewMode]);

  const [throttledTime, setThrottledTime] = useState(0);
  const lastChartUpdateRef = useRef(0);

  // Memoize Court to prevent re-renders during animation
  const memoizedCourt = React.useMemo(() => <Court viewMode={viewMode} />, [viewMode]);

  /*
  // Throttle chart updates to ~20 FPS to prevent animation lag
  React.useEffect(() => {
    if (showAnalysisPanel && epvData) {
      const now = performance.now();
      const currentTime = currentFrameIndex + animationProgress;
      if (now - lastChartUpdateRef.current > 50) { // Update every 50ms
        setThrottledTime(currentTime);
        lastChartUpdateRef.current = now;
      }
    }
  }, [currentFrameIndex, animationProgress, showAnalysisPanel, epvData]);
  */

  // Handle rotating entities
  const handleEntityRotate = React.useCallback((id: string, rotation: number) => {
    setEntitiesMap(prev => ({
      ...prev,
      [viewMode]: prev[viewMode].map(e => e.id === id ? { ...e, rotation } : e)
    }));
  }, [viewMode]);

  // Handle stage click to deselect
  const handleStageClick = (e: any) => {
    // If drawing, finish drawing
    if (activeTool && currentAction) {
      setActionsMap(prev => ({
        ...prev,
        [viewMode]: [...prev[viewMode], currentAction]
      }));
      // Select the newly created action
      setSelectedActionId(currentAction.id);
      setSelectedId(null); // Deselect player
      setCurrentAction(null);
      setActiveTool(null);
      return;
    }

    // If the click target is the Stage itself (empty space)
    if (e.target && e.target.getStage && e.target === e.target.getStage()) {
      setSelectedId(null);
      setSelectedActionId(null);
      setActiveTool(null);
      return;
    }

    // If the click target is NOT a part of a Player or Ball group
    // We can check the parent chain.
    let parent = e.target && e.target.getParent ? e.target.getParent() : null;
    let isEntity = false;
    while (parent) {
      if (parent.attrs.name === 'entity-group') {
        isEntity = true;
        break;
      }
      parent = parent.getParent ? parent.getParent() : null;
    }

    if (!isEntity) {
      // Let's check if we clicked the court background
      const name = e.target && e.target.attrs ? e.target.attrs.name : null;
      const parentName = (e.target && e.target.getParent && e.target.getParent())?.attrs?.name;

      if (name === 'court-background' || name === 'court-base' || parentName === 'wood-texture') {
         setSelectedId(null);
         setSelectedActionId(null);
         setActiveTool(null);
      }
    } else {
      // Clicked an entity
      setSelectedActionId(null); // Deselect action
    }
  };

  // Handle Action Selection
  const handleActionSelect = (id: string) => {
    setSelectedActionId(id);
    setSelectedId(null); // Deselect player
    setActiveTool(null);
  };

  // Delete Entity
  const handleDeleteEntity = () => {
    if (selectedId) {
      setEntitiesMap(prev => {
        const currentEntities = prev[viewMode];
        // Filter out the deleted entity
        const filteredEntities = currentEntities.filter(e => e.id !== selectedId);
        
        // If we deleted a player, check if they had the ball and release it
        const updatedEntities = filteredEntities.map(e => {
          if (e.type === 'ball' && (e as BallType).ownerId === selectedId) {
            return { ...e, ownerId: undefined };
          }
          return e;
        });

        return {
          ...prev,
          [viewMode]: updatedEntities
        };
      });
      
      // Also delete associated actions
      setActionsMap(prev => ({
        ...prev,
        [viewMode]: prev[viewMode].filter(a => a.playerId !== selectedId)
      }));
      setSelectedId(null);
    }
  };

  // Delete Action
  const handleDeleteAction = () => {
    if (selectedActionId) {
      setActionsMap(prev => ({
        ...prev,
        [viewMode]: prev[viewMode].filter(a => a.id !== selectedActionId)
      }));
      setSelectedActionId(null);
    }
  };

  // Change Action Type
  const handleChangeActionType = (type: ActionType) => {
    if (selectedActionId) {
      setActionsMap(prev => ({
        ...prev,
        [viewMode]: prev[viewMode].map(a => a.id === selectedActionId ? { ...a, type } : a)
      }));
    }
  };

  // Handle Action Point Drag
  const handleActionPointChange = (actionId: string, index: number, newPos: {x: number, y: number}) => {
    setActionsMap(prev => ({
      ...prev,
      [viewMode]: prev[viewMode].map(a => {
        if (a.id === actionId) {
          const newPath = [...a.path];
          newPath[index] = newPos;
          return { ...a, path: newPath };
        }
        return a;
      })
    }));
  };

  // Handle Mouse Down for Drawing
  const handleStageMouseDown = (e: any) => {
    if (!activeTool || !selectedId) return;
    
    const stage = e.target && e.target.getStage ? e.target.getStage() : null;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    let layerPos = pos;
    if (isVertical) {
       const layer = stageRef.current.findOne('Layer');
       const transform = layer.getAbsoluteTransform().copy();
       transform.invert();
       layerPos = transform.point(pos);
    }

    const startPos = entities.find(e => e.id === selectedId)?.position || layerPos;
    
    setCurrentAction({
      id: uuidv4(),
      type: activeTool,
      playerId: selectedId,
      path: [startPos, layerPos] // Start with 2 points
    });
  };

  // Handle Mouse Move for Drawing
  const handleStageMouseMove = (e: any) => {
    if (!activeTool || !currentAction) return;
    
    const stage = e.target && e.target.getStage ? e.target.getStage() : null;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    let layerPos = pos;
    if (isVertical) {
       const layer = stageRef.current.findOne('Layer');
       const transform = layer.getAbsoluteTransform().copy();
       transform.invert();
       layerPos = transform.point(pos);
    }

    const newPath = [...currentAction.path];
    newPath[newPath.length - 1] = layerPos;

    setCurrentAction(prev => prev ? { ...prev, path: newPath } : null);
  };

  // Handle Mouse Up for Drawing
  const handleStageMouseUp = (e: any) => {
    if (!activeTool || !currentAction) return;
    
    // Finalize action
    // Insert two midpoints for better curving
    const start = currentAction.path[0];
    const end = currentAction.path[currentAction.path.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    
    const p1 = { x: start.x + dx * 0.33, y: start.y + dy * 0.33 };
    const p2 = { x: start.x + dx * 0.66, y: start.y + dy * 0.66 };
    
    const finalAction = {
      ...currentAction,
      path: [start, p1, p2, end],
      color: '#ff4d4f' // Default red
    };

    setActionsMap(prev => ({
      ...prev,
      [viewMode]: [...prev[viewMode], finalAction]
    }));
    
    setSelectedActionId(finalAction.id);
    setSelectedId(null);
    setCurrentAction(null);
    setActiveTool(null);
  };

  // Calculate next number for a team
  const getNextNumber = (team: TeamType, currentEntities: BoardEntity[]): string => {
    const teamPlayers = currentEntities.filter(
      e => e.type === 'player' && (e as PlayerType).team === team
    ) as PlayerType[];
    
    const existingNumbers = new Set(
      teamPlayers
        .map(p => parseInt(p.number))
        .filter(n => !isNaN(n))
    );

    // Find first available number starting from 1
    let num = 1;
    while (existingNumbers.has(num)) {
      num++;
    }
    
    return num.toString();
  };

  // Handle dropping new assets onto the board
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    stage.setPointersPositions(e);
    const pointerPosition = stage.getPointerPosition();
    
    if (!pointerPosition) return;

    const type = e.dataTransfer.getData('type');
    const dataString = e.dataTransfer.getData('data');
    
    // Transform pointer position if in vertical mode (rotated 90 degrees)
    let x = pointerPosition.x;
    let y = pointerPosition.y;

    if (isVertical) {
      // Inverse transform for 90 degree rotation
      // Visual: x' = -y + offset, y' = x
      // Inverse: x = y', y = -(x' - offset) = offset - x'
      // offset is stageWidth (which is COURT_HEIGHT)
      const offset = stageWidth;
      const tempX = x;
      x = y;
      y = offset - tempX;
    }

    let newEntity: BoardEntity;

    if (type === 'ball') {
      newEntity = {
        id: uuidv4(),
        type: 'ball',
        position: { x, y }
      };
    } else if (type === 'player') {
      const data = JSON.parse(dataString);
      const nextNumber = data.number || getNextNumber(data.team, entities);
      
      newEntity = {
        id: uuidv4(),
        type: 'player',
        team: data.team,
        number: nextNumber,
        position: { x, y },
        rotation: 0
      };
    } else {
      return;
    }

    setEntitiesMap(prev => ({
      ...prev,
      [viewMode]: [...prev[viewMode], newEntity]
    }));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Necessary to allow dropping
  };

  const clearBoard = () => {
    // Reset Edit State
    setCurrentTacticId(null);
    setCurrentTacticMetadata(null);
    setCurrentTacticDescription('');
    
    // Clear Board
    setEntitiesMap(prev => ({
      ...prev,
      [viewMode]: []
    }));
    setActionsMap(prev => ({
      ...prev,
      [viewMode]: []
    }));
    
    // Reset Animation Frames
    const initialFrame: Frame = {
        id: uuidv4(),
        entitiesMap: { full: [], half: [] },
        actionsMap: { full: [], half: [] }
    };
    setFrames([initialFrame]);
    setCurrentFrameIndex(0);
    setIsPlaying(false);
  };

  // CSS transform for perspective view
  const boardStyle: React.CSSProperties = {
    border: '2px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
    backgroundColor: '#333',
    transition: 'transform 0.5s ease',
    transformStyle: 'preserve-3d',
    transformOrigin: 'center top', // Pivot from top to keep it in view
    overflow: 'hidden'
  };

  const SidebarButton = ({ icon, onClick, active, tooltip }: any) => (
    <Tooltip title={tooltip} placement="right">
      <Button 
        type={active ? 'primary' : 'default'}
        shape="circle" 
        size="large" 
        icon={icon} 
        onClick={onClick}
        style={{ 
          backgroundColor: active ? '#5C7ABD' : 'transparent', 
          borderColor: active ? '#5C7ABD' : 'rgba(255,255,255,0.3)',
          color: active ? '#fff' : 'rgba(255,255,255,0.7)',
          marginBottom: '15px'
        }}
      />
    </Tooltip>
  );

  // Action Menu for Selected Entity (Player or Ball)
  const renderPlayerMenu = () => {
    if (!selectedEntity) return null;
    if (selectedEntity.type !== 'player' && selectedEntity.type !== 'ball') return null;

    // Calculate position relative to the entity
    let x = selectedEntity.position.x;
    let y = selectedEntity.position.y;

    if (isVertical) {
       const tempX = x;
       x = stageWidth - y;
       y = tempX;
    }

    // Boundary detection: If too close to top, flip menu to bottom
    const isTooCloseToTop = y < 120;

    const menuStyle: React.CSSProperties = {
      position: 'absolute',
      top: y,
      left: x,
      zIndex: 100,
      background: 'rgba(35, 35, 35, 0.95)',
      backdropFilter: 'blur(8px)',
      padding: '8px',
      borderRadius: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      // Dynamic positioning
      transform: isTooCloseToTop ? 'translate(-50%, 0)' : 'translate(-50%, -100%)', 
      marginTop: isTooCloseToTop ? '45px' : '-55px', // Below: clear player (approx 20px radius + 25px). Above: clear rotation handle.
      border: '1px solid rgba(255,255,255,0.1)'
    };

    return (
      <div style={menuStyle}>
        {selectedEntity.type === 'player' && (
          <Button 
            size="small"
            shape="round"
            icon={<EditOutlined />} 
            onClick={() => setActiveTool('move')} // Default to move, then can change
            type={activeTool ? 'primary' : 'text'}
            style={{ color: !activeTool ? 'white' : undefined }}
          >
            Draw Path
          </Button>
        )}
        <Button 
          size="small"
          shape="round"
          type="text"
          danger
          icon={<DeleteOutlined />} 
          onClick={handleDeleteEntity}
        >
          Delete
        </Button>
        
        {/* Little arrow */}
        <div style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            [isTooCloseToTop ? 'top' : 'bottom']: '-6px',
            [isTooCloseToTop ? 'borderBottom' : 'borderTop']: '6px solid rgba(35, 35, 35, 0.95)'
        }} />
      </div>
    );
  };

  // Change Action Color
  const handleChangeActionColor = (color: string) => {
    if (selectedActionId) {
      setActionsMap(prev => ({
        ...prev,
        [viewMode]: prev[viewMode].map(a => a.id === selectedActionId ? { ...a, color } : a)
      }));
    }
  };

  // Change Action Speed
  const handleChangeActionSpeed = (speed: 'walk' | 'jog' | 'sprint') => {
    if (selectedActionId) {
      setActionsMap(prev => ({
        ...prev,
        [viewMode]: prev[viewMode].map(a => a.id === selectedActionId ? { ...a, speed } : a)
      }));
    }
  };

  // Action Menu for Selected Action (Line)
  const renderActionMenu = () => {
    if (!selectedAction) return null;

    // Helper to transform logical point to screen point
    const toScreen = (p: Position) => {
        let sx = p.x;
        let sy = p.y;
        if (isVertical) {
            const tempX = sx;
            sx = stageWidth - sy;
            sy = tempX;
        }
        return { x: sx, y: sy };
    };

    // Position at Top-Right of the end point (arrow head)
    // This simulates "top right of mouse" if the user is working on the arrow head
    const endPoint = selectedAction.path[selectedAction.path.length - 1];
    const endScreen = toScreen(endPoint);

    // Boundary detection
    const isTooCloseToTop = endScreen.y < 200;
    const isTooCloseToRight = endScreen.x > stageWidth - 150;

    // Center on the end point
    let menuX = endScreen.x; 
    let menuY = endScreen.y;

    const menuStyle: React.CSSProperties = {
      position: 'absolute',
      top: menuY,
      left: menuX,
      zIndex: 100,
      background: 'rgba(35, 35, 35, 0.95)',
      backdropFilter: 'blur(8px)',
      padding: '8px',
      borderRadius: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      // Dynamic positioning
      transform: `translate(${isTooCloseToRight ? '-90%' : '-50%'}, ${isTooCloseToTop ? '0' : '-100%'})`,
      marginTop: isTooCloseToTop ? '45px' : '-45px',
      border: '1px solid rgba(255,255,255,0.1)',
      pointerEvents: 'auto' // Ensure clicks pass through
    };

    const rowStyle: React.CSSProperties = {
      display: 'flex',
      gap: '6px',
      justifyContent: 'center'
    };

    // Determine available types based on player role (ball handler or not)
    // We need to find the player associated with this action
    const player = entities.find(e => e.id === selectedAction.playerId) as PlayerType | undefined;
    const hasBall = player && entities.some(e => e.type === 'ball' && (e as BallType).ownerId === player.id);
    
    // Determine if this is a defensive player (not on the same team as the ball owner)
    const ball = entities.find(e => e.type === 'ball') as BallType | undefined;
    const ballOwner = entities.find(e => e.id === ball?.ownerId) as PlayerType | undefined;
    const offenseTeam = ballOwner ? ballOwner.team : 'red'; // Default offense is red
    const isDefense = player && player.team !== offenseTeam;

    const colors = ['#ff4d4f', '#1890ff', '#52c41a', '#faad14', '#722ed1', '#eb2f96', '#ffffff', '#8c8c8c'];
    const currentSpeed = selectedAction.speed || 'jog';

    return (
      <div style={menuStyle}>
        <div style={rowStyle}>
          {hasBall ? (
            <>
              <Tooltip title="Dribble"><Button size="small" shape="round" type={selectedAction.type === 'dribble' ? 'primary' : 'text'} style={{ color: selectedAction.type !== 'dribble' ? 'white' : undefined }} onClick={() => handleChangeActionType('dribble')}>Dribble</Button></Tooltip>
              <Tooltip title="Pass"><Button size="small" shape="round" type={selectedAction.type === 'pass' ? 'primary' : 'text'} style={{ color: selectedAction.type !== 'pass' ? 'white' : undefined }} onClick={() => handleChangeActionType('pass')}>Pass</Button></Tooltip>
              <Tooltip title="Shoot"><Button size="small" shape="round" type={selectedAction.type === 'shoot' ? 'primary' : 'text'} style={{ color: selectedAction.type !== 'shoot' ? 'white' : undefined }} onClick={() => handleChangeActionType('shoot')}>Shoot</Button></Tooltip>
            </>
          ) : isDefense ? (
            <>
              <Tooltip title="Move"><Button size="small" shape="round" type={selectedAction.type === 'move' ? 'primary' : 'text'} style={{ color: selectedAction.type !== 'move' ? 'white' : undefined }} onClick={() => handleChangeActionType('move')}>Move</Button></Tooltip>
              <Tooltip title="Steal"><Button size="small" shape="round" type={selectedAction.type === 'steal' ? 'primary' : 'text'} style={{ color: selectedAction.type !== 'steal' ? 'white' : undefined }} onClick={() => handleChangeActionType('steal')}>Steal</Button></Tooltip>
              <Tooltip title="Block"><Button size="small" shape="round" type={selectedAction.type === 'block' ? 'primary' : 'text'} style={{ color: selectedAction.type !== 'block' ? 'white' : undefined }} onClick={() => handleChangeActionType('block')}>Block</Button></Tooltip>
            </>
          ) : (
            <>
              <Tooltip title="Move"><Button size="small" shape="round" type={selectedAction.type === 'move' ? 'primary' : 'text'} style={{ color: selectedAction.type !== 'move' ? 'white' : undefined }} onClick={() => handleChangeActionType('move')}>Move</Button></Tooltip>
              <Tooltip title="Screen"><Button size="small" shape="round" type={selectedAction.type === 'screen' ? 'primary' : 'text'} style={{ color: selectedAction.type !== 'screen' ? 'white' : undefined }} onClick={() => handleChangeActionType('screen')}>Screen</Button></Tooltip>
            </>
          )}
          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={handleDeleteAction} />
        </div>
        
        {/* Speed Control Row */}
        <div style={{ ...rowStyle, paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <Tooltip title="Walk (Slow)">
                <Button 
                    size="small" 
                    shape="circle" 
                    type={currentSpeed === 'walk' ? 'primary' : 'text'} 
                    style={{ color: currentSpeed !== 'walk' ? 'white' : undefined, fontSize: '12px' }} 
                    onClick={() => handleChangeActionSpeed('walk')}
                >
                    🐢
                </Button>
            </Tooltip>
            <Tooltip title="Jog (Normal)">
                <Button 
                    size="small" 
                    shape="circle" 
                    type={currentSpeed === 'jog' ? 'primary' : 'text'} 
                    style={{ color: currentSpeed !== 'jog' ? 'white' : undefined, fontSize: '12px' }} 
                    onClick={() => handleChangeActionSpeed('jog')}
                >
                    🏃
                </Button>
            </Tooltip>
            <Tooltip title="Sprint (Fast)">
                <Button 
                    size="small" 
                    shape="circle" 
                    type={currentSpeed === 'sprint' ? 'primary' : 'text'} 
                    style={{ color: currentSpeed !== 'sprint' ? 'white' : undefined, fontSize: '12px' }} 
                    onClick={() => handleChangeActionSpeed('sprint')}
                >
                    ⚡
                </Button>
            </Tooltip>
        </div>

        <div style={{ ...rowStyle, paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          {colors.map(c => (
            <div 
              key={c}
              onClick={() => handleChangeActionColor(c)}
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                backgroundColor: c,
                cursor: 'pointer',
                border: selectedAction.color === c ? '2px solid white' : '2px solid transparent',
                boxShadow: selectedAction.color === c ? '0 0 8px rgba(255,255,255,0.5)' : 'none',
                transition: 'all 0.2s'
              }}
            />
          ))}
        </div>
        {/* Little arrow */}
        <div style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            [isTooCloseToTop ? 'top' : 'bottom']: '-6px',
            [isTooCloseToTop ? 'borderBottom' : 'borderTop']: '6px solid rgba(35, 35, 35, 0.95)'
        }} />
      </div>
    );
  };

  // Frame Management
  const handleAddFrame = () => {
    // Check if current frame has any actions
    const hasActions = actionsMap.full.length > 0 || actionsMap.half.length > 0;
    if (!hasActions) {
      message.warning('Please add actions (movements/passes) before adding a new frame.');
      return;
    }

    // Deep copy current entities to start the new frame
    const nextEntitiesMap: Record<ViewMode, BoardEntity[]> = JSON.parse(JSON.stringify(entitiesMap));
    
    // Helper to update entities based on actions
    const updateEntitiesForMode = (mode: ViewMode) => {
      const actions = actionsMap[mode];
      const entities = nextEntitiesMap[mode];
      
      // 1. Move Players based on their movement paths
      entities.forEach(entity => {
        if (entity.type === 'player') {
          const action = actions.find(a => a.playerId === entity.id && ['move', 'dribble', 'screen', 'steal', 'block'].includes(a.type));
          if (action && action.path.length > 0) {
            const endPoint = action.path[action.path.length - 1];
            entity.position = { ...endPoint };
            
            // Update rotation to face movement direction
            if (action.path.length > 1) {
               const prev = action.path[action.path.length - 2];
               const angle = Math.atan2(endPoint.y - prev.y, endPoint.x - prev.x) * 180 / Math.PI;
               (entity as PlayerType).rotation = angle + 90; 
            }
          }
        }
      });

      // 2. Move Ball based on Pass/Shoot or Owner Movement
      const ball = entities.find(e => e.type === 'ball') as BallType | undefined;
      if (ball && ball.ownerId) {
          // Check if owner passed or shot
          const ownerAction = actions.find(a => a.playerId === ball.ownerId && ['pass', 'shoot'].includes(a.type));
          
          if (ownerAction && ownerAction.path.length > 0) {
            // Ball travels to end of path
            const endPoint = ownerAction.path[ownerAction.path.length - 1];
            ball.position = { ...endPoint };
            ball.ownerId = undefined; // Ball is released
            
            // Check if it landed on another player (Pass reception)
            const receiver = entities.find(e => e.type === 'player' && e.id !== ownerAction.playerId && 
              Math.hypot(e.position.x - endPoint.x, e.position.y - endPoint.y) < 30 // Threshold
            );
            if (receiver) {
              ball.ownerId = receiver.id;
            }
          } else {
            // Ball stays with owner (who might have moved in step 1)
            const owner = entities.find(e => e.id === ball.ownerId);
            if (owner) {
              ball.position = { ...owner.position };
            }
          }
      }
    };

    updateEntitiesForMode('full');
    updateEntitiesForMode('half');

    const newFrame: Frame = {
      id: uuidv4(),
      entitiesMap: nextEntitiesMap,
      actionsMap: { full: [], half: [] } // Clear actions for new frame
    };
    
    const newFrames = [...frames];
    // Insert after current frame
    newFrames.splice(currentFrameIndex + 1, 0, newFrame);
    
    isSwitchingFrame.current = true; // Prevent useEffect from overwriting new frame with old state
    setFrames(newFrames);
    setCurrentFrameIndex(currentFrameIndex + 1);
    
    // Explicitly update state to match the new frame
    // This prevents "disappearing" entities if the useEffect hasn't fired yet
    setEntitiesMap(newFrame.entitiesMap);
    setActionsMap(newFrame.actionsMap);
  };

  const handleSelectFrame = (index: number) => {
    isSwitchingFrame.current = true; // Prevent useEffect from overwriting target frame with old state
    setCurrentFrameIndex(index);
    setEntitiesMap(frames[index].entitiesMap);
    setActionsMap(frames[index].actionsMap);
    setIsPlaying(false);
    setAnimationProgress(0);
  };



  // Delete Frame
  const handleDeleteFrame = () => {
    if (frames.length <= 1) return; // Don't delete the last frame
    
    const newFrames = frames.filter((_, idx) => idx !== currentFrameIndex);
    
    // Adjust current index
    let newIndex = currentFrameIndex;
    if (newIndex >= newFrames.length) {
      newIndex = newFrames.length - 1;
    }
    
    isSwitchingFrame.current = true;
    setFrames(newFrames);
    setCurrentFrameIndex(newIndex);
    setEntitiesMap(newFrames[newIndex].entitiesMap);
    setActionsMap(newFrames[newIndex].actionsMap);
  };

  const handleSnapshot = () => {
    if (stageRef.current) {
      const uri = stageRef.current.toDataURL();
      const link = document.createElement('a');
      link.download = 'tactics-board.png';
      link.href = uri;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleExport = () => {
    if (frames.length <= 1 && actionsMap.full.length === 0 && actionsMap.half.length === 0) {
      message.warning('Nothing to export!');
      return;
    }

    // Reset to start
    setIsPlaying(false);
    setCurrentFrameIndex(0);
    setAnimationProgress(0);
    setEntitiesMap(frames[0].entitiesMap);
    setActionsMap(frames[0].actionsMap);
    
    // Clear selection for clean recording
    setSelectedId(null);
    setSelectedActionId(null);
    setActiveTool(null);

    message.loading('Preparing recording...', 1);

    // Give it a moment to render frame 0 then start
    setTimeout(() => {
      const layer = stageRef.current.findOne('Layer');
      const canvas = layer.getCanvas()._canvas;
      
      // Check if stream capture is supported
      if (!canvas.captureStream) {
        message.error('Browser does not support canvas recording.');
        return;
      }

      const stream = canvas.captureStream(30); // 30 FPS
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      
      recorder.ondataavailable = (e: any) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tactics-animation.webm';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        recordedChunksRef.current = [];
        message.success('Export complete! (Saved as WebM video)');
      };
      
      mediaRecorderRef.current = recorder;
      recorder.start();
      
      // Start Animation
      setIsPlaying(true);
      setIsAnimationMode(true);
    }, 500);
  };

  const handleStop = () => {
    setIsPlaying(false);
    setIsAnimationMode(false); // Exit animation mode
    isSwitchingFrame.current = true;
    setCurrentFrameIndex(0);
    setEntitiesMap(frames[0].entitiesMap);
    setActionsMap(frames[0].actionsMap);
    setAnimationProgress(0);
  };

  const handleUndo = () => {
    // Reset Animation: Delete all frames except the first one
    // AND clear actions in the first frame to start fresh
    const firstFrame = frames[0];
    
    // Create a clean first frame with NO actions
    const cleanFirstFrame = {
        ...firstFrame,
        actionsMap: { full: [], half: [] }
    };

    isSwitchingFrame.current = true;
    setFrames([cleanFirstFrame]);
    setCurrentFrameIndex(0);
    setEntitiesMap(cleanFirstFrame.entitiesMap);
    setActionsMap(cleanFirstFrame.actionsMap);
    setIsPlaying(false);
    setAnimationProgress(0);
    message.success('Animation reset. All frames deleted.');
  };

  // Top Bar Render
  const renderTopBar = () => (
    <div style={{
      height: '50px',
      background: '#2A2A2A', // Dark Grey
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      justifyContent: 'space-between',
      borderTop: '2px solid #3A3A3A', // Lighter line
      width: stageWidth + 4, // Match board width (stage + borders)
      boxSizing: 'border-box',
      zIndex: 100,
      marginTop: '0px', // Removed margin
      borderRadius: '0 0 4px 4px' // Rounded bottom corners only
    }}>
      <style>
        {`
          .toolbar-icon-btn {
            opacity: 0.7;
            transition: all 0.2s ease-in-out;
          }
          .toolbar-icon-btn:hover {
            opacity: 1 !important;
            transform: scale(1.15);
            color: #3A7AFE !important; /* Accent Blue */
          }
          .frame-desc-input::placeholder {
            color: rgba(255, 255, 255, 0.5) !important;
          }
        `}
      </style>

      {/* Left Tools */}
      <div style={{ display: 'flex', gap: '15px' }}>
        <Tooltip title="Snapshot"><Button type="text" className="toolbar-icon-btn" icon={<CameraOutlined />} style={{ color: '#E5E5E5', fontSize: '20px' }} onClick={handleSnapshot} /></Tooltip>
        <Tooltip title="Export Animation (Video)"><Button type="text" className="toolbar-icon-btn" icon={<DownloadOutlined />} style={{ color: '#E5E5E5', fontSize: '20px' }} onClick={handleExport} /></Tooltip>
        <Tooltip title="Export Sketch Data (JSON)"><Button type="text" className="toolbar-icon-btn" icon={<FileTextOutlined />} style={{ color: '#E5E5E5', fontSize: '20px' }} onClick={handleExportJSON} /></Tooltip>
      </div>

      {/* Center Frames */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '5px 10px', borderRadius: '4px' }}>
        {frames.map((frame, idx) => (
          <Tooltip key={frame.id} title={`Frame ${idx + 1}`}>
            <Button 
              type={currentFrameIndex === idx ? 'primary' : 'default'}
              onClick={() => handleSelectFrame(idx)}
              style={{ 
                background: currentFrameIndex === idx ? '#3A7AFE' : 'transparent', // Accent Blue
                color: currentFrameIndex === idx ? '#fff' : 'rgba(255,255,255,0.7)',
                border: currentFrameIndex === idx ? 'none' : '1px solid rgba(255,255,255,0.2)',
                minWidth: '30px',
                fontWeight: currentFrameIndex === idx ? 'bold' : 'normal'
              }}
            >
              {idx + 1}
            </Button>
          </Tooltip>
        ))}
        <Tooltip title="Add Frame">
          <Button 
            icon={<PlusOutlined />} 
            onClick={handleAddFrame}
            className="toolbar-icon-btn"
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)' }}
          />
        </Tooltip>
        <Tooltip title="Delete Frame">
          <Button 
            icon={<DeleteOutlined />} 
            onClick={handleDeleteFrame}
            disabled={frames.length <= 1}
            className="toolbar-icon-btn"
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', marginLeft: '5px' }}
          />
        </Tooltip>
        <Tooltip title="Reset Animation (Delete All Frames)">
          <Button 
            icon={<UndoOutlined />} 
            onClick={handleUndo}
            className="toolbar-icon-btn"
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', marginLeft: '5px' }}
          />
        </Tooltip>
        
        {/* Frame Description Input */}
        <div style={{ marginLeft: '10px', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '10px' }}>
            <Input 
                className="frame-desc-input"
                placeholder="Frame Description (e.g. Pick & Roll)" 
                value={frames[currentFrameIndex]?.description || ''}
                onChange={(e) => {
                    const newDesc = e.target.value;
                    setFrames(prev => {
                        const newFrames = [...prev];
                        newFrames[currentFrameIndex] = {
                            ...newFrames[currentFrameIndex],
                            description: newDesc
                        };
                        return newFrames;
                    });
                }}
                style={{ 
                    width: '200px', 
                    background: '#141414', 
                    border: '1px solid #434343', 
                    color: '#ffffff',
                    fontSize: '12px',
                    borderRadius: '4px'
                }}
                size="small"
            />
        </div>
      </div>

      {/* Right Playback */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <Dropdown overlay={
          <Menu onClick={({ key }) => setPlaybackSpeed(parseFloat(key))}>
            <Menu.Item key="0.25">0.25x</Menu.Item>
            <Menu.Item key="0.5">0.5x</Menu.Item>
            <Menu.Item key="1.0">1.0x</Menu.Item>
            <Menu.Item key="1.5">1.5x</Menu.Item>
            <Menu.Item key="2.0">2.0x</Menu.Item>
          </Menu>
        } placement="topCenter">
          <Button 
            type="text" 
            style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', fontWeight: 'bold', minWidth: '50px' }}
          >
            {playbackSpeed}x
          </Button>
        </Dropdown>

        <Tooltip title="Stop">
          <Button 
            type="text" 
            icon={<div style={{ width: '12px', height: '12px', backgroundColor: 'currentColor', borderRadius: '1px' }} />} 
            onClick={handleStop}
            style={{ color: 'rgba(255,255,255,0.7)', fontSize: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} 
          />
        </Tooltip>
        <Tooltip title="Pause">
          <Button 
            type="text" 
            icon={<PauseOutlined />} 
            onClick={() => setIsPlaying(false)}
            style={{ color: isPlaying ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: '24px' }} 
          />
        </Tooltip>
        <Tooltip title="Play">
          <Button 
            type="text" 
            icon={<CaretRightOutlined />} 
            onClick={() => {
              // Auto-restart if at the end OR if starting fresh from edit mode
              if (!isAnimationMode || currentFrameIndex >= frames.length - 1) {
                isSwitchingFrame.current = true;
                setCurrentFrameIndex(0);
                setEntitiesMap(frames[0].entitiesMap);
                setActionsMap(frames[0].actionsMap);
                setAnimationProgress(0);
              }
              
              setIsAnimationMode(true);
              setIsPlaying(true);
            }}
            style={{ color: isPlaying ? 'rgba(255,255,255,0.3)' : '#fff', fontSize: '24px' }} 
          />
        </Tooltip>
      </div>
    </div>
  );

  /*
  // Recommendation Handler
  const handleAnalyzeEPV = async (silent = false, slidersOverride: any = null) => {
    if (frames.length < 2) {
      if (!silent) message.warning("Need at least 2 frames for analysis");
      return;
    }

    setIsAnalyzing(true);
    const trajectoryFrames = [];
    let currentTime = 0;
    const dt = 0.04; // 25 FPS simulation
    const simPlaybackSpeed = 1.0; // Use standard speed for analysis

    try {
      for (let i = 0; i < frames.length - 1; i++) {
        const currentFrame = frames[i];
        const nextFrame = frames[i + 1];
        
        const currentEntities = currentFrame.entitiesMap[viewMode];
        const nextEntities = nextFrame.entitiesMap[viewMode];
        const currentActions = currentFrame.actionsMap[viewMode];

        // Simulate transition
        for (let progress = 0; progress <= 1; progress += (dt * simPlaybackSpeed)) {
          const frameEntities = currentEntities.map(entity => {
            const nextEntity = nextEntities.find(e => e.id === entity.id);
            if (!nextEntity) return { id: entity.id, type: entity.type, team: (entity as any).team || 'neutral', x: entity.position.x, y: entity.position.y };

            let pos = { ...entity.position };
            let action: Action | undefined;

            if (entity.type === 'player') {
               action = currentActions.find(a => a.playerId === entity.id && ['move', 'dribble', 'screen', 'steal', 'block'].includes(a.type));
            } else if (entity.type === 'ball') {
               const ball = entity as BallType;
               if (ball.ownerId) {
                 action = currentActions.find(a => a.playerId === ball.ownerId && (a.type === 'pass' || a.type === 'shoot'));
                 if (!action) {
                     const ownerAction = currentActions.find(a => a.playerId === ball.ownerId && ['move', 'dribble', 'steal', 'screen', 'block'].includes(a.type));
                     if (ownerAction) action = ownerAction;
                 }
               }
            }

            if (action && action.path.length >= 2) {
               let t = progress;
               let speedMultiplier = 1.5;
               if (action.speed === 'walk') speedMultiplier = 1.0;
               if (action.speed === 'sprint') speedMultiplier = 2.5;
               
               let localProgress = Math.min(1, progress * speedMultiplier);
               t = localProgress;

               if (action.type === 'steal') t = t * t;

               if (t >= 1) {
                   pos = action.path[action.path.length - 1];
               } else {
                   pos = getPointOnSpline(action.path, t);
               }
            } else {
               pos = {
                x: entity.position.x + (nextEntity.position.x - entity.position.x) * progress,
                y: entity.position.y + (nextEntity.position.y - entity.position.y) * progress
              };
            }

            return {
              id: entity.id,
              type: entity.type,
              team: (entity as any).team || 'neutral',
              x: pos.x,
              y: pos.y,
              ownerId: (entity as any).ownerId
            };
          });

          // --- Inject Ghost Defenders if enabled ---
          if (showGhostDefense) {
             const ball = frameEntities.find(e => e.type === 'ball');
             const ballOwner = frameEntities.find(e => e.id === (ball as any)?.ownerId);
             const offenseTeam = (ballOwner as any)?.team || 'red';
             
             // Construct proper Ball object for utility
             const ballObj = ball ? {
                 ...ball,
                 position: { x: ball.x, y: ball.y },
                 ownerId: (ball as any).ownerId
             } : undefined;

             // Filter offensive players from the CURRENT interpolated frame
             // We need to cast them to Player type structure for calculateGhostDefender
             const currentPlayers = frameEntities
                .filter(e => e.type === 'player')
                .map(e => ({
                    ...e,
                    position: { x: e.x, y: e.y },
                    role: 'player', // Dummy
                    team: e.team
                })) as any[];

             currentPlayers.forEach(player => {
                 if (player.team === offenseTeam) {
                     const { position: ghostPos } = calculateGhostDefender(
                         player, 
                         ballObj as any, 
                         viewMode, 
                         currentPlayers
                     );
                     
                     frameEntities.push({
                         id: `ghost_${player.id}`,
                         type: 'player',
                         team: offenseTeam === 'red' ? 'blue' : 'red', // Opposite team
                         x: ghostPos.x,
                         y: ghostPos.y
                     });
                 }
             });
          }
          
          trajectoryFrames.push({
            timestamp: currentTime,
            entities: frameEntities
          });
          currentTime += dt;
        }
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s for analysis
      
      // Collect ALL assigned player profiles
      const playerMap: Record<string, number> = {};
      const assignedNames: string[] = [];
      
      entitiesMap[viewMode].forEach(entity => {
          if (entity.type === 'player' && (entity as any).profile) {
              const pid = (entity as any).profile.id;
              if (pid) {
                  playerMap[entity.id] = pid;
                  if (!assignedNames.includes((entity as any).profile.name)) {
                      assignedNames.push((entity as any).profile.name);
                  }
              }
          }
      });

      if (Object.keys(playerMap).length > 0) {
          message.info(`Analyzing with data for: ${assignedNames.join(', ')}`);
      } else {
          message.warning("No NBA players identified. Using League Average.");
      }

      const response = await fetch(API_ENDPOINTS.ANALYZE_EPV, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              trajectory: trajectoryFrames,
              court_type: viewMode,
              player_map: playerMap,
              sliders: slidersOverride || epvSliders
          }),
          signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error(`Analysis failed: ${response.status}`);
      
      const data = await response.json();
      setEpvData(data);
      // setIsEpvModalVisible(true); // No longer using modal
      setShowAnalysisPanel(true); // Show panel instead
      if (!silent) message.success("Analysis Complete!");
    } catch (error) {
        console.error(error);
        if (!silent) message.error("Analysis failed");
    } finally {
        setIsAnalyzing(false);
    }
  };
  */

  // Auto-Analyze when frames change (Debounced) - DISABLED
  // React.useEffect(() => {
  //     if (frames.length >= 2) {
  //         const timer = setTimeout(() => {
  //             handleAnalyzeEPV(true);
  //         }, 1000);
  //         return () => clearTimeout(timer);
  //     }
  // }, [frames, viewMode]);

  const handleRecommendTactic = async () => {
    setLoadingRecommendations(true);
    setIsRecommendationModalVisible(true);

    try {
      // Prepare payload from current frame entities
      const currentEntities = entitiesMap[viewMode];
      const players = currentEntities.filter(e => e.type === 'player').map(p => ({
        id: p.id,
        position: p.position,
        role: (p as PlayerType).role, // Assuming role is added to PlayerType
        team: (p as PlayerType).team
      }));
      const ball = currentEntities.find(e => e.type === 'ball');

      const payload = {
        viewMode,
        players,
        ball: ball ? { position: ball.position } : null
      };

      // Call Backend API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(API_ENDPOINTS.MATCH_TACTIC, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data = await response.json();
      setRecommendations(data.matches || []);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
      message.error('Failed to get tactic recommendations. Is the backend running?');
      setRecommendations([]);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const handleExportJSON = () => {
    // --- Generate Trajectory Data (Interpolation) for EPV ---
    const trajectoryFrames: any[] = [];
    let currentTime = 0;
    const dt = 0.04; // 25 FPS simulation
    const simPlaybackSpeed = 1.0;

    if (frames.length >= 2) {
        for (let i = 0; i < frames.length - 1; i++) {
            const currentFrame = frames[i];
            const nextFrame = frames[i + 1];
            
            const currentEntities = currentFrame.entitiesMap[viewMode];
            const nextEntities = nextFrame.entitiesMap[viewMode];
            const currentActions = currentFrame.actionsMap[viewMode];

            // Simulate transition
            for (let progress = 0; progress <= 1; progress += (dt * simPlaybackSpeed)) {
                const frameEntities = currentEntities.map(entity => {
                    const nextEntity = nextEntities.find(e => e.id === entity.id);
                    if (!nextEntity) return { id: entity.id, type: entity.type, team: (entity as any).team || 'neutral', x: entity.position.x, y: entity.position.y };

                    let pos = { ...entity.position };
                    let action: Action | undefined;

                    if (entity.type === 'player') {
                        action = currentActions.find(a => a.playerId === entity.id && ['move', 'dribble', 'screen', 'steal', 'block'].includes(a.type));
                    } else if (entity.type === 'ball') {
                        const ball = entity as BallType;
                        if (ball.ownerId) {
                            action = currentActions.find(a => a.playerId === ball.ownerId && (a.type === 'pass' || a.type === 'shoot'));
                            if (!action) {
                                const ownerAction = currentActions.find(a => a.playerId === ball.ownerId && ['move', 'dribble', 'steal', 'screen', 'block'].includes(a.type));
                                if (ownerAction) action = ownerAction;
                            }
                        }
                    }

                    if (action && action.path.length >= 2) {
                        let t = progress;
                        let speedMultiplier = 1.5;
                        if (action.speed === 'walk') speedMultiplier = 1.0;
                        if (action.speed === 'sprint') speedMultiplier = 2.5;
                        
                        let localProgress = Math.min(1, progress * speedMultiplier);
                        t = localProgress;

                        if (action.type === 'steal') t = t * t;

                        if (t >= 1) {
                            pos = action.path[action.path.length - 1];
                        } else {
                            pos = getPointOnSpline(action.path, t);
                        }
                    } else {
                        pos = {
                            x: entity.position.x + (nextEntity.position.x - entity.position.x) * progress,
                            y: entity.position.y + (nextEntity.position.y - entity.position.y) * progress
                        };
                    }

                    return {
                        id: entity.id,
                        type: entity.type,
                        team: (entity as any).team || 'neutral',
                        x: pos.x,
                        y: pos.y,
                        ownerId: (entity as any).ownerId
                    };
                });

                // Inject Ghost Defenders if enabled
                if (showGhostDefense) {
                    const ball = frameEntities.find(e => e.type === 'ball');
                    const ballOwner = frameEntities.find(e => e.id === (ball as any)?.ownerId);
                    const offenseTeam = (ballOwner as any)?.team || 'red';
                    
                    const ballObj = ball ? {
                        ...ball,
                        position: { x: ball.x, y: ball.y },
                        ownerId: (ball as any).ownerId
                    } : undefined;

                    const currentPlayers = frameEntities
                        .filter(e => e.type === 'player')
                        .map(e => ({
                            ...e,
                            position: { x: e.x, y: e.y },
                            role: 'player',
                            team: e.team
                        })) as any[];

                    currentPlayers.forEach(player => {
                        if (player.team === offenseTeam) {
                            const { position: ghostPos } = calculateGhostDefender(
                                player, 
                                ballObj as any, 
                                viewMode, 
                                currentPlayers
                            );
                            
                            frameEntities.push({
                                id: `ghost_${player.id}`,
                                type: 'player',
                                team: offenseTeam === 'red' ? 'blue' : 'red',
                                x: ghostPos.x,
                                y: ghostPos.y
                            });
                        }
                    });
                }
                
                trajectoryFrames.push({
                    timestamp: currentTime,
                    entities: frameEntities
                });
                currentTime += dt;
            }
        }
    }

    // Prompt for Tactic Details
    const tacticName = window.prompt("Enter Tactic Name:", "My Custom Tactic");
    if (!tacticName) return; // Cancelled
    
    const tacticDesc = window.prompt("Enter Description (Optional):", "Created with Tactics Board");

    const data = {
      meta: {
        version: "1.0",
        timestamp: new Date().toISOString(),
        viewMode: viewMode,
        frameCount: frames.length,
        name: tacticName,
        description: tacticDesc || ""
      },
      frames: frames.map((frame, index) => {
        // Use current state for the current frame to ensure latest changes are captured
        const isCurrent = index === currentFrameIndex;
        const entities = isCurrent ? entitiesMap[viewMode] : frame.entitiesMap[viewMode];
        const actions = isCurrent ? actionsMap[viewMode] : frame.actionsMap[viewMode];

        return {
          id: frame.id,
          index: index,
          description: frame.description || "", // Export description
          entities: entities.map(e => {
            if (e.type === 'player') {
              const p = e as PlayerType;
              return {
                id: p.id,
                type: 'player',
                team: p.team,
                number: p.number,
                role: p.role,
                position: p.position,
                rotation: p.rotation
              };
            } else {
              const b = e as BallType;
              return {
                id: b.id,
                type: 'ball',
                position: b.position,
                ownerId: b.ownerId
              };
            }
          }),
          actions: actions.map(a => ({
            id: a.id,
            type: a.type,
            playerId: a.playerId,
            path: a.path,
            color: a.color
          }))
        };
      }),
      epv_trajectory: trajectoryFrames
    };

    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tactics_sketch_${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success('Sketch data (with EPV trajectory) exported to JSON!');
  };

  const handleLoadTactic = async (tacticId: string, loadMode: 'play' | 'edit' = 'play') => {
    try {
      const response = await fetch(`${API_ENDPOINTS.BASE_URL}/api/tactics/${tacticId}`);
      if (!response.ok) throw new Error('Failed to fetch tactic details');
      const responseData = await response.json();
      
      // Unwrap animation_data if present (New Schema Support)
      const data = responseData.animation_data || responseData;

      // Store metadata for editing
      setCurrentTacticId(tacticId);
      setCurrentTacticMetadata({
          name: responseData.name,
          description: responseData.description,
          category: responseData.category,
          sub_category: responseData.sub_category,
          tags: responseData.tags,
          external_links: responseData.external_links,
          preview_image: responseData.preview_image
      });

      // Check if it's the new Export format (Sketch Data)
      if (data.frames && Array.isArray(data.frames)) {
          // If meta is missing, mock it
          const meta = data.meta || { viewMode: 'full' };
          const loadedViewMode = meta.viewMode || 'full';
          
          const newFrames: Frame[] = data.frames.map((f: any) => {
              // Reconstruct entities and actions for the specific viewMode
              const entities = f.entities || [];
              const actions = f.actions || [];
              
              // We populate both viewModes with the same data to prevent crashes, 
              // but ideally we should respect the viewMode it was created in.
              return {
                  id: f.id || uuidv4(),
                  entitiesMap: {
                      full: entities,
                      half: entities // Duplicate for safety
                  },
                  actionsMap: {
                      full: actions,
                      half: actions // Duplicate for safety
                  },
                  description: f.description || "" // Support description if added later
              };
          });

          setFrames(newFrames);
          setEntitiesMap(newFrames[0].entitiesMap);
          setActionsMap(newFrames[0].actionsMap);
          setCurrentFrameIndex(0);
          
          // Switch view mode if needed
          if (loadedViewMode !== viewMode) {
              setViewMode(loadedViewMode as ViewMode);
              message.info(`Switched to ${loadedViewMode} court view`);
          }

          // Only auto-play if mode is 'play'
          if (loadMode === 'play') {
              setIsPlaying(true);
              setIsAnimationMode(true);
          } else {
              // Edit mode: don't auto-play
              setIsPlaying(false);
              setIsAnimationMode(false);
          }
          message.success(`Loaded tactic: ${data.meta?.name || responseData.name || 'Custom Tactic'}`);
          return;
      }

      // Fallback: Old Format (1-3-1 Offense style)
      // Parse tactic data into frames
      const newFrames: Frame[] = [];
      
      // Initial Setup (Frame 0)
      // Hardcoded 1-3-1 positions for now as they are not in the JSON
      // In a real app, these should come from the JSON
      const initialEntities: BoardEntity[] = [
        { id: '1', type: 'player', team: 'red', number: '1', role: 'PG', position: { x: 380, y: 120 }, rotation: 0 },
        { id: '2', type: 'player', team: 'red', number: '2', role: 'SG', position: { x: 100, y: 300 }, rotation: 0 },
        { id: '3', type: 'player', team: 'red', number: '3', role: 'SF', position: { x: 660, y: 300 }, rotation: 0 },
        { id: '4', type: 'player', team: 'red', number: '4', role: 'PF', position: { x: 250, y: 350 }, rotation: 0 },
        { id: '5', type: 'player', team: 'red', number: '5', role: 'C', position: { x: 380, y: 250 }, rotation: 0 },
        { id: 'ball', type: 'ball', position: { x: 380, y: 130 }, ownerId: '1' }
      ];

      newFrames.push({
        id: '0',
        entitiesMap: { full: initialEntities, half: initialEntities },
        actionsMap: { full: [], half: [] },
        description: "Initial Setup"
      });

      // Process steps
      if (data.steps && Array.isArray(data.steps)) {
        data.steps.forEach((stepText: string, index: number) => {
          const stepIndex = index + 1; // 1-based index for matching overlays
          
          // Clone previous frame entities
          const prevEntities = [...newFrames[newFrames.length - 1].entitiesMap.full];
          const currentEntities = prevEntities.map(e => ({ ...e })); 
          
          // Find overlays for this step
          const overlay = data.overlays?.find((o: any) => o.for_step === stepIndex);
          const actions: Action[] = [];

          if (overlay && overlay.arrows) {
            overlay.arrows.forEach((arrow: any) => {
              // Create action from arrow
              const actionId = uuidv4();
              let path: Position[] = [];
              
              // Find start position from entity
              const fromEntity = currentEntities.find(e => e.id === String(arrow.fromId));
              const startPos = fromEntity ? fromEntity.position : { x: 0, y: 0 };
              
              // Determine end position
              let endPos = { x: 0, y: 0 };
              if (arrow.endPoint) {
                endPos = arrow.endPoint;
              } else if (arrow.toId) {
                const toEntity = currentEntities.find(e => e.id === String(arrow.toId));
                endPos = toEntity ? toEntity.position : { x: 0, y: 0 };
              }

              // Construct path
              path = [startPos];
              if (arrow.controlPoint) {
                path.push(arrow.controlPoint);
              }
              path.push(endPos);

              actions.push({
                id: actionId,
                type: arrow.type === 'pass' ? 'pass' : arrow.type === 'screen' ? 'screen' : 'move',
                playerId: String(arrow.fromId),
                path: path,
                color: arrow.type === 'pass' ? '#ff9c6e' : arrow.type === 'screen' ? '#8c8c8c' : '#1890ff'
              });

              // Update entity position if it's a move
              if (arrow.type === 'move' || arrow.type === 'curve_move') {
                 const entityIndex = currentEntities.findIndex(e => e.id === String(arrow.fromId));
                 if (entityIndex !== -1) {
                   currentEntities[entityIndex] = {
                     ...currentEntities[entityIndex],
                     position: endPos
                   };
                 }
              }
              // Update ball position if it's a pass
              if (arrow.type === 'pass') {
                 const ballIndex = currentEntities.findIndex(e => e.type === 'ball');
                 if (ballIndex !== -1) {
                    const ball = currentEntities[ballIndex] as BallType;
                    currentEntities[ballIndex] = {
                      ...ball,
                      position: endPos,
                      ownerId: String(arrow.toId)
                    };
                 }
              }
            });
          }

          newFrames.push({
            id: String(stepIndex),
            entitiesMap: { full: currentEntities, half: currentEntities },
            actionsMap: { full: actions, half: actions },
            description: stepText
          });
        });
      }

      setFrames(newFrames);
      setEntitiesMap(newFrames[0].entitiesMap);
      setActionsMap(newFrames[0].actionsMap);
      setCurrentFrameIndex(0);
      setIsPlaying(true);
      setIsAnimationMode(true);
      message.success(`Loaded tactic: ${data.tactic}`);

    } catch (error) {
      console.error('Error loading tactic:', error);
      message.error('Failed to load tactic');
    }
  };

  const handleOpenSaveModal = () => {
    // Capture screenshot
    if (stageRef.current) {
        try {
            const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 });
            setSavePreviewImage(dataUrl);
        } catch (e) {
            console.error("Screenshot failed", e);
        }
    }
    
    // Pre-fill form if editing
    if (currentTacticId && currentTacticMetadata) {
        saveForm.setFieldsValue({
            name: currentTacticMetadata.name,
            description: currentTacticMetadata.description,
            category: currentTacticMetadata.category,
            sub_category: currentTacticMetadata.sub_category,
            tags: currentTacticMetadata.tags,
            external_links: currentTacticMetadata.external_links,
            preview_source: currentTacticMetadata.preview_image ? 'custom' : 'auto',
            custom_image_url: currentTacticMetadata.preview_image
        });
    } else {
        saveForm.resetFields();
    }

    setIsSaveModalVisible(true);
  };

  const handleSaveTactic = async (values: any) => {
    setSaveLoading(true);
    try {
        // Determine preview image source
        let finalPreviewImage = savePreviewImage;
        if ((values.preview_source === 'custom' || values.preview_source === 'upload') && values.custom_image_url) {
            finalPreviewImage = values.custom_image_url;
        }

        const tacticData = {
            id: currentTacticId || uuidv4(),
            ...values,
            preview_image: finalPreviewImage,
            animation_data: {
                meta: {
                  version: "2.0",
                  timestamp: new Date().toISOString(),
                  viewMode: viewMode,
                  frameCount: frames.length,
                  name: values.name,
                  description: values.description
                },
                frames: frames.map(f => ({
                    id: f.id,
                    description: f.description,
                    entities: f.entitiesMap[viewMode], 
                    actions: f.actionsMap[viewMode],
                }))
            }
        };

        const response = await fetch(API_ENDPOINTS.TACTICS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tacticData)
        });

        if (!response.ok) throw new Error("Save failed");
        
        // Update state to reflect saved tactic (becomes currently edited)
        setCurrentTacticId(tacticData.id);
        setCurrentTacticMetadata({
            ...values,
            preview_image: finalPreviewImage
        });
        
        message.success("Tactic saved to Gallery!");
        setIsSaveModalVisible(false);
        // saveForm.resetFields(); // Don't reset, so we keep values if we open again
    } catch (e) {
        console.error(e);
        message.error("Failed to save tactic");
    } finally {
        setSaveLoading(false);
    }
  };

  // Player Search Modal
  const playerSearchModal = () => {
    return (
      <Modal
        title="Assign Real NBA Player"
        visible={isPlayerSearchModalVisible}
        onCancel={() => setIsPlayerSearchModalVisible(false)}
        footer={null}
        width={800}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Input.Search 
            placeholder="Search for a player by name"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onSearch={handleSearchPlayers}
            loading={loadingPlayers}
          />
          
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {loadingPlayers ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '50px' }}>
                <Spin size="large" tip="Loading players..." />
              </div>
            ) : (
              <List
                dataSource={searchResults}
                renderItem={item => (
                  <Card 
                    style={{ marginBottom: '10px', cursor: 'pointer' }}
                    onClick={() => handleAssignPlayer(item)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar src={item.photoUrl} size={64} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                        <div style={{ color: '#888', fontSize: '14px' }}>
                          {item.team} - {item.position}
                        </div>
                      </div>
                    </div>
                  </Card>
                )}
              />
            )}
          </div>
        </div>
      </Modal>
    );
  };

  // Context Menu Handler for Player
  const handlePlayerContextMenu = (e: any, id: string) => {
    e.evt.preventDefault();
    setTargetPlayerId(id);
    // Show context menu using Antd Dropdown logic or just open modal directly for now
    // For simplicity, let's open a modal asking if they want to assign a player
    Modal.confirm({
      title: 'Assign Real NBA Player',
      content: 'Do you want to assign a real NBA player profile to this entity?',
      onOk: () => {
        setIsPlayerSearchModalVisible(true);
        setSearchQuery('');
        setSearchResults([]);
      }
    });
  };

  const handleSearchPlayers = async () => {
    if (!searchQuery.trim()) return;
    setLoadingPlayers(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
      
      const response = await fetch(`${API_ENDPOINTS.SEARCH_PLAYERS}?name=${encodeURIComponent(searchQuery)}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error(`Server error: ${response.status}`);
      const data = await response.json();
      setSearchResults(data);
    } catch (error: any) {
      console.error('Error searching players:', error);
      if (error.name === 'AbortError') {
        message.error('Request timeout - backend may be sleeping. Please try again.');
      } else {
        message.error(`Failed to search players: ${error.message}`);
      }
    } finally {
      setLoadingPlayers(false);
    }
  };

  const handleAssignPlayer = async (nbaPlayer: any) => {
    if (!targetPlayerId) return;

    // Fetch stats for this player
    let stats = undefined;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);
        
        const response = await fetch(API_ENDPOINTS.GET_PLAYER_STATS(nbaPlayer.id), {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (response.ok) {
            stats = await response.json();
        }
    } catch (e) {
        console.warn("Could not fetch stats", e);
    }

    // Update ALL frames to ensure consistency
    setFrames(prevFrames => {
        return prevFrames.map(frame => {
            const updatedEntitiesMap = { ...frame.entitiesMap };
            // Update for both full and half views if needed, but usually ID is unique across views? 
            // Actually viewMode separates them. We should update the current viewMode's entities.
            // Or better: update in all viewModes if the ID exists?
            // For now, let's stick to current viewMode as IDs might not be shared across modes in this app's logic (usually they are separate boards)
            
            ['full', 'half'].forEach((mode) => {
                const vMode = mode as ViewMode;
                const entities = [...updatedEntitiesMap[vMode]];
                const idx = entities.findIndex(e => e.id === targetPlayerId);
                
                if (idx !== -1 && entities[idx].type === 'player') {
                    const player = entities[idx] as PlayerType;
                    entities[idx] = {
                        ...player,
                        profile: {
                            id: nbaPlayer.id,
                            name: nbaPlayer.name,
                            photoUrl: nbaPlayer.photoUrl,
                            stats: stats
                        }
                    };
                    updatedEntitiesMap[vMode] = entities;
                }
            });
            
            return {
                ...frame,
                entitiesMap: updatedEntitiesMap
            };
        });
    });

    // Also update current state (entitiesMap) to reflect changes immediately
    setEntitiesMap(prev => {
      const currentEntities = [...prev[viewMode]];
      const entityIndex = currentEntities.findIndex(e => e.id === targetPlayerId);
      if (entityIndex !== -1 && currentEntities[entityIndex].type === 'player') {
        const player = currentEntities[entityIndex] as PlayerType;
        currentEntities[entityIndex] = {
          ...player,
          profile: {
            id: nbaPlayer.id,
            name: nbaPlayer.name,
            photoUrl: nbaPlayer.photoUrl,
            stats: stats
          }
        };
      }
      return {
        ...prev,
        [viewMode]: currentEntities
      };
    });

    if (targetPlayerId) {
        setSelectedId(targetPlayerId);
    }

    setIsPlayerSearchModalVisible(false);
    message.success(`Assigned ${nbaPlayer.name} to player!`);
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'row', 
      background: APP_BACKGROUND,
      minHeight: '100vh',
      width: '100%',
      overflow: 'hidden'
    }}>
      
      {/* Left Sidebar */}
      <div style={{
        width: '70px',
        background: 'rgba(0,0,0,0.2)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '20px',
        borderRight: '1px solid rgba(255,255,255,0.1)',
        zIndex: 20
      }}>
        <SidebarButton 
          icon={<ExpandOutlined />} 
          active={viewMode === 'full'} 
          onClick={() => setViewMode('full')}
          tooltip="Full Court"
        />
        <SidebarButton 
          icon={<CompressOutlined />} 
          active={viewMode === 'half'} 
          onClick={() => setViewMode('half')}
          tooltip="Half Court"
        />
        
        <div style={{ flex: 1 }} />
        
        <SidebarButton 
          icon={<BookOutlined />} 
          onClick={() => setIsTacticsLibraryVisible(true)}
          tooltip="Tactics Gallery"
          active={isTacticsLibraryVisible}
        />

        <SidebarButton 
          icon={<SaveOutlined />} 
          onClick={handleOpenSaveModal}
          tooltip="Save to Gallery"
        />

        <SidebarButton 
          icon={<RobotOutlined />} 
          onClick={() => setIsChatPanelVisible(true)}
          tooltip="AI 战术助手"
          active={isChatPanelVisible}
        />

        <SidebarButton 
          icon={<BulbOutlined />} 
          onClick={handleRecommendTactic}
          tooltip="Recommend Tactic (AI)"
        />

        {/* Commented out Analyze button
        <SidebarButton 
          icon={isAnalyzing ? <Spin indicator={<LineChartOutlined spin />} /> : <LineChartOutlined />} 
          onClick={() => {
              if (!showAnalysisPanel) {
                  handleAnalyzeEPV();
                  setShowAnalysisPanel(true);
              } else {
                  setShowAnalysisPanel(false);
              }
          }}
          tooltip="Analyze Expected Score"
          active={showAnalysisPanel}
        />
        */}

        <SidebarButton 
          icon={showGhostDefense ? <EyeOutlined /> : <EyeInvisibleOutlined />} 
          onClick={() => setShowGhostDefense(!showGhostDefense)}
          active={showGhostDefense}
          tooltip="Toggle Ghost Defense"
        />

        <SidebarButton 
          icon={<DeleteOutlined />} 
          onClick={clearBoard}
          tooltip="Clear Board"
        />
        <SidebarButton 
          icon={<FullscreenOutlined />} 
          onClick={() => document.documentElement.requestFullscreen()}
          tooltip="Fullscreen"
        />
      </div>

      {/* Main Content Area */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center',
        position: 'relative',
        padding: '20px',
        overflow: 'auto'
      }}>
        
        <div style={{ display: 'flex', flexDirection: 'row', gap: '20px', alignItems: 'flex-start' }}>
          
          {/* Left Column: Board + PlayerInfoPanel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Main Board Area */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div 
                ref={boardRef}
                onDrop={handleDrop} 
                onDragOver={handleDragOver}
                style={{ ...boardStyle, position: 'relative', borderRadius: '8px 8px 0 0', borderBottom: 'none' }}
              >
                {renderPlayerMenu()}
                {renderActionMenu()}

                <Stage 
                  width={stageWidth} 
                  height={stageHeight} 
                  ref={stageRef}
                  onClick={handleStageClick}
                  onTap={handleStageClick}
                  onMouseDown={handleStageMouseDown}
                  onMouseMove={handleStageMouseMove}
                  onMouseUp={handleStageMouseUp}
                >
                  <Layer
                    rotation={isVertical ? 90 : 0}
                    x={isVertical ? stageWidth : 0}
                    y={0}
                  >{memoizedCourt}{showGhostDefense && (
                      <GhostDefenseLayer 
                        entities={entities} 
                        viewMode={viewMode} 
                        currentFrameIndex={currentFrameIndex}
                      />
                    )}<ActionLayer 
                      actions={actions}
                      currentAction={currentAction}
                      selectedActionId={selectedActionId}
                      onSelectAction={handleActionSelect}
                      onActionPointChange={handleActionPointChange}
                      viewMode={viewMode}
                    />
                    
                    {/* --- Z-Index Fix: Render Layers in Order --- */}

                    {/* 1. Render Players First (Bottom Layer) */}
{/* 1. 先渲染所有球员 (底层) */}
                  {entities.filter(e => e.type === 'player').map(entity => {
                      const hasBall = entities.some(e => e.type === 'ball' && (e as BallType).ownerId === entity.id);
                      return (
                        <Player 
                          key={entity.id} 
                          player={entity as PlayerType} 
                          onDragMove={handleEntityDrag}
                          rotationOffset={isVertical ? -90 : 0}
                          isSelected={selectedId === entity.id}
                          hasBall={hasBall}
                          draggable={!activeTool} 
                          onSelect={() => {
                            setSelectedId(entity.id);
                            setSelectedActionId(null); 
                          }}
                          onRotate={handleEntityRotate}
                          stageWidth={stageWidth}
                          stageHeight={stageHeight}
                          onContextMenu={handlePlayerContextMenu}
                          viewMode={viewMode}
                          scale={(entity as any).scale || 1}
                          armExtension={(entity as any).armExtension || 0}
                          actionType={(entity as any).actionType}
                        />
                      );
                  })}

                  {/* 2. 后渲染所有球 (顶层 - 确保球永远浮在球员上方) */}
                  {entities.filter(e => e.type === 'ball').map(entity => (
                      <Ball 
                        key={entity.id} 
                        ball={entity as BallType} 
                        onDragMove={handleEntityDrag}
                        draggable={!activeTool}
                        stageWidth={stageWidth}
                        stageHeight={stageHeight}
                        isSelected={selectedId === entity.id}
                        onSelect={() => {
                          setSelectedId(entity.id);
                          setSelectedActionId(null);
                        }}
                        viewMode={viewMode}
                      />
                  ))}
                  </Layer>
                </Stage>

                {/* Tactic Step Description Overlay */}
                {isAnimationMode && frames[currentFrameIndex]?.description && (
                  <div style={{
                    position: 'absolute',
                    bottom: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(0, 0, 0, 0.7)',
                    color: 'white',
                    padding: '10px 20px',
                    borderRadius: '20px',
                    maxWidth: '80%',
                    textAlign: 'center',
                    zIndex: 10,
                    pointerEvents: 'none',
                    fontSize: '16px',
                    fontWeight: 'bold'
                  }}>
                    {frames[currentFrameIndex].description}
                  </div>
                )}
              </div>
              {renderTopBar()}
            </div>

            {/* Bottom Panel: PlayerInfoPanel */}
            <div style={{ width: stageWidth, height: '220px', overflow: 'hidden' }}>
                <PlayerInfoPanel 
                  players={entities.filter(e => e.type === 'player') as PlayerType[]} 
                  mode="bottom"
                />
            </div>
          </div>

          {/* Right Panel: AssetsBar or AnalysisPanel */}
          <div style={{ 
              width: showAnalysisPanel ? '400px' : '100px', 
              height: stageHeight, 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'center',
              transition: 'width 0.3s ease'
          }}>
             {/* showAnalysisPanel is hardcoded to false, hiding the analysis panel code below */}
             {showAnalysisPanel ? (
                 <div style={{ 
                     width: '100%', 
                     height: '100%', 
                     background: 'rgba(0,0,0,0.4)', 
                     borderRadius: '8px',
                     padding: '10px',
                     display: 'flex',
                     flexDirection: 'column'
                 }}>
                    {/* ... EPV Panel JSX ... */}
                 </div>
             ) : (
                 !isAnimationMode && <AssetsBar onDragStart={() => {}} vertical={true} />
             )}
          </div>
        </div>

        {/* Animation Controls (Absolute positioned at bottom) */}
        {isAnimationMode && (
        <div style={{ position: 'absolute', bottom: '20px', width: '100%', display: 'flex', justifyContent: 'center' }}>
            <div style={{ 
              width: '80%', 
              background: 'rgba(0,0,0,0.6)', 
              padding: '10px 20px', 
              borderRadius: '8px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '15px',
              backdropFilter: 'blur(4px)'
            }}>
              <span style={{ color: '#E5E5E5', fontWeight: 'bold', minWidth: '80px' }}>
                Frame {currentFrameIndex + 1} / {frames.length}
              </span>
              
              <Slider 
                min={0} 
                max={frames.length - 1} 
                value={currentFrameIndex + animationProgress} 
                onChange={(val) => {
                   const frameIdx = Math.floor(val);
                   const progress = val - frameIdx;
                   
                   if (frameIdx !== currentFrameIndex) {
                     isSwitchingFrame.current = true;
                     setCurrentFrameIndex(frameIdx);
                     setEntitiesMap(frames[frameIdx].entitiesMap);
                     setActionsMap(frames[frameIdx].actionsMap);
                   }
                   
                   setAnimationProgress(progress);
                   setIsPlaying(false); // Pause when scrubbing
                }}
                step={0.01}
                style={{ flex: 1 }}
                trackStyle={{ backgroundColor: '#5C7ABD' }}
                handleStyle={{ borderColor: '#5C7ABD', backgroundColor: '#5C7ABD' }}
                railStyle={{ backgroundColor: '#3A3A3A' }}
              />
            </div>
        </div>
        )}

        {/* Recommendation Modal */}
        <Modal
          title="Tactic Recommendations"
          visible={isRecommendationModalVisible}
          onCancel={() => setIsRecommendationModalVisible(false)}
          footer={null}
          width={800}
        >
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {loadingRecommendations ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '50px' }}>
                <Spin size="large" tip="Loading recommendations..." />
              </div>
            ) : recommendations.length > 0 ? (
              <List
                dataSource={recommendations}
                renderItem={item => (
                  <Card 
                    style={{ marginBottom: '10px', cursor: 'pointer' }}
                    onClick={() => {
                      // Apply this tactic's movements to the board
                      const { players, ball } = item;
                      
                      setEntitiesMap(prev => {
                        const updatedEntities = { ...prev };
                        
                        // Update player positions
                        players.forEach((p: any) => {
                          const player = updatedEntities[viewMode].find(e => e.id === p.id);
                          if (player && player.type === 'player') {
                            player.position = p.position;
                            (player as PlayerType).rotation = p.rotation || 0;
                          }
                        });
                        
                        // Update ball position
                        if (ball) {
                          const b = updatedEntities[viewMode].find(e => e.type === 'ball');
                          if (b) {
                            b.position = ball.position;
                            b.ownerId = undefined; // Release ownership
                          }
                        }
                        
                        return updatedEntities;
                      });
                      
                      setIsRecommendationModalVisible(false);
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <Tag color="green">{item.tacticType}</Tag>
                        <span style={{ marginLeft: '8px', fontWeight: 'bold' }}>{item.name}</span>
                      </div>
                      <div>
                        <span style={{ fontSize: '14px', color: '#888' }}>{item.quality}</span>
                      </div>
                    </div>
                    <div style={{ marginTop: '10px' }}>
                      {item.players.map((p: any) => (
                        <div key={p.id} style={{ marginBottom: '4px' }}>
                          <Tag color="blue">{p.role}</Tag> {p.id} - {p.position.x.toFixed(1)}, {p.position.y.toFixed(1)}
                        </div>
                      ))}
                    </div>
                    {item.ball && (
                      <div style={{ marginTop: '10px' }}>
                        <Tag color="orange">Ball</Tag> {item.ball.position.x.toFixed(1)}, {item.ball.position.y.toFixed(1)}
                      </div>
                    )}
                  </Card>
                )}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <p>No tactics found for the current setup.</p>
                <Button type="primary" onClick={handleRecommendTactic}>
                  Get Recommendations
                </Button>
              </div>
            )}
          </div>
        </Modal>

        {/* Player Search Modal */}
        <Modal
          title="Assign NBA Player"
          open={isPlayerSearchModalVisible}
          onCancel={() => setIsPlayerSearchModalVisible(false)}
          footer={null}
        >
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <Input 
              placeholder="Search NBA Player (e.g. Curry)" 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onPressEnter={handleSearchPlayers}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={handleSearchPlayers} loading={loadingPlayers}>
              Search
            </Button>
          </div>
          
          <List
            loading={loadingPlayers}
            dataSource={searchResults}
            renderItem={(item: any) => (
              <List.Item
                actions={[<Button type="link" onClick={() => handleAssignPlayer(item)}>Assign</Button>]}
              >
                <List.Item.Meta
                  avatar={<Avatar src={item.photoUrl} />}
                  title={item.name}
                  description={item.isActive ? <Tag color="green">Active</Tag> : <Tag color="red">Inactive</Tag>}
                />
              </List.Item>
            )}
            style={{ maxHeight: '400px', overflowY: 'auto' }}
          />
        </Modal>

        {/* EPV Analysis Modal - REMOVED (Replaced by Right Panel) */}
      </div>
      
      <TacticsLibrary 
        visible={isTacticsLibraryVisible}
        onClose={() => setIsTacticsLibraryVisible(false)}
        onSelectTactic={handleLoadTactic}
      />
      
      <Modal
        title={currentTacticId ? "Update Tactic" : "Save Tactic to Gallery"}
        visible={isSaveModalVisible}
        onCancel={() => setIsSaveModalVisible(false)}
        onOk={() => saveForm.submit()}
        confirmLoading={saveLoading}
        width={600}
      >
        <Form
            form={saveForm}
            layout="vertical"
            onFinish={handleSaveTactic}
            initialValues={{ category: 'Offense', tags: [], sub_category: 'Actions', preview_source: 'auto' }}
        >
            {/* Dynamic Preview Section */}
            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.preview_source !== curr.preview_source || prev.custom_image_url !== curr.custom_image_url}>
                {({ getFieldValue }) => {
                    const source = getFieldValue('preview_source');
                    const customUrl = getFieldValue('custom_image_url');
                    const displayImage = (source === 'custom' || source === 'upload') && customUrl ? customUrl : savePreviewImage;

                    return (
                        <div style={{ marginBottom: 16, textAlign: 'center', background: '#f0f0f0', padding: 8 }}>
                            {displayImage ? (
                                <img 
                                    src={displayImage} 
                                    alt="Preview" 
                                    style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain' }} 
                                    onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/400x200?text=Invalid+Image+URL')}
                                />
                            ) : (
                                <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>
                                    No Preview Available
                                </div>
                            )}
                            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
                                {source === 'auto' ? 'Auto-generated Preview' : 'Custom Preview'}
                            </div>
                        </div>
                    );
                }}
            </Form.Item>

            <Form.Item name="preview_source" label="Preview Image Source">
                <Radio.Group buttonStyle="solid">
                    <Radio.Button value="auto">Auto-Generated</Radio.Button>
                    <Radio.Button value="custom">URL</Radio.Button>
                    <Radio.Button value="upload">Upload</Radio.Button>
                </Radio.Group>
            </Form.Item>

            <Form.Item 
                noStyle 
                shouldUpdate={(prev, curr) => prev.preview_source !== curr.preview_source || prev.custom_image_url !== curr.custom_image_url}
            >
                {({ getFieldValue, setFieldsValue }) => {
                    const source = getFieldValue('preview_source');

                    if (source === 'custom') {
                        return (
                            <Form.Item name="custom_image_url" label="Image URL" rules={[{ required: true, message: 'Please enter image URL' }]}>
                                <Input placeholder="https://example.com/my-tactic.jpg" />
                            </Form.Item>
                        );
                    }
                    
                    if (source === 'upload') {
                        return (
                            <Form.Item label="Upload Image">
                                <Upload
                                    beforeUpload={(file) => {
                                        const reader = new FileReader();
                                        reader.onload = e => {
                                            if (e.target && e.target.result) {
                                                setFieldsValue({ custom_image_url: e.target.result });
                                            }
                                        };
                                        reader.readAsDataURL(file);
                                        return false; // Prevent auto upload
                                    }}
                                    showUploadList={false}
                                >
                                    <Button>Click to Upload Image</Button>
                                </Upload>
                                <Form.Item name="custom_image_url" noStyle>
                                    <Input type="hidden" />
                                </Form.Item>
                                {getFieldValue('custom_image_url') && <div style={{marginTop: 8, color: 'green'}}>Image Loaded Successfully</div>}
                            </Form.Item>
                        );
                    }
                    
                    return null;
                }}
            </Form.Item>

            <Form.Item name="name" label="Tactic Name" rules={[{ required: true }]}>
                <Input placeholder="e.g. Horns Flex Offense" />
            </Form.Item>

            <Row gutter={16}>
                <Col span={12}>
                    <Form.Item name="category" label="Category" rules={[{ required: true }]}>
                        <Select onChange={() => saveForm.setFieldsValue({ sub_category: null })}>
                            <Select.Option value="Offense">Offense</Select.Option>
                            <Select.Option value="Defense">Defense</Select.Option>
                            <Select.Option value="Strategy & Concepts">Strategy & Concepts</Select.Option>
                        </Select>
                    </Form.Item>
                </Col>
                <Col span={12}>
                    <Form.Item 
                        noStyle 
                        shouldUpdate={(prev, curr) => prev.category !== curr.category}
                    >
                        {({ getFieldValue }) => {
                            const category = getFieldValue('category');
                            let currentSubCategories: string[] = [];
                            if (category === 'Offense') {
                                currentSubCategories = ['Set', 'Motion', 'Actions', 'Continuity', 'Zone'];
                            } else if (category === 'Defense') {
                                currentSubCategories = ['Man', 'Zone', 'Press'];
                            } else {
                                currentSubCategories = ['General Strategy', 'Concept', 'Lineup'];
                            }
                            
                            return (
                                <Form.Item name="sub_category" label="Sub-Category" rules={[{ required: true }]}>
                                    <Select placeholder="Type">
                                        {currentSubCategories.map(sub => (
                                            <Select.Option key={sub} value={sub}>{sub}</Select.Option>
                                        ))}
                                    </Select>
                                </Form.Item>
                            );
                        }}
                    </Form.Item>
                </Col>
            </Row>

            
            <Form.Item name="description" label="Description">
                <Input.TextArea rows={3} placeholder="Briefly describe the tactic..." />
            </Form.Item>

            <Form.Item name="tags" label="Tags">
                <Select mode="tags" placeholder="Press enter to add tags (e.g. Pick and Roll, Spacing)" />
            </Form.Item>

            <Form.Item label="External Links">
                <Input.Group compact>
                    <Form.Item name={['external_links', 'article']} noStyle>
                        <Input style={{ width: '50%' }} prefix={<LinkOutlined />} placeholder="Article / Wikipedia URL" />
                    </Form.Item>
                    <Form.Item name={['external_links', 'video']} noStyle>
                        <Input style={{ width: '50%' }} prefix={<PlayCircleOutlined />} placeholder="Video URL" />
                    </Form.Item>
                </Input.Group>
            </Form.Item>
        </Form>
      </Modal>

      <ChatPanel
        visible={isChatPanelVisible}
        onClose={() => setIsChatPanelVisible(false)}
        currentTactic={{
          meta: {
            name: currentTacticDescription || 'Current Tactic',
            frameCount: frames.length,
          },
          frames: frames.map((frame, idx) => ({
            id: frame.id,
            index: idx,
            entities: frame.entitiesMap[viewMode],
            actionsMap: frame.actionsMap,
          })),
        }}
        onApplyTactic={(tactic) => {
          // Apply the AI-generated tactic to the board
          console.log('Applying tactic:', tactic);
          
          try {
            // Convert AI tactic format to internal format
            const newFrames: Frame[] = [];
            const tacticFrames = tactic.frames || [];
            
            // Helper function to convert coordinates
            const convertCoord = (val: number, max: number) => {
              if (typeof val !== 'number' || isNaN(val)) return max / 2;
              // If value looks like percentage (0-100), convert to pixels
              if (val >= 0 && val <= 100) {
                return (val / 100) * max;
              }
              return val;
            };
            
            // If no frames but has steps, convert steps to a single frame
            if (tacticFrames.length === 0 && tactic.steps) {
              // Create entities from steps (use unique start positions)
              const playerPositions = new Map<string, { x: number; y: number }>();
              const actions: Action[] = [];
              let ballOwnerId: string | undefined;
              
              tactic.steps.forEach((step: any, idx: number) => {
                const playerNum = String(step.player_number || step.playerNumber || '1');
                const startPos = step.start_pos || step.startPos || { x: 400, y: 300 };
                const endPos = step.end_pos || step.endPos || startPos;
                
                const startX = convertCoord(startPos.x, 800);
                const startY = convertCoord(startPos.y, 682);
                const endX = convertCoord(endPos.x, 800);
                const endY = convertCoord(endPos.y, 682);
                
                // Store initial position
                if (!playerPositions.has(playerNum)) {
                  playerPositions.set(playerNum, { x: startX, y: startY });
                  // First player with dribble action owns the ball
                  if (!ballOwnerId && (step.action === 'dribble' || step.action === 'pass')) {
                    ballOwnerId = `ai-player-red-${playerNum}`;
                  }
                }
                
                // Create action with valid path
                const playerId = `ai-player-red-${playerNum}`;
                actions.push({
                  id: `ai-action-${idx}`,
                  type: (step.action || 'move') as ActionType,
                  playerId,
                  path: [
                    { x: startX, y: startY },
                    { x: endX, y: endY }
                  ],
                });
              });
              
              // Create player entities
              const entities: BoardEntity[] = [];
              playerPositions.forEach((pos, num) => {
                entities.push({
                  id: `ai-player-red-${num}`,
                  type: 'player',
                  number: num,
                  team: 'red',
                  position: { x: pos.x, y: pos.y },
                });
              });
              
              // Add ball
              const ballOwnerPos = ballOwnerId ? 
                playerPositions.get(ballOwnerId.replace('ai-player-red-', '')) : 
                playerPositions.get('1');
              entities.push({
                id: 'ai-ball',
                type: 'ball',
                position: ballOwnerPos ? { x: ballOwnerPos.x, y: ballOwnerPos.y } : { x: 400, y: 300 },
                ownerId: ballOwnerId || (playerPositions.has('1') ? 'ai-player-red-1' : undefined),
              });
              
              newFrames.push({
                id: 'ai-frame-1',
                entitiesMap: { full: entities, half: [] },
                actionsMap: { full: actions, half: [] },
              });
            } else if (tacticFrames.length > 0) {
              // Process frames format
              tacticFrames.forEach((frame: any, frameIdx: number) => {
                const entities: BoardEntity[] = [];
                const actions: Action[] = [];
                let ballOwnerId: string | undefined;
                
                // Process players
                const players = frame.players || [];
                players.forEach((p: any) => {
                  const x = convertCoord(p.x, 800);
                  const y = convertCoord(p.y, 682);
                  const playerId = `ai-player-${p.team || 'red'}-${p.number}`;
                  
                  entities.push({
                    id: playerId,
                    type: 'player',
                    number: String(p.number),
                    team: (p.team || 'red') as TeamType,
                    position: { x, y },
                  });
                  
                  // Track ball owner
                  if (p.has_ball || p.hasBall) {
                    ballOwnerId = playerId;
                  }
                });
                
                // Add ball entity
                const ballOwner = entities.find(e => e.id === ballOwnerId);
                entities.push({
                  id: `ai-ball-${frameIdx}`,
                  type: 'ball',
                  position: ballOwner ? { ...ballOwner.position } : { x: 400, y: 400 },
                  ownerId: ballOwnerId,
                });
                
                // Process actions
                const frameActions = frame.actions || [];
                frameActions.forEach((a: any, actionIdx: number) => {
                  const playerNum = String(a.player_number || a.playerNumber);
                  // Find player by number in any team
                  const player = entities.find(e => 
                    e.type === 'player' && (e as PlayerType).number === playerNum
                  );
                  const playerId = player?.id || `ai-player-red-${playerNum}`;
                  
                  // Convert path coordinates
                  const rawPath = a.path || [];
                  const path: Position[] = rawPath.map((pt: any) => {
                    if (Array.isArray(pt)) {
                      return { 
                        x: convertCoord(pt[0], 800), 
                        y: convertCoord(pt[1], 682) 
                      };
                    }
                    return { 
                      x: convertCoord(pt.x, 800), 
                      y: convertCoord(pt.y, 682) 
                    };
                  }).filter((pt: Position) => !isNaN(pt.x) && !isNaN(pt.y));
                  
                  // Ensure path has at least 2 points
                  if (path.length === 1 && player) {
                    path.unshift({ ...player.position });
                  } else if (path.length === 0 && player) {
                    path.push({ ...player.position }, { ...player.position });
                  }
                  
                  if (path.length >= 2) {
                    actions.push({
                      id: `ai-action-${frameIdx}-${actionIdx}`,
                      type: (a.action_type || a.actionType || 'move') as ActionType,
                      playerId,
                      path,
                    });
                  }
                });
                
                newFrames.push({
                  id: `ai-frame-${frameIdx + 1}`,
                  entitiesMap: { full: entities, half: [] },
                  actionsMap: { full: actions, half: [] },
                });
              });
            }
            
            if (newFrames.length > 0) {
              setFrames(newFrames);
              setCurrentFrameIndex(0);
              setEntitiesMap(newFrames[0].entitiesMap);
              setActionsMap(newFrames[0].actionsMap);
              setCurrentTacticDescription(tactic.name || tactic.tactic_name || 'AI Generated Tactic');
              message.success(`Tactic "${tactic.name || tactic.tactic_name || 'AI Tactic'}" applied!`);
            } else {
              message.warning('No valid frames found in tactic data');
            }
          } catch (error) {
            console.error('Error applying tactic:', error);
            message.error('Failed to apply tactic: ' + String(error));
          }
        }}
      />
    </div>
  );
};

export default TacticsBoard;