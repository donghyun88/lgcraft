/**
 * 시즌11 티어 명단 + 시즌10 s10/index.html 로스터 매칭 → ../players.json 생성
 *
 * 중요: 각 선수의 **`tier` / `tierSheetMainRace` / `raceDefault` 는 아래 `TIER_ROWS`(시즌11 배정 표)만 따릅니다.**
 * 시즌10 `PLAYERS_META`의 **`티어`(휴/애/아 등)** 필드는 사용하지 않습니다. (이름·id·종족만 참고)
 *
 * 티어 표 규칙: 같은 티어 블록 안에서
 *   1행(주황)=메인 저그, 2행(파랑)=메인 테란, 3행(노랑)=메인 토스
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const indexHtml = fs.readFileSync(path.resolve(__dirname, '../../../s10/index.html'), 'utf8');

function extractLegacyPlayers(html) {
  const marker = 'const PLAYERS_META = ';
  const start = html.indexOf(marker);
  if (start === -1) throw new Error('PLAYERS_META not found');
  let i = html.indexOf('[', start);
  let depth = 0;
  const begin = i;
  for (; i < html.length; i++) {
    const c = html[i];
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  return JSON.parse(html.slice(begin, i));
}

const legacy = extractLegacyPlayers(indexHtml);
/** @type {Record<string, { id: string, 종족: string }>} */
const byName = {};
for (const p of legacy) {
  byName[p.이름] = { id: p.id, 종족: p.종족 };
}

/**
 * 시즌11 티어 표 — 각 키(Z/T/P)가 표에서의 행(메인 종족)과 동일
 */
const TIER_ROWS = {
  갓: {
    Z: ['남상원', '장민수', '정용석', '이대연', '오택삼', '이영길', '안정한'],
    T: ['황윤도', '박재창', '김종성', '박광명', '이철훈', '한민석'],
    P: ['강응선', '김주한', '황윤호'],
  },
  킹: {
    Z: ['이봉철', '박진욱', '최상균', '최재광', '변정식', '김재현', '전성민', '정재영', '주효진','안태영'],
    T: ['이윤종', '김인경', '구선웅', '김경식'],
    P: ['김동현', '조승일', '전은후', '김태훈'],
  },
  휴먼: {
    Z: ['강구산', '황찬종', '장대원', '김재준', '이창언', '김도현', '김민중'],
    T: ['임호진', '경제진'],
    P: ['남정석', '박정진', '조현용', '강성구', '명동주', '최성진', '이형섭', '권혁준','변진황'],
  },
  애니멀: {
    Z: ['공동건', '공동현', '황진영', '김현기', '정현우', '우병진', '유태욱', '권오선'],
    T: ['최화용', '손정곤', '정주오', '김태수'],
    P: ['김태준', '조항용', '염규상', '황정동', '한규호', '유윤실'],
  },
  아메바: {
    Z: ['김도완', '이경성', '이윤호', '오석현', '임채현', '이동균', '심현도'],
    T: ['이웅배', '이태연', '김경철'],
    P: ['최수명', '설재근', '고성근', '양시찬', '양현철'],
  },
};

function legacyRaceToDefault(종족) {
  if (종족 === 'Z' || 종족 === 'T' || 종족 === 'P' || 종족 === 'R') return 종족;
  if (종족 === 'PT') return 'P';
  if (종족 === 'ZP') return 'P';
  return null;
}

/** 표의 메인 종족 행과 일치 — 종족 픽 규칙만 추가 */
const SPECIAL_RACE = {
  최상균: {
    raceVsOpponent: { Z: 'P' },
    notes: '메인 저그. 저그 상대일 때만 토스.',
  },
  황정동: {
    raceVsOpponent: { P: 'Z' },
    notes: '메인 토스. 토스 상대일 때만 저그.',
  },
  권혁준: {
    raceVsOpponent: { Z: 'T' },
    notes: '메인 토스. 저그 상대일 때만 테란.',
  },
};

/** 시즌 간 종족 변경 등 메모 (SPECIAL_RACE.notes 가 있으면 그쪽이 우선) */
const PLAYER_NOTES = {
  정주오: '시즌11부터 테란으로 변경 참가(시즌10 기록과 등록 종족이 다름).',
};

function hashId(name) {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h) ^ name.charCodeAt(i);
  return 's11_' + (h >>> 0).toString(16);
}

const usedIds = new Set();
function uniqueId(base) {
  let id = base;
  let n = 0;
  while (usedIds.has(id)) id = `${base}_${++n}`;
  usedIds.add(id);
  return id;
}

const players = [];

for (const [tier, bands] of Object.entries(TIER_ROWS)) {
  for (const tierSheetMainRace of ['Z', 'T', 'P']) {
    const names = bands[tierSheetMainRace];
    for (const displayName of names) {
      let legacyHit = byName[displayName];

      const special = SPECIAL_RACE[displayName];
      const raceDefault = tierSheetMainRace;
      const raceVsOpponent = special?.raceVsOpponent;

      const legacyR = legacyRaceToDefault(legacyHit?.종족 ?? '');
      if (legacyHit && legacyR && legacyR !== tierSheetMainRace) {
        console.warn(
          `[시즌10≠표 행 메인종족] ${displayName}: 시즌10 단일종족=${legacyR}, 시즌11 표 행=${tierSheetMainRace} → 표 행을 raceDefault 로 사용`,
        );
      }

      const entry = {
        id: legacyHit ? uniqueId(legacyHit.id) : uniqueId(hashId(displayName)),
        displayName,
        teamId: null,
        tier,
        tierSheetMainRace,
        raceDefault,
        aliases: [],
      };
      if (raceVsOpponent) entry.raceVsOpponent = raceVsOpponent;
      if (special?.notes) entry.raceNotes = special.notes;
      else if (PLAYER_NOTES[displayName]) entry.raceNotes = PLAYER_NOTES[displayName];

      players.push(entry);
    }
  }
}

players.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko'));

const out = {
  schemaVersion: 1,
  season: 11,
  notes:
    '티어 표에서 같은 티어 블록의 1행=메인저그(Z), 2행=메인테란(T), 3행=메인토스(P). tierSheetMainRace 와 raceDefault 가 동일합니다. teamId 는 팀 확정 후 meta.json 의 t1~t6 로 채웁니다. raceVsOpponent 는 개인전 상대 종족(T/Z/P)별 픽.',
  players,
};

fs.writeFileSync(path.join(root, 'players.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('Wrote players.json count=', players.length);
