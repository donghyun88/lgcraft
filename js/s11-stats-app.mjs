/** 시즌11 통계 차트 */
import {
  loadJson,
  loadAllRoundResults,
  simulateSeason,
  getRaceLetter,
  rosterByDisplayName,
  fixtureRoundMap,
  slotPlanBySlot,
  oppRaceZtp,
  emptyStats,
} from './s11-season-simulate.mjs';

const Chart = globalThis.Chart;

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function compareStandingRow(a, b) {
  if (b.seriesW !== a.seriesW) return b.seriesW - a.seriesW;
  if (b.setW !== a.setW) return b.setW - a.setW;
  if (a.seriesL !== b.seriesL) return a.seriesL - b.seriesL;
  return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
}

function applyRoundDocToAcc(acc, fixtures, doc) {
  const rd = (fixtures.rounds || []).find((x) => x.round === doc.round);
  if (!rd) return;
  const byFixture = new Map((doc.matchups || []).map((m) => [m.fixtureId, m]));
  for (const fm of rd.matchups || []) {
    const mu = byFixture.get(fm.id);
    if (!mu) continue;
    const [tA, tB] = fm.teamIds || [];
    if (!tA || !tB) continue;
    const sw = mu.series && mu.series.winnerTeamIndex;
    if (sw === 1) {
      acc[tA].seriesW++;
      acc[tB].seriesL++;
    } else if (sw === 2) {
      acc[tB].seriesW++;
      acc[tA].seriesL++;
    }
    for (const sl of mu.slots || []) {
      const w = sl.winnerTeamIndex;
      if (w === 1) {
        acc[tA].setW++;
        acc[tB].setL++;
      } else if (w === 2) {
        acc[tB].setW++;
        acc[tA].setL++;
      }
    }
  }
}

function buildTeamAcc(meta, fixtures, roundDocs) {
  const acc = {};
  for (const t of meta.teams) {
    acc[t.id] = { teamId: t.id, name: t.name, seriesW: 0, seriesL: 0, setW: 0, setL: 0 };
  }
  for (const doc of [...roundDocs].sort((a, b) => (a.round || 0) - (b.round || 0))) {
    applyRoundDocToAcc(acc, fixtures, doc);
  }
  return acc;
}

/** 맵별 P/T/Z 상대전적 (시즌10 맵표와 동일 구조, 경기당 1회만 집계) */
function buildMapMatchupStats(fixtures, roundDocs, rosterPlayers) {
  const rosterMap = rosterByDisplayName(rosterPlayers);
  const valid = ['P', 'T', 'Z'];
  const mapStats = {};
  const bumpWin = (map, winnerRace, loserRace) => {
    if (!valid.includes(winnerRace) || !valid.includes(loserRace) || winnerRace === loserRace) return;
    if (!mapStats[map]) {
      mapStats[map] = {
        P: { total: { w: 0, l: 0 }, vsT: { w: 0, l: 0 }, vsZ: { w: 0, l: 0 } },
        T: { total: { w: 0, l: 0 }, vsP: { w: 0, l: 0 }, vsZ: { w: 0, l: 0 } },
        Z: { total: { w: 0, l: 0 }, vsP: { w: 0, l: 0 }, vsT: { w: 0, l: 0 } },
      };
    }
    const m = mapStats[map];
    m[winnerRace].total.w++;
    m[loserRace].total.l++;
    m[winnerRace][`vs${loserRace}`].w++;
    m[loserRace][`vs${winnerRace}`].l++;
  };

  for (const doc of [...roundDocs].sort((a, b) => (a.round || 0) - (b.round || 0))) {
    const rnum = doc.round;
    if (rnum == null) continue;
    const byId = fixtureRoundMap(fixtures, rnum);
    const planBySlot = slotPlanBySlot(fixtures, rnum);
    for (const mu of doc.matchups || []) {
      const fix = byId.get(mu.fixtureId);
      if (!fix) continue;
      for (const sl of [...(mu.slots || [])].sort((a, b) => (a.slot || 0) - (b.slot || 0))) {
        if (sl.winnerTeamIndex !== 1 && sl.winnerTeamIndex !== 2) continue;
        const metaSlot = planBySlot.get(sl.slot) || {};
        if ((metaSlot.format || '1v1') !== '1v1') continue;
        const namesA = (sl.teamA || []).map((r) => (r.displayName || '').trim()).filter(Boolean);
        const namesB = (sl.teamB || []).map((r) => (r.displayName || '').trim()).filter(Boolean);
        if (namesA.length < 1 || namesB.length < 1) continue;
        const n1 = namesA[0];
        const n2 = namesB[0];
        const a = oppRaceZtp(sl.teamA[0], rosterMap, n1);
        const b = oppRaceZtp(sl.teamB[0], rosterMap, n2);
        if (!a || !b || !valid.includes(a) || !valid.includes(b) || a === b) continue;
        const mapName = metaSlot.map || '—';
        if (mapName === '—') continue;
        const team1Won = sl.winnerTeamIndex === 1;
        const wRace = team1Won ? a : b;
        const lRace = team1Won ? b : a;
        bumpWin(mapName, wRace, lRace);
      }
    }
  }
  return mapStats;
}

