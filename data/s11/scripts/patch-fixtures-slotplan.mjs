/**
 * One-off / 재실행: fixtures.json 라운드별 slotPlan을 운영 확정 일정표로 갱신
 * 실행: node patch-fixtures-slotplan.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesPath = path.resolve(__dirname, '../fixtures.json');

const j = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

/** 1~7경기 × 라운드 1~10 (열). 3라운드 1경기 원문 '캉' → 킹 */
const tierRows = [
  ['애니멀', '휴먼', '킹', '갓', '아메바', '애니멀', '휴먼', '킹', '갓', '아메바'],
  ['휴먼', '킹', '갓', '아메바', '애니멀', '휴먼', '킹', '갓', '아메바', '애니멀'],
  [7, 8, 5, 6, 4, 4, 6, 7, 8, 5],
  ['킹', '갓', '아메바', '애니멀', '휴먼', '킹', '갓', '아메바', '애니멀', '휴먼'],
  ['갓', '아메바', '애니멀', '휴먼', '킹', '갓', '아메바', '애니멀', '휴먼', '킹'],
  [8, 7, 10, 9, 11, 11, 9, 8, 7, 10],
  ['아메바', '애니멀', '휴먼', '킹', '갓', '아메바', '애니멀', '휴먼', '킹', '갓'],
];

const mapRows = [
  ['애티튜드', '녹아웃', '폴스타', '제인도', '옥타곤', '폴리포이드', '매치포인트', '애티튜드', '녹아웃', '투혼'],
  ['투혼', '옥타곤', '폴리포이드', '녹아웃', '폴스타', '제인도', '실피드', '투혼', '매치포인트', '폴스타'],
  ['뱀파이어', '한니발', '뱀파이어', '한니발', '뱀파이어', '한니발', '뱀파이어', '한니발', '뱀파이어', '한니발'],
  ['녹아웃', '폴스타', '투혼', '옥타곤', '폴리포이드', '매치포인트', '애티튜드', '제인도', '실피드', '실피드'],
  ['옥타곤', '애티튜드', '녹아웃', '폴스타', '제인도', '실피드', '폴리포이드', '매치포인트', '애티튜드', '폴리포이드'],
  ['헌터', '빠무', '헌터', '빠무', '헌터', '빠무', '헌터', '빠무', '헌터', '빠무'],
  ['실피드', '투혼', '옥타곤', '폴리포이드', '매치포인트', '폴스타', '제인도', '실피드', '투혼', '옥타곤'],
];

function slotPlanForRound(r) {
  const note1v1 = '개인전: race 생략 시 등록종족';
  const cap2 = tierRows[2][r];
  const cap3 = tierRows[5][r];
  return [
    { slot: 1, format: '1v1', tierLine: tierRows[0][r], map: mapRows[0][r], notes: note1v1 },
    { slot: 2, format: '1v1', tierLine: tierRows[1][r], map: mapRows[1][r], notes: note1v1 },
    {
      slot: 3,
      format: '2v2',
      tierLine: null,
      map: mapRows[2][r],
      pointCapPerTeam: cap2,
      notes: `각 팀 출전 2명의 티어 포인트 합 ≤ ${cap2}`,
    },
    { slot: 4, format: '1v1', tierLine: tierRows[3][r], map: mapRows[3][r], notes: note1v1 },
    { slot: 5, format: '1v1', tierLine: tierRows[4][r], map: mapRows[4][r], notes: note1v1 },
    {
      slot: 6,
      format: '3v3',
      tierLine: null,
      map: mapRows[5][r],
      pointCapPerTeam: cap3,
      notes: `각 팀 출전 3명의 티어 포인트 합 ≤ ${cap3}`,
    },
    { slot: 7, format: '1v1', tierLine: tierRows[6][r], map: mapRows[6][r], notes: note1v1 },
  ];
}

for (let i = 0; i < 10; i++) {
  const roundObj = j.rounds[i];
  if (roundObj.round !== i + 1) throw new Error(`round order: index ${i} has round ${roundObj.round}`);
  roundObj.slotPlan = slotPlanForRound(i);
}

j.mapRotation1v1 = [
  '애티튜드',
  '녹아웃',
  '폴스타',
  '제인도',
  '옥타곤',
  '폴리포이드',
  '매치포인트',
  '투혼',
  '실피드',
];
j.teamPlayMaps = {
  oddRounds: { '2v2': '뱀파이어', '3v3': '헌터' },
  evenRounds: { '2v2': '한니발', '3v3': '빠무' },
  _note: '라운드별 정확한 맵·상한은 rounds[].slotPlan 참고. 홀/짝 라운드 팀플 맵 교대 요약.',
};
j.matchupPreset.description =
  '1~10라운드 팀대전 3경기(t6 포함). 라운드별 1~7경기 티어·맵·2v2/3v3 포인트 상한은 운영 확정 일정 반영. 대진·경기일 문구는 scripts/apply-official-schedule-text.mjs 실행 결과를 따릅니다.';

fs.writeFileSync(fixturesPath, JSON.stringify(j, null, 2), 'utf8');
console.log('Updated', fixturesPath);
