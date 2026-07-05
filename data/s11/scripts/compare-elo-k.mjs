/**
 * K=32(현재) vs K=100(개인전) 등 시나리오 — 실제 S11 결과로 ELO 분포 비교
 * node data/s11/scripts/compare-elo-k.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildRoundDocsFromMatchups,
  matchupFromPerMatchDoc,
} from '../../../js/s11-data-loader.mjs';
import {
  fixtureRoundMap,
  slotPlanBySlot,
  slotsInPlayedOrder,
  rosterByDisplayName,
  updateEloPair,
  opponentRacesFromSlotRows,
  oppRaceZtp,
  emptyStats,
  bumpStats,
  statKeysForFormat,
  bumpMapSimple,
  bumpVsOppRace,
  bumpTeamMap,
  emptyVsOppRace,
  emptyTeamMapStats,
} from '../../../js/s11-season-simulate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(__dirname, '..');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function kForFormat(format, K) {
  if (format === '2v2') return K['22'];
  if (format === '3v3') return K['33'];
  return K.개인전;
}

function simulateWithK(fixtures, roundDocs, players, K_VALUES) {
  const rosterMap = rosterByDisplayName(players);
  const statsByName = {};
  const stateByName = new Map();

  function ensure(name) {
    const n = (name || '').trim();
    if (!n) return null;
    if (!stateByName.has(n)) {
      stateByName.set(n, {
        displayName: n,
        elo: 1000,
        elo1v1: 1000,
        eloTeam: 1000,
        history: [],
      });
    }
    if (!statsByName[n]) statsByName[n] = emptyStats();
    return stateByName.get(n);
  }

  for (const doc of [...roundDocs].sort((a, b) => (a.round || 0) - (b.round || 0))) {
    const rnum = doc.round;
    const byId = fixtureRoundMap(fixtures, rnum);
    const planBySlot = slotPlanBySlot(fixtures, rnum);

    for (const mu of doc.matchups || []) {
      const fix = byId.get(mu.fixtureId);
      if (!fix?.teamIds?.length) continue;
      for (const sl of slotsInPlayedOrder(mu)) {
        const w = sl.winnerTeamIndex;
        if (w !== 1 && w !== 2) continue;
        const team1Won = w === 1;
        const metaSlot = planBySlot.get(sl.slot) || {};
        const format = metaSlot.format || '1v1';
        const k = kForFormat(format, K_VALUES);
        const namesA = (sl.teamA || []).map((r) => (r.displayName || '').trim()).filter(Boolean);
        const namesB = (sl.teamB || []).map((r) => (r.displayName || '').trim()).filter(Boolean);
        for (const nm of [...namesA, ...namesB]) ensure(nm);
        for (const nm of namesA) bumpStats(statsByName[nm], format, team1Won);
        for (const nm of namesB) bumpStats(statsByName[nm], format, !team1Won);

        if (format === '1v1' && namesA.length && namesB.length) {
          const n1 = namesA[0];
          const n2 = namesB[0];
          const s1 = ensure(n1);
          const s2 = ensure(n2);
          const { d1, d2 } = updateEloPair(s1.elo, s2.elo, team1Won ? 1 : 0, k);
          const { d1: d1s, d2: d2s } = updateEloPair(s1.elo1v1, s2.elo1v1, team1Won ? 1 : 0, k);
          s1.elo += d1;
          s2.elo += d2;
          s1.elo1v1 += d1s;
          s2.elo1v1 += d2s;
        } else if ((format === '2v2' || format === '3v3') && namesA.length && namesB.length) {
          const snapA = namesA.map((nm) => ({ nm, e: ensure(nm).elo, et: ensure(nm).eloTeam }));
          const snapB = namesB.map((nm) => ({ nm, e: ensure(nm).elo, et: ensure(nm).eloTeam }));
          const aAvg = snapA.reduce((s, x) => s + x.e, 0) / snapA.length;
          const bAvg = snapB.reduce((s, x) => s + x.e, 0) / snapB.length;
          const aT = snapA.reduce((s, x) => s + x.et, 0) / snapA.length;
          const bT = snapB.reduce((s, x) => s + x.et, 0) / snapB.length;
          const { d1, d2 } = updateEloPair(aAvg, bAvg, team1Won ? 1 : 0, k);
          const { d1: d1t, d2: d2t } = updateEloPair(aT, bT, team1Won ? 1 : 0, k);
          for (const { nm, e, et } of snapA) {
            ensure(nm).elo = e + d1;
            ensure(nm).eloTeam = et + d1t;
          }
          for (const { nm, e, et } of snapB) {
            ensure(nm).elo = e + d2;
            ensure(nm).eloTeam = et + d2t;
          }
        }
      }
    }
  }
  return stateByName;
}

function loadRoundDocs() {
  const fixtures = readJson(path.join(dataRoot, 'fixtures.json'));
  const manifest = readJson(path.join(dataRoot, 'results/manifest.json'));
  const resultsDir = path.join(dataRoot, 'results');
  const matchupsById = new Map();
  for (const fid of manifest.matchResults) {
    const doc = readJson(path.join(resultsDir, `${fid}.json`));
    const mu = matchupFromPerMatchDoc(doc, fid);
    if (mu) matchupsById.set(fid, mu);
  }
  const roundDocs = buildRoundDocsFromMatchups(fixtures, matchupsById);
  return { fixtures, roundDocs, players: readJson(path.join(dataRoot, 'players.json')).players || [] };
}

function stats(stateByName, label) {
  const rows = [...stateByName.values()].filter((s) => s.history?.length || s.elo !== 1000);
  const elos = rows.map((s) => s.elo);
  const games = rows.map((s) => {
    const st = stateByName.get(s.displayName);
    return st ? 0 : 0;
  });
  const withGames = [...stateByName.entries()]
    .map(([name, st]) => ({ name, elo: st.elo, elo1v1: st.elo1v1, g: 0 }))
    .filter((r) => {
      return true;
    });

  const gameCount = new Map();
  for (const [, st] of stateByName) {
    for (const h of st.history || []) {
      gameCount.set(st.displayName, (gameCount.get(st.displayName) || 0) + 1);
    }
  }

  const ranked = [...stateByName.entries()]
    .map(([name, st]) => ({ name, elo: st.elo, elo1v1: st.elo1v1, g: gameCount.get(name) || 0 }))
    .filter((r) => r.g > 0)
    .sort((a, b) => b.elo - a.elo);

  const allElos = ranked.map((r) => r.elo);
  const min = Math.min(...allElos);
  const max = Math.max(...allElos);
  const spread = max - min;
  const mean = allElos.reduce((a, b) => a + b, 0) / allElos.length;
  const std = Math.sqrt(allElos.reduce((s, e) => s + (e - mean) ** 2, 0) / allElos.length);

  console.log(`\n=== ${label} ===`);
  console.log(`  참가(세트 1+): ${ranked.length}명`);
  console.log(`  ELO 범위: ${min} ~ ${max} (폭 ${spread})`);
  console.log(`  평균 ${mean.toFixed(1)} · 표준편차 ${std.toFixed(1)}`);
  console.log('  Top 5:');
  for (const r of ranked.slice(0, 5)) {
    console.log(`    ${r.name.padEnd(8)} ${r.elo} (${r.g}세트, 1000 대비 ${r.elo - 1000 >= 0 ? '+' : ''}${r.elo - 1000})`);
  }
  console.log('  Bottom 5:');
  for (const r of ranked.slice(-5).reverse()) {
    console.log(`    ${r.name.padEnd(8)} ${r.elo} (${r.g}세트)`);
  }

  const rankMap32 = new Map();
  return { ranked, spread, std, rankMap32 };
}

function rankChanges(a, b) {
  const mapA = new Map(a.ranked.map((r, i) => [r.name, i + 1]));
  const mapB = new Map(b.ranked.map((r, i) => [r.name, i + 1]));
  const shifts = [];
  for (const name of mapA.keys()) {
    if (!mapB.has(name)) continue;
    shifts.push({ name, d: mapA.get(name) - mapB.get(name), eloA: a.ranked.find((x) => x.name === name)?.elo, eloB: b.ranked.find((x) => x.name === name)?.elo });
  }
  shifts.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  console.log('\n=== K=32 → K=100(개인만) 순위 변동 (상위) ===');
  for (const s of shifts.slice(0, 8)) {
    if (s.d === 0) continue;
    console.log(`  ${s.name}: ${s.eloA}→${s.eloB} ELO, 순위 ${s.d > 0 ? '+' : ''}${s.d}`);
  }
}

function singleGameTable() {
  console.log('\n=== 단일 세트 Δ 비교 (이론) ===');
  const pairs = [
    [1000, 1000, '동점'],
    [1000, 1100, '1000이 100점 낮음'],
    [1000, 1200, '200점 격차'],
    [1000, 1300, '300점 격차'],
  ];
  for (const [e1, e2, label] of pairs) {
    const win32 = updateEloPair(e1, e2, 1, 32).d1;
    const win100 = updateEloPair(e1, e2, 1, 100).d1;
    const lose32 = updateEloPair(e1, e2, 0, 32).d1;
    const lose100 = updateEloPair(e1, e2, 0, 100).d1;
    console.log(`  ${label} (${e1} vs ${e2}): 승 +${win32}/+${win100}, 패 ${lose32}/${lose100}`);
  }
}

const K_CURRENT = { 개인전: 32, '22': 24, '33': 16 };
const K_SOLO100 = { 개인전: 100, '22': 24, '33': 16 };
const K_ALL100 = { 개인전: 100, '22': 75, '33': 50 };
const K_MODERATE = { 개인전: 48, '22': 36, '33': 24 };

singleGameTable();

const { fixtures, roundDocs, players } = loadRoundDocs();
let setCount = 0;
for (const doc of roundDocs) {
  for (const mu of doc.matchups || []) {
    for (const sl of mu.slots || []) {
      if (sl.winnerTeamIndex === 1 || sl.winnerTeamIndex === 2) setCount++;
    }
  }
}
console.log(`\n데이터: ${roundDocs.length}라운드 · 반영 세트 ${setCount}건`);

const s32 = simulateWithK(fixtures, roundDocs, players, K_CURRENT);
const s100solo = simulateWithK(fixtures, roundDocs, players, K_SOLO100);
const s100all = simulateWithK(fixtures, roundDocs, players, K_ALL100);
const sMod = simulateWithK(fixtures, roundDocs, players, K_MODERATE);

const r32 = stats(s32, 'K=32/24/16 (현재)');
const r100s = stats(s100solo, 'K=100/24/16 (개인전만 100)');
const r100a = stats(s100all, 'K=100/75/50 (전부 ~3.1배)');
const rMod = stats(sMod, 'K=48/36/24 (적당 상향 ~1.5배)');

rankChanges(r32, r100s);

console.log('\n=== 요약 ===');
console.log(`  현재 spread ${r32.spread} → 개인100 only ${r100s.spread} → 전부100 ${r100a.spread} → 적당상향 ${rMod.spread}`);
console.log(`  현재 σ ${r32.std.toFixed(1)} → 개인100 ${r100s.std.toFixed(1)} → 전부100 ${r100a.std.toFixed(1)} → 적당 ${rMod.std.toFixed(1)}`);
