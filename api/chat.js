// Vercel serverless function：記帳本 AI 助手。金鑰只放在 Vercel 環境變數，不會出現在網頁裡。
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bkoifruqixrrssopivyx.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_rznlz_sSW-ymsZUp2enM3w_qqb5cUHw';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

const SYSTEM = `你是使用者個人記帳本裡的記帳助手，用繁體中文、口語親切、簡短回答。
你可以看到系統附上的「帳務摘要」（薪資分配比例、專案對應、分類對應、最近幾個月各分配帳戶的實際花費）。
原則：
1. 先討論、再調整。使用者問「怎麼調」時，先根據數字說明現況與建議，並說明理由；使用者同意或明確要求「幫我改」時，才呼叫工具提出調整。
2. 工具只是「提出調整」，使用者會在畫面上按確定才會生效，所以不用再問「要不要套用」，說明你提了什麼即可。
3. 不要編造摘要裡沒有的數字。資料不足時直接說，或問使用者。
4. 你不能新增、修改或刪除單筆記帳紀錄，只能調整分配比例與對應設定。
5. 分配比例合計必須剛好 100%。`;

const TOOLS = [
  { name: 'set_ratios', description: '提出新的薪資分配比例。key 是分配帳戶名稱，value 是百分比（例如 50 代表 50%），合計必須是 100。可新增、刪除帳戶；順序即顯示順序。',
    input_schema: { type: 'object', properties: { ratios: { type: 'object', additionalProperties: { type: 'number' } }, reason: { type: 'string' } }, required: ['ratios'] } },
  { name: 'set_project_map', description: '提出「專案 → 分配帳戶」的對應調整（只需列出要改的）。值為 null 代表取消該專案對應。分配帳戶必須存在於比例中。',
    input_schema: { type: 'object', properties: { map: { type: 'object', additionalProperties: { type: ['string', 'null'] } }, reason: { type: 'string' } }, required: ['map'] } },
  { name: 'set_category_map', description: '提出「分類 → 分配帳戶」的對應調整。key 可以是「主分類」或「主分類/子分類」，值為 null 代表取消。沒有專案的支出才會看這張表。',
    input_schema: { type: 'object', properties: { map: { type: 'object', additionalProperties: { type: ['string', 'null'] } }, reason: { type: 'string' } }, required: ['map'] } }
];

async function verify(token) {
  const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { Authorization: 'Bearer ' + token, apikey: SUPABASE_KEY } });
  if (!r.ok) return null;
  return r.json();
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const allowed = (process.env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (!process.env.ANTHROPIC_API_KEY || !allowed.length) return res.status(500).json({ error: 'not_configured' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'login' });
  let user;
  try { user = await verify(token); } catch (e) { return res.status(502).json({ error: 'auth_unreachable' }); }
  if (!user || !user.email) return res.status(401).json({ error: 'login' });
  if (!allowed.includes(String(user.email).toLowerCase())) return res.status(403).json({ error: 'not_allowed' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-16)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return res.status(400).json({ error: 'bad_request' });
  const ctx = JSON.stringify(body.context || {}).slice(0, 12000);

  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, system: SYSTEM + '\n\n帳務摘要（JSON）：\n' + ctx, tools: TOOLS, messages: msgs })
    });
  } catch (e) { return res.status(502).json({ error: 'upstream_unreachable' }); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(502).json({ error: 'upstream', status: r.status, detail: (data.error && data.error.message) || '' });
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  const proposals = (data.content || []).filter(b => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, input: b.input }));
  return res.status(200).json({ text, proposals });
};
