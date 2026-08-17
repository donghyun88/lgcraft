/** 시즌11 라운드 결과 — fixture ID 기반 병렬 로드 + manifest + sessionStorage 캐시 */

export const RESULTS_CACHE_VERSION = 4;

const MANIFEST_URL = 'data/s11/results/manifest.json';

let manifestCache;
let manifestPromise;

export function listFixtureIdsFromFixtures(fixtures, minRound = 1, maxRound = 20) {
  const ids = [];
  for (const rd of fixtures.rounds || []) {
    const r = rd.round;
    if (r == null || r < minRound || r > maxRound) continue;
    for (const m of rd.matchups || []) {
      if (m.id) ids.push(m.id);
    }
  }
  return ids;
}

/** fixtures.rounds 에 정의된 최대 라운드 (없으면 20) */
export function maxScheduledRound(fixtures) {
  let max = 0;
  for (const rd of fixtures?.rounds || []) {
    const r = Number(rd.round) || 0;
    if (r > max) max = r;
  }
  return max > 0 ? max : 20;
}

/** manifest matchResults 에서 파싱한 최대 라운드 번호 */
export function maxResultRoundFromManifest(manifest) {
  let max = 0;
  for (const id of manifest?.matchResults || []) {
    const m = String(id).match(/-r(\d+)/i);
    if (!m) continue;
    const r = Number(m[1]);
    if (Number.isFinite(r) && r > max) max = r;
  }
  return max > 0 ? max : 0;
}

/** manifest가 있으면 실제 존재하는 결과 파일만 반환 (404 방지) */
export function fixtureIdsForRoundRange(fixtures, minRound = 1, maxRound = 20, manifest = null) {
  const ids = listFixtureIdsFromFixtures(fixtures, minRound, maxRound);
  const listed = manifest?.matchResults;
  if (!Array.isArray(listed) || !listed.length) return ids;
  const available = new Set(listed);
  return ids.filter((id) => available.has(id));
}

export async function loadResultsManifest({ force = false } = {}) {
  if (!force && manifestCache !== undefined) return manifestCache;
  if (force) {
    manifestCache = undefined;
    manifestPromise = undefined;
  }
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((data) => {
        manifestCache = data;
        return data;
      });
  }
  return manifestPromise;
}

export function matchupFromPerMatchDoc(doc, fixtureId) {
  if (!doc || !Array.isArray(doc.matchups)) return null;
  // match-input은 보통 matchups[0].fixtureId = 파일명과 동일
  const hit = doc.matchups.find((x) => x.fixtureId === fixtureId);
  if (hit) return hit;
  // 단일 매치 파일이면 fixtureId 누락 시 첫 매치업을 해당 ID로 사용
  if (doc.matchups.length === 1) {
    const only = doc.matchups[0];
    if (only && !only.fixtureId) return { ...only, fixtureId };
  }
  return null;
}

export async function fetchPerMatchResultDoc(fixtureId, { cache = 'no-store' } = {}) {
  const url = `data/s11/results/${fixtureId}.json`;
  const res = await fetch(url, { cache });
  if (!res.ok) return null;
  return res.json();
}

export function buildRoundDocsFromMatchups(fixtures, matchupsByFixtureId) {
  const docs = [];
  for (const rd of fixtures.rounds || []) {
    const roundNum = rd.round;
    if (roundNum == null) continue;
    const ordered = [];
    for (const fm of rd.matchups || []) {
      const mu = matchupsByFixtureId.get(fm.id);
      if (mu) ordered.push(mu);
    }
    if (!ordered.length) continue;
    docs.push({
      schemaVersion: 1,
      season: fixtures.season || 11,
      phase: fixtures.phase || 'first_half',
      round: roundNum,
      matchups: ordered,
    });
  }
  return docs.sort((a, b) => (a.round || 0) - (b.round || 0));
}

