import React, { useState, useEffect } from 'react';
import { Button, Form, Typography, Space, Alert, Tag, Modal, Select, Segmented } from 'antd';
import { RadarChartOutlined, CloseOutlined, SettingOutlined, ArrowRightOutlined, BulbOutlined, CheckCircleFilled, RobotOutlined } from '@ant-design/icons';
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
  /** Callback to load a tactic by ID */
  onLoadTactic?: (tacticId: string, mode?: 'play' | 'edit') => void;
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

// ─────────────────────────────────────────────────────────────────────────────
// Histogram Intersection Fit Score
// FitScore = Σ min(D_k, S_k) / Σ D_k   (over all 10 Synergy playtypes)
//
// Answers: "Of the demand distribution, what fraction is adequately supplied?"
// - D_k = 0 → min(0, S_k) = 0, so irrelevant Supply dimensions are ignored
// - If Supply exceeds Demand on a dimension, it's capped at Demand (no bonus)
// - Range: 0% (total mismatch) to 100% (Supply ≥ Demand on every dimension)
// ─────────────────────────────────────────────────────────────────────────────
const computeHistogramIntersectionScore = (
  demandMap: Record<string, number>,
  playerTags: (string | undefined)[],
): number => {
  const { normalizedMap } = computeRankWeightedSupply(playerTags);

  const sumD = SYNERGY_DIMS.reduce((s, k) => s + (demandMap[k] ?? 0), 0);
  if (sumD === 0) return 0;

  const intersection = SYNERGY_DIMS.reduce((s, k) => {
    const d = demandMap[k] ?? 0;
    const supply = normalizedMap[k] ?? 0;
    return s + Math.min(d, supply);
  }, 0);

  return Math.round((intersection / sumD) * 100);
};

