import React, { useState, useEffect } from 'react';
import { Button, Form, Typography, Space, Alert, Tag, Modal, Select, Segmented } from 'antd';
import { RadarChartOutlined, CloseOutlined, SettingOutlined, ArrowRightOutlined, BulbOutlined, CheckCircleFilled } from '@ant-design/icons';
import { API_ENDPOINTS } from '../../config/api';
import { Player, Action } from '../../types';
import { POSITIONS } from '../../utils/constants';
import { formatOffensiveRoleForAi } from '../../config/playerRoles';

const { Title, Text } = Typography;

interface DiagnosticActionFrame {
  frameIndex: number;
  actions: Action[];
}

interface LineupDiagnosticPanelProps {
  isOpen: boolean;
  onClose: () => void;
  boardPlayers?: Player[];
  /** Actions grouped by frame — Demand vector is aggregated over all frames */
  boardActionFrames?: DiagnosticActionFrame[];
  /** Name of the currently loaded tactic */
  currentTacticName?: string;
}

interface DiagnosticDimension {
  name: string;
  score: number;
  reason: string;
}

interface WeakLink {
  position: string;
  current_tag: string;
  issue: string;
  suggestion: string;
  expected_score?: number;
  delta_score?: number;
}

interface DiagnosticResult {
  tactic_summary: string;
  dimensions: DiagnosticDimension[];
  weak_links: WeakLink[];
  score_metric?: 'cosine' | 'jsd';
  base_score?: number;
}

type ScoreMetric = 'cosine' | 'jsd';

const getScoreColor = (score: number): string => {
  if (score >= 80) return '#52c41a';
  if (score >= 60) return '#1677ff';
  if (score >= 30) return '#faad14';
  return '#fa8c16';
};

// `COMMON_TACTICS` has been historically used for manual tactic entry and is now removed.

const ROLE_TO_POSITION: Record<string, string> = { PG: 'PG', SG: 'SG', SF: 'SF', PF: 'PF', C: 'C' };

const toRadarLabel = (name: string): string => {
  // Pass through exact Synergy playtype tags as-is
  const SYNERGY_TAGS = ['Spot_Up','PnR_BH','PnR_RM','Post_Up','Cut','Transition','Isolation','Off_Screen','Hand_Off','Putback'];
  if (SYNERGY_TAGS.includes(name)) return name;
  const lower = name.toLowerCase();
  if (lower.includes('iso')) return 'Isolation';
  if (lower.includes('cut')) return 'Cut';
  if (lower.includes('spot')) return 'Spot_Up';
  if (lower.includes('pnr_rm') || lower.includes('roll')) return 'PnR_RM';
  if (lower.includes('pnr') || lower.includes('pick') || lower.includes('ball_hand')) return 'PnR_BH';
  if (lower.includes('post')) return 'Post_Up';
  if (lower.includes('hand_off') || lower.includes('handoff')) return 'Hand_Off';
  if (lower.includes('putback') || lower.includes('put_back')) return 'Putback';
  if (lower.includes('off') && lower.includes('screen')) return 'Off_Screen';
  if (lower.includes('transit')) return 'Transition';
  return name.length > 20 ? `${name.slice(0, 18)}...` : name;
};

// ─────────────────────────────────────────────────────────────────────────────
// Role Cluster Capability Table
// Source: "Offensive Role Cluster Description" (research paper, Table 11)
//
// Methodology: Residual Uniform Imputation
//   Known values: playtype frequencies explicitly reported in Table 11 High Stats.
//   Missing values: residual = 1.0 − Σ(known), distributed uniformly across the
//   remaining (10 − n_known) undocumented playtypes.
//   Formula: imputed_k = (1.0 − Σ known) / (10 − |known|)
//
// Dimensions: 10 of the 11 official Synergy playtypes
// (Misc excluded — it is a residual catch-all with no defined supply semantics;
//  if a tactic action is tagged Misc it is simply ignored in the Fit Score).
// Deliberately excluded: Playmaking, Spacing, Defense — these are NOT Synergy
// playtype termination categories and would violate the Σ = 1.0 probability axiom.
// ─────────────────────────────────────────────────────────────────────────────
const TAG_CAPABILITY: Record<string, Record<string, number>> = {
  // Keys marked with (*) are paper-backed from Table 11; rest are imputed.
  //            Spot_Up  PnR_BH  PnR_RM  Post_Up   Cut   Transit   Iso   Off_Scr  Hand_Off  Putback
  STB:  { Spot_Up:0.27/*★*/, PnR_BH:0.07, PnR_RM:0.19/*★*/, Post_Up:0.07, Cut:0.07, Transition:0.07, Isolation:0.07, Off_Screen:0.07, Hand_Off:0.07, Putback:0.07 },
  ISA:  { Spot_Up:0.10,      PnR_BH:0.10, PnR_RM:0.10,       Post_Up:0.10, Cut:0.10, Transition:0.10, Isolation:0.14/*★*/, Off_Screen:0.10, Hand_Off:0.10, Putback:0.10 },
  PUB:  { Spot_Up:0.07,      PnR_BH:0.07, PnR_RM:0.18/*★*/, Post_Up:0.26/*★*/, Cut:0.07, Transition:0.07, Isolation:0.07, Off_Screen:0.07, Hand_Off:0.07, Putback:0.07 },
  SBH:  { Spot_Up:0.23/*★*/, PnR_BH:0.36/*★*/, PnR_RM:0.05, Post_Up:0.05, Cut:0.05, Transition:0.05, Isolation:0.05, Off_Screen:0.05, Hand_Off:0.05, Putback:0.05 },
  TRA:  { Spot_Up:0.33/*★*/, PnR_BH:0.05, PnR_RM:0.05,       Post_Up:0.05, Cut:0.05, Transition:0.23/*★*/, Isolation:0.05, Off_Screen:0.05, Hand_Off:0.05, Putback:0.05 },
  PBH:  { Spot_Up:0.06,      PnR_BH:0.46/*★*/, PnR_RM:0.06, Post_Up:0.06, Cut:0.06, Transition:0.06, Isolation:0.06, Off_Screen:0.06, Hand_Off:0.06, Putback:0.06 },
  SUS:  { Spot_Up:0.47/*★*/, PnR_BH:0.06, PnR_RM:0.06,       Post_Up:0.06, Cut:0.06, Transition:0.06, Isolation:0.06, Off_Screen:0.06, Hand_Off:0.06, Putback:0.06 },
  RCB:  { Spot_Up:0.06,      PnR_BH:0.06, PnR_RM:0.23/*★*/, Post_Up:0.06, Cut:0.26/*★*/, Transition:0.06, Isolation:0.06, Off_Screen:0.06, Hand_Off:0.06, Putback:0.06 },
  OSS:  { Spot_Up:0.28/*★*/, PnR_BH:0.05, PnR_RM:0.05,       Post_Up:0.05, Cut:0.05, Transition:0.05, Isolation:0.05, Off_Screen:0.34/*★*/, Hand_Off:0.05, Putback:0.05 },
  WWH:  { Spot_Up:0.29/*★*/, PnR_BH:0.22/*★*/, PnR_RM:0.06, Post_Up:0.06, Cut:0.06, Transition:0.06, Isolation:0.06, Off_Screen:0.06, Hand_Off:0.06, Putback:0.06 },
};

