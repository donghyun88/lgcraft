/** 시즌11 출전 코인 집계 (상·하반기별 개인전 5 / 팀전 6 + 시즌 팀코인 3) */

import { fixtureRoundMap, slotPlanBySlot } from './s11-season-simulate.mjs';

export const COIN_CAPS = { solo: 5, team: 6 };
/** 시즌 전체(상·하반 합산) 팀당 재량 팀코인 */
export const TEAM_COIN_CAP = 3;
/** coin-usage.json 과 집계 로직 동기화용 — 규칙 변경 시 증가 */
export const COIN_LOGIC_VERSION = 2;

export const HALF_RANGES = {
  first_half: { min: 1, max: 10, label: '상반기', roundLabel: '1R~10R' },
  second_half: { min: 11, max: 20, label: '하반기', roundLabel: '11R~20R' },
};

export function halfKeyForRound(roundNum) {
  if (roundNum >= 1 && roundNum <= 10) return 'first_half';
  if (roundNum >= 11 && roundNum <= 20) return 'second_half';
  return null;
}

function slotLineName(row) {
  if (!row) return '';
  return (row.displayName || row.playerName || '').trim();
}

function formatFromPlan(metaSlot, sl) {
  if (metaSlot && metaSlot.format) return metaSlot.format;
  const n = Math.max((sl.teamA || []).length, (sl.teamB || []).length);
  if (n >= 3) return '3v3';
  if (n >= 2) return '2v2';
  return '1v1';
}

function formatLabel(format) {
  if (format === '1v1') return '개인전';
  if (format === '2v2') return '2v2';
  if (format === '3v3') return '3v3';
  return format || '—';
}

function emptyPlayerCoin() {
  return { solo: 0, team: 0, teamCoin: 0, log: [] };
}

function emptyTeamCoin() {
  return { used: 0, log: [] };
}

/** displayName → players.json tier */
export function tierByDisplayName(players) {
  const m = new Map();
  for (const p of players || []) {
    const n = (p.displayName || '').trim();
    if (n) m.set(n, (p.tier || '').trim());
  }
  return m;
}

/** displayName → teamId */
export function teamIdByDisplayName(players) {
  const m = new Map();
  for (const p of players || []) {
    const n = (p.displayName || '').trim();
    if (n) m.set(n, (p.teamId || '').trim());
  }
  return m;
}

/** 개인전: 슬롯 tierLine 과 선수 tier 가 같을 때만 개인코인 +1 */
function countsSoloCoin(metaSlot, playerName, tierMap) {
  if (!metaSlot || metaSlot.format !== '1v1') return false;
  const tierLine = (metaSlot.tierLine || '').trim();
  if (!tierLine) return true;
  const playerTier = tierMap.get(playerName) || '';
  return Boolean(playerTier && playerTier === tierLine);
}

function ensurePlayerCoin(map, name) {
  if (!map.has(name)) map.set(name, emptyPlayerCoin());
  return map.get(name);
}

function ensureTeamCoin(map, teamId) {
  if (!teamId) return null;
  if (!map.has(teamId)) map.set(teamId, emptyTeamCoin());
  return map.get(teamId);
}

function uniqueMatchups(matchups) {
  const seen = new Set();
  const out = [];
  for (const mu of matchups || []) {
    const fid = mu?.fixtureId;
    if (!fid || seen.has(fid)) continue;
    seen.add(fid);
    out.push(mu);
  }
  return out;
}

export function dedupeRoundDocs(roundDocs) {
  const byRound = new Map();
  for (const doc of roundDocs || []) {
    if (doc && doc.round != null) byRound.set(doc.round, doc);
  }
  return [...byRound.values()].sort((a, b) => (a.round || 0) - (b.round || 0));
}

