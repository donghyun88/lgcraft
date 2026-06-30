/** 시즌11 ELO·세트 집계 (선수 페이지와 동기) */

export const K_VALUES = { 개인전: 32, '22': 24, '33': 16 };

export function emptyStats() {
  return {
    total: { w: 0, l: 0 },
    개인전: { w: 0, l: 0 },
    팀전: { w: 0, l: 0 },
    '22': { w: 0, l: 0 },
    '33': { w: 0, l: 0 },
  };
}

export function statKeysForFormat(format) {
  const keys = ['total'];
  if (format === '1v1') {
    keys.push('개인전');
    return keys;
  }
  if (format === '2v2') {
    keys.push('팀전', '22');
    return keys;
  }
  if (format === '3v3') {
    keys.push('팀전', '33');
    return keys;
  }
  keys.push('팀전');
  return keys;
}

export function bumpStats(stats, format, won) {
  for (const k of statKeysForFormat(format)) {
    if (won) stats[k].w++;
    else stats[k].l++;
  }
}

export function updateEloPair(elo1, elo2, result, k) {
  const expected = 1 / (1 + 10 ** ((elo2 - elo1) / 400));
  const delta = Math.round(k * (result - expected));
  return { d1: delta, d2: -delta };
}

export function kForFormat(format) {
  if (format === '2v2') return K_VALUES['22'];
  if (format === '3v3') return K_VALUES['33'];
  return K_VALUES.개인전;
}

export async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json();
}

export async function loadRoundResultDoc(roundNum) {
  const p = String(roundNum).padStart(2, '0');
  for (const url of [`data/s11/results/round-${p}.json`, `data/s11/results/round-${p}.sample.json`]) {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.ok) return res.json();
  }
  return null;
}

