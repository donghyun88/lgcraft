/**
 * manifest + 결과 JSON + fixtures + players → data/s11/coin-usage.json
 *
 * 선행: build-results-manifest.mjs (또는 rebuild-derived-data.mjs)
 * 사용: node data/s11/scripts/build-coin-usage.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildCoinUsageByHalf, coinUsageToJson } from '../../../js/s11-coin-usage.mjs';
import { buildRoundDocsFromMatchups, matchupFromPerMatchDoc } from '../../../js/s11-data-loader.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(__dirname, '..');
const resultsDir = path.join(dataRoot, 'results');
const outPath = path.join(dataRoot, 'coin-usage.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadRoundDocsFromDisk(fixtures, manifest) {
  const ids = Array.isArray(manifest?.matchResults) ? manifest.matchResults : [];
  const matchupsByFixtureId = new Map();
  for (const fid of ids) {
    const filePath = path.join(resultsDir, `${fid}.json`);
    if (!fs.existsSync(filePath)) continue;
    const doc = readJson(filePath);
    const mu = matchupFromPerMatchDoc(doc, fid);
    if (mu) matchupsByFixtureId.set(fid, mu);
  }
  return buildRoundDocsFromMatchups(fixtures, matchupsByFixtureId);
}

const manifestPath = path.join(resultsDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('manifest.json 없음. 먼저 build-results-manifest.mjs 를 실행하세요.');
  process.exit(1);
}

const manifest = readJson(manifestPath);
const fixtures = readJson(path.join(dataRoot, 'fixtures.json'));
const playersData = readJson(path.join(dataRoot, 'players.json'));
const roundDocs = loadRoundDocsFromDisk(fixtures, manifest);
const coinUsage = buildCoinUsageByHalf(fixtures, roundDocs, playersData.players || []);
const out = coinUsageToJson(coinUsage);

fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

const firstCount = Object.keys(out.byHalf.first_half?.players || {}).length;
const secondCount = Object.keys(out.byHalf.second_half?.players || {}).length;
console.log(
  `Wrote ${outPath} (상반기 ${firstCount}명 · maxR ${out.byHalf.first_half?.maxRound || 0}, 하반기 ${secondCount}명 · maxR ${out.byHalf.second_half?.maxRound || 0})`,
);
