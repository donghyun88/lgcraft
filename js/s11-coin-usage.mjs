/** 시즌11 출전 코인 집계 (상·하반기별 개인전 5 / 팀전 6) */

import { fixtureRoundMap, slotPlanBySlot } from './s11-season-simulate.mjs';

export const COIN_CAPS = { solo: 5, team: 6 };

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
  return { solo: 0, team: 0, log: [] };
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

/**
 * @param {object} fixtures
 * @param {object[]} roundDocs
 * @param {object[]} [players] — players.json 항목 (개인전 tierLine 일치 판별)
 * @returns {{ byHalf: { first_half: Map, second_half: Map }, maxRoundByHalf: { first_half: number, second_half: number } }}
 */
export function buildCoinUsageByHalf(fixtures, roundDocs, players) {
  const tierMap = tierByDisplayName(players);
  const byHalf = {
    first_half: new Map(),
    second_half: new Map(),
  };
  const maxRoundByHalf = { first_half: 0, second_half: 0 };

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
          };
          if (isSolo) {
            if (countsSoloCoin(metaSlot, nm, tierMap)) {
              rec.solo++;
              entry.countsSolo = true;
            } else {
              entry.countsSolo = false;
              entry.crossTier = true;
            }
          } else {
            rec.team++;
            entry.countsTeam = true;
          }
          rec.log.push(entry);
        }
      }
    }
  }

  return { byHalf, maxRoundByHalf };
}

export function defaultHalfKey(fixtures) {
  return fixtures && fixtures.phase === 'second_half' ? 'second_half' : 'first_half';
}

export function coinUsageForPlayer(byHalf, halfKey, displayName) {
  const name = (displayName || '').trim();
  if (!name) return emptyPlayerCoin();
  const rec = byHalf[halfKey]?.get(name);
  if (!rec) return emptyPlayerCoin();
  return { solo: rec.solo, team: rec.team, log: rec.log.slice() };
}

export function coinMeterTone(used, cap, kind = 'solo') {
  if (used >= cap) return 'cap';
  if (kind === 'team' && used >= 4) return 'warn';
  if (kind === 'solo' && cap > 0 && used / cap >= 0.8) return 'warn';
  return 'ok';
}

export function formatAppearanceTooltip(log) {
  if (!Array.isArray(log) || !log.length) return '출전 기록 없음';
  return log
    .map((e) => {
      let line = `${e.round}R #${e.slot} ${formatLabel(e.format)}`;
      if (e.crossTier) line += ' (상위티어 출전)';
      return line;
    })
    .join('\n');
}