function spendTeamCoin(teamCoins, teamId, entry, playerRec) {
  const teamRec = ensureTeamCoin(teamCoins, teamId);
  entry.usesTeamCoin = true;
  if (playerRec) playerRec.teamCoin = (playerRec.teamCoin || 0) + 1;
  if (!teamRec) return;
  teamRec.used++;
  teamRec.log.push({
    round: entry.round,
    slot: entry.slot,
    format: entry.format,
    fixtureId: entry.fixtureId,
    displayName: entry.displayName,
    half: entry.half,
    kind: entry.teamCoinKind || null,
  });
}

/**
 * @param {object} fixtures
 * @param {object[]} roundDocs
 * @param {object[]} [players] — players.json 항목 (개인전 tierLine 일치·팀코인 소속 판별)
 * @returns {{ byHalf: { first_half: Map, second_half: Map }, maxRoundByHalf: { first_half: number, second_half: number }, teamCoins: Map }}
 */
export function buildCoinUsageByHalf(fixtures, roundDocs, players) {
  const tierMap = tierByDisplayName(players);
  const teamMap = teamIdByDisplayName(players);
  const byHalf = {
    first_half: new Map(),
    second_half: new Map(),
  };
  const maxRoundByHalf = { first_half: 0, second_half: 0 };
  const teamCoins = new Map();

  for (const doc of dedupeRoundDocs(roundDocs)) {
    const rnum = doc.round;
    const half = halfKeyForRound(rnum);
    if (!half) continue;

    const hasAppearance = (doc.matchups || []).some((mu) =>
      (mu.slots || []).some((sl) =>
        [...(sl.teamA || []), ...(sl.teamB || [])].some((row) => slotLineName(row)),
      ),
    );
    if (hasAppearance) maxRoundByHalf[half] = Math.max(maxRoundByHalf[half], rnum);

    const byId = fixtureRoundMap(fixtures, rnum);
    const planBySlot = slotPlanBySlot(fixtures, rnum);

    for (const mu of uniqueMatchups(doc.matchups)) {
      if (!byId.has(mu.fixtureId)) continue;
      for (const sl of mu.slots || []) {
        const metaSlot = planBySlot.get(sl.slot) || {};
        const format = formatFromPlan(metaSlot, sl);
        const isSolo = format === '1v1';
        const names = new Set();
        for (const row of [...(sl.teamA || []), ...(sl.teamB || [])]) {
          const nm = slotLineName(row);
          if (nm) names.add(nm);
        }
        if (!names.size) continue;

        for (const nm of names) {
          const rec = ensurePlayerCoin(byHalf[half], nm);
          const entry = {
            round: rnum,
            slot: sl.slot,
            format,
            fixtureId: mu.fixtureId,
            displayName: nm,
            half,
          };
          if (isSolo) {
            if (countsSoloCoin(metaSlot, nm, tierMap)) {
              if (rec.solo >= COIN_CAPS.solo) {
                entry.teamCoinKind = 'solo';
                spendTeamCoin(teamCoins, teamMap.get(nm) || '', entry, rec);
              } else {
                rec.solo++;
                entry.countsSolo = true;
              }
            } else {
              entry.countsSolo = false;
              entry.crossTier = true;
            }
          } else if (rec.team >= COIN_CAPS.team) {
            entry.teamCoinKind = 'team';
            spendTeamCoin(teamCoins, teamMap.get(nm) || '', entry, rec);
          } else {
            rec.team++;
            entry.countsTeam = true;
          }
          rec.log.push(entry);
        }
      }
    }
  }

  return { byHalf, maxRoundByHalf, teamCoins };
}

export function defaultHalfKey(fixtures) {
  return fixtures && fixtures.phase === 'second_half' ? 'second_half' : 'first_half';
}

export function coinUsageForPlayer(byHalf, halfKey, displayName) {
  const name = (displayName || '').trim();
  if (!name) return emptyPlayerCoin();
  const rec = byHalf[halfKey]?.get(name);
  if (!rec) return emptyPlayerCoin();
  return {
    solo: rec.solo,
    team: rec.team,
    teamCoin: rec.teamCoin || 0,
    log: rec.log.slice(),
  };
}

