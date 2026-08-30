/** 상·하반기 화제의 선수 — 반기별 simulate + 활약 기준 */

import { HALF_RANGES } from './s11-coin-usage.mjs';
import { emptyStats, simulateSeason } from './s11-season-simulate.mjs';
import { computeBlendedTierPpi, computePlayerPowerIndex } from './s11-team-power-ratings.mjs';

/** 화제 선수 최소 활약 (합류 여부와 무관) */
export const BUZZ_THRESHOLDS = {
  /** 공통: PPI = 개인7·팀3 */
  minPpi: 72,
  mvp: { minGames: 3, minWins: 2, minPpi: 74 },
  soloStar: { minSoloGames: 2, minPpiSolo: 74 },
  teamStar: { minTeamGames: 2, minPpiTeam: 74 },
  ironMan: { minGames: 5, minWins: 3 },
  winRate: { minGames: 4, minAdjPct: 62 },
  riser: { minDelta: 5, minGamesEachHalf: 2 },
  /** 11R+ 합류 — ‘합류’만으론 불가, 반기 활약 필수 */
  joinImpact: { minGames: 2, minWins: 2, minPpi: 74, topPct: 0.45 },
  clutch: { minGames: 2, minWins: 2, minPpi: 72 },
};

export const BUZZ_CRITERIA_TEXT =
  '해당 반기 출전·승리·PPI(개7·팀3)로 선정. 합류 카드는 11R+ 합류 + 2전 2승+ + PPI 74+ + 반기 상위권일 때만.';

function gamesFromStats(stats, mode) {
  if (mode === 'solo') return (stats?.개인전?.w || 0) + (stats?.개인전?.l || 0);
  if (mode === 'team') {
    return (stats?.['22']?.w || 0) + (stats?.['22']?.l || 0) + (stats?.['33']?.w || 0) + (stats?.['33']?.l || 0);
  }
  const t = stats?.total || { w: 0, l: 0 };
  return (t.w || 0) + (t.l || 0);
}

function adjWinPct(r) {
  return ((r.wins + 2) / (r.games + 4)) * 100;
}

function buildHalfPlayerRows(players, statsByName, stateByName) {
  const rows = [];
  for (const p of players || []) {
    if (!p.teamId) continue;
    const dn = (p.displayName || '').trim();
    if (!dn) continue;
    const stats = statsByName[dn] || emptyStats();
    const st = stateByName.get(dn);
    const elo = st?.elo ?? 1000;
    const eloTeam = st?.eloTeam ?? elo;
    const games = gamesFromStats(stats, 'total');
    if (games === 0) continue;

    const soloG = gamesFromStats(stats, 'solo');
    const teamG = gamesFromStats(stats, 'team');
    const wins = stats.total?.w || 0;
    const ppiSolo = computePlayerPowerIndex(elo, stats, p, 'solo');
    const ppiTeam = computePlayerPowerIndex(eloTeam, stats, p, 'team');
    const ppi = computePlayerPowerIndex(elo, stats, p, 'total');
    const ppiTier = computeBlendedTierPpi(ppiSolo, ppiTeam);

    rows.push({
      id: p.id,
      displayName: dn,
      teamId: p.teamId,
      tier: p.tier || '',
      joinedFromRound: p.joinedFromRound,
      games,
      wins,
      losses: games - wins,
      soloG,
      teamG,
      ppi,
      ppiSolo,
      ppiTeam,
      ppiTier,
    });
  }
  return rows;
}

function roundLabelForDocs(roundDocs, halfKey) {
  const range = HALF_RANGES[halfKey];
  if (!range) return '';
  let max = 0;
  for (const d of roundDocs || []) {
    const r = d.round;
    if (r == null || r < range.min || r > range.max) continue;
    if (r > max) max = r;
  }
  if (max < range.min) return `${range.min}R~`;
  return `${range.min}R~${max}R`;
}

function pickUnique(rows, sorter, filter, usedNames, tag, hookFn) {
  const list = rows.filter(filter).sort(sorter);
  for (const row of list) {
    if (usedNames.has(row.displayName)) continue;
    usedNames.add(row.displayName);
    return { tag, displayName: row.displayName, teamId: row.teamId, tier: row.tier, hook: hookFn(row) };
  }
  return null;
}

