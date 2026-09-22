// Single self-contained HTML page, no bundler, no new dependency -- fetches
// /api/data and re-renders every 3s. Kept as one file deliberately: this
// is a local dev tool a developer runs for a few minutes, not a product
// that needs a build pipeline, and adding one would contradict the whole
// "zero required cloud dependency, reduce engineering work" ethos.
export function renderPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>maskea Dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: #0a0a0f; color: #e4e4e7; padding: 24px;
  }
  h1 { font-size: 18px; font-weight: 700; margin: 0 0 4px; }
  .subtitle { color: #71717a; font-size: 13px; margin: 0 0 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .card { background: #16161d; border: 1px solid #27272a; border-radius: 10px; padding: 16px; }
  .card .label { font-size: 11px; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
  .card .value { font-size: 24px; font-weight: 700; }
  .card .value.ok { color: #4ade80; }
  .card .value.warn { color: #fbbf24; }
  .card .value.bad { color: #f87171; }
  .section { background: #16161d; border: 1px solid #27272a; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .section h2 { font-size: 13px; font-weight: 700; margin: 0 0 12px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; color: #71717a; font-weight: 600; padding: 6px 8px; border-bottom: 1px solid #27272a; }
  td { padding: 6px 8px; border-bottom: 1px solid #1f1f23; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge.ok { background: #14532d; color: #4ade80; }
  .badge.fail { background: #450a0a; color: #f87171; }
  .badge.redact { background: #422006; color: #fbbf24; margin-left: 4px; }
  .cloud-cta {
    background: linear-gradient(135deg, #1e1b4b, #16161d); border: 1px solid #312e81;
    border-radius: 10px; padding: 16px; display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 16px;
  }
  .cloud-cta .text { font-size: 13px; }
  .cloud-cta .text strong { display: block; font-size: 14px; margin-bottom: 2px; }
  .cloud-cta button {
    background: #4f46e5; color: white; border: none; border-radius: 6px; padding: 8px 16px;
    font-size: 13px; font-weight: 600; cursor: not-allowed; opacity: 0.6;
  }
  .empty { color: #71717a; font-size: 13px; padding: 24px; text-align: center; }
  .bar-chart { display: flex; align-items: flex-end; gap: 3px; height: 60px; margin-top: 8px; }
  .bar { background: #4f46e5; border-radius: 2px 2px 0 0; flex: 1; min-height: 2px; }
</style>
</head>
<body>
  <h1>maskea Dashboard</h1>
  <p class="subtitle">Local only — reads <code>.maskea/</code> directly, nothing leaves this machine.</p>

  <div class="cloud-cta">
    <div class="text">
      <strong>See this across every project?</strong>
      Maskea Cloud syncs this data across your team. Not live yet.
    </div>
    <button disabled>Coming soon</button>
  </div>

  <div class="grid" id="cards"></div>

  <div class="section">
    <h2>Spend, last 30 days</h2>
    <div class="bar-chart" id="spend-chart"></div>
  </div>

  <div class="section">
    <h2>Recent Requests</h2>
    <table id="requests-table"><thead><tr><th>Time</th><th>Status</th><th>Latency</th><th>Redactions</th></tr></thead><tbody></tbody></table>
  </div>

<script>
function fmtCost(n) { return '$' + n.toFixed(4); }
function fmtTime(iso) { return new Date(iso).toLocaleTimeString(); }

function scoreClass(score) { return score >= 90 ? 'ok' : score >= 70 ? 'warn' : 'bad'; }

async function render() {
  const res = await fetch('/api/data');
  const data = await res.json();

  const cards = document.getElementById('cards');
  if (data.totals.calls === 0) {
    cards.innerHTML = '<div class="empty" style="grid-column: 1/-1;">No calls recorded yet. Wrap a call with maskea.wrap(...) and refresh.</div>';
  } else {
    cards.innerHTML = [
      ['Health Score', data.healthScore + '/100', scoreClass(data.healthScore)],
      ['Total Calls', data.totals.calls, ''],
      ['Retries Saved', data.totals.retriesSaved, 'ok'],
      ['Secrets Removed', data.totals.secretsRemoved, data.totals.secretsRemoved > 0 ? 'warn' : ''],
      ['PII Removed', data.totals.piiRemoved, data.totals.piiRemoved > 0 ? 'warn' : ''],
      ['Avg Latency', Math.round(data.totals.avgLatencyMs) + 'ms', ''],
      ['Spend (month)', fmtCost(data.spend.monthToDate), ''],
      ['Budget Cap', data.spend.monthlyCap !== null ? '$' + data.spend.monthlyCap : 'not set', ''],
    ].map(([label, value, cls]) =>
      '<div class="card"><div class="label">' + label + '</div><div class="value ' + cls + '">' + value + '</div></div>'
    ).join('');
  }

  const chart = document.getElementById('spend-chart');
  if (data.spend.byDay.length === 0) {
    chart.innerHTML = '<div class="empty">No spend recorded yet.</div>';
  } else {
    const max = Math.max(...data.spend.byDay.map(d => d.costUsd), 0.0001);
    chart.innerHTML = data.spend.byDay.map(d =>
      '<div class="bar" style="height:' + Math.max(2, (d.costUsd / max) * 60) + 'px" title="' + d.date + ': ' + fmtCost(d.costUsd) + '"></div>'
    ).join('');
  }

  const tbody = document.querySelector('#requests-table tbody');
  if (data.requests.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No requests yet.</td></tr>';
  } else {
    tbody.innerHTML = data.requests.map(r => {
      const badges = [];
      if (r.secretHits && r.secretHits.length) badges.push('<span class="badge redact">secrets</span>');
      if (r.piiHits && r.piiHits.length) badges.push('<span class="badge redact">PII</span>');
      return '<tr><td>' + fmtTime(r.timestamp) + '</td><td><span class="badge ' + (r.ok ? 'ok">ok' : 'fail">failed') + '</span></td><td>' + r.durationMs + 'ms</td><td>' + (badges.join('') || '—') + '</td></tr>';
    }).join('');
  }
}

render();
setInterval(render, 3000);
</script>
</body>
</html>`
}