function raceBadgeHtml(race) {
  const raw = String(race || '').trim().toUpperCase();
  if (!raw) return '';
  const c = raw.charAt(0);
  const safe = c === 'P' || c === 'T' || c === 'Z' || c === 'R' ? c : '';
  if (!safe) return '';
  return `<span class="race-icon race-${safe}" title="${escapeHtml(safe)}">${escapeHtml(safe)}</span>`;
}

function renderLeaderboardCard(title, rows) {
  let html = `<div class="bg-white p-4 rounded-xl border border-zinc-200/80 shadow-sm">
    <h4 class="font-bold text-base mb-3 border-b border-zinc-100 pb-2 text-zinc-800">${escapeHtml(title)}</h4>
    <ul class="space-y-2.5">`;
  rows.forEach((row, index) => {
    const idLine = row.playerId ? escapeHtml(row.playerId) : '—';
    html += `<li class="flex items-start justify-between gap-2 text-sm">
      <span class="flex items-start gap-2 min-w-0 flex-1">
        <span class="font-bold w-6 shrink-0 text-center text-zinc-400 leading-6">${index + 1}</span>
        ${raceBadgeHtml(row.race)}
        <span class="min-w-0">
          <span class="block truncate font-medium leading-snug text-zinc-800">${escapeHtml(row.name)} <span class="font-normal text-zinc-400">(${escapeHtml(row.team)})</span></span>
          <span class="mt-0.5 block truncate font-mono text-[10px] text-zinc-400">${idLine}</span>
        </span>
      </span>
      <div class="shrink-0 text-right">
        <span class="font-bold tabular-nums text-indigo-600">${row.elo}</span>
        <div class="text-[10px] text-zinc-500">${row.w}승 ${row.l}패</div>
      </div>
    </li>`;
  });
  html += '</ul></div>';
  return html;
}

function renderLeaderboards(meta, roster, stateByName, statsByName) {
  const grid = document.getElementById('leaderboard-grid');
  if (!grid) return;
  const teamName = (tid) => meta.teams.find((t) => t.id === tid)?.name || tid;
  const rows = roster
    .filter((p) => p.teamId)
    .map((p) => {
      const dn = (p.displayName || '').trim();
      const st = stateByName.get(dn);
      const elo = st?.elo ?? 1000;
      const stt = statsByName[dn] || emptyStats();
      const w = stt.total.w;
      const l = stt.total.l;
      return {
        name: dn,
        playerId: (p.id && String(p.id).trim()) || '',
        team: teamName(p.teamId),
        elo,
        w,
        l,
        tier: p.tier || '',
        race: getRaceLetter(p),
      };
    });

  let html = '';
  const tiers = [...new Set(rows.map((r) => r.tier).filter(Boolean))].sort();
  for (const tier of tiers) {
    const top = rows.filter((r) => r.tier === tier).sort((a, b) => b.elo - a.elo).slice(0, 5);
    if (top.length) html += renderLeaderboardCard(`${tier} 티어 ELO (상위 5)`, top);
  }
  for (const race of ['P', 'T', 'Z']) {
    const top = rows.filter((r) => r.race === race).sort((a, b) => b.elo - a.elo).slice(0, 5);
    if (top.length) {
      const label = { P: 'Protoss', T: 'Terran', Z: 'Zerg' }[race];
      html += renderLeaderboardCard(`${label} ELO (상위 5)`, top);
    }
  }
  grid.innerHTML = html || '<p class="text-sm text-zinc-500 col-span-full">표시할 데이터가 없습니다.</p>';
}

function getWinRate(w, l) {
  return w + l > 0 ? Math.round((w / (w + l)) * 100) : -1;
}