function qualifiesJoinImpact(r, pool) {
  const t = BUZZ_THRESHOLDS.joinImpact;
  if (!r.joinedFromRound || r.joinedFromRound < 11) return false;
  if (r.games < t.minGames || r.wins < t.minWins || r.ppiTier < t.minPpi) return false;
  const ranked = pool.filter((x) => x.games >= t.minGames).sort((a, b) => b.ppiTier - a.ppiTier);
  const idx = ranked.findIndex((x) => x.id === r.id);
  if (idx < 0) return false;
  const cutoff = Math.max(1, Math.ceil(ranked.length * t.topPct));
  return idx < cutoff;
}

function picksFirstHalf(rows) {
  const used = new Set();
  const picks = [];
  const m = BUZZ_THRESHOLDS.mvp;

  const mvp = pickUnique(
    rows,
    (a, b) => b.ppiTier - a.ppiTier || b.wins - a.wins,
    (r) => r.games >= m.minGames && r.wins >= m.minWins && r.ppiTier >= m.minPpi,
    used,
    '반기 MVP',
    (r) => `${r.wins}승 ${r.losses}패 · PPI ${r.ppiTier} · ${r.games}전`,
  );
  if (mvp) picks.push(mvp);

  const s = BUZZ_THRESHOLDS.soloStar;
  const solo = pickUnique(
    rows,
    (a, b) => b.ppiSolo - a.ppiSolo || b.wins - a.wins,
    (r) => r.soloG >= s.minSoloGames && r.ppiSolo >= s.minPpiSolo && r.wins >= 1,
    used,
    '개인전 스타',
    (r) => `${r.tier} · ${r.wins}승 · 개인 PPI ${r.ppiSolo}`,
  );
  if (solo) picks.push(solo);

  const tm = BUZZ_THRESHOLDS.teamStar;
  const team = pickUnique(
    rows,
    (a, b) => b.ppiTeam - a.ppiTeam || b.wins - a.wins,
    (r) => r.teamG >= tm.minTeamGames && r.ppiTeam >= tm.minPpiTeam && r.wins >= 1,
    used,
    '팀플 스타',
    (r) => `팀전 PPI ${r.ppiTeam} · ${r.wins}승 · 2·3대3 ${r.teamG}전`,
  );
  if (team) picks.push(team);

  const im = BUZZ_THRESHOLDS.ironMan;
  const iron = pickUnique(
    rows,
    (a, b) => b.games - a.games || b.wins - a.wins,
    (r) => r.games >= im.minGames && r.wins >= im.minWins,
    used,
    '출전왕',
    (r) => `${r.games}세트 ${r.wins}승 — 반기 최다 출전급`,
  );
  if (iron) picks.push(iron);

  const wr = BUZZ_THRESHOLDS.winRate;
  const wrPick = pickUnique(
    rows,
    (a, b) => adjWinPct(b) - adjWinPct(a),
    (r) => r.games >= wr.minGames && adjWinPct(r) >= wr.minAdjPct,
    used,
    '승률 장인',
    (r) => `${Math.round(adjWinPct(r))}% · ${r.wins}승 ${r.losses}패`,
  );
  if (wrPick) picks.push(wrPick);

  return picks.slice(0, 4);
}