// Map any dimension name variation to a valid TAG_CAPABILITY key (10 Synergy playtypes)
const toDimKey = (name: string): string => {
  const n = name.toLowerCase().replace(/-/g, '_');
  if (n.includes('cut')) return 'Cut';
  if (n.includes('spot')) return 'Spot_Up';
  if (n.includes('hand_off') || (n.includes('hand') && n.includes('off'))) return 'Hand_Off';
  if (n.includes('off_screen') || (n.includes('off') && n.includes('screen'))) return 'Off_Screen';
  if (n.includes('post')) return 'Post_Up';
  if (n.includes('putback') || n.includes('put_back')) return 'Putback';
  // Distinguish ball-handler (BH) from roll-man (RM) — check more specific pattern first
  if (n === 'pnr_rm' || n.includes('pnr_rm') || n.includes('roll_man') || n.includes('roll man')) return 'PnR_RM';
  if (n.includes('pnr') || n.includes('pick') || n.includes('ball_hand') || n.includes('ballhand')) return 'PnR_BH';
  if (n.includes('iso')) return 'Isolation';
  if (n.includes('transit')) return 'Transition';
  // Non-Synergy concepts mapped to closest proxy (with comment for reader)
  if (n.includes('play') || n.includes('assist')) return 'PnR_BH'; // Playmaking proxy → PnR_BH
  if (n.includes('spac')) return 'Spot_Up';   // Spacing proxy → Spot_Up
  if (n.includes('defense')) return 'Cut';    // Defensive movement proxy → Cut
  return name;
};

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Demand from draw-path action frequency
// d_k = C_k / Σ C_i  (Eq. 1 in paper § 3.2)
// Returns empty map if no board actions are tagged (panel will show “no data” HUD).
// ─────────────────────────────────────────────────────────────────────────────
const computeDemand = (actions: Action[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  actions.forEach(a => {
    if (a.actionTag) counts[a.actionTag] = (counts[a.actionTag] ?? 0) + 1;
  });
  const total = Object.values(counts).reduce((s, c) => s + c, 0);
  if (!total) return {};
  return Object.fromEntries(Object.entries(counts).map(([k, c]) => [k, c / total]));
};

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Cosine Similarity Fit Score
// FitScore = (D · S) / (|D| |S|)  (Eq. 2 in paper § 3.3)
// Both vectors span the 10 Synergy playtype dimensions.
// ─────────────────────────────────────────────────────────────────────────────
const SYNERGY_DIMS = ['Spot_Up','PnR_BH','PnR_RM','Post_Up','Cut','Transition','Isolation','Off_Screen','Hand_Off','Putback'] as const;

const SUPPLY_DECAY_ALPHA: Record<string, number> = {
  Spot_Up: 0.8,
  PnR_BH: 0.2,
  PnR_RM: 0.8,
  Post_Up: 0.2,
  Cut: 0.8,
  Transition: 0.8,
  Isolation: 0.2,
  Off_Screen: 0.8,
  Hand_Off: 0.2,
  Putback: 0.8,
};

const computeRankWeightedSupply = (playerTags: (string | undefined)[]) => {
  const validTags = playerTags.filter(Boolean) as string[];
  const rawMap: Record<string, number> = {};
  const normalizedMap: Record<string, number> = {};

  SYNERGY_DIMS.forEach(dim => {
    const alpha = SUPPLY_DECAY_ALPHA[dim] ?? 0.8;
    const valuesDesc = validTags
      .map(tag => TAG_CAPABILITY[tag]?.[dim] ?? 0.07)
      .sort((a, b) => b - a);

    const raw = valuesDesc.reduce((sum, value, j) => sum + value * Math.pow(alpha, j), 0);
    rawMap[dim] = raw;
  });

  const totalRaw = SYNERGY_DIMS.reduce((sum, dim) => sum + (rawMap[dim] ?? 0), 0);
  SYNERGY_DIMS.forEach(dim => {
    normalizedMap[dim] = totalRaw > 0 ? (rawMap[dim] ?? 0) / totalRaw : 0;
  });

  return { rawMap, normalizedMap, totalRaw };
};

const computeCosineFitScore = (
  demandMap: Record<string, number>,
  playerTags: (string | undefined)[],
): number => {
  const { normalizedMap } = computeRankWeightedSupply(playerTags);
  const D = SYNERGY_DIMS.map(k => demandMap[k] ?? 0);
  const S = SYNERGY_DIMS.map(k => normalizedMap[k] ?? 0);
  const dot  = D.reduce((s, d, i) => s + d * S[i], 0);
  const magD = Math.sqrt(D.reduce((s, d) => s + d * d, 0));
  const magS = Math.sqrt(S.reduce((s, v) => s + v * v, 0));
  if (!magD || !magS) return 0;
  return Math.round((dot / (magD * magS)) * 100);
};

/*
const computeJsdFitScore = (
  demandMap: Record<string, number>,
  playerTags: (string | undefined)[],
): number => {
  const { normalizedMap } = computeRankWeightedSupply(playerTags);
  const dVec = SYNERGY_DIMS.map(k => demandMap[k] ?? 0);
  const sVec = SYNERGY_DIMS.map(k => normalizedMap[k] ?? 0);
  const sumD = dVec.reduce((sum, value) => sum + value, 0);
  const sumS = sVec.reduce((sum, value) => sum + value, 0);
  if (!sumD || !sumS) return 0;

  const kl = (p: number[], q: number[]) => p.reduce((sum, pVal, i) => {
    if (pVal <= 0) return sum;
    const qVal = q[i];
    if (qVal <= 0) return sum;
    return sum + pVal * Math.log(pVal / qVal);
  }, 0);

  const mean = dVec.map((d, i) => 0.5 * (d + sVec[i]));
  const jsd = 0.5 * kl(dVec, mean) + 0.5 * kl(sVec, mean);
  const fit = (1 - (jsd / Math.log(2))) * 100;
  return Math.max(0, Math.min(100, Math.round(fit)));
};
*/

const computeFitScore = (
  demandMap: Record<string, number>,
  playerTags: (string | undefined)[],
  metric: ScoreMetric,
): number => computeCosineFitScore(demandMap, playerTags);

const getTopDemandItems = (demandMap: Record<string, number>, limit?: number) =>
  Object.entries(demandMap)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({ key, value }));