/*
// Previous metric: Cosine Similarity (Focused variant)
// Deprecated: cosine similarity between all-positive vectors has a high floor (~55-75%)
// regardless of actual shape alignment, making scores visually misleading.
const computeCosineFitScore = (
  demandMap: Record<string, number>,
  playerTags: (string | undefined)[],
): number => {
  const { normalizedMap } = computeRankWeightedSupply(playerTags);
  const activeDims = SYNERGY_DIMS.filter(k => (demandMap[k] ?? 0) > 0);
  if (activeDims.length === 0) return 0;
  const D = activeDims.map(k => demandMap[k] ?? 0);
  const S = activeDims.map(k => normalizedMap[k] ?? 0);
  const dot  = D.reduce((s, d, i) => s + d * S[i], 0);
  const magD = Math.sqrt(D.reduce((s, d) => s + d * d, 0));
  const magS = Math.sqrt(S.reduce((s, v) => s + v * v, 0));
  if (!magD || !magS) return 0;
  return Math.round((dot / (magD * magS)) * 100);
};
*/

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
): number => computeHistogramIntersectionScore(demandMap, playerTags);

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

  const size = 500;
  const padding = 100;
  const center = size / 2;
  const radius = 180;
  const n = dimensions.length;

  // Find the absolute maximum between both Demand and Supply to create a shared, dynamic scale
  const rawMaxDemand = dimensions.reduce((max, d) => Math.max(max, demandMap[toRadarLabel(d.name)] ?? 0), 0);
  const rawMaxSupply = dimensions.reduce((max, d) => Math.max(max, supplyMap[toDimKey(d.name)] ?? 0), 0);
  const globalMax = Math.max(0.1, rawMaxDemand, rawMaxSupply);

  // Ceil to the nearest 0.1 (e.g. 0.23 -> 0.30)
  let axisMax = Math.ceil(globalMax * 10) / 10;
  if (axisMax - globalMax < 0.02) {
      axisMax += 0.1; // Add breathing room if it's too close to the edge
  }

  const getPoint = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / n - Math.PI / 2;
    return {
      x: center + radius * value * Math.cos(angle),
      y: center + radius * value * Math.sin(angle),
    };
  };

  const outerPolygon = Array.from({ length: n }, (_, i) => getPoint(i, 1)).map(p => `${p.x},${p.y}`).join(' ');
  const gridLevels = [0.25, 0.5, 0.75, 1];
  const gridPolygons = gridLevels.map(level => Array.from({ length: n }, (_, i) => getPoint(i, level)).map(p => `${p.x},${p.y}`).join(' '));
  
  // Map points based on the shared dynamic scaling axisMax
  const demandPolygon = dimensions.map((d, i) => getPoint(i, (demandMap[toRadarLabel(d.name)] ?? 0) / axisMax)).map(p => `${p.x},${p.y}`).join(' ');
  const currentPolygon = dimensions.map((d, i) => getPoint(i, (supplyMap[toDimKey(d.name)] ?? 0) / axisMax)).map(p => `${p.x},${p.y}`).join(' ');

  const modernMonoFont = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg
        width={size}
        height={size}
        viewBox={`${-padding} ${-padding} ${size + padding * 2} ${size + padding * 2}`}
        style={{ overflow: 'visible', display: 'block' }}
      >
        <polygon points={outerPolygon} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} />
        {gridPolygons.map((points, idx) => (
          <polygon key={`grid-${idx}`} points={points} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={idx === gridPolygons.length - 1 ? 0 : 1.2} />
        ))}
        {dimensions.map((_, i) => {
          const outer = getPoint(i, 1);
          return (
            <line key={`line-${i}`} x1={center} y1={center} x2={outer.x} y2={outer.y} stroke="rgba(255,255,255,0.15)" strokeWidth={1.2} />
          );
        })}

        {/* Quantitative Anchors (Dynamic Axis Scale) */}
        {gridLevels.map((level, idx) => {
          const p = getPoint(0, level); // Top vertical axis
          const labelValue = (level * axisMax * 100).toFixed(0);
          return (
            <text 
              key={`scale-${idx}`} 
              x={p.x + 8} 
              y={p.y + 6} 
              fill="#cfd7e6" 
              fontSize="16" 
              fontFamily={modernMonoFont}
              fontWeight="700"
            >
              {labelValue}%
            </text>
          );
        })}

        {/* Demand layer — tactic requirement (soft orange dashed) */}
        <polygon points={demandPolygon} fill="rgba(255,169,64,0.15)" stroke="#ffaa40" strokeWidth={3} strokeDasharray="8 5" />
        {/* Supply layer — actual lineup performance (cyan solid) */}
        <polygon points={currentPolygon} fill="rgba(0, 229, 255, 0.15)" stroke="#00e5ff" strokeWidth={3.5} />

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
              fill={isHovered ? '#ffffff' : '#ffffff'} 
              fontSize={isHovered ? "22" : "20"}
              fontWeight={isHovered ? 900 : 800}
              fontFamily={modernMonoFont}
              style={{ transition: 'all 0.2s ease', cursor: 'pointer', letterSpacing: 0.5 }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {words.map((word, idx) => (
                <tspan key={idx} x={lp.x} dy={idx === 0 ? 0 : 24}>{word}</tspan> 
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
      return <strong key={i} style={{ color: '#00e5ff', background: 'rgba(0,229,255,0.12)', borderRadius: 3, padding: '0 3px' }}>{part}</strong>;
    }
    if (TACTIC_KEYWORDS.includes(part)) {
      return <strong key={i} style={{ color: '#36d9b3', fontWeight: 700 }}>{part}</strong>;
    }
    return part;
  });
};