function rateClass(rate) {
  if (rate > 50) return 'text-emerald-600';
  if (rate < 50 && rate !== -1) return 'text-red-600';
  return '';
}

function renderMapMatchupTable(map, stats) {
  const races = ['T', 'P', 'Z'];
  let tableHtml = `<div class="bg-white p-4 rounded-xl border border-zinc-200/80 shadow-sm overflow-x-auto">
    <h4 class="font-bold text-base mb-3 text-zinc-800">${escapeHtml(map)}</h4>
    <table class="w-full text-center text-xs border-collapse min-w-[640px]">
      <thead class="bg-zinc-50">
        <tr>
          <th class="p-2 border border-zinc-200" rowspan="2">종족</th>
          <th class="p-2 border border-zinc-200" colspan="3">전체(동족전 제외)</th>
          <th class="p-2 border border-zinc-200" colspan="3">vs Terran</th>
          <th class="p-2 border border-zinc-200" colspan="3">vs Protoss</th>
          <th class="p-2 border border-zinc-200" colspan="3">vs Zerg</th>
        </tr>
        <tr class="bg-zinc-50">
          ${Array(4)
            .fill(0)
            .map(() => '<th class="p-1 border border-zinc-200">승</th><th class="p-1 border border-zinc-200">패</th><th class="p-1 border border-zinc-200">승률</th>')
            .join('')}
        </tr>
      </thead><tbody>`;

  for (const race of races) {
    const s = stats[race];
    const totalRate = getWinRate(s.total.w, s.total.l);
    const vsT_Rate = getWinRate(s.vsT?.w, s.vsT?.l);
    const vsP_Rate = getWinRate(s.vsP?.w, s.vsP?.l);
    const vsZ_Rate = getWinRate(s.vsZ?.w, s.vsZ?.l);
    tableHtml += `<tr>
      <td class="p-2 border border-zinc-200 font-bold">${race}</td>
      <td class="p-2 border border-zinc-200">${s.total.w}</td>
      <td class="p-2 border border-zinc-200">${s.total.l}</td>
      <td class="p-2 border border-zinc-200 font-bold ${rateClass(totalRate)}">${totalRate !== -1 ? `${totalRate}%` : '—'}</td>
      ${race === 'T' ? '<td class="p-2 border border-zinc-100 bg-zinc-50" colspan="3"></td>' : `<td class="p-2 border border-zinc-200">${s.vsT.w}</td><td class="p-2 border border-zinc-200">${s.vsT.l}</td><td class="p-2 border border-zinc-200 font-bold ${rateClass(vsT_Rate)}">${vsT_Rate !== -1 ? `${vsT_Rate}%` : '—'}</td>`}
      ${race === 'P' ? '<td class="p-2 border border-zinc-100 bg-zinc-50" colspan="3"></td>' : `<td class="p-2 border border-zinc-200">${s.vsP.w}</td><td class="p-2 border border-zinc-200">${s.vsP.l}</td><td class="p-2 border border-zinc-200 font-bold ${rateClass(vsP_Rate)}">${vsP_Rate !== -1 ? `${vsP_Rate}%` : '—'}</td>`}
      ${race === 'Z' ? '<td class="p-2 border border-zinc-100 bg-zinc-50" colspan="3"></td>' : `<td class="p-2 border border-zinc-200">${s.vsZ.w}</td><td class="p-2 border border-zinc-200">${s.vsZ.l}</td><td class="p-2 border border-zinc-200 font-bold ${rateClass(vsZ_Rate)}">${vsZ_Rate !== -1 ? `${vsZ_Rate}%` : '—'}</td>`}
    </tr>`;
  }
  tableHtml += '</tbody></table></div>';
  return tableHtml;
}

function renderMapTables(mapStats) {
  const el = document.getElementById('map-stats-grid');
  if (!el) return;
  const names = Object.keys(mapStats).sort();
  el.innerHTML = names.length ? names.map((m) => renderMapMatchupTable(m, mapStats[m])).join('') : '<p class="text-sm text-zinc-500">1:1 맵 통계가 없습니다.</p>';
}

