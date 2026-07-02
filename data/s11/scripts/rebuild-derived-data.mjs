/**
 * 결과 manifest + coin-usage.json 일괄 재생성
 *
 * 결과 JSON을 results/ 에 추가·수정한 뒤 실행하세요.
 * 사용: node data/s11/scripts/rebuild-derived-data.mjs
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

function run(script) {
  const r = spawnSync(node, [path.join(__dirname, script)], { stdio: 'inherit', cwd: __dirname });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('build-results-manifest.mjs');
run('build-coin-usage.mjs');
console.log('Done: manifest.json + coin-usage.json');
