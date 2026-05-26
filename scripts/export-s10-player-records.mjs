/**
 * 시즌10 최종 선수 기록 CSV 추출 (s10/index.html · input.csv 와 동일 집계)
 *
 * 실행: node scripts/export-s10-player-records.mjs
 * 출력: s10/player-records-export.csv
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 's10', 'index.html');
const csvInPath = path.join(root, 's10', 'input.csv');
const csvOutPath = path.join(root, 's10', 'player-records-export.csv');

const html = fs.readFileSync(indexPath, 'utf8');

function sliceConst(name) {
  const re = new RegExp(`const ${name} = ([\\s\\S]*?);\\r?\\n`);
  const m = html.match(re);
  if (!m) throw new Error('const ' + name + ' not found in s10/index.html');
  // eslint-disable-next-line no-eval
  return eval('(' + m[1].trim() + ')');
}

const TEAM_NAMES = sliceConst('TEAM_NAMES');
const PLAYERS_META = sliceConst('PLAYERS_META');
const K_VALUES = sliceConst('K_VALUES');

function parseCsvLine(line) {
  const columns = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      columns.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  columns.push(field);
  return columns.map((f) => f.trim().replace(/^"|"$/g, ''));
}

function emptyStats() {
  return {
    total: { w: 0, l: 0 },
    개인전: {
      w: 0,
      l: 0,
      vsP: { w: 0, l: 0 },
      vsT: { w: 0, l: 0 },
      vsZ: { w: 0, l: 0 },
    },
    팀전: { w: 0, l: 0 },
    '22': { w: 0, l: 0 },
    '33': { w: 0, l: 0 },
  };
}

function normalizePtRace(race) {
  if (!race) return null;
  const c = String(race).trim().toUpperCase().charAt(0);
  return c === 'P' || c === 'T' || c === 'Z' ? c : null;
}

function updateElo(p1, p2, result, k) {
  const expected = 1 / (1 + 10 ** ((p2.elo - p1.elo) / 400));
  const delta = Math.round(k * (result - expected));
  p1.elo += delta;
  p2.elo -= delta;
  return delta;
}

function bumpWl(bucket, won) {
  if (won) bucket.w++;
  else bucket.l++;
}

function update1v1VsRace(stats, oppRace, won) {
  const r = normalizePtRace(oppRace);
  if (!r) return;
  const key = 'vs' + r;
  bumpWl(stats.개인전[key], won);
}

function updatePlayerStats(playersData, p1Id, p2Id, p1Won, type, tier = null, oppRaceForP1 = null, oppRaceForP2 = null) {
  const p1 = playersData[p1Id];
  if (!p1) return;

  if (p1Won) {
    bumpWl(p1.stats.total, true);
    bumpWl(p1.stats[type], true);
    if (tier) bumpWl(p1.stats[tier], true);
  } else {
    bumpWl(p1.stats.total, false);
    bumpWl(p1.stats[type], false);
    if (tier) bumpWl(p1.stats[tier], false);
  }

  if (type === '개인전' && oppRaceForP1 != null) {
    update1v1VsRace(p1.stats, oppRaceForP1, p1Won);
  }

  if (p2Id) {
    const p2 = playersData[p2Id];
    if (!p2) return;
    if (!p1Won) {
      bumpWl(p2.stats.total, true);
      bumpWl(p2.stats[type], true);
    } else {
      bumpWl(p2.stats.total, false);
      bumpWl(p2.stats[type], false);
    }
    if (type === '개인전' && oppRaceForP2 != null) {
      update1v1VsRace(p2.stats, oppRaceForP2, !p1Won);
    }
  }
}

function buildPlayerStats(csvText) {
  const playersData = {};
  const nameToIdMap = {};

  PLAYERS_META.forEach((p) => {
    playersData[p.id] = { ...p, elo: 1000, stats: emptyStats() };
    nameToIdMap[p.이름] = p.id;
  });

  const lines = csvText.trim().split('\n').slice(1);

  for (const line of lines) {
    if (!line.trim()) continue;

    const columns = parseCsvLine(line);
    const [round, , type, tier, , team1Id, team1PlayersStr, , team2PlayersStr, winnerStr] = columns;

    const parsePlayerStr = (str) => {
      if (!str) return { id: null, name: 'N/A', race: null };
      const parts = str.split(':');
      const name = parts[0].trim();
      const id = nameToIdMap[name];
      const race =
        parts[1] && parts[1].trim()
          ? parts[1].trim().toUpperCase()
          : id && playersData[id]
            ? playersData[id].종족
            : null;
      return { id, name, race };
    };

    const team1PlayerInfo = team1PlayersStr.split(',').map(parsePlayerStr);
    const team1Players = team1PlayerInfo.map((p) => p.id).filter(Boolean);
    const team2PlayerInfo = team2PlayersStr.split(',').map(parsePlayerStr);
    const team2Players = team2PlayerInfo.map((p) => p.id).filter(Boolean);

    const winnerTeam = parseInt(winnerStr, 10);
    const k = K_VALUES[type === '팀전' ? tier : '개인전'] || 32;

    if (type === '개인전') {
      const p1 = playersData[team1Players[0]];
      const p2 = playersData[team2Players[0]];
      if (p1 && p2) {
        updateElo(p1, p2, winnerTeam === 1 ? 1 : 0, k);
        const p1Race = team1PlayerInfo[0].race;
        const p2Race = team2PlayerInfo[0].race;
        updatePlayerStats(playersData, p1.id, p2.id, winnerTeam === 1, type, null, p2Race, p1Race);
      }
    } else if (type === '팀전') {
      const team1Elo =
        team1Players.reduce((sum, pid) => sum + (playersData[pid]?.elo || 1000), 0) / team1Players.length;
      const team2Elo =
        team2Players.reduce((sum, pid) => sum + (playersData[pid]?.elo || 1000), 0) / team2Players.length;
      const expected = 1 / (1 + 10 ** ((team2Elo - team1Elo) / 400));
      const actual = winnerTeam === 1 ? 1 : 0;
      const delta = Math.round(k * (actual - expected));

      team1Players.forEach((pid) => {
        const p = playersData[pid];
        if (p) {
          p.elo += delta;
          updatePlayerStats(playersData, pid, null, winnerTeam === 1, type, tier);
        }
      });
      team2Players.forEach((pid) => {
        const p = playersData[pid];
        if (p) {
          p.elo -= delta;
          updatePlayerStats(playersData, pid, null, winnerTeam === 2, type, tier);
        }
      });
    }
  }

  return playersData;
}

function winRatePct(w, l) {
  const t = w + l;
  if (t === 0) return '';
  return String(Math.round((w / t) * 100));
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function wlTriple(bucket) {
  return [bucket.w, bucket.l, winRatePct(bucket.w, bucket.l)];
}

const HEADERS = [
  'id',
  '이름',
  '팀번호',
  '팀명',
  '종족',
  '티어',
  'ELO',
  '전체_승',
  '전체_패',
  '전체_승률',
  '개인전_승',
  '개인전_패',
  '개인전_승률',
  '개인전_vsP_승',
  '개인전_vsP_패',
  '개인전_vsP_승률',
  '개인전_vsT_승',
  '개인전_vsT_패',
  '개인전_vsT_승률',
  '개인전_vsZ_승',
  '개인전_vsZ_패',
  '개인전_vsZ_승률',
  '팀전_승',
  '팀전_패',
  '팀전_승률',
  '2v2_승',
  '2v2_패',
  '2v2_승률',
  '3v3_승',
  '3v3_패',
  '3v3_승률',
];

function playerToRow(p) {
  const s = p.stats;
  const total = wlTriple(s.total);
  const solo = wlTriple(s.개인전);
  const vsP = wlTriple(s.개인전.vsP);
  const vsT = wlTriple(s.개인전.vsT);
  const vsZ = wlTriple(s.개인전.vsZ);
  const team = wlTriple(s.팀전);
  const t22 = wlTriple(s['22']);
  const t33 = wlTriple(s['33']);

  return [
    p.id,
    p.이름,
    p.팀,
    TEAM_NAMES[p.팀] || p.팀,
    p.종족,
    p.티어,
    p.elo,
    ...total,
    ...solo,
    ...vsP,
    ...vsT,
    ...vsZ,
    ...team,
    ...t22,
    ...t33,
  ].map(csvCell);
}

function main() {
  const csvText = fs.readFileSync(csvInPath, 'utf8');
  const playersData = buildPlayerStats(csvText);

  const rows = Object.values(playersData)
    .sort((a, b) => b.elo - a.elo || a.이름.localeCompare(b.이름, 'ko'))
    .map(playerToRow);

  const out = [HEADERS.map(csvCell).join(','), ...rows.map((r) => r.join(','))].join('\n');
  fs.writeFileSync(csvOutPath, '\uFEFF' + out, 'utf8');

  console.log(`Wrote ${rows.length} players → ${csvOutPath}`);
}

main();