export async function fetchPerMatchResultDoc(fixtureId) {
  const url = `data/s11/results/${fixtureId}.json`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export function matchupFromPerMatchDoc(doc, fixtureId) {
  if (!doc || !Array.isArray(doc.matchups)) return null;
  return doc.matchups.find((x) => x.fixtureId === fixtureId) || null;
}

export async function mergePerMatchOverlaysIntoRoundDoc(baseDoc, roundNum, fixtures) {
  const rd = (fixtures.rounds || []).find((x) => x.round === roundNum);
  const fixtureIds = (rd && rd.matchups ? rd.matchups.map((m) => m.id).filter(Boolean) : []) || [];
  const overlays = new Map();
  await Promise.all(
    fixtureIds.map(async (fid) => {
      const pm = await fetchPerMatchResultDoc(fid);
      const mu = matchupFromPerMatchDoc(pm, fid);
      if (mu) overlays.set(fid, mu);
    }),
  );
  if (!overlays.size && !baseDoc) return null;

  const out = baseDoc
    ? JSON.parse(JSON.stringify(baseDoc))
    : {
        schemaVersion: 1,
        season: 11,
        phase: fixtures.phase || 'first_half',
        round: roundNum,
        recordedAt: '',
        author: '',
        notes: '',
        matchups: [],
      };
  if (!Array.isArray(out.matchups)) out.matchups = [];

  if (baseDoc) {
    for (const [fid, mu] of overlays) {
      const idx = out.matchups.findIndex((x) => x.fixtureId === fid);
      if (idx >= 0) out.matchups[idx] = mu;
      else out.matchups.push(mu);
    }
  } else {
    const ordered = [];
    for (const fid of fixtureIds) {
      const mu = overlays.get(fid);
      if (mu) ordered.push(mu);
    }
    out.matchups = ordered;
  }
  return out;
}

export async function loadRoundResultDocMerged(roundNum, fixtures) {
  const base = await loadRoundResultDoc(roundNum);
  return mergePerMatchOverlaysIntoRoundDoc(base, roundNum, fixtures);
}

export async function loadAllRoundResults(maxRound, fixtures, minRound = 1) {
  const start = Math.max(1, minRound | 0);
  const end = Math.max(start, maxRound | 0);
  const docs = await Promise.all(
    Array.from({ length: end - start + 1 }, (_, i) => loadRoundResultDocMerged(start + i, fixtures)),
  );
  return docs.filter(Boolean);
}

export function fixtureRoundMap(fixtures, roundNum) {
  const rd = (fixtures.rounds || []).find((x) => x.round === roundNum);
  if (!rd) return new Map();
  const m = new Map();
  for (const mu of rd.matchups || []) m.set(mu.id, mu);
  return m;
}

export function slotPlanBySlot(fixtures, roundNum) {
  const rd = (fixtures.rounds || []).find((x) => x.round === roundNum);
  const m = new Map();
  if (!rd || !rd.slotPlan) return m;
  for (const s of rd.slotPlan) m.set(s.slot, s);
  return m;
}

export function getRaceLetter(p) {
  return (p.tierSheetMainRace || p.raceDefault || '').trim() || '';
}

export function rosterByDisplayName(players) {
  const m = new Map();
  for (const p of players || []) {
    const dn = (p.displayName || '').trim();
    if (dn) m.set(dn, p);
  }
  return m;
}

export function bumpMapSimple(perMap, mapName, won) {
  if (!mapName || mapName === '—') return;
  if (!perMap[mapName]) perMap[mapName] = { w: 0, l: 0 };
  if (won) perMap[mapName].w++;
  else perMap[mapName].l++;
}

export function emptyVsOppRace() {
  return { Z: { w: 0, l: 0 }, T: { w: 0, l: 0 }, P: { w: 0, l: 0 } };
}

export function emptyTeamMapStats() {
  return { '2v2': {}, '3v3': {} };
}

export function oppRaceZtp(row, rosterMap, displayName) {
  const raw = row?.race && String(row.race).trim().toUpperCase();
  if (raw) {
    const c = raw.charAt(0);
    if (c === 'Z' || c === 'T' || c === 'P' || c === 'R') return c;
    return null;
  }
  const p = rosterMap.get((displayName || '').trim());
  const letter = getRaceLetter(p || {});
  return letter === 'Z' || letter === 'T' || letter === 'P' || letter === 'R' ? letter : null;
}

export function bumpVsOppRace(vs, oppRace, won) {
  if (!oppRace || !vs[oppRace]) return;
  if (won) vs[oppRace].w++;
  else vs[oppRace].l++;
}

export function bumpTeamMap(teamMapStats, format, mapName, won) {
  if (!mapName || mapName === '—') return;
  const bucketKey = format === '2v2' ? '2v2' : format === '3v3' ? '3v3' : null;
  if (!bucketKey) return;
  const bucket = teamMapStats[bucketKey];
  if (!bucket[mapName]) bucket[mapName] = { w: 0, l: 0 };
  if (won) bucket[mapName].w++;
  else bucket[mapName].l++;
}

export function opponentRacesFromSlotRows(slotRows, nameList, rosterMap) {
  return (nameList || []).map((nm) => {
    const row = (slotRows || []).find((r) => (r.displayName || '').trim() === nm);
    return oppRaceZtp(row || {}, rosterMap, nm) || '';
  });
}

/** ELO 반영 순서: playedOrder 가 있으면 실제 진행 순, 없으면 슬롯 번호 순 */
export function slotsInPlayedOrder(mu) {
  const slots = [...(mu.slots || [])];
  const po = mu.playedOrder;
  if (!Array.isArray(po) || !po.length) {
    return slots.sort((a, b) => (a.slot || 0) - (b.slot || 0));
  }
  const bySlot = new Map(slots.map((s) => [s.slot, s]));
  const ordered = [];
  for (const slotNum of po) {
    const sl = bySlot.get(slotNum);
    if (sl) ordered.push(sl);
  }
  for (const sl of slots) {
    if (!ordered.includes(sl)) ordered.push(sl);
  }
  return ordered;
}

/**
 * @returns {{ statsByName: object, stateByName: Map }}
 */
export function simulateSeason(fixtures, roundDocs, rosterPlayers) {
  const rosterMap = rosterByDisplayName(rosterPlayers);
  const statsByName = {};
  const stateByName = new Map();

  function ensure(name) {
    const n = (name || '').trim();
    if (!n) return null;
    if (!stateByName.has(n)) {
      const player = rosterMap.get(n) || { displayName: n, id: '', teamId: '' };
      stateByName.set(n, {
        displayName: n,
        player,
        elo: 1000,
        elo1v1: 1000,
        eloTeam: 1000,
        history: [],
        mapStats: {},
        vsOppRace: emptyVsOppRace(),
        teamMapStats: emptyTeamMapStats(),
      });
    }
    if (!statsByName[n]) statsByName[n] = emptyStats();
    return stateByName.get(n);
  }

  const sortedDocs = [...roundDocs].sort((a, b) => (a.round || 0) - (b.round || 0));
  let globalSeq = 0;

  for (const doc of sortedDocs) {
    const rnum = doc.round;
    if (rnum == null) continue;
    const byId = fixtureRoundMap(fixtures, rnum);
    const planBySlot = slotPlanBySlot(fixtures, rnum);

    for (const mu of doc.matchups || []) {
      const fix = byId.get(mu.fixtureId);
      if (!fix || !fix.teamIds || fix.teamIds.length < 2) continue;
      const [tA, tB] = fix.teamIds;
      const slots = slotsInPlayedOrder(mu);

      for (const sl of slots) {
        const w = sl.winnerTeamIndex;
        if (w !== 1 && w !== 2) continue;
        const team1Won = w === 1;
        const metaSlot = planBySlot.get(sl.slot) || {};
        const format = metaSlot.format || '1v1';
        const mapName = metaSlot.map || '—';
        const k = kForFormat(format);

        const namesA = (sl.teamA || []).map((r) => (r.displayName || '').trim()).filter(Boolean);
        const namesB = (sl.teamB || []).map((r) => (r.displayName || '').trim()).filter(Boolean);

        for (const nm of [...namesA, ...namesB]) ensure(nm);

        const bumpSide = (names, sideWon) => {
          for (const nm of names) bumpStats(statsByName[nm], format, sideWon);
        };
        bumpSide(namesA, team1Won);
        bumpSide(namesB, !team1Won);

        const record = (nm, eloBefore, delta, won, opponents, opponentRaces) => {
          const st = ensure(nm);
          if (!st) return;
          const eloAfter = eloBefore + delta;
          st.elo = eloAfter;
          const opps = opponents || [];
          const races =
            Array.isArray(opponentRaces) && opponentRaces.length === opps.length
              ? opponentRaces
              : opps.map(() => '');
          st.history.push({
            seq: ++globalSeq,
            round: rnum,
            fixtureId: mu.fixtureId,
            slot: sl.slot,
            map: mapName,
            format,
            tierLine: metaSlot.tierLine || '',
            won,
            delta,
            eloBefore,
            eloAfter,
            opponents: opps,
            opponentRaces: races,
            teamIds: [tA, tB],
          });
        };

        if (format === '1v1' && namesA.length >= 1 && namesB.length >= 1) {
          const n1 = namesA[0];
          const n2 = namesB[0];
          const s1 = ensure(n1);
          const s2 = ensure(n2);
          const e1 = s1.elo;
          const e2 = s2.elo;
          const e1solo = s1.elo1v1;
          const e2solo = s2.elo1v1;
          const { d1, d2 } = updateEloPair(e1, e2, team1Won ? 1 : 0, k);
          const { d1: d1solo, d2: d2solo } = updateEloPair(e1solo, e2solo, team1Won ? 1 : 0, k);
          s1.elo1v1 = e1solo + d1solo;
          s2.elo1v1 = e2solo + d2solo;
          bumpMapSimple(s1.mapStats, mapName, team1Won);
          bumpMapSimple(s2.mapStats, mapName, !team1Won);
          const roppFor1 = oppRaceZtp(sl.teamB[0], rosterMap, n2);
          const roppFor2 = oppRaceZtp(sl.teamA[0], rosterMap, n1);
          bumpVsOppRace(s1.vsOppRace, roppFor1, team1Won);
          bumpVsOppRace(s2.vsOppRace, roppFor2, !team1Won);
          record(n1, e1, d1, team1Won, [n2], [roppFor1 || '']);
          record(n2, e2, d2, !team1Won, [n1], [roppFor2 || '']);
        } else if ((format === '2v2' || format === '3v3') && namesA.length && namesB.length) {
          const snapA = namesA.map((nm) => ({ nm, eloBefore: ensure(nm).elo, eloTeamBefore: ensure(nm).eloTeam }));
          const snapB = namesB.map((nm) => ({ nm, eloBefore: ensure(nm).elo, eloTeamBefore: ensure(nm).eloTeam }));
          const racesB = opponentRacesFromSlotRows(sl.teamB, namesB, rosterMap);
          const racesA = opponentRacesFromSlotRows(sl.teamA, namesA, rosterMap);
          const aAvg = snapA.reduce((s, x) => s + x.eloBefore, 0) / snapA.length;
          const bAvg = snapB.reduce((s, x) => s + x.eloBefore, 0) / snapB.length;
          const aTeamAvg = snapA.reduce((s, x) => s + x.eloTeamBefore, 0) / snapA.length;
          const bTeamAvg = snapB.reduce((s, x) => s + x.eloTeamBefore, 0) / snapB.length;
          const { d1, d2 } = updateEloPair(aAvg, bAvg, team1Won ? 1 : 0, k);
          const { d1: d1team, d2: d2team } = updateEloPair(aTeamAvg, bTeamAvg, team1Won ? 1 : 0, k);
          for (const { nm, eloBefore, eloTeamBefore } of snapA) {
            record(nm, eloBefore, d1, team1Won, namesB, racesB);
            ensure(nm).eloTeam = eloTeamBefore + d1team;
            bumpTeamMap(ensure(nm).teamMapStats, format, mapName, team1Won);
          }
          for (const { nm, eloBefore, eloTeamBefore } of snapB) {
            record(nm, eloBefore, d2, !team1Won, namesA, racesA);
            ensure(nm).eloTeam = eloTeamBefore + d2team;
            bumpTeamMap(ensure(nm).teamMapStats, format, mapName, !team1Won);
          }
        }
      }
    }
  }

  return { statsByName, stateByName };
}
