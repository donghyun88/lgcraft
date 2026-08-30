/** 시즌11 팀 전력 지수(TPI) — ELO·승률·출전 가중, 티어별·팀전 슬롯 집계 */

import { emptyStats } from './s11-season-simulate.mjs';

export const TIER_ORDER = ['갓', '킹', '애니멀', '아메바', '휴먼'];

/** 7세트 구조: 개인전(티어) 5 + 2·3대3 2 */
export const SOLO_SETS = 5;
export const TEAM_SETS = 2;

/** 티어 등급·PPI — 개인전 vs 팀전 기여 */
export const TIER_BLEND_SOLO = 0.7;
export const TIER_BLEND_TEAM = 0.3;

export const RADAR_AXES = [...TIER_ORDER, '팀전'];

export const TIER_BAR_COLORS = {
  갓: '#4f46e5',
  킹: '#7c3aed',
  애니멀: '#9333ea',
  아메바: '#c026d3',
  휴먼: '#db2777',
  팀전: '#0d9488',
};

export const TEAM_CHART_COLORS = {
  t1: '#e11d48',
  t2: '#4f46e5',
  t3: '#d97706',
  t4: '#0891b2',
  t5: '#059669',
  t6: '#ea580c',
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function gamesFromStats(stats, mode) {
  if (mode === 'solo') {
    return (stats?.개인전?.w || 0) + (stats?.개인전?.l || 0);
  }
  if (mode === 'team') {
    return (stats?.['22']?.w || 0) + (stats?.['22']?.l || 0) + (stats?.['33']?.w || 0) + (stats?.['33']?.l || 0);
  }
  const total = stats?.total || { w: 0, l: 0 };
  return (total.w || 0) + (total.l || 0);
}

function winsFromStats(stats, mode) {
  if (mode === 'solo') return stats?.개인전?.w || 0;
  if (mode === 'team') {
    return (stats?.['22']?.w || 0) + (stats?.['33']?.w || 0);
  }
  return stats?.total?.w || 0;
}

/**
 * PPI (40–99)
 * @param {'total'|'solo'|'team'} mode — solo=개인전(티어), team=2·3대3, total=로스터 표시용
 */
export function computePlayerPowerIndex(elo, stats, player = {}, mode = 'total') {
  const games = gamesFromStats(stats, mode);
  const wins = winsFromStats(stats, mode);
  const eloScore = clamp((elo - 950) / 3.5, 35, 99);
  const adjWr = games > 0 ? (wins + 2) / (games + 4) : 0.5;
  const wrScore = adjWr * 100;
  const activity = Math.min(games / (mode === 'team' ? 6 : 10), 1) * 100;

  let ppi = eloScore * 0.55 + wrScore * 0.35 + activity * 0.1;
  if (games === 0) {
    if (mode === 'team') ppi = 50;
    else ppi = player.joinedFromRound ? 54 : 50;
  } else if (games < 3 && player.joinedFromRound && mode !== 'team') {
    ppi = ppi * 0.85 + 55 * 0.15;
  }
  return Math.round(clamp(ppi, 40, 99));
}

/** 티어 라인 PPI — 개인전 70% + 팀전 30% (미출전 축은 50) */
export function computeBlendedTierPpi(ppiSolo, ppiTeam) {
  const solo = ppiSolo ?? 50;
  const team = ppiTeam ?? 50;
  return Math.round(solo * TIER_BLEND_SOLO + team * TIER_BLEND_TEAM);
}

/** 팀 단위 슬롯(2·3대3) TPI — 로스터 합산 승패 + 팀전 ELO 평균 */
export function computeTeamSlotIndex(rosterRows) {
  let w = 0;
  let l = 0;
  let eloSum = 0;
  let eloN = 0;

  for (const row of rosterRows) {
    const stats = row.stats || emptyStats();
    w += (stats['22']?.w || 0) + (stats['33']?.w || 0);
    l += (stats['22']?.l || 0) + (stats['33']?.l || 0);
    const tg = (stats['22']?.w || 0) + (stats['22']?.l || 0) + (stats['33']?.w || 0) + (stats['33']?.l || 0);
    if (tg > 0) {
      eloSum += row.eloTeam ?? row.elo ?? 1000;
      eloN++;
    }
  }

  const games = w + l;
  if (games === 0) return { score: 50, games: 0, wins: 0, losses: 0 };

  const avgElo = eloN > 0 ? eloSum / eloN : 1000;
  const eloScore = clamp((avgElo - 950) / 3.5, 35, 99);
  const adjWr = (w + 2) / (games + 4);
  const wrScore = adjWr * 100;
  const activity = Math.min(games / 20, 1) * 100;
  const score = Math.round(clamp(eloScore * 0.55 + wrScore * 0.35 + activity * 0.1, 40, 99));

  return { score, games, wins: w, losses: l };
}

function tierAggregate(players) {
  if (!players?.length) return { score: 50, count: 0, activeCount: 0, top: null };
  const enriched = players.map((p) => ({
    ...p,
    ppiTier: computeBlendedTierPpi(p.ppiSolo, p.ppiTeam),
  }));
  const active = enriched.filter((p) => p.soloGames > 0 || p.teamGames > 0);
  if (!active.length) {
    const top = [...enriched].sort((a, b) => b.ppiTier - a.ppiTier)[0];
    return { score: 50, count: players.length, activeCount: 0, top: top || null };
  }
  const sorted = [...active].sort((a, b) => b.ppiTier - a.ppiTier);
  const top = sorted[0];
  if (sorted.length === 1) {
    return { score: top.ppiTier, count: players.length, activeCount: 1, top };
  }
  const restAvg = sorted.slice(1).reduce((s, p) => s + p.ppiTier, 0) / (sorted.length - 1);
  const score = Math.round(top.ppiTier * 0.55 + restAvg * 0.45);
  return { score, count: players.length, activeCount: active.length, top };
}

function averageTierScore(tiers) {
  let sum = 0;
  for (const tier of TIER_ORDER) sum += tiers[tier]?.score ?? 50;
  return Math.round(sum / TIER_ORDER.length);
}

/** 팀 1개 TPI */
export function computeTeamPowerRating(teamId, players, statsByName, stateByName) {
  const roster = (players || []).filter((p) => p.teamId === teamId);
  const tiers = {};
  for (const tier of TIER_ORDER) tiers[tier] = { players: [], score: 50, count: 0, activeCount: 0, top: null };

  const rosterRows = [];
  let activePlayers = 0;

  for (const p of roster) {
    const dn = (p.displayName || '').trim();
    const stats = statsByName[dn] || emptyStats();
    const st = stateByName.get(dn);
    const elo = st?.elo ?? 1000;
    const eloTeam = st?.eloTeam ?? elo;
    const games = gamesFromStats(stats, 'total');
    const soloGames = gamesFromStats(stats, 'solo');
    const teamGames = gamesFromStats(stats, 'team');

    const ppi = computePlayerPowerIndex(elo, stats, p, 'total');
    const ppiSolo = computePlayerPowerIndex(elo, stats, p, 'solo');
    const ppiTeam = computePlayerPowerIndex(eloTeam, stats, p, 'team');
    const ppiTier = computeBlendedTierPpi(ppiSolo, ppiTeam);

    if (games > 0) activePlayers++;

    rosterRows.push({ stats, elo, eloTeam, ppiTeam, teamGames });

    const tier = p.tier && tiers[p.tier] != null ? p.tier : '휴먼';
    tiers[tier].players.push({
      displayName: dn,
      id: p.id,
      ppi,
      ppiSolo,
      ppiTeam,
      ppiTier,
      games,
      soloGames,
      teamGames,
      elo: Math.round(elo),
    });
  }

  for (const tier of TIER_ORDER) {
    const agg = tierAggregate(tiers[tier].players);
    tiers[tier] = { ...tiers[tier], ...agg };
  }

  const tierOvr = averageTierScore(tiers);
  const teamSlot = computeTeamSlotIndex(rosterRows);
  const teamBattle = teamSlot.score;

  const ovr =
    teamSlot.games > 0
      ? Math.round((tierOvr * SOLO_SETS + teamBattle * TEAM_SETS) / (SOLO_SETS + TEAM_SETS))
      : tierOvr;

  const depth =
    roster.length > 0 ? Math.round(clamp(50 + (activePlayers / roster.length) * 45, 40, 95)) : 50;

  return {
    teamId,
    ovr,
    tierOvr,
    tiers,
    teamSlot,
    attack: tierOvr,
    teamBattle,
    depth,
    rosterSize: roster.length,
    activePlayers,
  };
}

export const GRADE_BY_RANK = ['S', 'A', 'B+', 'B', 'C', 'D'];

/** 전원 평가 — 티어 내 PPI 순위로 S~D 배분 (3전 미만은 등급 없음) */
export const PLAYER_GRADE_MIN_GAMES = 3;

export const PLAYER_GRADE_CRITERIA_TEXT =
  '선수 등급: 같은 티어(갓~휴먼) 안에서 개7·팀3 PPI 순위로 S~D 6단계 배분. 3전 미만은 —.';

/**
 * PPI 순위 → 등급 (티어 내 상대 평가 — 팀 TPI와 같은 방식)
 * @returns {string|null} S~D or null if sample too small
 */
export function gradeFromPlayerTierRank(rank, totalInTier, totalGames) {
  if (totalGames == null || totalGames < PLAYER_GRADE_MIN_GAMES) return null;
  if (!rank || !totalInTier || totalInTier < 1) return null;
  if (totalInTier === 1) return 'B';
  const bucket = Math.min(Math.floor(((rank - 1) / totalInTier) * 6), 5);
  return GRADE_BY_RANK[bucket];
}

export const GRADE_COLORS = {
  S: { bg: '#fef3c7', text: '#b45309', border: '#fcd34d' },
  A: { bg: '#d1fae5', text: '#047857', border: '#6ee7b7' },
  'B+': { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd' },
  B: { bg: '#e0e7ff', text: '#4338ca', border: '#a5b4fc' },
  C: { bg: '#f4f4f5', text: '#52525b', border: '#d4d4d8' },
  D: { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5' },
};

function getAxisScore(rating, axis) {
  if (!rating) return 50;
  if (axis === '팀전') return rating.teamBattle ?? 50;
  return rating.tiers?.[axis]?.score ?? 50;
}

function pickTeamTagline(axisRanks, axisGrades) {
  const axes = [...TIER_ORDER, '팀전'];
  let best = null;
  let worst = null;
  for (const axis of axes) {
    const rank = axisRanks?.[axis] ?? 6;
    if (!best || rank < best.rank) best = { axis, rank, grade: axisGrades?.[axis] };
    if (!worst || rank > worst.rank) worst = { axis, rank, grade: axisGrades?.[axis] };
  }
  if (!best) return '';
  if (best.rank === 1 && worst.rank >= 5) {
    return `${best.axis} ${best.grade}등급 리그 1위 — ${worst.axis}(${worst.grade})는 보완 과제`;
  }
  if (best.rank === 1) return `${best.axis} 라인 리그 최강 (${best.grade})`;
  if (worst.rank === 6) return `${worst.axis} 라인 리그 꼴찌 (${worst.grade}) — 여기부터 반등`;
  return `${best.axis}(${best.grade}) vs ${worst.axis}(${worst.grade}) — 양날의 팀`;
}

export function computeTeamSpotlights(rating, players, statsByName) {
  const roster = (players || []).filter((p) => p.teamId === rating.teamId);
  const rows = [];

  for (const p of roster) {
    const dn = (p.displayName || '').trim();
    const stats = statsByName[dn] || emptyStats();
    const soloG = gamesFromStats(stats, 'solo');
    const teamG = gamesFromStats(stats, 'team');
    const totalG = gamesFromStats(stats, 'total');
    const totalW = stats.total?.w || 0;
    let pl = null;
    for (const tier of TIER_ORDER) {
      pl = rating.tiers[tier]?.players?.find((x) => x.id === p.id);
      if (pl) break;
    }
    if (!pl) continue;
    rows.push({
      displayName: dn,
      tier: p.tier,
      ppi: pl.ppi,
      ppiSolo: pl.ppiSolo,
      ppiTeam: pl.ppiTeam,
      ppiTier: pl.ppiTier ?? computeBlendedTierPpi(pl.ppiSolo, pl.ppiTeam),
      soloG,
      teamG,
      totalG,
      totalW,
      joinedFromRound: p.joinedFromRound,
    });
  }

  const active = rows.filter((r) => r.totalG > 0);
  const spotlights = [];
  const used = new Set();

  function push(item) {
    if (spotlights.length >= 6) return;
    if (used.has(item.name) && spotlights.length >= 4) return;
    spotlights.push(item);
    used.add(item.name);
  }

  const ace = [...active].sort((a, b) => b.ppi - a.ppi)[0];
  if (ace) push({ key: 'ace', label: '팀 에이스', name: ace.displayName, detail: `PPI ${ace.ppi} · ${ace.totalG}전` });

  const soloKing = [...active].filter((r) => r.soloG >= 2).sort((a, b) => b.ppiSolo - a.ppiSolo)[0];
  if (soloKing) {
    push({
      key: 'solo',
      label: '개인전 킹',
      name: soloKing.displayName,
      detail: `${soloKing.tier} · 개인 ${soloKing.ppiSolo}`,
    });
  }

  const teamKing = [...active].filter((r) => r.teamG >= 2).sort((a, b) => b.ppiTeam - a.ppiTeam)[0];
  if (teamKing) {
    push({
      key: 'team',
      label: '팀플 장인',
      name: teamKing.displayName,
      detail: `팀전 ${teamKing.ppiTeam} · ${teamKing.teamG}전`,
    });
  }

  const tierCore = [...active].sort((a, b) => b.ppiTier - a.ppiTier)[0];
  if (tierCore && tierCore.displayName !== ace?.displayName) {
    push({
      key: 'tier',
      label: '티어 핵심',
      name: tierCore.displayName,
      detail: `${tierCore.tier} · 개7팀3 ${tierCore.ppiTier}`,
    });
  }

  const late = [...rows]
    .filter((r) => r.joinedFromRound >= 11 && r.totalG >= 2 && r.totalW >= 2 && r.ppi >= 74)
    .sort((a, b) => b.ppi - a.ppi || b.totalW - a.totalW)[0];
  if (late) {
    push({
      key: 'late',
      label: '합류 임팩트',
      name: late.displayName,
      detail: `${late.joinedFromRound}R · ${late.totalW}승 ${late.totalG - late.totalW}패 · PPI ${late.ppi}`,
    });
  }

  const wrMaster = [...active]
    .filter((r) => r.totalG >= 4)
    .sort((a, b) => (b.totalW + 2) / (b.totalG + 4) - (a.totalW + 2) / (a.totalG + 4))[0];
  if (wrMaster) {
    const pct = Math.round(((wrMaster.totalW + 2) / (wrMaster.totalG + 4)) * 100);
    push({
      key: 'wr',
      label: '승률 장인',
      name: wrMaster.displayName,
      detail: `${pct}% · ${wrMaster.totalW}승 ${wrMaster.totalG - wrMaster.totalW}패`,
    });
  }

  const grinder = [...active].sort((a, b) => b.totalG - a.totalG)[0];
  if (grinder) {
    push({ key: 'work', label: '출전왕', name: grinder.displayName, detail: `${grinder.totalG}세트 출전` });
  }

  const hidden = [...rows]
    .filter((r) => r.totalG >= 1 && r.totalG <= 3 && r.ppi >= 72)
    .sort((a, b) => b.ppi - a.ppi)[0];
  if (hidden) {
    push({ key: 'hidden', label: '히든 카드', name: hidden.displayName, detail: `${hidden.totalG}전 · PPI ${hidden.ppi}` });
  }

  return spotlights.slice(0, 6);
}

export function computePlayerTierLeagueRanks(byTeam, teamIds) {
  const ranks = new Map();
  for (const tier of TIER_ORDER) {
    const pool = [];
    for (const tid of teamIds) {
      for (const pl of byTeam[tid]?.tiers?.[tier]?.players || []) {
        if ((pl.games ?? 0) >= PLAYER_GRADE_MIN_GAMES) {
          pool.push({
            id: pl.id,
            ppiTier: pl.ppiTier ?? computeBlendedTierPpi(pl.ppiSolo, pl.ppiTeam),
            displayName: pl.displayName,
          });
        }
      }
    }
    pool.sort((a, b) => b.ppiTier - a.ppiTier);
    pool.forEach((pl, i) => {
      ranks.set(pl.id, { tier, rank: i + 1, total: pool.length, ppiTier: pl.ppiTier });
    });
  }
  return ranks;
}

/** 리그 상대 순위·등급·하이라이트 부여 */
export function enrichLeagueRatings(byTeam, teamIds) {
  const axes = [...TIER_ORDER, '팀전'];
  const leagueAvg = {};

  for (const axis of axes) {
    const vals = teamIds.map((tid) => getAxisScore(byTeam[tid], axis));
    leagueAvg[axis] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }

  const hallOfFame = [];

  for (const axis of axes) {
    const ranked = teamIds
      .map((tid) => ({ teamId: tid, score: getAxisScore(byTeam[tid], axis) }))
      .sort((a, b) => b.score - a.score);

    ranked.forEach((row, i) => {
      const r = byTeam[row.teamId];
      if (!r) return;
      r.axisRanks = r.axisRanks || {};
      r.axisGrades = r.axisGrades || {};
      r.axisDelta = r.axisDelta || {};
      r.axisRanks[axis] = i + 1;
      r.axisGrades[axis] = GRADE_BY_RANK[i] || 'D';
      r.axisDelta[axis] = Math.round(row.score - leagueAvg[axis]);
    });

    if (ranked[0]) {
      hallOfFame.push({
        axis,
        teamId: ranked[0].teamId,
        score: ranked[0].score,
        grade: 'S',
      });
    }
  }

  const ovrRanked = teamIds
    .map((tid) => ({ teamId: tid, ovr: byTeam[tid]?.ovr ?? 0 }))
    .sort((a, b) => b.ovr - a.ovr);
  ovrRanked.forEach((row, i) => {
    const r = byTeam[row.teamId];
    if (!r) return;
    r.leagueRank = i + 1;
    r.overallGrade = GRADE_BY_RANK[i] || 'D';
  });

  for (const tid of teamIds) {
    const r = byTeam[tid];
    if (!r) continue;
    r.tagline = pickTeamTagline(r.axisRanks, r.axisGrades);
    r.leagueAvg = leagueAvg;
  }

  return { leagueAvg, hallOfFame };
}

export function computeLeaguePowerRatings(players, statsByName, stateByName, teamIds) {
  const byTeam = {};
  for (const tid of teamIds) {
    byTeam[tid] = computeTeamPowerRating(tid, players, statsByName, stateByName);
    byTeam[tid].spotlights = computeTeamSpotlights(byTeam[tid], players, statsByName);
  }
  const { hallOfFame } = enrichLeagueRatings(byTeam, teamIds);
  byTeam._hallOfFame = hallOfFame;
  byTeam._playerTierRanks = computePlayerTierLeagueRanks(byTeam, teamIds);
  return byTeam;
}

/** TPI 점수 → 배경 강도 (0–1) */
export function tpiHeatAlpha(score) {
  return clamp((score - 45) / 50, 0.08, 0.92);
}