function picksSecondHalf(rows, firstRows, secondRoundLabel) {
  const used = new Set();
  const picks = [];
  const firstById = new Map(firstRows.map((r) => [r.id, r]));
  const m = BUZZ_THRESHOLDS.mvp;

  const mvp = pickUnique(
    rows,
    (a, b) => b.ppiTier - a.ppiTier || b.wins - a.wins,
    (r) => r.games >= 2 && r.wins >= 1 && r.ppiTier >= m.minPpi,
    used,
    '하반기 MVP',
    (r) => `${r.wins}승 ${r.losses}패 · PPI ${r.ppiTier} · ${secondRoundLabel}`,
  );
  if (mvp) picks.push(mvp);

  const rs = BUZZ_THRESHOLDS.riser;
  let bestRiser = null;
  let bestDelta = -999;
  for (const r of rows) {
    if (used.has(r.displayName)) continue;
    if (r.joinedFromRound >= 11) continue;
    const prev = firstById.get(r.id);
    if (!prev || prev.games < rs.minGamesEachHalf || r.games < rs.minGamesEachHalf) continue;
    const delta = r.ppiTier - prev.ppiTier;
    if (delta >= rs.minDelta && r.wins >= 1 && delta > bestDelta) {
      bestDelta = delta;
      bestRiser = r;
    }
  }
  if (bestRiser) {
    used.add(bestRiser.displayName);
    const prev = firstById.get(bestRiser.id);
    picks.push({
      tag: '급부상',
      displayName: bestRiser.displayName,
      teamId: bestRiser.teamId,
      tier: bestRiser.tier,
      hook: `상반기 ${prev.ppiTier} → 하반기 ${bestRiser.ppiTier} (+${bestDelta}) · ${bestRiser.wins}승 ${secondRoundLabel}`,
    });
  }

  const joinPick = pickUnique(
    rows,
    (a, b) => b.ppiTier - a.ppiTier || b.wins - a.wins || b.games - a.games,
    (r) => qualifiesJoinImpact(r, rows),
    used,
    '합류 임팩트',
    (r) => `${r.joinedFromRound}R 합류 · ${r.wins}승 ${r.losses}패 · PPI ${r.ppiTier} (${secondRoundLabel})`,
  );
  if (joinPick) picks.push(joinPick);

  const tm = BUZZ_THRESHOLDS.teamStar;
  const team = pickUnique(
    rows,
    (a, b) => b.ppiTeam - a.ppiTeam || b.wins - a.wins,
    (r) => r.teamG >= tm.minTeamGames && r.ppiTeam >= tm.minPpiTeam && r.wins >= 2,
    used,
    '팀플 히어로',
    (r) => `팀전 ${r.ppiTeam} · ${r.wins}승 · 2·3대3 ${r.teamG}전`,
  );
  if (team) picks.push(team);

  const cl = BUZZ_THRESHOLDS.clutch;
  const clutch = pickUnique(
    rows,
    (a, b) => b.wins - a.wins || b.ppiTier - a.ppiTier,
    (r) => r.games >= cl.minGames && r.wins >= cl.minWins && r.ppiTier >= cl.minPpi,
    used,
    '승부사',
    (r) => `${r.wins}승 ${r.losses}패 · PPI ${r.ppiTier}`,
  );
  if (clutch) picks.push(clutch);

  return picks.slice(0, 4);
}

/** @param {object[]} teams — { id, name, short, teamId } */
export function computeHalfSeasonBuzz(players, fixtures, roundDocs, teams) {
  const teamName = new Map((teams || []).map((t) => [t.id || t.teamId, t.name || t.short || '']));

  const firstDocs = (roundDocs || []).filter((d) => d.round >= 1 && d.round <= 10);
  const secondDocs = (roundDocs || []).filter((d) => d.round >= 11 && d.round <= 20);

  const sim1 = firstDocs.length ? simulateSeason(fixtures, firstDocs, players) : { statsByName: {}, stateByName: new Map() };
  const sim2 = secondDocs.length ? simulateSeason(fixtures, secondDocs, players) : { statsByName: {}, stateByName: new Map() };

  const firstRows = buildHalfPlayerRows(players, sim1.statsByName, sim1.stateByName);
  const secondRows = buildHalfPlayerRows(players, sim2.statsByName, sim2.stateByName);

  const attachTeam = (pick) =>
    pick ? { ...pick, teamName: teamName.get(pick.teamId) || pick.teamId } : null;

  return {
    criteria: BUZZ_CRITERIA_TEXT,
    firstHalf: {
      key: 'first_half',
      label: HALF_RANGES.first_half.label,
      roundLabel: roundLabelForDocs(firstDocs, 'first_half') || HALF_RANGES.first_half.roundLabel,
      picks: picksFirstHalf(firstRows).map(attachTeam).filter(Boolean),
    },
    secondHalf: {
      key: 'second_half',
      label: HALF_RANGES.second_half.label,
      roundLabel: roundLabelForDocs(secondDocs, 'second_half') || '11R~',
      picks: picksSecondHalf(secondRows, firstRows, roundLabelForDocs(secondDocs, 'second_half')).map(attachTeam).filter(Boolean),
    },
  };
}
