import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = JSON.parse(readFileSync(join(root, 'fixtures.json'), 'utf8'));
const { players } = JSON.parse(readFileSync(join(root, 'players.json'), 'utf8'));

const tierByName = new Map();
for (const p of players) {
  const n = (p.displayName || '').trim();
  if (n) tierByName.set(n, (p.tier || '').trim());
}

function slotPlanByRound(roundNum) {
  const rd = (fixtures.rounds || []).find((x) => x.round === roundNum);
  const m = new Map();
  for (const s of rd?.slotPlan || []) m.set(s.slot, s);
  return m;
}

function lineName(row) {
  if (!row) return '';
  return (row.displayName || row.playerName || '').trim();
}

const resultsDir = join(root, 'results');
const files = readdirSync(resultsDir)
  .filter((f) => /^s11-r\d+-m\d+\.json$/.test(f))
  .sort();

const mismatches = [];

for (const file of files) {
  const doc = JSON.parse(readFileSync(join(resultsDir, file), 'utf8'));
  const round = doc.round;
  if (round == null) continue;
  const plan = slotPlanByRound(round);

  for (const mu of doc.matchups || []) {
    for (const sl of mu.slots || []) {
      const sp = plan.get(sl.slot);
      if (!sp || sp.format !== '1v1' || !sp.tierLine) continue;

      const slotTier = sp.tierLine.trim();
      for (const side of ['teamA', 'teamB']) {
        for (const row of sl[side] || []) {
          const name = lineName(row);
          if (!name) continue;
          const playerTier = tierByName.get(name);
          if (!playerTier) {
            mismatches.push({
              file,
              fixtureId: mu.fixtureId,
              round,
              slot: sl.slot,
              slotTier,
              map: sp.map,
              player: name,
              playerTier: '(미등록)',
              kind: 'unknown',
            });
            continue;
          }
          if (playerTier !== slotTier) {
            mismatches.push({
              file,
              fixtureId: mu.fixtureId,
              round,
              slot: sl.slot,
              slotTier,
              map: sp.map,
              player: name,
              playerTier,
              kind: 'cross-tier',
            });
          }
        }
      }
    }
  }
}

console.log(JSON.stringify(mismatches, null, 2));
console.error(`\n총 ${mismatches.length}건 (cross-tier: ${mismatches.filter((x) => x.kind === 'cross-tier').length})`);