/** 맵 표 전체를 합쳐 PvT / TvZ / ZvP 한쪽 종족 기준 승률(동족전 제외, 맵별 표와 동일 원천) */
function aggregateMirrorMatchupsFromMapStats(mapStats) {
  const pVT = { w: 0, l: 0 };
  const tVZ = { w: 0, l: 0 };
  const zVP = { w: 0, l: 0 };
  for (const m of Object.values(mapStats)) {
    pVT.w += m.P?.vsT?.w ?? 0;
    pVT.l += m.P?.vsT?.l ?? 0;
    tVZ.w += m.T?.vsZ?.w ?? 0;
    tVZ.l += m.T?.vsZ?.l ?? 0;
    zVP.w += m.Z?.vsP?.w ?? 0;
    zVP.l += m.Z?.vsP?.l ?? 0;
  }
  const pct = (w, l) => (w + l > 0 ? Math.round((100 * w) / (w + l)) : null);
  const items = [
    { label: 'PvT (프로토스)', w: pVT.w, l: pVT.l, pct: pct(pVT.w, pVT.l) },
    { label: 'TvZ (테란)', w: tVZ.w, l: tVZ.l, pct: pct(tVZ.w, tVZ.l) },
    { label: 'ZvP (저그)', w: zVP.w, l: zVP.l, pct: pct(zVP.w, zVP.l) },
  ].filter((x) => x.w + x.l > 0);
  return {
    labels: items.map((x) => x.label),
    values: items.map((x) => x.pct),
    rows: items.map((x) => ({ w: x.w, l: x.l })),
  };
}

const chartRefs = [];

function destroyCharts() {
  while (chartRefs.length) {
    const c = chartRefs.pop();
    try {
      c.destroy();
    } catch (_) {}
  }
}

function makeStackedTeamSetChart(canvasId, teamRows) {
  const el = document.getElementById(canvasId);
  if (!el || !Chart) return;
  const ctx = el.getContext('2d');
  chartRefs.push(
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: teamRows.map((t) => t.name),
        datasets: [
          {
            label: '세트 승',
            data: teamRows.map((t) => t.setW),
            backgroundColor: 'rgba(16, 185, 129, 0.88)',
            stack: 'sets',
          },
          {
            label: '세트 패',
            data: teamRows.map((t) => t.setL),
            backgroundColor: 'rgba(248, 113, 113, 0.82)',
            stack: 'sets',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } } },
        scales: {
          x: { stacked: true, ticks: { maxRotation: 45, minRotation: 0 } },
          y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    }),
  );
}

function makeMirrorMatchupChart(canvasId, agg) {
  const el = document.getElementById(canvasId);
  if (!el || !Chart) return;
  if (!agg.labels.length) return;
  const ctx = el.getContext('2d');
  const colors = ['rgba(217, 119, 6, 0.88)', 'rgba(2, 132, 199, 0.88)', 'rgba(190, 24, 93, 0.88)'];
  const display = agg.values.map((v) => (v == null ? 0 : v));
  chartRefs.push(
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: agg.labels,
        datasets: [
          {
            label: '승률',
            data: display,
            backgroundColor: agg.labels.map((_, i) => colors[i % colors.length]),
            borderRadius: 6,
            maxBarThickness: 72,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                const i = ctx.dataIndex;
                const { w, l } = agg.rows[i];
                if (w + l === 0) return ' 표본 없음';
                const p = agg.values[i];
                return ` ${w}승 ${l}패${p != null ? ` (${p}%)` : ''}`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (v) => `${v}%`,
            },
          },
        },
      },
    }),
  );
}

function makeHorizontalBar(canvasId, labels, data, label) {
  const el = document.getElementById(canvasId);
  if (!el || !Chart) return;
  const ctx = el.getContext('2d');
  chartRefs.push(
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label, data, backgroundColor: 'rgba(124, 58, 237, 0.8)', borderRadius: 4 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true },
        },
      },
    }),
  );
}

/** 가로 막대, X축 0~100% (승률용) */
function makeHorizontalPercentBar(canvasId, labels, data, metaRows) {
  const el = document.getElementById(canvasId);
  if (!el || !Chart) return;
  const ctx = el.getContext('2d');
  chartRefs.push(
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label, data, backgroundColor: 'rgba(79, 70, 229, 0.82)', borderRadius: 4 }],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                const r = metaRows[ctx.dataIndex];
                if (!r) return '';
                return ` ${r.w}승 ${r.l}패 (${ctx.parsed.x}%)`;
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            ticks: { callback: (v) => `${v}%` },
          },
        },
      },
    }),
  );
}

