/**
 * results/s11-r01-m1.json(첫 경기일 열 대전) + fixtures 1라운드 → results/round-01.sample.json
 * 실행: node merge-round01-sample.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'fixtures.json'), 'utf8'));
const r1 = fixtures.rounds.find((x) => x.round === 1);
if (!r1) throw new Error('round 1 not found');

const m1Path = path.join(root, 'results', 's11-r01-m1.json');
const m1 = JSON.parse(fs.readFileSync(m1Path, 'utf8'));
const fromFile = m1.matchups?.[0];
if (!fromFile || fromFile.fixtureId !== 's11-r01-m1') throw new Error('s11-r01-m1.json needs matchups[0] fixtureId s11-r01-m1');

function nFmt(f) {
  if (f === '2v2') return 2;
  if (f === '3v3') return 3;
  return 1;
}
function emptyR(n) {
  return Array.from({ length: n }, () => ({ displayName: '', race: null }));
}
function emptyMu(fid, plan) {
  return {
    fixtureId: fid,
    series: {
      winnerTeamIndex: null,
      setScoreTeamA: null,
      setScoreTeamB: null,
      decidedBy: 'sets',
      notes: '',
      mvp: null,
    },
    playedOrder: null,
    slots: (plan || []).map((sp) => ({
      slot: sp.slot,
      winnerTeamIndex: null,
      teamA: emptyR(nFmt(sp.format)),
      teamB: emptyR(nFmt(sp.format)),
    })),
  };
}

const plan = r1.slotPlan || [];
const m2 = r1.matchups.find((m) => m.id === 's11-r01-m2');
const m3 = r1.matchups.find((m) => m.id === 's11-r01-m3');
if (!m2 || !m3) throw new Error('matchups m2/m3');

const out = {
  schemaVersion: 1,
  season: 11,
  phase: m1.phase || 'first_half',
  round: 1,
  recordedAt: m1.recordedAt || new Date().toISOString().slice(0, 10),
  author: m1.author || '샘플',
  notes:
    '1라운드 3대전 형식 샘플. s11-r01-m1은 해당 라 첫 경기일 열 대전(tools/match-input 등) 실제 입력, s11-r01-m2·m3는 빈 슬롯(추가 입력 시 채움).',
  matchups: [fromFile, emptyMu(m2.id, plan), emptyMu(m3.id, plan)],
};

fs.writeFileSync(path.join(root, 'results', 'round-01.sample.json'), JSON.stringify(out, null, 2), 'utf8');
console.log('Wrote results/round-01.sample.json');
