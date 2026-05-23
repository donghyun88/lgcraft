/**
 * player-ids.json → players.json 의 id 갱신
 * - 표 원본 id 에 팀 접두어(1P_, 2Fighters_, …)가 있으면 제거
 * - 기존 id 는 aliases 에 보존 (다를 때만)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const TEAM_PREFIX = {
  t1: '1P_',
  t2: '2Fighters_',
  t3: '3Star_',
  t4: 'Soul_',
  t5: 'TX_',
  t6: '6Kings_',
};

/** teamId + displayName → 접두어 제거 후에도 수동 보정이 필요한 id */
const MANUAL_IDS = {
  't4\0김재현': 'rOdeO',
  't4\0지주영': 'Z:IN',
  't5\0김동현': 'dOngkim',
};

function normalizePlayerId(teamId, displayName, rawId) {
  const key = `${teamId}\0${displayName}`;
  if (MANUAL_IDS[key]) return MANUAL_IDS[key];
  const prefix = TEAM_PREFIX[teamId];
  if (prefix && rawId.startsWith(prefix)) return rawId.slice(prefix.length);
  return rawId;
}

const sheet = JSON.parse(fs.readFileSync(path.join(root, 'player-ids.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(root, 'players.json'), 'utf8'));

const byKey = new Map();
const normalizedEntries = [];
for (const e of sheet.entries || []) {
  const id = normalizePlayerId(e.teamId, e.displayName, e.id);
  byKey.set(`${e.teamId}\0${e.displayName}`, id);
  normalizedEntries.push({ ...e, id });
}

sheet.entries = normalizedEntries;
sheet.notes = [
  ...(Array.isArray(sheet.notes) ? sheet.notes : []),
  'id 는 팀 접두어 없이 저장 (apply-player-ids.mjs 가 자동 정규화).',
].filter((n, i, a) => a.indexOf(n) === i);
fs.writeFileSync(path.join(root, 'player-ids.json'), JSON.stringify(sheet, null, 2), 'utf8');

let updated = 0;
const missing = [];
const dupIds = new Map();

for (const p of data.players) {
  const key = `${p.teamId}\0${p.displayName}`;
  const nextId = byKey.get(key);
  if (!nextId) {
    missing.push(`${p.teamId} ${p.displayName}`);
    continue;
  }
  if (p.id !== nextId) {
    const aliases = Array.isArray(p.aliases) ? [...p.aliases] : [];
    for (const prev of [p.id, ...(aliases || [])]) {
      if (prev && prev !== nextId && !aliases.includes(prev)) aliases.push(prev);
    }
    p.aliases = [...new Set(aliases)];
    p.id = nextId;
    updated++;
  }
  dupIds.set(nextId, (dupIds.get(nextId) || 0) + 1);
}

const dupes = [...dupIds.entries()].filter(([, n]) => n > 1).map(([id]) => id);

fs.writeFileSync(path.join(root, 'players.json'), JSON.stringify(data, null, 2), 'utf8');

console.log('Updated ids:', updated);
console.log('Players in JSON:', data.players.length);
console.log('Normalized player-ids.json entries:', normalizedEntries.length);
if (missing.length) console.warn('No sheet match:', missing.join(', '));
if (dupes.length) console.warn('Duplicate ids after apply:', dupes.join(', '));