function make11WinRateLeaders(canvasId, roster, statsByName, minGames) {
  const rows = roster
    .filter((p) => p.teamId)
    .map((p) => {
      const dn = (p.displayName || '').trim();
      const s = statsByName[dn]?.개인전 || { w: 0, l: 0 };
      const g = s.w + s.l;
      const pct = g > 0 ? (100 * s.w) / g : -1;
      return { dn, w: s.w, l: s.l, g, pct };
    })
    .filter((x) => x.g >= minGames)
    .sort((a, b) => {
      if (b.pct !== a.pct) return b.pct - a.pct;
      return b.g - a.g;
    })
    .slice(0, 12);
  if (!rows.length) return;
  makeHorizontalPercentBar(
    canvasId,
    rows.map((r) => r.dn),
    rows.map((r) => Math.round(r.pct)),
    rows,
  );
}

function makeEloNetGainLeaders(canvasId, roster, stateByName, statsByName) {
  const rows = roster
    .filter((p) => p.teamId)
    .map((p) => {
      const dn = (p.displayName || '').trim();
      const elo = stateByName.get(dn)?.elo ?? 1000;
      const t = statsByName[dn]?.total || { w: 0, l: 0 };
      const g = t.w + t.l;
      return { dn, net: elo - 1000, g };
    })
    .filter((x) => x.g >= 1)
    .sort((a, b) => b.net - a.net)
    .slice(0, 12);
  if (!rows.length) return;
  const el = document.getElementById(canvasId);
  if (!el || !Chart) return;
  const ctx = el.getContext('2d');
  chartRefs.push(
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.dn),
        datasets: [
          {
            label: 'ELO 순증감',
            data: rows.map((r) => r.net),
            backgroundColor: rows.map((r) =>
              r.net >= 0 ? 'rgba(5, 150, 105, 0.85)' : 'rgba(220, 38, 38, 0.8)',
            ),
            borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label(ctx) {
                const r = rows[ctx.dataIndex];
                return ` 시작 1000 대비 ${r.net >= 0 ? '+' : ''}${r.net} (경기 ${r.g}판 반영)`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { precision: 0 },
          },
        },
      },
    }),
  );
}

function buildCharts(meta, fixtures, roundDocs, roster, stateByName, statsByName, mapStats) {
  destroyCharts();
  if (!Chart) {
    console.warn('Chart.js 없음');
    return;
  }

  const acc = buildTeamAcc(meta, fixtures, roundDocs);
  const teamRows = Object.values(acc).sort(compareStandingRow);
  makeStackedTeamSetChart('chart-team-setwl', teamRows);

  const agg = aggregateMirrorMatchupsFromMapStats(mapStats);
  makeMirrorMatchupChart('chart-mirror-mu', agg);

  make11WinRateLeaders('chart-11-wr', roster, statsByName, 4);
  makeEloNetGainLeaders('chart-elo-net', roster, stateByName, statsByName);

  const topPlayers = roster
    .filter((p) => p.teamId)
    .map((p) => {
      const dn = (p.displayName || '').trim();
      const elo = stateByName.get(dn)?.elo ?? 1000;
      return { dn, elo };
    })
    .sort((a, b) => b.elo - a.elo)
    .slice(0, 15);
  makeHorizontalBar(
    'chart-top-elo',
    topPlayers.map((x) => x.dn),
    topPlayers.map((x) => x.elo),
    'ELO',
  );
}

async function main() {
  const loading = document.getElementById('loading');
  const mainEl = document.getElementById('main-content');
  const errEl = document.getElementById('load-err');
  try {
    const [meta, playersData, fixtures] = await Promise.all([
      loadJson('data/s11/meta.json'),
      loadJson('data/s11/players.json'),
      loadJson('data/s11/fixtures.json'),
    ]);
    const maxR = Math.max(...(fixtures.rounds || []).map((r) => r.round || 0), 0);
    const roundDocs = await loadAllRoundResults(maxR || 10, fixtures);
    const roster = playersData.players || [];
    const { statsByName, stateByName } = simulateSeason(fixtures, roundDocs, roster);

    renderLeaderboards(meta, roster, stateByName, statsByName);
    const mapStats = buildMapMatchupStats(fixtures, roundDocs, roster);
    renderMapTables(mapStats);
    buildCharts(meta, fixtures, roundDocs, roster, stateByName, statsByName, mapStats);

    loading.classList.add('hidden');
    mainEl.classList.remove('hidden');
  } catch (e) {
    console.error(e);
    loading.classList.add('hidden');
    errEl.textContent = e.message || String(e);
    errEl.classList.remove('hidden');
  }
}

main();
