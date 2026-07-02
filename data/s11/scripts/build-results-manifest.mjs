/**
 * data/s11/results/ 의 s11-rNN-mM.json 목록 → manifest.json
 *
 * 사용: node data/s11/scripts/build-results-manifest.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.resolve(__dirname, '../results');
const outPath = path.join(resultsDir, 'manifest.json');

const matchResults = fs
  .readdirSync(resultsDir)
  .filter((name) => /^s11-r\d{2}-m\d+\.json$/.test(name))
  .map((name) => name.replace(/\.json$/, ''))
  .sort();

const manifest = {
  schemaVersion: 1,
  season: 11,
  generatedAt: new Date().toISOString(),
  matchResults,
};

fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outPath} (${matchResults.length} results)`);
