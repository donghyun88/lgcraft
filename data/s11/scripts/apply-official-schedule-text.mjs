/**
 * 운영 확정 홈/원정·경기일 텍스트표 → fixtures.json matchups + matchupPreset.pairsByRound
 * 실행: node apply-official-schedule-text.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.resolve(__dirname, '../fixtures.json');

const j = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

/** [홈, 원정, M/D] × 3경기, 날짜 열 왼쪽→오른쪽 = m1→m3 */
const sched = {
  1: [
    ['t5', 't6', '5/26'],
    ['t3', 't4', '5/28'],
    ['t1', 't2', '5/31'],
  ],
  2: [
    ['t1', 't3', '6/2'],
    ['t4', 't6', '6/4'],
    ['t2', 't5', '6/7'],
  ],
  3: [
    ['t3', 't5', '6/9'],
    ['t2', 't6', '6/11'],
    ['t1', 't4', '6/14'],
  ],
  4: [
    ['t2', 't4', '6/16'],
    ['t1', 't5', '6/18'],
    ['t3', 't6', '6/21'],
  ],
  5: [
    ['t1', 't6', '6/23'],
    ['t2', 't3', '6/25'],
    ['t4', 't5', '6/28'],
  ],
  6: [
    ['t4', 't5', '6/30'],
    ['t1', 't6', '7/2'],
    ['t2', 't3', '7/5'],
  ],
  7: [
    ['t3', 't6', '7/7'],
    ['t2', 't4', '7/9'],
    ['t1', 't5', '7/12'],
  ],
  8: [
    ['t1', 't4', '7/14'],
    ['t3', 't5', '7/16'],
    ['t2', 't6', '7/19'],
  ],
  9: [
    ['t2', 't5', '7/21'],
    ['t1', 't3', '7/23'],
    ['t4', 't6', '7/26'],
  ],
  10: [
    ['t1', 't2', '7/28'],
    ['t5', 't6', '7/30'],
    ['t3', 't4', '8/2'],
  ],
};

for (const rd of j.rounds) {
  const row = sched[rd.round];
  if (!row) throw new Error(`missing schedule for round ${rd.round}`);
  const p2 = String(rd.round).padStart(2, '0');
  rd.matchups = row.map(([a, b, d], i) => ({
    id: `s11-r${p2}-m${i + 1}`,
    teamIds: [a, b],
    date: d,
  }));
}

const mp = j.matchupPreset || (j.matchupPreset = {});
mp.pairsByRound = Object.fromEntries(
  Object.entries(sched).map(([k, v]) => [k, v.map((x) => [x[0], x[1]])]),
);
delete mp.pairsByRoundMod5;
delete mp.pairIndexForRound;
mp.description =
  '1~10라운드 팀대전 3경기(t6 포함). 라운드별 1~7경기 티어·맵·2v2/3v3 포인트 상한은 운영 확정 일정 반영. 대진·경기일은 운영 확정 홈·원정 표준안. pairsByRound["1"]~"10"은 해당 라운드에서 날짜 열 순(왼쪽→오른쪽)과 같은 팀쌍 순서입니다.';

fs.writeFileSync(fixturesPath, JSON.stringify(j, null, 2), 'utf8');
console.log('Updated', fixturesPath);