const demandForLabel = (label: string, actions: string[] = []): number => {
  // Normalize: lower-case, treat _ and - as equivalent
  const norm = (s: string) => s.toLowerCase().replace(/_/g, '-');
  const normLabel = norm(label);
  const normalized = actions.map(a => norm(a));
  const has = (keyword: string) => normalized.some(a => a.includes(norm(keyword)));

  // Only the 10 Synergy playtypes (excl. Misc) are valid demand dimensions
  if (normLabel.includes('cut'))       return has('cut')        ? 0.90 : 0.65;
  if (normLabel.includes('spot'))      return has('spot')       ? 0.88 : 0.63;
  if (normLabel.includes('pnr-rm') || (normLabel.includes('pnr') && normLabel.includes('rm')))
                                       return has('pnr')        ? 0.85 : 0.62;
  if (normLabel.includes('pnr') || normLabel.includes('pick'))
                                       return has('pnr')        ? 0.88 : 0.64;
  if (normLabel.includes('post'))      return has('post')       ? 0.88 : 0.66;
  if (normLabel.includes('off-screen')|| normLabel.includes('offscreen'))
                                       return has('off-screen') ? 0.85 : 0.63;
  if (normLabel.includes('hand-off') || normLabel.includes('handoff'))
                                       return has('hand-off')   ? 0.82 : 0.60;
  if (normLabel.includes('putback'))   return has('putback')    ? 0.80 : 0.58;
  if (normLabel.includes('iso'))       return has('iso')        ? 0.85 : 0.65;
  if (normLabel.includes('transit'))   return has('transit')    ? 0.85 : 0.62;
  if (normalized.some(a => a === normLabel)) return 0.85;
  return 0.65;
};

const RadarChart: React.FC<{
  dimensions: DiagnosticDimension[];
  /** Normalised demand vector: key = Synergy playtype, value in [0, 1] */
  demandMap: Record<string, number>;
  /** Normalised supply vector: key = Synergy playtype, value in [0, 1] */
  supplyMap: Record<string, number>;
}> = ({ dimensions, demandMap, supplyMap }) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!dimensions?.length) return null;

  const size = 390;
  const padding = 72;
  const center = size / 2;
  const radius = 132;
  const n = dimensions.length;

  const maxDemand = Math.max(0.01, dimensions.reduce((max, d) => Math.max(max, demandMap[toRadarLabel(d.name)] ?? 0), 0));
  const maxSupply = Math.max(0.01, dimensions.reduce((max, d) => Math.max(max, supplyMap[toDimKey(d.name)] ?? 0), 0));

  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    return {
      x: center + radius * value * Math.cos(angle),
      y: center + radius * value * Math.sin(angle),
    };
  };

  const outerPolygon = Array.from({ length: n }, (_, i) => getPoint(i, 1)).map(p => `${p.x},${p.y}`).join(' ');
  const gridPolygons = [0.25, 0.5, 0.75, 1].map(level => Array.from({ length: n }, (_, i) => getPoint(i, level)).map(p => `${p.x},${p.y}`).join(' '));
  // Demand polygon: shape-normalised to match Cosine Similarity logic (independent scaling)
  const demandPolygon = dimensions.map((d, i) => getPoint(i, (demandMap[toRadarLabel(d.name)] ?? 0) / maxDemand)).map(p => `${p.x},${p.y}`).join(' ');
  // Supply polygon: shape-normalised to match Cosine Similarity logic
  const currentPolygon = dimensions.map((d, i) => getPoint(i, (supplyMap[toDimKey(d.name)] ?? 0) / maxSupply)).map(p => `${p.x},${p.y}`).join(' ');

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg
        width={size}
        height={size}
        viewBox={`${-padding} ${-padding} ${size + padding * 2} ${size + padding * 2}`}
        style={{ overflow: 'visible', display: 'block' }}
      >
        <polygon points={outerPolygon} fill="rgba(255,255,255,0.01)" stroke="rgba(255,255,255,0.12)" strokeWidth={1.1} />
        {gridPolygons.map((points, idx) => (
          <polygon key={`grid-${idx}`} points={points} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={idx === gridPolygons.length - 1 ? 0 : 1} />
        ))}
        {dimensions.map((_, i) => {
          const outer = getPoint(i, 1);
          return (
            <line key={`line-${i}`} x1={center} y1={center} x2={outer.x} y2={outer.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          );
        })}

        {/* Demand layer — tactic requirement (blue dashed) */}
        <polygon points={demandPolygon} fill="rgba(22,119,255,0.16)" stroke="rgba(106,169,255,0.95)" strokeWidth={2.4} strokeDasharray="7 4" />
        {/* Supply layer — actual lineup performance (amber solid) */}
        <polygon points={currentPolygon} fill="rgba(250, 173, 20, 0.14)" stroke="#faad14" strokeWidth={2.2} />

        {dimensions.map((d, i) => {
          const supply = (supplyMap[toDimKey(d.name)] ?? 0) * 100;
          const p = getPoint(i, (supplyMap[toDimKey(d.name)] ?? 0) / maxSupply);
          const isHovered = hoveredIndex === i;
          return (
            <g key={`point-${i}`} onMouseEnter={() => setHoveredIndex(i)} onMouseLeave={() => setHoveredIndex(null)} style={{ cursor: 'pointer' }}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isHovered ? 5.5 : 3.2}
                fill={getScoreColor(supply)}
                stroke="rgba(0,0,0,0.8)"
                strokeWidth={isHovered ? 2 : 1}
                style={{ transition: 'all 0.2s ease' }}
              />
            </g>
          );
        })}

        {dimensions.map((d, i) => {
          const lp = getPoint(i, 1.35); // Move labels slightly further out to accommodate larger text
          const shortLabel = toRadarLabel(d.name);
          const words = shortLabel.split(' ');
          const isHovered = hoveredIndex === i;
          return (
            <text
              key={`label-${d.name}`}
              x={lp.x}
              y={lp.y}
              textAnchor="middle"
              fill={isHovered ? '#fff' : '#a8b4cc'} // slightly brighter base color
              fontSize={isHovered ? "17" : "15"} // Increased from 16/14 to 17/15
              fontWeight={isHovered ? 700 : 700} // Increased base weight to 700
              fontFamily="Inter, Segoe UI, Roboto, sans-serif"
              style={{ transition: 'all 0.2s ease', cursor: 'pointer' }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {words.map((word, idx) => (
                <tspan key={idx} x={lp.x} dy={idx === 0 ? 0 : 20}>{word}</tspan> // Increased line height slightly
              ))}
            </text>
          );
        })}

      </svg>

      {hoveredIndex !== null && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(250, 173, 20, 0.4)',
          borderRadius: 8,
          padding: '12px 16px',
          width: 240,
          pointerEvents: 'none',
          boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          zIndex: 10,
          backdropFilter: 'blur(8px)'
        }}>
          {(() => {
            const d = dimensions[hoveredIndex];
            const label = toRadarLabel(d.name);
            const demand = Math.round((demandMap[label] ?? 0) * 100);
            const supply = Math.round((supplyMap[toDimKey(d.name)] ?? 0) * 100);
            const gap = supply - demand;
            return (
              <>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: 700, display: 'block', marginBottom: 8 }}>{d.name}</Text>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: '#1677ff', fontSize: 12 }}>Demand</Text>
                  <Text style={{ color: '#6aa9ff', fontSize: 12, fontWeight: 600 }}>{demand}%</Text>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ color: '#faad14', fontSize: 12 }}>Supply</Text>
                  <Text style={{ color: getScoreColor(supply), fontSize: 12, fontWeight: 600 }}>{supply}%</Text>
                </div>
                {gap < 0 && (
                  <div style={{ marginBottom: 8, fontSize: 11, color: '#fa8c16', fontWeight: 600 }}>Gap: {Math.abs(gap)}% below demand</div>
                )}
                <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', marginBottom: 10 }} />
                <Text style={{ color: '#adb5c9', fontSize: 11, fontStyle: 'italic', lineHeight: 1.4, display: 'block' }}>
                  {d.reason}
                </Text>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};