const LineupDiagnosticPanel: React.FC<LineupDiagnosticPanelProps> = ({ isOpen, onClose, boardPlayers = [], boardActionFrames = [], currentTacticName, onLoadTactic }) => {
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

    // Guard: require a full 5-player lineup with role tags on the board
    if (boardEntries.length < 5) {
      setDiagError(`A complete 5-player lineup is required to run diagnostics. Currently ${boardEntries.length} player${boardEntries.length === 1 ? '' : 's'} with role tags on the board.`);
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
          background: '#1F1F1F', // Left toolbar background / App Background
          border: '1px solid #3F3F46',
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
            <RadarChartOutlined style={{ color: '#00e5ff', fontSize: 22 }} />
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
              background: '#27272A',
              borderRadius: 12,
              padding: 4,
              border: '1px solid #3F3F46',
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
                      background: isActive ? '#3F3F46' : 'transparent',
                      color: isActive ? '#F59E0B' : '#A1A1AA',
                      fontWeight: isActive ? 700 : 500,
                      padding: '8px 20px',
                      borderRadius: 8,
                      fontSize: 14,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.2)' : 'none',
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
            className="run-diagnostics-btn"
            type={result ? "default" : "primary"} 
            block 
            loading={loading} 
            icon={<RadarChartOutlined />} 
            onClick={() => form.submit()} 
            style={result ? { height: 46, borderRadius: 10, fontWeight: 600, marginBottom: 14, background: 'transparent', borderColor: '#3F3F46', color: '#A1A1AA' } : { height: 46, borderRadius: 10, fontWeight: 700, marginBottom: 14, background: '#F59E0B', borderColor: '#F59E0B', color: '#18181B' }}
          >
            {loading ? 'Analyzing...' : result ? 'Recalculate Diagnostics' : 'Run Lineup Diagnostics'}
          </Button>
          <style>{`
            .run-diagnostics-btn:hover {
                filter: brightness(1.1);
            }
          `}</style>

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
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <BulbOutlined style={{ color: '#9fb3c8', fontSize: 16 }} />
                      <Title level={5} style={{ margin: 0, color: '#eaf0f8', fontSize: 22, fontWeight: 700, letterSpacing: 1.1 }}>
                        TACTIC MATCH RANKING
                      </Title>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {tacticMatches.map((tactic, idx) => {
                      const fitColor = tactic.fitScore >= 75 ? '#52c41a' : tactic.fitScore >= 50 ? '#1677ff' : tactic.fitScore >= 30 ? '#faad14' : '#fa4d4d';
                      return (
                        <div key={tactic.id} style={{
                          display: 'grid',
                          gridTemplateColumns: '124px minmax(0, 1fr)',
                          gap: 16,
                          background: 'rgba(16,22,31,0.72)',
                          border: '1px solid rgba(165,181,204,0.2)',
                          borderRadius: 10,
                          padding: '16px 18px'
                        }}>
                          {tactic.preview_image ? (
                            <img src={tactic.preview_image} alt={tactic.name} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, flexShrink: 0, border: '1px solid rgba(181,196,218,0.28)' }} />
                          ) : (
                            <div style={{ width: 120, height: 120, background: 'rgba(255,255,255,0.03)', borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(181,196,218,0.25)' }}>
                              <RadarChartOutlined style={{ fontSize: 34, color: '#708099' }} />
                            </div>
                          )}
                          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'flex-start', marginBottom: 10, columnGap: 10 }}>
                                <div style={{ minWidth: 0 }}>
                                  <Text style={{ color: '#f3f7fc', fontSize: 21, fontWeight: 700, letterSpacing: 0.2, display: 'block', marginBottom: 8 }}>{tactic.name}</Text>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <Text style={{ color: '#8f9bb3', fontSize: 13, letterSpacing: 1.0, fontWeight: 700, minWidth: 78, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                                        CATEGORY
                                      </Text>
                                      <Tag style={{ margin: 0, background: 'rgba(104,139,178,0.16)', border: '1px solid rgba(177,194,216,0.44)', color: '#e6edf7', fontSize: 14, padding: '3px 10px', borderRadius: 4, fontWeight: 700 }}>
                                        {tactic.category || 'General'}
                                      </Tag>
                                    </div>
                                    {(tactic.tags || []).length > 0 && (
                                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                        <Text style={{ color: '#8f9bb3', fontSize: 13, letterSpacing: 1.0, fontWeight: 700, minWidth: 64, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                                          ACTIONS
                                        </Text>
                                        <div style={{ display: 'flex', flex: 1, minWidth: 0, gap: 6, flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin', paddingBottom: 2 }}>
                                          {(tactic.tags || []).slice(0, 3).map((t: string) => (
                                            <Tag key={t} style={{ margin: 0, background: 'transparent', border: '1px dashed rgba(177,194,216,0.34)', color: '#cbd5e1', fontSize: 13, padding: '2px 8px', borderRadius: 4, fontWeight: 600, whiteSpace: 'nowrap', flex: '0 0 auto' }}>
                                              {t.replace(/_/g, ' ')}
                                            </Tag>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, minWidth: 110, marginLeft: 4, paddingLeft: 4 }}>
                                  <Text style={{ color: '#8f9bb3', fontSize: 13, fontWeight: 700, letterSpacing: 1.1, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", lineHeight: 1.1 }}>
                                    FIT SCORE
                                  </Text>
                                  <Text style={{ color: fitColor, fontSize: 32, fontWeight: 800, whiteSpace: 'nowrap', lineHeight: 1.05, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                                    {tactic.fitScore}%
                                  </Text>
                                </div>
                              </div>
                              <Text style={{ color: '#d8e1ee', fontSize: 16, lineHeight: 1.65, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {tactic.description || 'No description available'}
                              </Text>
                            </div>
                            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                              <Button 
                                type="primary" 
                                size="large"
                                onClick={() => onLoadTactic && onLoadTactic(tactic.id, 'play')}
                                style={{ background: 'transparent', borderColor: 'rgba(177,194,216,0.52)', color: '#dce6f5', borderRadius: 6, fontWeight: 700, fontSize: 15, padding: '0 18px', height: 38, boxShadow: 'none' }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(177,194,216,0.12)'; e.currentTarget.style.borderColor = 'rgba(177,194,216,0.72)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(177,194,216,0.52)'; }}
                              >
                                Load Tactic
                              </Button>
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


                // Debug & score share the exact same supply model
                const validTags = playerTags.filter(Boolean) as string[];
                const supplyStats = computeRankWeightedSupply(validTags);
                const supplyVec = SYNERGY_DIMS.map(k => supplyStats.normalizedMap[k] ?? 0);

                const synergizedDimensions: DiagnosticDimension[] = SYNERGY_DIMS.map(k => {
                  const aiDim = result.dimensions?.find(d => toRadarLabel(d.name) === k || toDimKey(d.name) === k);
                  return { name: k, score: 0, reason: aiDim?.reason ?? '' };
                });

                return (
                  <>
                    {/* --- INTEGRATED HERO PANEL (SCORE + RADAR + LIST) --- */}
                    <div style={{ 
                      display: 'flex',
                      flexDirection: 'column',
                      marginBottom: 16,
                      gap: 0
                    }}>
                      
                      {/* TOP SECTION: Score */}
                      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 8, marginTop: 0 }}>
                        
                        {/* SCORE BLOCK: Left-aligned, Large, Stacked */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                          <Text style={{ color: '#8f9bb3', fontSize: 24, fontWeight: 800, letterSpacing: 1.0, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>
                            TACTIC FIT SCORE
                          </Text>
                          {fitScore !== null ? (
                            <div style={{ fontSize: 64, fontWeight: 900, color: '#ffffff', fontFamily: "var(--font-mono, 'Courier New', monospace)", lineHeight: 1 }}>
                              {fitScore}%
                            </div>
                          ) : (
                            <div style={{ fontSize: 18, color: '#8f9bb3', fontStyle: 'italic', marginTop: 8 }}>Load a tactic</div>
                          )}
                        </div>
                      </div>

                      {/* MIDDLE SECTION: Radar Chart */}
                      <div style={{ height: 460, width: '100%', overflow: 'visible', display: 'flex', justifyContent: 'center', marginBottom: 0, marginTop: '-20px' }}>
                        <RadarChart
                          dimensions={synergizedDimensions}
                          demandMap={demandMap}
                          supplyMap={supplyStats.normalizedMap}
                        />
                      </div>

                      {/* BOTTOM SECTION: Full-Width Demands Table */}
                      <div style={{ marginTop: 10 }}>
                        {topDemandItems.length > 0 ? (
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.2)' }}>
                                <th style={{ textAlign: 'left', padding: '12px 4px', width: '25%' }}>
                                   <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>ACTIONS</Text>
                                </th>
                                <th style={{ textAlign: 'center', padding: '12px 4px', width: '25%' }}>
                                   <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                     <div style={{ width: 14, height: 0, borderTop: '2px dashed #ffaa40' }} />
                                     <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>DEMAND</Text>
                                   </div>
                                </th>
                                <th style={{ textAlign: 'center', padding: '12px 4px', width: '25%' }}>
                                   <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                     <div style={{ width: 14, height: 2, background: '#00e5ff' }} />
                                     <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>SUPPLY</Text>
                                   </div>
                                </th>
                                <th style={{ textAlign: 'right', padding: '12px 4px', width: '25%' }}>
                                   <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: 700, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>GAP</Text>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {topDemandItems.slice(0, 5).map(({ key, value }) => {
                                const dem = value * 100;
                                const sup = (supplyStats.normalizedMap[key] ?? 0) * 100;
                                const gap = sup - dem;
                                const gapColor = gap < 0 ? '#ff6b6b' : '#a0aec0'; // Coral Red if negative gap, else dim gray
                                return (
                                  <tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <td style={{ padding: '8px 4px' }}>
                                      <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{key}</Text>
                                    </td>
                                    <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                                        <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{dem.toFixed(1)}%</Text>
                                    </td>
                                    <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                                        <Text style={{ color: '#ffffff', fontSize: 15, fontWeight: 600, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>{sup.toFixed(1)}%</Text>
                                    </td>
                                    <td style={{ padding: '8px 4px', textAlign: 'right' }}>
                                        <Text style={{ color: gapColor, fontSize: 15, fontWeight: gap < 0 ? 800 : 500, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                                          {gap > 0 ? '+' : ''}{gap.toFixed(1)}%
                                        </Text>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        ) : (
                          <div style={{ padding: 16 }}>
                            <Text style={{ color: '#8f9bb3', fontSize: 13, fontStyle: 'italic', fontFamily: "var(--font-mono, 'Courier New', monospace)" }}>No recognized actions.</Text>
                          </div>
                        )}
                      </div>

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
                    <BulbOutlined style={{ color: '#00e5ff' }} />
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>Substitution Suggestions</Text>
                  </div>
                  <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 12, paddingTop: 4, scrollbarWidth: 'thin' }}>
                    {result.weak_links.map((wl, idx) => {
                      const currentTag = wl.current_tag.split(' - ')[0];
                      const suggestTag = wl.suggestion;
                      
                      return (
                      <div key={idx} style={{ 
                        flex: '0 0 460px', 
                        background: 'linear-gradient(135deg, rgba(30,36,50,0.8) 0%, rgba(20,24,35,0.9) 100%)', 
                        border: '1px solid #00e5ff33', 
                        borderRadius: 16, 
                        padding: 24,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
                      }}>
                        {/* Header: Swap & Score */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                             <Tag style={{ margin: 0, background: '#252b3b', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontWeight: 700, fontSize: 16, padding: '6px 12px', borderRadius: 6 }}>{wl.position}</Tag>
                             <Text style={{ color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: 0.5 }}>{currentTag} <ArrowRightOutlined style={{ color: '#00e5ff', margin: '0 6px', fontSize: 18 }}/> <span style={{ color: '#00e5ff' }}>{suggestTag}</span></Text>
                          </div>
                          {typeof wl.expected_score === 'number' && typeof result.base_score === 'number' && (
                             <Text style={{ color: '#52c41a', fontSize: 21, fontWeight: 800 }}>
                               {result.base_score}% <ArrowRightOutlined style={{ fontSize: 16, color: '#8c8c8c', margin: '0 6px' }} /> {wl.expected_score}%
                             </Text>
                          )}
                        </div>
                        
                        {/* Visual Diffs */}
                        <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                           {/* Diffs Header */}
                           <div style={{ display: 'flex', alignItems: 'center', fontSize: 15, color: '#8f9bb3', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8, marginBottom: 4 }}>
                             <div style={{ width: 95, fontWeight: 700 }}>Actions</div>
                             <div style={{ flex: 1, paddingLeft: 12, fontWeight: 700 }}>Compare</div>
                             <div style={{ width: 170, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                               <span style={{ width: 42, textAlign: 'right' }} title={`${currentTag} Supply`}>{currentTag}</span>
                               <span style={{ width: 14 }}></span>
                               <span style={{ width: 42, textAlign: 'right', color: '#00e5ff' }} title={`${suggestTag} Supply`}>{suggestTag}</span>
                               <span style={{ width: 48, textAlign: 'right' }}>Δ</span>
                             </div>
                           </div>
                           
                           {/* Diff Rows */}
                           {topDemandItems.slice(0, 4).map(d => {
                             const curSupply = TAG_CAPABILITY[currentTag]?.[d.key] ?? 0.07;
                             const sugSupply = TAG_CAPABILITY[suggestTag]?.[d.key] ?? 0.07;
                             const delta = sugSupply - curSupply;
                             
                             // 0% Denoising
                             const isZero = Math.abs(delta) < 0.005;
                             const rowOpacity = isZero ? 0.35 : 1;
                             
                             const deltaColor = delta > 0 ? '#52c41a' : (delta < -0.01 ? '#ff4d4f' : '#8c8c8c');
                             const deltaPrefix = delta > 0 ? '+' : '';
                             
                             return (
                               <div key={d.key} style={{ display: 'flex', alignItems: 'center', fontSize: 16, gap: 12, opacity: rowOpacity, transition: 'opacity 0.2s' }}>
                                 <div style={{ width: 95, color: '#adb5c9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700, letterSpacing: 0.5 }} title={d.key}>{d.key}</div>
                                  
                                  {/* Progress bar container */}
                                  <div style={{ flex: 1, height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${curSupply * 100}%`, background: 'rgba(255,255,255,0.35)', borderRadius: 4, zIndex: 1 }} />
                                    {delta > 0 && (
                                       <div style={{ position: 'absolute', left: `${curSupply * 100}%`, top: 0, bottom: 0, width: `${delta * 100}%`, background: '#52c41a', borderRadius: '0 4px 4px 0', zIndex: 2 }} />
                                    )}
                                    {delta < 0 && (
                                       <div style={{ position: 'absolute', left: `${sugSupply * 100}%`, top: 0, bottom: 0, width: `${-delta * 100}%`, background: '#ff4d4f', borderRadius: '0 4px 4px 0', zIndex: 3 }} />
                                    )}
                                  </div>
                                  
                                  <div style={{ width: 170, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
                                     <Text style={{ color: '#8c8c8c', width: 42, textAlign: 'right', fontSize: 16, fontFamily: 'monospace' }}>{(curSupply * 100).toFixed(0)}%</Text>
                                     <ArrowRightOutlined style={{ color: '#555', fontSize: 14, width: 14 }} />
                                     <Text style={{ color: '#e6f4ff', width: 42, textAlign: 'right', fontSize: 16, fontFamily: 'monospace' }}>{(sugSupply * 100).toFixed(0)}%</Text>
                                     <Text style={{ color: deltaColor, fontWeight: 800, width: 48, textAlign: 'right', fontSize: 16, fontFamily: 'monospace' }}>{deltaPrefix}{(delta * 100).toFixed(0)}%</Text>
                                  </div>
                               </div>
                             );
                           })}
                        </div>

                        {/* AI Insight Footer */}
                        {wl.issue && (
                            <div style={{ 
                              padding: '12px 16px', 
                              borderRadius: '4px 8px 8px 4px', 
                              background: 'linear-gradient(90deg, rgba(0, 229, 255, 0.15) 0%, rgba(0, 229, 255, 0.02) 100%)', 
                              borderLeft: '4px solid #00e5ff',
                              display: 'flex', 
                              gap: 14, 
                              alignItems: 'center' 
                            }}>
                              <div style={{ background: 'rgba(0, 229, 255, 0.2)', padding: 6, borderRadius: '50%', display: 'flex' }}>
                                <RobotOutlined style={{ color: '#00e5ff', fontSize: 18 }} />
                              </div>
                              <Text style={{ color: '#e2e8f0', fontSize: 17, lineHeight: 1.6, fontWeight: 500, flex: 1, letterSpacing: 0.2 }}>
                                {renderIssue(wl.issue)}
                              </Text>
                            </div>
                        )}
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
