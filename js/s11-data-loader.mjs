/** 시즌11 라운드 결과 — fixture ID 기반 병렬 로드 + manifest + sessionStorage 캐시 */

export const RESULTS_CACHE_VERSION = 2;

const MANIFEST_URL = 'data/s11/results/manifest.json';

let manifestCache;
let manifestPromise;

export function listFixtureIdsFromFixtures(fixtures, minRound = 1, maxRound = 10) {
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

/** manifest가 있으면 실제 존재하는 결과 파일만 반환 (404 방지) */
export function fixtureIdsForRoundRange(fixtures, minRound = 1, maxRound = 10, manifest = null) {
  const ids = listFixtureIdsFromFixtures(fixtures, minRound, maxRound);
  const listed = manifest?.matchResults;
  if (!Array.isArray(listed) || !listed.length) return ids;
  const available = new Set(listed);
  return ids.filter((id) => available.has(id));
}

export async function loadResultsManifest() {
  if (manifestCache !== undefined) return manifestCache;
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL, { cache: 'default' })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
  }
  manifestCache = await manifestPromise;
  return manifestCache;
}

export function matchupFromPerMatchDoc(doc, fixtureId) {
  if (!doc || !Array.isArray(doc.matchups)) return null;
  return doc.matchups.find((x) => x.fixtureId === fixtureId) || null;
}

export async function fetchPerMatchResultDoc(fixtureId, { cache = 'default' } = {}) {
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

function cacheKey(minRound, maxRound) {
  return `s11-round-docs:v${RESULTS_CACHE_VERSION}:${minRound}-${maxRound}`;
}

function readCache(minRound, maxRound) {
  try {
    const raw = sessionStorage.getItem(cacheKey(minRound, maxRound));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(minRound, maxRound, docs) {
  try {
    sessionStorage.setItem(cacheKey(minRound, maxRound), JSON.stringify(docs));
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
  if (useCache) {
    const cached = readCache(start, end);
    if (cached) return cached;
  }
  const manifest = await loadResultsManifest();
  const fixtureIds = fixtureIdsForRoundRange(fixtures, start, end, manifest);
  const matchupsByFixtureId = await fetchMatchupsForFixtureIds(fixtureIds);
  const docs = buildRoundDocsFromMatchups(fixtures, matchupsByFixtureId).filter(
    (d) => d.round >= start && d.round <= end,
  );
  if (useCache && docs.length) writeCache(start, end, docs);
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

/** @deprecated loadRoundDocsForRange 사용 */
export async function loadAllRoundResults(maxRound, fixtures, minRound = 1, options = {}) {
  return loadRoundDocsForRange(fixtures, maxRound, minRound, options);
}