export function teamCoinUsageForTeam(teamCoins, teamId) {
  const id = (teamId || '').trim();
  if (!id || !teamCoins) return emptyTeamCoin();
  const rec = teamCoins.get ? teamCoins.get(id) : teamCoins[id];
  if (!rec) return emptyTeamCoin();
  return { used: rec.used || 0, log: Array.isArray(rec.log) ? rec.log.slice() : [] };
}

export function coinMeterTone(used, cap, kind = 'solo') {
  if (used >= cap) return 'cap';
  if (kind === 'team' && used >= 4) return 'warn';
  if (kind === 'teamCoin' && used >= 2) return 'warn';
  if (kind === 'solo' && cap > 0 && used / cap >= 0.8) return 'warn';
  return 'ok';
}

export function formatAppearanceTooltip(log) {
  if (!Array.isArray(log) || !log.length) return '출전 기록 없음';
  return log
    .map((e) => {
      let line = `${e.round}R #${e.slot} ${formatLabel(e.format)}`;
      if (e.crossTier) line += ' (상위티어 출전)';
      if (e.usesTeamCoin) line += ' (팀코인)';
      return line;
    })
    .join('\n');
}

export function formatTeamCoinTooltip(log) {
  if (!Array.isArray(log) || !log.length) return '팀코인 사용 없음';
  return log
    .map((e) => {
      const kind =
        e.kind === 'solo' ? '개인전 한도초과' : e.kind === 'team' ? '팀전 한도초과' : '재량';
      return `${e.round}R #${e.slot} ${formatLabel(e.format)} · ${e.displayName || '—'} (${kind})`;
    })
    .join('\n');
}

/** buildCoinUsageByHalf 결과 → coin-usage.json */
export function coinUsageToJson({ byHalf, maxRoundByHalf, teamCoins }) {
  const out = {
    schemaVersion: 1,
    coinLogicVersion: COIN_LOGIC_VERSION,
    teamCoinCap: TEAM_COIN_CAP,
    generatedAt: new Date().toISOString(),
    byHalf: {},
    teams: {},
  };
  for (const half of ['first_half', 'second_half']) {
    const players = {};
    for (const [name, rec] of byHalf[half].entries()) {
      players[name] = {
        solo: rec.solo,
        team: rec.team,
        teamCoin: rec.teamCoin || 0,
        log: rec.log,
      };
    }
    out.byHalf[half] = {
      maxRound: maxRoundByHalf[half] || 0,
      players,
    };
  }
  const teamEntries = teamCoins instanceof Map ? teamCoins.entries() : Object.entries(teamCoins || {});
  for (const [teamId, rec] of teamEntries) {
    out.teams[teamId] = {
      used: rec.used || 0,
      log: Array.isArray(rec.log) ? rec.log : [],
    };
  }
  return out;
}

/** coin-usage.json → buildCoinUsageByHalf 와 동일한 구조 (실패 시 null) */
export function coinUsageFromJson(doc) {
  if (!doc || doc.schemaVersion !== 1) return null;
  if (doc.coinLogicVersion !== COIN_LOGIC_VERSION) return null;
  const byHalf = { first_half: new Map(), second_half: new Map() };
  const maxRoundByHalf = { first_half: 0, second_half: 0 };
  for (const half of ['first_half', 'second_half']) {
    const block = doc.byHalf?.[half];
    if (!block) continue;
    maxRoundByHalf[half] = block.maxRound || 0;
    for (const [name, rec] of Object.entries(block.players || {})) {
      byHalf[half].set(name, {
        solo: rec.solo || 0,
        team: rec.team || 0,
        teamCoin: rec.teamCoin || 0,
        log: Array.isArray(rec.log) ? rec.log.slice() : [],
      });
    }
  }
  const teamCoins = new Map();
  for (const [teamId, rec] of Object.entries(doc.teams || {})) {
    teamCoins.set(teamId, {
      used: rec.used || 0,
      log: Array.isArray(rec.log) ? rec.log.slice() : [],
    });
  }
  return { byHalf, maxRoundByHalf, teamCoins };
}
