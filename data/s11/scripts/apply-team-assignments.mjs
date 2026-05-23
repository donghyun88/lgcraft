/**
 * 시즌11 팀 배정표 반영 → ../players.json, ../meta.json 갱신
 * 실행: node apply-team-assignments.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

/** displayName 기준 팀 id */
const TEAM_BY_NAME = {
  이대연: 't1',
  황윤도: 't1',
  박진욱: 't1',
  전성민: 't1',
  전은후: 't1',
  이창언: 't1',
  이형섭: 't1',
  임호진: 't1',
  황정동: 't1',
  한규호: 't1',
  정현우: 't1',
  최수명: 't1',
  이경성: 't1',
  이동균: 't1',
  박재창: 't2',
  이영길: 't2',
  정용석: 't2',
  구선웅: 't2',
  변정식: 't2',
  최상균: 't2',
  권혁준: 't2',
  강성구: 't2',
  장대원: 't2',
  공동현: 't2',
  황진영: 't2',
  조항용: 't2',
  김도완: 't2',
  이태연: 't2',
  김주한: 't3',
  박광명: 't3',
  최재광: 't3',
  김태훈: 't3',
  김인경: 't3',
  황찬종: 't3',
  최성진: 't3',
  강구산: 't3',
  유윤실: 't3',
  권오선: 't3',
  최화용: 't3',
  양현철: 't3',
  고성근: 't3',
  오석현: 't3',
  안정한: 't4',
  한민석: 't4',
  장민수: 't4',
  안태영: 't4',
  이윤종: 't4',
  김재현: 't4',
  김도현: 't4',
  경제진: 't4',
  조현용: 't4',
  우병진: 't4',
  김태수: 't4',
  염규상: 't4',
  지주영: 't4',
  김경철: 't4',
  심현도: 't4',
  이철훈: 't5',
  황윤호: 't5',
  남상원: 't5',
  이봉철: 't5',
  김동현: 't5',
  정재영: 't5',
  변진황: 't5',
  김민중: 't5',
  김재준: 't5',
  공동건: 't5',
  정주오: 't5',
  유태욱: 't5',
  양시찬: 't5',
  이윤호: 't5',
  이웅배: 't5',
  김종성: 't6',
  강응선: 't6',
  오택삼: 't6',
  김경식: 't6',
  조승일: 't6',
  주효진: 't6',
  박정진: 't6',
  남정석: 't6',
  명동주: 't6',
  김태준: 't6',
  김현기: 't6',
  손정곤: 't6',
  설재근: 't6',
  임채현: 't6',
};

const CAPTAINS = new Set(['전은후', '최상균', '강구산', '장민수', '김재준', '손정곤']);

const NEW_PLAYERS = [
  {
    id: 's11_jijuyeong',
    displayName: '지주영',
    teamId: 't4',
    tier: '아메바',
    tierSheetMainRace: 'P',
    raceDefault: 'P',
    aliases: [],
    isCaptain: false,
    raceNotes: '팀 배정표 기준 추가(총원 86). 아메바 티어, 메인 토스.',
  },
];

function resolveTeamId(p) {
  let tid = TEAM_BY_NAME[p.displayName];
  if (tid) return tid;
  for (const a of p.aliases || []) {
    tid = TEAM_BY_NAME[a];
    if (tid) return tid;
  }
  return null;
}

const data = JSON.parse(fs.readFileSync(path.join(root, 'players.json'), 'utf8'));

for (const p of data.players) {
  const tid = resolveTeamId(p);
  if (tid) {
    p.teamId = tid;
    p.isCaptain = CAPTAINS.has(p.displayName);
  } else {
    p.teamId = null;
    delete p.isCaptain;
  }
}

for (const np of NEW_PLAYERS) {
  if (!data.players.some((x) => x.id === np.id)) {
    data.players.push({ ...np });
  }
}

const missingTeam = data.players.filter((p) => !p.teamId);
data.players.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'));

data.notes = [
  typeof data.notes === 'string' ? data.notes : '',
  '팀 배정표 반영: teamId t1~t6 = 1~6팀. isCaptain = 팀장.',
]
  .filter(Boolean)
  .join(' ');

fs.writeFileSync(path.join(root, 'players.json'), JSON.stringify(data, null, 2), 'utf8');

const meta = JSON.parse(fs.readFileSync(path.join(root, 'meta.json'), 'utf8'));
meta.teams = [
  { id: 't1', name: '원펀치', short: '1Punch', playerCount: 14, mainCaptain: '이대연' },
  { id: 't2', name: '투파이터', short: '2Fighters', playerCount: 14, mainCaptain: '공동현' },
  { id: 't3', name: '3성', short: '3Star', playerCount: 14, mainCaptain: '최성진' },
  { id: 't4', name: '영혼스타즈', short: 'Soul', playerCount: 15, mainCaptain: '안태영' },
  { id: 't5', name: '팀택틱스', short: 'TX', playerCount: 15, mainCaptain: '양시찬' },
  { id: 't6', name: '6킹즈', short: '6Kings', playerCount: 14, mainCaptain: '김종성' },
];
meta.notes = [
  't1~t6 = 팀 id. 팀장은 players.json 의 isCaptain.',
  'fixtures.json 의 t1~t6 대진은 팀 번호와 동일하게 쓰면 됩니다.',
  'name = 팀명, short = 팀 아이디(영문).',
];
fs.writeFileSync(path.join(root, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

console.log('Players:', data.players.length);
console.log('No teamId:', missingTeam.map((p) => p.displayName).join(', ') || '(none)');