// Basketball action keywords that should be highlighted teal
const TACTIC_KEYWORDS = ['Cut', 'Spot_Up', 'Spot-Up', 'Post_Up', 'Post-Up', 'Off_Screen', 'PnR', 'Isolation', 'Spacing', 'Playmaking', 'Drive and Kick', 'Perimeter Shooting'];
// Role codes highlighted in amber
const ROLE_CODES = ['STB', 'ISA', 'PUB', 'SBH', 'TRA', 'PBH', 'SUS', 'RCB', 'OSS', 'WWH'];

const renderIssue = (text: string) => {
  if (!text) return text;
  // Build a single regex from all keywords + role codes + markdown bold
  const escaped = [...TACTIC_KEYWORDS, ...ROLE_CODES].map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(\\*\\*.*?\\*\\*|${escaped.join('|')})`, 'g');
  const parts = text.split(pattern);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} style={{ color: '#fff' }}>{part.slice(2, -2)}</strong>;
    }
    if (ROLE_CODES.includes(part)) {
      return <strong key={i} style={{ color: '#faad14', background: 'rgba(250,173,20,0.12)', borderRadius: 3, padding: '0 3px' }}>{part}</strong>;
    }
    if (TACTIC_KEYWORDS.includes(part)) {
      return <strong key={i} style={{ color: '#36d9b3', fontWeight: 700 }}>{part}</strong>;
    }
    return part;
  });
};

const LineupDiagnosticPanel: React.FC<LineupDiagnosticPanelProps> = ({ isOpen, onClose, boardPlayers = [], boardActionFrames = [], currentTacticName }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [scoreMetric, setScoreMetric] = useState<ScoreMetric>('cosine');
  const [panelMode, setPanelMode] = useState<'optimize_lineup' | 'recommend_tactics'>('optimize_lineup');
  const [tacticMatches, setTacticMatches] = useState<any[]>([]);
  const [isRecommending, setIsRecommending] = useState(false);
  const [form] = Form.useForm();
  
  // Decouple UI rendering from live-board updates by using snapshotted data
  const [diagSnapshot, setDiagSnapshot] = useState<{ playerTags: (string | undefined)[], actions: Action[], scoreMetric: ScoreMetric } | null>(null);

  const boardActions = boardActionFrames.flatMap(frame => frame.actions);

  useEffect(() => {
    if (!boardPlayers.length) return;
    const updates: Record<string, string> = {};
    boardPlayers.forEach(p => {
      const pos = p.role && ROLE_TO_POSITION[p.role];
      if (pos && p.playerTag) updates[`player_${pos}`] = p.playerTag;
    });
    if (Object.keys(updates).length) form.setFieldsValue(updates);
  }, [boardPlayers, form]);

  // Clear stale diagnostic data when the board is empty (no players AND no draw-path actions).
  // This prevents the panel from showing cached results from a previous tactic session.
  useEffect(() => {
    const hasPlayers = boardPlayers.some(p => p.type === 'player');
    const hasActions = boardActions.some(a => a.actionTag);
    if (!hasPlayers && !hasActions) {
      setResult(null);
      setDiagSnapshot(null);
      setTacticMatches([]);
      setDiagError(null);
    }
  }, [boardPlayers, boardActions]);

  // Legacy tactic config change handler removed

  const handleDiagnose = async (_values: Record<string, string | string[]>) => {
    const values = form.getFieldsValue(true) as Record<string, string | string[]>;
    setLoading(true);
    setDiagError(null);
    setResult(null);

    const boardEntries = boardPlayers
      .filter(p => p.role && p.playerTag)
      .map(p => ({
        position: p.role as string,
        player_tag: formatOffensiveRoleForAi(p.playerTag),
      }));

    // Guard: require at least one player with a role tag on the board
    if (boardEntries.length === 0) {
      setDiagError('Please drag players onto the court and assign role tags before running diagnostics.');
      setLoading(false);
      return;
    }

    const current_lineup = boardEntries;

    if (panelMode === 'recommend_tactics') {
      setIsRecommending(true);
      try {
        const listRes = await fetch(API_ENDPOINTS.TACTICS);
        if (!listRes.ok) throw new Error(`HTTP ${listRes.status} ${listRes.statusText}`);
        const listData = await listRes.json();
        
        const detailsRes = await Promise.all(
          listData.map((t: any) => 
            fetch(`${API_ENDPOINTS.TACTICS}/${t.id}`).then(res => res.json())
          )
        );

        // Use only actual board players — no form fallback
        const playerTags = boardPlayers
          .filter(p => p.role && p.playerTag)
          .map(p => p.playerTag);

        const matches = detailsRes.map(tactic => {
          const actions: Action[] = [];
          if (tactic.animation_data?.frames) {
             tactic.animation_data.frames.forEach((f: any) => {
                if (f.actions) actions.push(...f.actions);
             });
          }
          const demandMap = computeDemand(actions);
          const hasDemand = Object.keys(demandMap).length > 0;
          const fitScore = hasDemand ? computeFitScore(demandMap, playerTags, scoreMetric) : 0;
          
          return {
            ...tactic,
            fitScore
          };
        });
        
        const sortedMatches = matches
          .filter(m => m.category === 'Offense' && m.fitScore > 0)
          .sort((a, b) => b.fitScore - a.fitScore);
        setTacticMatches(sortedMatches);
        
        // Snapshot the current state to freeze UI updates
        setDiagSnapshot({ playerTags, actions: boardActions, scoreMetric });
      } catch (error: any) {
        setDiagError(error.message || String(error));
      } finally {
        setIsRecommending(false);
        setLoading(false);
      }
      return;
    }

    const boardActionTags = boardActions
      .map(a => a.actionTag)
      .filter((tag): tag is string => Boolean(tag));

    const payload = {
      target_tactic: {
        name: currentTacticName || 'Custom Tactic',
        action_requirements: boardActionTags.length ? boardActionTags : (values.tactic_actions || []),
        action_requirements_detailed: boardActionFrames.map(frame => ({
          frameIndex: frame.frameIndex,
          actionTags: frame.actions.map(a => a.actionTag).filter(Boolean),
        })),
        score_metric: scoreMetric,
      },
      current_lineup,
    };

    const url = `${API_ENDPOINTS.BASE_URL}/api/diagnose_lineup`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let detail = `HTTP ${response.status} ${response.statusText}`;
        try {
          const errJson = await response.json();
          const raw = errJson?.detail ?? errJson;
          detail = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
        } catch { }
        throw new Error(detail);
      }

      const data = (await response.json()) as DiagnosticResult;
      setResult(data);
      setDiagSnapshot({
        playerTags: boardPlayers.filter(p => p.type === 'player').map(p => p.playerTag),
        actions: boardActions,
        scoreMetric
      });
      if (data.score_metric === 'cosine' || data.score_metric === 'jsd') {
        setScoreMetric(data.score_metric);
      }
    } catch (error: unknown) {
      let msg: string;
      if (error instanceof Error) {
        msg = error.message;
      } else if (typeof error === 'string') {
        msg = error;
      } else {
        try { msg = JSON.stringify(error, null, 2); } catch { msg = String(error); }
      }
      setDiagError(msg);
    } finally {
      setLoading(false);
    }
  };

  // Legacy tactic form watches removed

  if (!isOpen) return null;

  return (
    <Form
      form={form}
      layout="vertical"
      onFinish={handleDiagnose}
      initialValues={{
        player_PG: 'PBH',
        player_SG: 'SUS',
        player_SF: 'WWH',
        player_PF: 'RCB',
        player_C: 'STB',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          bottom: 12,
          width: '640px',
          maxWidth: '58vw',
          minWidth: '540px',
          background: 'rgba(10,16,28,0.72)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          boxShadow: '-10px 0 32px rgba(0,0,0,0.5)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'Inter, Segoe UI, Roboto, sans-serif',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Space>
            <RadarChartOutlined style={{ color: '#faad14', fontSize: 22 }} />
            <div>
              <Title level={4} style={{ color: '#fff', margin: 0 }}>AI Lineup Diagnostics</Title>
              <Text style={{ color: '#7a86a0', fontSize: 11, letterSpacing: 1 }}>SPORTS VISUAL ANALYTICS HUD</Text>
            </div>
          </Space>
          <Button type="text" icon={<CloseOutlined style={{ color: '#98a2b8' }} />} onClick={onClose} />
        </div>

        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
              <Text style={{ color: '#6f7b95', fontSize: 11, letterSpacing: 1, fontWeight: 500 }}>
                {panelMode === 'recommend_tactics' ? 'CURRENT LINEUP' : 'CURRENT SCENARIO'}
              </Text>
            <div><Text style={{ color: '#fff', fontWeight: 600 }}>{panelMode === 'recommend_tactics' ? (isRecommending ? 'Looking for Tactics...' : 'Live Board Roster') : (currentTacticName || 'Custom Board Roster')}</Text></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Custom AI-Themed Segmented Control */}
            <div style={{
              display: 'inline-flex',
              background: 'rgba(15,23,42,0.6)',
              borderRadius: 12,
              padding: 4,
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              {[
                { id: 'optimize_lineup', label: 'Optimize Lineup' },
                { id: 'recommend_tactics', label: 'Recommend Tactics' }
              ].map(opt => {
                const isActive = panelMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setPanelMode(opt.id as any)}
                    style={{
                      border: 'none',
                      background: isActive ? 'linear-gradient(135deg, rgba(250,173,20,0.2) 0%, rgba(250,173,20,0.05) 100%)' : 'transparent',
                      color: isActive ? '#faad14' : '#8f9bb3',
                      fontWeight: isActive ? 700 : 500,
                      padding: '8px 20px',
                      borderRadius: 8,
                      fontSize: 14,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isActive ? 'inset 0 0 0 1px rgba(250,173,20,0.3), 0 2px 8px rgba(0,0,0,0.2)' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px 18px' }}>
          <Button 
            type={result ? "default" : "primary"} 
            block 
            loading={loading} 
            icon={<RadarChartOutlined />} 
            onClick={() => form.submit()} 
            style={result ? { height: 46, borderRadius: 10, fontWeight: 600, marginBottom: 14, background: 'transparent', borderColor: '#4e5a70', color: '#8f9bb3' } : { height: 46, borderRadius: 10, fontWeight: 700, marginBottom: 14, background: '#faad14', borderColor: '#faad14', color: '#000' }}
          >
            {loading ? 'Analyzing...' : result ? 'Recalculate Diagnostics' : 'Run Lineup Diagnostics'}
          </Button>

          {diagError && (
            <div style={{
              marginBottom: 14,
              padding: '16px 20px',
              background: 'linear-gradient(135deg, rgba(250, 173, 20, 0.08) 0%, rgba(250, 173, 20, 0.02) 100%)',
              border: '1px solid rgba(250, 173, 20, 0.2)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.2)'
            }}>
              <div style={{
                background: 'rgba(250, 173, 20, 0.15)',
                borderRadius: '50%',
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: '1px solid rgba(250, 173, 20, 0.3)'
              }}>
                <BulbOutlined style={{ color: '#faad14', fontSize: 18 }} />
              </div>
              <div style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Board Data Required
                </Text>
                <Text style={{ color: '#adb5c9', fontSize: 13, lineHeight: 1.5, display: 'block' }}>
                  {diagError}
                </Text>
              </div>
              <Button 
                type="text" 
                icon={<CloseOutlined style={{ fontSize: 12, color: '#7a86a0' }} />} 
                onClick={() => setDiagError(null)} 
                style={{ marginLeft: -8, marginTop: -4 }}
              />
            </div>
          )}

          {panelMode === 'recommend_tactics' ? (
            <div style={{ marginTop: 16 }}>
              {isRecommending ? (
                <div style={{ padding: '40px 0', textAlign: 'center' }}>
                  <div className="custom-spin" style={{ width: 36, height: 36, border: '3px solid rgba(250,173,20,0.2)', borderTopColor: '#faad14', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                  <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                  <Text style={{ color: '#adb5c9', fontSize: 13 }}>Analyzing 38+ tactical systems against your lineup...</Text>
                </div>
              ) : tacticMatches.length > 0 ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <BulbOutlined style={{ color: '#faad14', fontSize: 18 }} />
                    <Title level={5} style={{ margin: 0, color: '#fff', fontSize: 15 }}>Top Tactic Matches</Title>
                  </div>
                  <Text style={{ color: '#8f9bb3', fontSize: 12, display: 'block', marginBottom: 16 }}>
                    Based on your current lineup's strengths, these set plays offer the highest technical synergy.
                  </Text>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {tacticMatches.map((tactic, idx) => {
                      const fitColor = tactic.fitScore >= 75 ? '#52c41a' : tactic.fitScore >= 50 ? '#1677ff' : tactic.fitScore >= 30 ? '#faad14' : '#fa4d4d';
                      return (
                        <div key={tactic.id} style={{
                          display: 'flex', gap: 16, background: 'linear-gradient(135deg, rgba(30,36,50,0.8) 0%, rgba(20,24,35,0.9) 100%)',
                          border: '1px solid rgba(250, 173, 20, 0.25)', borderRadius: 12, padding: 16,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                        }}>
                          {tactic.preview_image ? (
                            <img src={tactic.preview_image} alt={tactic.name} style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: '1px solid rgba(255,255,255,0.1)' }} />
                          ) : (
                            <div style={{ width: 80, height: 80, background: 'rgba(255,255,255,0.05)', borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                              <RadarChartOutlined style={{ fontSize: 24, color: '#4e5a70' }} />
                            </div>
                          )}
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                                <Text style={{ color: '#fff', fontSize: 15, fontWeight: 600 }}>{tactic.name}</Text>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.3)', padding: '2px 8px', borderRadius: 10, border: `1px solid ${fitColor}33` }}>
                                  <Text style={{ color: fitColor, fontSize: 16, fontWeight: 800 }}>{tactic.fitScore}%</Text>
                                </div>
                              </div>
                              <Text style={{ color: '#adb5c9', fontSize: 11, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {tactic.description || 'No description available'}
                              </Text>
                            </div>
                            <div style={{ marginTop: 8 }}>
                              <Tag style={{ margin: 0, background: '#252b3b', border: '1px solid rgba(255,255,255,0.08)', color: '#a8b4cc', fontSize: 10 }}>{tactic.category || 'General'}</Tag>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : null}
            </div>
          ) : result ? (
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 16, padding: '20px 24px', position: 'relative', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', boxShadow: 'inset 0 0 20px rgba(250,173,20,0.05)' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg, #1677ff, #faad14, #52c41a)' }} />
              
              {/* DUAL-LAYER RADAR LEGEND + FIT SCORE HUD */}
              {(() => {
                const playerTags = diagSnapshot?.playerTags ?? boardPlayers.filter(p => p.type === 'player').map(p => p.playerTag ?? undefined);
                const activeActions = diagSnapshot?.actions ?? boardActions;
                const activeScoreMetric = diagSnapshot?.scoreMetric ?? scoreMetric;
                const demandMap = computeDemand(activeActions);
                const hasDemand = Object.keys(demandMap).length > 0;
                const fitScore = hasDemand ? computeFitScore(demandMap, playerTags, activeScoreMetric) : null;
                const topDemandItems = getTopDemandItems(demandMap);
                const fitColor = fitScore === null ? '#6f7b95'
                  : fitScore >= 75 ? '#52c41a'
                  : fitScore >= 50 ? '#1677ff'
                  : fitScore >= 30 ? '#faad14'
                  : '#fa4d4d';

                // Radar display: always show all 10 Synergy axes (original layout)
                const synergizedDimensions: DiagnosticDimension[] = [...SYNERGY_DIMS].map(k => {
                  const aiDim = result.dimensions?.find(d => toRadarLabel(d.name) === k || toDimKey(d.name) === k);
                  return { name: k, score: 0, reason: aiDim?.reason ?? '' };
                });

                // Debug & score share the exact same supply model
                const validTags = playerTags.filter(Boolean) as string[];
                const supplyStats = computeRankWeightedSupply(validTags);
                const supplyVec = SYNERGY_DIMS.map(k => supplyStats.normalizedMap[k] ?? 0);

                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 16, alignItems: 'stretch', marginBottom: 14 }}>
                      <div style={{
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 14,
                        padding: '16px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        minHeight: 116,
                      }}>
                        <Text style={{ color: '#7a86a0', fontSize: 13, fontWeight: 700, letterSpacing: 1.1 }}>
                          TACTIC FIT SCORE
                        </Text>
                        {fitScore !== null ? (
                          <span style={{ fontSize: 44, lineHeight: 1.1, fontWeight: 900, color: fitColor, textShadow: `0 0 14px ${fitColor}55`, fontFamily: 'monospace', marginTop: 8 }}>
                            {fitScore}%
                          </span>
                        ) : (
                          <span style={{ fontSize: 14, color: '#4e5a70', fontStyle: 'italic', marginTop: 10 }}>Load a tactic first</span>
                        )}
                        <Text style={{ color: '#8f9bb3', fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
                          Score derived from cosine similarity between tactic demand and lineup supply.
                        </Text>
                      </div>

                      <div style={{
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.02))',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 14,
                        padding: '14px 16px',
                        minHeight: 116,
                      }}>
                        <Text style={{ color: '#cfd7e6', fontSize: 14, fontWeight: 700, display: 'block', marginBottom: 12 }}>Top Tactic Demands</Text>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                          {topDemandItems.length > 0 ? topDemandItems.map(({ key, value }) => (
                            <div key={key} style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 12px',
                              borderRadius: 999,
                              background: 'rgba(22,119,255,0.12)',
                              border: '1px solid rgba(106,169,255,0.25)',
                            }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#6aa9ff', boxShadow: '0 0 10px rgba(106,169,255,0.6)' }} />
                              <Text style={{ color: '#dbe7ff', fontSize: 13, fontWeight: 700 }}>{key}</Text>
                              <Text style={{ color: '#6aa9ff', fontSize: 13, fontWeight: 700 }}>{(value * 100).toFixed(0)}%</Text>
                            </div>
                          )) : (
                            <Text style={{ color: '#8f9bb3', fontSize: 13 }}>No recognized demand from current draw-path actions.</Text>
                          )}
                        </div>
                        <Text style={{ color: '#8f9bb3', fontSize: 13, lineHeight: 1.6 }}>
                          Suggestions below are ranked by real score lift under the same fit formula.
                        </Text>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 20, height: 2, background: 'rgba(22,119,255,0.55)', borderTop: '1.5px dashed rgba(22,119,255,0.55)' }} />
                        <Text style={{ color: '#6aa9ff', fontSize: 11 }}>Tactic Demand</Text>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 20, height: 2, background: '#faad14' }} />
                        <Text style={{ color: '#faad14', fontSize: 11 }}>Lineup Supply</Text>
                      </div>
                    </div>

                    <div style={{ marginBottom: 16, padding: 18, background: '#0f1726', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16 }}>
                      <RadarChart
                        dimensions={synergizedDimensions}
                        demandMap={demandMap}
                        supplyMap={supplyStats.normalizedMap}
                      />
                    </div>

                    {/* ── DEBUG PANEL ────────────────────────────────────── */}
                    <div style={{ marginBottom: 20, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => setDebugOpen(o => !o)}
                        style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: 'none', cursor: 'pointer',
                          padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ color: '#7a86a0', fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>🔬 COMPUTATION DEBUG</Text>
                        <Text style={{ color: '#4e5a70', fontSize: 11 }}>{debugOpen ? '▲ hide' : '▼ show'}</Text>
                      </button>

                      {debugOpen && (
                        <div style={{ padding: '12px 14px', fontSize: 11, fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', overflowX: 'auto' }}>

                          {/* 1. boardActions */}
                          <div style={{ marginBottom: 12 }}>
                            <Text style={{ color: '#faad14', display: 'block', marginBottom: 4 }}>
                              ① boardActions ({boardActions.length} total across {boardActionFrames.length} frames)
                            </Text>
                            {boardActions.length === 0
                              ? <Text style={{ color: '#4e5a70' }}>No actions across frames</Text>
                              : boardActionFrames.map(({ frameIndex, actions }) => (
                                  <div key={frameIndex} style={{ marginBottom: 8 }}>
                                    <Text style={{ color: '#7a86a0', display: 'block', marginBottom: 3 }}>
                                      Frame {frameIndex + 1} ({actions.length} actions)
                                    </Text>
                                    {actions.length === 0
                                      ? <div style={{ color: '#4e5a70', marginBottom: 2 }}>—</div>
                                      : actions.map((a, i) => (
                                          <div key={`${frameIndex}-${i}`} style={{ color: a.actionTag ? '#52c41a' : '#fa4d4d', marginBottom: 2 }}>
                                            [{i}] type={a.type} tag=<b>{a.actionTag ?? 'UNTAGGED'}</b>
                                            {' '}start=({a.path[0]?.x.toFixed(0)},{a.path[0]?.y.toFixed(0)})
                                            {' '}end=({a.path[a.path.length-1]?.x.toFixed(0)},{a.path[a.path.length-1]?.y.toFixed(0)})
                                          </div>
                                        ))}
                                  </div>
                                ))
                            }
                          </div>

                          {/* 2. Demand vector */}
                          <div style={{ marginBottom: 12 }}>
                            <Text style={{ color: '#1677ff', display: 'block', marginBottom: 4 }}>② Demand vector (d_k = C_k / ΣC)</Text>
                            {hasDemand
                              ? SYNERGY_DIMS.map(k => (
                                  <div key={k} style={{ color: (demandMap[k] ?? 0) > 0 ? '#6aa9ff' : '#333d4f', marginBottom: 1 }}>
                                    {k.padEnd(12)}: {((demandMap[k] ?? 0) * 100).toFixed(1)}%
                                    {' '}<span style={{ color: '#333d4f' }}>{'█'.repeat(Math.round((demandMap[k] ?? 0) * 20))}</span>
                                  </div>
                                ))
                              : <Text style={{ color: '#4e5a70' }}>Empty — no tagged actions</Text>
                            }
                          </div>

                          {/* 3. Supply per player */}
                          <div style={{ marginBottom: 12 }}>
                            <Text style={{ color: '#faad14', display: 'block', marginBottom: 4 }}>③ Supply per player</Text>
                            {validTags.length === 0
                              ? <Text style={{ color: '#4e5a70' }}>No player tags set</Text>
                              : validTags.map((tag, pi) => (
                                  <div key={pi} style={{ marginBottom: 6 }}>
                                    <Text style={{ color: '#faad14' }}>Player {pi+1}: {tag}</Text>
                                    <div style={{ paddingLeft: 8, marginTop: 2 }}>
                                      {SYNERGY_DIMS.map(k => {
                                        const v = TAG_CAPABILITY[tag]?.[k] ?? 0.07;
                                        const isPaper = v > 0.10;
                                        return (
                                          <div key={k} style={{ color: isPaper ? '#52c41a' : '#4e5a70', marginBottom: 1 }}>
                                            {k.padEnd(12)}: {(v * 100).toFixed(0)}%{isPaper ? ' ★' : ''}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))
                            }
                          </div>

                          {/* 4. Rank-weighted & normalized supply vector */}
                          <div style={{ marginBottom: 12 }}>
                            <Text style={{ color: '#faad14', display: 'block', marginBottom: 4 }}>④ Rank-weighted Supply S (normalized)</Text>
                            {SYNERGY_DIMS.map((k, i) => (
                              <div key={k} style={{ color: supplyVec[i] > 0.10 ? '#faad14' : '#4e5a70', marginBottom: 1 }}>
                                {k.padEnd(12)}: {(supplyVec[i] * 100).toFixed(1)}%
                                {' '}<span style={{ color: '#333d4f' }}>{'█'.repeat(Math.round(supplyVec[i] * 20))}</span>
                              </div>
                            ))}
                          </div>

                          {/* 4b. Rank-weight details */}
                          <div style={{ marginBottom: 12 }}>
                            <Text style={{ color: '#faad14', display: 'block', marginBottom: 4 }}>④b Rank-weight details (α, S', s)</Text>
                            {SYNERGY_DIMS.map(k => (
                              <div key={k} style={{ color: '#adb5c9', marginBottom: 1 }}>
                                {k.padEnd(12)}: α={(SUPPLY_DECAY_ALPHA[k] ?? 0.8).toFixed(1)}
                                {'  '}S'={(supplyStats.rawMap[k] ?? 0).toFixed(4)}
                                {'  '}s={((supplyStats.normalizedMap[k] ?? 0) * 100).toFixed(1)}%
                              </div>
                            ))}
                            <div style={{ color: '#4e5a70', marginTop: 3 }}>
                              ΣS' = {supplyStats.totalRaw.toFixed(4)}; Σs = {SYNERGY_DIMS.reduce((sum, k) => sum + (supplyStats.normalizedMap[k] ?? 0), 0).toFixed(4)}
                            </div>
                          </div>

                          {/* 5. Fit score calculation */}
                          {hasDemand && validTags.length > 0 && (() => {
                            const D = SYNERGY_DIMS.map(k => demandMap[k] ?? 0);
                            const S = supplyVec;

                            if (activeScoreMetric === 'jsd') {
                              const M = D.map((d, i) => 0.5 * (d + S[i]));
                              const kl = (p: number[], q: number[]) => p.reduce((sum, pVal, i) => {
                                if (pVal <= 0 || q[i] <= 0) return sum;
                                return sum + pVal * Math.log(pVal / q[i]);
                              }, 0);
                              const klDM = kl(D, M);
                              const klSM = kl(S, M);
                              const jsd = 0.5 * klDM + 0.5 * klSM;
                              const fit = (1 - (jsd / Math.log(2))) * 100;

                              return (
                                <div>
                                  <Text style={{ color: '#36d9b3', display: 'block', marginBottom: 4 }}>⑤ Jensen-Shannon Divergence</Text>
                                  <div style={{ color: '#adb5c9', marginBottom: 6 }}>
                                    <div>M = 0.5 × (D + S)</div>
                                    {SYNERGY_DIMS.map((k, i) => (
                                      <div key={`jsd-m-${k}`} style={{ color: M[i] > 0.08 ? '#8bdc8f' : '#4e5a70' }}>
                                        {k.padEnd(12)}: M={M[i].toFixed(4)}  (D={D[i].toFixed(4)}, S={S[i].toFixed(4)})
                                      </div>
                                    ))}
                                  </div>
                                  <div style={{ color: '#adb5c9' }}>
                                    KL(D||M) = {klDM.toFixed(4)}<br/>
                                    KL(S||M) = {klSM.toFixed(4)}<br/>
                                    JSD = 0.5 × {klDM.toFixed(4)} + 0.5 × {klSM.toFixed(4)} = {jsd.toFixed(4)}<br/>
                                    Fit = (1 - JSD / ln(2)) × 100 = <b style={{ color: fitColor }}>{fit.toFixed(1)}%</b>
                                  </div>
                                </div>
                              );
                            }

                            const dot   = D.reduce((s, d, i) => s + d * S[i], 0);
                            const magD  = Math.sqrt(D.reduce((s, d) => s + d * d, 0));
                            const magS  = Math.sqrt(S.reduce((s, v) => s + v * v, 0));
                            const cos   = magD && magS ? dot / (magD * magS) : 0;
                            return (
                              <div>
                                <Text style={{ color: '#36d9b3', display: 'block', marginBottom: 4 }}>⑤ Cosine Similarity</Text>
                                <div style={{ color: '#adb5c9' }}>
                                  D·S = {dot.toFixed(4)}<br/>
                                  |D| = {magD.toFixed(4)}<br/>
                                  |S| = {magS.toFixed(4)}<br/>
                                  cos = {dot.toFixed(4)} / ({magD.toFixed(4)} × {magS.toFixed(4)}) = <b style={{ color: fitColor }}>{(cos * 100).toFixed(1)}%</b>
                                </div>
                              </div>
                            );
                          })()}

                        </div>
                      )}
                    </div>
                    {/* ── END DEBUG ───────────────────────────────────────── */}
                  </>
                );
              })()}

              {/* SUBSTITUTION CARDS */}
              {result.weak_links?.length > 0 ? (() => {
                const demandMap = computeDemand(boardActions);
                const topDemandItems = getTopDemandItems(demandMap);

                return (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <BulbOutlined style={{ color: '#faad14' }} />
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>Substitution Suggestions</Text>
                  </div>
                  <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'thin' }}>
                    {result.weak_links.map((wl, idx) => {
                      // Attempt to parse structured text if it exists (Demands vs Current vs Replace)
                      const fullText = typeof wl.issue === 'string' ? wl.issue : '';
                      
                      let demandsText = '';
                      let currentText = '';
                      let replaceText = '';
                      
                      if (fullText) {
                        // Extract keywords based on the structure we expect. If the AI doesn't return this structure, it will fall back to the old string styling.
                        const sentences = fullText.split(/(?:\. |! |\? )/).filter(Boolean);
                        if (sentences.length >= 2) {
                          currentText = sentences[0] + '.';
                          replaceText = sentences.slice(1).join('. ') + (fullText.endsWith('.') ? '' : '.');
                        } else {
                          currentText = fullText;
                        }
                      }

                      return (
                      <div key={idx} style={{ 
                        flex: '0 0 280px', 
                        background: 'linear-gradient(135deg, rgba(30,36,50,0.8) 0%, rgba(20,24,35,0.9) 100%)', 
                        border: '1px solid rgba(250, 173, 20, 0.25)', 
                        borderRadius: 12, 
                        padding: 16,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <Tag style={{ margin: 0, background: '#252b3b', border: 'none', color: '#fff', fontWeight: 600 }}>{wl.position}</Tag>
                          <Text style={{ color: '#52c41a', fontSize: 12, fontWeight: 700 }}>
                            {typeof wl.delta_score === 'number' ? `+${wl.delta_score}% Fit` : 'Needs Revision'}
                          </Text>
                        </div>
                        
                        <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                           {/* STRUCTURED TEXT DISPLAY */}
                           {topDemandItems.length > 0 && (
                             <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                               <span style={{ color: '#adb5c9', fontWeight: 600, marginRight: 6 }}>Demands:</span>
                               <span style={{ color: '#d1d8e6' }}>{topDemandItems.map((d: {key: string, value: number}) => `${d.key} (${(d.value * 100).toFixed(0)}%)`).join(', ')}</span>
                             </div>
                           )}
                           
                           {currentText && (
                             <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                               <span style={{ color: '#ff4d4f', opacity: 0.9, fontWeight: 600, marginRight: 6 }}>Current:</span>
                               <span style={{ color: '#d1d8e6' }}>{renderIssue(currentText)}</span>
                             </div>
                           )}
                           
                           {replaceText && (
                             <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                               <span style={{ color: '#52c41a', opacity: 0.9, fontWeight: 600, marginRight: 6 }}>Replace:</span>
                               <span style={{ color: '#d1d8e6' }}>{renderIssue(replaceText)}</span>
                             </div>
                           )}
                        </div>

                        {typeof wl.expected_score === 'number' && (
                          <div style={{ marginBottom: 12, padding: '8px 10px', borderRadius: 10, background: 'rgba(82,196,26,0.08)', border: '1px solid rgba(82,196,26,0.18)' }}>
                            <Text style={{ color: '#8bdc8f', fontSize: 12 }}>
                              Expected score after swap: <b style={{ color: '#52c41a' }}>{wl.expected_score}%</b>
                            </Text>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                              <Text style={{ color: '#7a86a0', fontSize: 10, display: 'block', marginBottom: 4 }}>Current</Text>
                              <Tag style={{ margin: 0, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontWeight: 500, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={wl.current_tag}>{wl.current_tag.split(' - ')[0]}</Tag>
                            </div>
                            <ArrowRightOutlined style={{ color: '#faad14', opacity: 0.6, flexShrink: 0, margin: '0 8px' }} />
                            <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
                            <Text style={{ color: '#faad14', fontSize: 10, display: 'block', marginBottom: 4 }}>Suggest</Text>
                            <Tag style={{ margin: 0, background: 'rgba(250, 173, 20, 0.15)', border: '1px solid rgba(250, 173, 20, 0.3)', color: '#faad14', fontWeight: 600 }}>{wl.suggestion}</Tag>
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
              ); })() : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px', background: 'rgba(82,196,26,0.08)', borderRadius: 12, border: '1px solid rgba(82,196,26,0.2)' }}>
                  <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
                  <Text strong style={{ color: '#fff' }}>Perfect Lineup Fit</Text>
                </div>
              )}
            </div>
          ) : null}
        </div>


      </div>
    </Form>
  );
};

export default LineupDiagnosticPanel;
