/**
 * s10/index.html 에서 PLAYERS_META·TEAM_NAMES·TEAM_LOGOS·K_VALUES 및 CSV 처리 함수를 읽어
 * js/season10-analytics.js 생성 (수동 동기화용)
 * 실행: node scripts/extract-season10-analytics.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 's10', 'index.html');
const outPath = path.join(root, 'js', 'season10-analytics.js');

const html = fs.readFileSync(indexPath, 'utf8');

function sliceConst(name) {
  const re = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n        \\}|\\[[\\s\\S]*?\\n        \\]);`);
  const m = html.match(re);
  if (!m) throw new Error('const ' + name + ' not found');
  return m[1];
}

const TEAM_NAMES = sliceConst('TEAM_NAMES');
const TEAM_LOGOS = sliceConst('TEAM_LOGOS');
const PLAYERS_META = sliceConst('PLAYERS_META');
const K_VALUES = sliceConst('K_VALUES');

const processBlock = `
export function parseCsvLine(line) {
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

/**
 * s10/index.html 의 processAllData 와 동일한 집계. CSV는 s10/input.csv.
 * @returns {{ playersData: object, teamsData: object, matchesData: any[], mapMatchupStats: object }}
 */
export function buildSeason10Stats(csvText) {
  let playersData = {};
  let teamsData = {};
  let mapMatchupStats = {};
  const nameToIdMap = {};
  let roundMatchups = {};
  let forcedResults = {};
  const matchesData = [];

  function updateMapMatchupStats(map, p1Race, p2Race, p1Won) {
    const validRaces = ['P', 'T', 'Z'];
    if (!validRaces.includes(p1Race) || !validRaces.includes(p2Race)) return;

    if (!mapMatchupStats[map]) {
      mapMatchupStats[map] = {
        P: { total: { w: 0, l: 0 }, vsT: { w: 0, l: 0 }, vsZ: { w: 0, l: 0 } },
        T: { total: { w: 0, l: 0 }, vsP: { w: 0, l: 0 }, vsZ: { w: 0, l: 0 } },
        Z: { total: { w: 0, l: 0 }, vsP: { w: 0, l: 0 }, vsT: { w: 0, l: 0 } },
      };
    }

    if (p1Race !== p2Race) {
      mapMatchupStats[map][p1Race].total.w += p1Won ? 1 : 0;
      mapMatchupStats[map][p1Race].total.l += p1Won ? 0 : 1;
      mapMatchupStats[map][p2Race].total.w += p1Won ? 0 : 1;
      mapMatchupStats[map][p2Race].total.l += p1Won ? 1 : 0;

      mapMatchupStats[map][p1Race][\`vs\${p2Race}\`].w += p1Won ? 1 : 0;
      mapMatchupStats[map][p1Race][\`vs\${p2Race}\`].l += p1Won ? 0 : 1;
      mapMatchupStats[map][p2Race][\`vs\${p1Race}\`].w += p1Won ? 0 : 1;
      mapMatchupStats[map][p2Race][\`vs\${p1Race}\`].l += p1Won ? 1 : 0;
    }
  }

  function updateElo(p1, p2, result, k) {
    const expected = 1 / (1 + 10 ** ((p2.elo - p1.elo) / 400));
    const delta = Math.round(k * (result - expected));
    p1.elo += delta;
    p2.elo -= delta;
    return delta;
  }

  function updatePlayerStats(p1Id, p2Id, p1Won, type, tier = null) {
    const p1 = playersData[p1Id];
    if (!p1) return;
    if (p1Won) {
      p1.stats.total.w++;
      p1.stats[type].w++;
      if (tier) p1.stats[tier].w++;
    } else {
      p1.stats.total.l++;
      p1.stats[type].l++;
      if (tier) p1.stats[tier].l++;
    }
    if (p2Id) {
      const p2 = playersData[p2Id];
      if (!p2) return;
      if (!p1Won) {
        p2.stats.total.w++;
        p2.stats[type].w++;
      } else {
        p2.stats.total.l++;
        p2.stats[type].l++;
      }
    }
  }

  playersData = {};
  teamsData = {};
  mapMatchupStats = {};
  Object.keys(nameToIdMap).forEach((k) => delete nameToIdMap[k]);
  roundMatchups = {};
  forcedResults = {};
  matchesData.length = 0;

  PLAYERS_META.forEach((p) => {
    playersData[p.id] = {
      ...p,
      elo: 1000,
      history: [],
      stats: {
        total: { w: 0, l: 0 },
        개인전: { w: 0, l: 0 },
        팀전: { w: 0, l: 0 },
        '22': { w: 0, l: 0 },
        '33': { w: 0, l: 0 },
      },
    };
    nameToIdMap[p.이름] = p.id;
  });
  Object.keys(TEAM_NAMES).forEach((teamId) => {
    teamsData[teamId] = {
      id: parseInt(teamId, 10),
      name: TEAM_NAMES[teamId],
      matches: 0,
      wins: 0,
      losses: 0,
      setWins: 0,
      setLosses: 0,
      recentForm: [],
    };
  });

  const lines = csvText.trim().split('\\n').slice(1);

  lines.forEach((line, index) => {
    if (!line) return;

    const columns = parseCsvLine(line);
    const [round, matchNum, type, tier, map, team1Id, team1PlayersStr, team2Id, team2PlayersStr, winnerStr, resultStr, result_team] =
      columns;

    const parsePlayerStr = (str) => {
      if (!str) return { id: null, name: 'N/A', race: null, isJongbyun: false };
      const parts = str.split(':');
      const name = parts[0].trim();
      const id = nameToIdMap[name];
      const race =
        parts[1] && parts[1].trim()
          ? parts[1].trim().toUpperCase()
          : playersData[id]
            ? playersData[id].종족
            : null;
      const isJongbyun = parts[2] ? parts[2].trim().toUpperCase() === 'J' : false;
      return { id, name, race, isJongbyun };
    };

    const team1PlayerInfo = team1PlayersStr.split(',').map(parsePlayerStr);
    const team1Players = team1PlayerInfo.map((p) => p.id).filter(Boolean);
    const team2PlayerInfo = team2PlayersStr.split(',').map(parsePlayerStr);
    const team2Players = team2PlayerInfo.map((p) => p.id).filter(Boolean);

    if (team1Players.length !== team1PlayerInfo.length || team2Players.length !== team2PlayerInfo.length) {
      console.warn('Could not find ID for all players in line:', line);
    }

    const winnerTeam = parseInt(winnerStr, 10);

    const match = {
      id: index,
      round: parseInt(round, 10),
      matchNum: parseInt(matchNum, 10),
      type,
      tier,
      map,
      team1: { id: parseInt(team1Id, 10), players: team1Players, playerInfo: team1PlayerInfo },
      team2: { id: parseInt(team2Id, 10), players: team2Players, playerInfo: team2PlayerInfo },
      winner: winnerTeam,
      eloChanges: [],
    };

    const k = K_VALUES[type === '팀전' ? tier : '개인전'] || 32;
    if (type === '개인전') {
      const p1 = playersData[team1Players[0]];
      const p2 = playersData[team2Players[0]];
      if (p1 && p2) {
        const eloChange = updateElo(p1, p2, winnerTeam === 1 ? 1 : 0, k);
        match.eloChanges.push({ player: p1.id, from: p1.elo - eloChange, to: p1.elo, change: eloChange });
        match.eloChanges.push({ player: p2.id, from: p2.elo + eloChange, to: p2.elo, change: -eloChange });
        updatePlayerStats(p1.id, p2.id, winnerTeam === 1, type);
        p1.history.push(match.id);
        p2.history.push(match.id);

        const p1Race = team1PlayerInfo[0].race;
        const p2Race = team2PlayerInfo[0].race;
        updateMapMatchupStats(map, p1Race, p2Race, winnerTeam === 1);
      }
    } else {
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
          match.eloChanges.push({ player: pid, from: p.elo, to: p.elo + delta, change: delta });
          p.elo += delta;
          updatePlayerStats(pid, null, winnerTeam === 1, type, tier);
          p.history.push(match.id);
        }
      });
      team2Players.forEach((pid) => {
        const p = playersData[pid];
        if (p) {
          match.eloChanges.push({ player: pid, from: p.elo, to: p.elo - delta, change: -delta });
          p.elo -= delta;
          updatePlayerStats(pid, null, winnerTeam === 2, type, tier);
          p.history.push(match.id);
        }
      });
    }
    matchesData.push(match);

    const roundKey = \`R\${round}-\${[team1Id, team2Id].sort().join('-')}\`;
    if (!roundMatchups[roundKey]) {
      roundMatchups[roundKey] = {
        round: parseInt(round, 10),
        team1Id: parseInt(team1Id, 10),
        team2Id: parseInt(team2Id, 10),
        team1SetWins: 0,
        team2SetWins: 0,
        matches: [],
      };
    }
    roundMatchups[roundKey].matches.push(match);
    if (parseInt(team1Id, 10) === roundMatchups[roundKey].team1Id) {
      if (winnerTeam === 1) roundMatchups[roundKey].team1SetWins++;
      else roundMatchups[roundKey].team2SetWins++;
    } else {
      if (winnerTeam === 1) roundMatchups[roundKey].team2SetWins++;
      else roundMatchups[roundKey].team1SetWins++;
    }
    if (resultStr && resultStr.includes(':')) {
      forcedResults[roundKey] = resultStr;
    }
    if (result_team && !roundMatchups[roundKey].result_team) {
      roundMatchups[roundKey].result_team = parseInt(result_team, 10);
    }
  });

  Object.values(roundMatchups).forEach((roundResult) => {
    const team1 = teamsData[roundResult.team1Id];
    const team2 = teamsData[roundResult.team2Id];
    if (!team1 || !team2) return;

    team1.matches++;
    team2.matches++;

    let matchupSetWins1;
    let matchupSetLosses1;
    let matchupSetWins2;
    let matchupSetLosses2;
    let team1WonMatch;
    let team2WonMatch;

    const roundKey = \`R\${roundResult.round}-\${[roundResult.team1Id, roundResult.team2Id].sort().join('-')}\`;
    const forcedResult = forcedResults[roundKey];
    const forcedWinnerTeam = roundResult.result_team;

    if (forcedWinnerTeam) {
      team1WonMatch = roundResult.team1Id === forcedWinnerTeam;
      team2WonMatch = roundResult.team2Id === forcedWinnerTeam;
      matchupSetWins1 = roundResult.team1SetWins;
      matchupSetLosses1 = roundResult.team2SetWins;
      matchupSetWins2 = roundResult.team2SetWins;
      matchupSetLosses2 = roundResult.team1SetWins;
    } else if (forcedResult) {
      const [score1Str, score2Str] = forcedResult.split(':');
      const sortedTeamIds = [roundResult.team1Id, roundResult.team2Id].sort((a, b) => a - b);
      const scoreForSortedTeam1 = parseInt(score1Str, 10);
      const scoreForSortedTeam2 = parseInt(score2Str, 10);

      if (roundResult.team1Id === sortedTeamIds[0]) {
        matchupSetWins1 = scoreForSortedTeam1;
        matchupSetLosses1 = scoreForSortedTeam2;
        matchupSetWins2 = scoreForSortedTeam2;
        matchupSetLosses2 = scoreForSortedTeam1;
      } else {
        matchupSetWins1 = scoreForSortedTeam2;
        matchupSetLosses1 = scoreForSortedTeam1;
        matchupSetWins2 = scoreForSortedTeam1;
        matchupSetLosses2 = scoreForSortedTeam2;
      }
      team1WonMatch = matchupSetWins1 > matchupSetLosses1;
      team2WonMatch = matchupSetWins2 > matchupSetLosses2;
    } else {
      matchupSetWins1 = roundResult.team1SetWins;
      matchupSetLosses1 = roundResult.team2SetWins;
      matchupSetWins2 = roundResult.team2SetWins;
      matchupSetLosses2 = roundResult.team1SetWins;

      team1WonMatch = roundResult.team1SetWins > roundResult.team2SetWins;
      team2WonMatch = roundResult.team2SetWins > roundResult.team1SetWins;
    }

    team1.setWins += matchupSetWins1;
    team1.setLosses += matchupSetLosses1;
    team2.setWins += matchupSetWins2;
    team2.setLosses += matchupSetLosses2;

    if (team1WonMatch) {
      team1.wins++;
      team2.losses++;
      team1.recentForm.push('W');
      team2.recentForm.push('L');
    } else if (team2WonMatch) {
      team2.wins++;
      team1.losses++;
      team2.recentForm.push('W');
      team1.recentForm.push('L');
    }
  });

  return { playersData, teamsData, matchesData, mapMatchupStats };
}
`;

const header = `/**
 * 시즌10 기록실(s10/index.html)과 동일한 선수 메타·CSV 집계.
 * s10/index.html 수정 시: \`node scripts/extract-season10-analytics.mjs\` 로 재생성하세요.
 */
`;

const body = `${header}export const TEAM_NAMES = ${TEAM_NAMES};
export const TEAM_LOGOS = ${TEAM_LOGOS};
export const PLAYERS_META = ${PLAYERS_META};
export const K_VALUES = ${K_VALUES};
${processBlock}`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, body, 'utf8');
console.log('Wrote', outPath);
