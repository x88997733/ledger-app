// Vercel serverless function: 代抓台股收盤價／即時價，避免瀏覽器 CORS 問題
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return n > 0 ? n : null };
async function getJSON(url, ms = 9000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t) }
}
module.exports = async (req, res) => {
  const codes = String((req.query && req.query.codes) || '').split(',').map(s => s.trim().toUpperCase()).filter(s => /^[0-9A-Z]{3,8}$/.test(s)).slice(0, 40);
  if (!codes.length) { res.status(400).json({ error: 'no codes' }); return }
  const px = {}, errs = [];
  const want = new Set(codes);
  await Promise.all([
    getJSON('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL').then(a => a.forEach(r => { if (want.has(r.Code)) { const p = num(r.ClosingPrice); if (p) px[r.Code] = { p, at: r.Date, src: 'twse' } } })).catch(e => errs.push('twse:' + e.message)),
    getJSON('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes').then(a => a.forEach(r => { const c = r.SecuritiesCompanyCode; if (want.has(c) && !px[c]) { const p = num(r.Close); if (p) px[c] = { p, src: 'tpex' } } })).catch(e => errs.push('tpex:' + e.message)),
  ]);
  const miss = codes.filter(c => !px[c]);
  await Promise.all(miss.map(async c => {
    for (const suf of ['.TW', '.TWO']) {
      try {
        const j = await getJSON('https://query1.finance.yahoo.com/v8/finance/chart/' + c + suf + '?range=5d&interval=1d');
        const m = j && j.chart && j.chart.result && j.chart.result[0] && j.chart.result[0].meta;
        const p = m && num(m.regularMarketPrice);
        if (p) { px[c] = { p, src: 'yahoo' }; return }
      } catch (e) { errs.push('yahoo ' + c + suf + ':' + e.message) }
    }
  }));
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).json({ px, errs });
};