function cacheKey(minRound, maxRound, manifest) {
  const stamp =
    manifest?.generatedAt ||
    (Array.isArray(manifest?.matchResults) ? manifest.matchResults.join(',') : '') ||
    'none';
  return `s11-round-docs:v${RESULTS_CACHE_VERSION}:${minRound}-${maxRound}:${stamp}`;
}

function readCache(minRound, maxRound, manifest) {
  try {
    const raw = sessionStorage.getItem(cacheKey(minRound, maxRound, manifest));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(minRound, maxRound, docs, manifest) {
  try {
    sessionStorage.setItem(cacheKey(minRound, maxRound, manifest), JSON.stringify(docs));
  } catch {
    /* quota exceeded */
  }
}

async function fetchMatchupsForFixtureIds(fixtureIds) {
  const matchupsByFixtureId = new Map();
  await Promise.all(
    fixtureIds.map(async (fid) => {
      const doc = await fetchPerMatchResultDoc(fid);
      const mu = matchupFromPerMatchDoc(doc, fid);
      if (mu) matchupsByFixtureId.set(fid, mu);
    }),
  );
  return matchupsByFixtureId;
}

/**
 * fixtures + manifest 기준 병렬 fetch (round-NN.json 프로브 없음).
 * @param {object} fixtures
 * @param {number} maxRound
 * @param {number} [minRound=1]
 * @param {{ useCache?: boolean }} [options]
 */
export async function loadRoundDocsForRange(fixtures, maxRound, minRound = 1, { useCache = true } = {}) {
  const start = Math.max(1, minRound | 0);
  const end = Math.max(start, maxRound | 0);
  const manifest = await loadResultsManifest();
  if (useCache) {
    const cached = readCache(start, end, manifest);
    if (cached) return cached;
  }
  const fixtureIds = fixtureIdsForRoundRange(fixtures, start, end, manifest);
  const matchupsByFixtureId = await fetchMatchupsForFixtureIds(fixtureIds);
  const missing = fixtureIds.filter((fid) => !matchupsByFixtureId.has(fid));
  if (missing.length) {
    console.warn('[s11] 결과 JSON 미로드 (manifest에는 있으나 fetch 실패):', missing);
  }
  const docs = buildRoundDocsFromMatchups(fixtures, matchupsByFixtureId).filter(
    (d) => d.round >= start && d.round <= end,
  );
  // 라운드 일부만 있는 경우(예: 11R m1만)에도 캐시 — missing은 매니페스트 대비 파일 fetch 실패일 때만 문제
  if (useCache && docs.length && !missing.length) writeCache(start, end, docs, manifest);
  return docs;
}

/** 단일 라운드 lazy 로드 (라운드 결과 탭 등) */
export async function loadSingleRoundDoc(fixtures, roundNum) {
  const rd = (fixtures.rounds || []).find((x) => x.round === roundNum);
  if (!rd) return null;
  const manifest = await loadResultsManifest();
  const fixtureIds = fixtureIdsForRoundRange(fixtures, roundNum, roundNum, manifest);
  if (!fixtureIds.length) return null;
  const matchupsByFixtureId = await fetchMatchupsForFixtureIds(fixtureIds);
  const docs = buildRoundDocsFromMatchups(fixtures, matchupsByFixtureId);
  return docs.find((d) => d.round === roundNum) || null;
}

/** fixtures(+결과 매니페스트) 기준으로 시즌 전체 결과 로드 */
export async function loadAllSeasonRoundDocs(fixtures, { useCache = true } = {}) {
  const maxSched = maxScheduledRound(fixtures);
  const manifest = await loadResultsManifest();
  const maxRes = maxResultRoundFromManifest(manifest);
  const maxRound = Math.max(maxSched, maxRes, 20);
  return loadRoundDocsForRange(fixtures, maxRound, 1, { useCache });
}

/** @deprecated loadRoundDocsForRange 사용 */
export async function loadAllRoundResults(maxRound, fixtures, minRound = 1, options = {}) {
  return loadRoundDocsForRange(fixtures, maxRound, minRound, options);
}
