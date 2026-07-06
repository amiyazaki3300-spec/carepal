import { useEffect, useRef, useState, useCallback } from 'react';
import type { Category, CategoryId, Product, StockMap } from '../types';
import { taisPhotoUrl, taisDetailUrl } from '../utils/tais';
import { saveSetting, supabaseEnabled } from '../lib/supabase';

const AI_KEY_STORAGE = 'carepal-ai-key';
const AI_MODEL = 'gpt-5-nano';
export const PROPOSAL_RANK_KEY = 'carepal-ai-proposals';

export function incrementProposalCounts(ids: string[]) {
  try {
    const counts = JSON.parse(localStorage.getItem(PROPOSAL_RANK_KEY) ?? '{}') as Record<string, number>;
    ids.forEach(id => { counts[id] = (counts[id] ?? 0) + 1; });
    localStorage.setItem(PROPOSAL_RANK_KEY, JSON.stringify(counts));
  } catch { /* ignore */ }
}

interface Suggestion { id: string; reason: string; }
interface SmartResult { suggestions: Suggestion[]; note: string; }

interface ChatMessage { role: 'user' | 'assistant'; content: string; }
interface AiChatResult { message: string; suggestions: Suggestion[]; quickReplies?: string[]; }

interface Props {
  products: Product[];
  categories: Category[];
  stock: StockMap;
  onClose: () => void;
}

// ── カテゴリ別キーワード (ローカルマッチング用) ────────────────
const CATEGORY_KEYWORDS: Partial<Record<CategoryId, string[]>> = {
  tesuri: ['手すり', '転倒', 'バランス', '立ち上がり', '玄関', '廊下', 'トイレ', '浴室', '階段', 'つかまる', 'グリップ'],
  tsue: ['杖', 'T字', '多点', '4点', 'ロフストランド', 'バランス補助', '歩行補助'],
  hokoki: ['歩行器', '歩行車', 'ウォーカー', '屋外', 'シルバーカー', 'パーキンソン', 'シート', '休憩', 'ロール', '前腕'],
  slope: ['スロープ', '段差', '段差解消', '傾斜'],
  kurumaisu: ['車いす', '車椅子', '長距離', '自走', '介助', '移動'],
  'tokushu-shindai': ['ベッド', '寝台', '起き上がり', '寝起き', 'モーター', '高さ調整'],
  'shindai-fuzoku': ['マットレス', 'サイドレール', '転落防止', '介助バー'],
  tokozure: ['床ずれ', '褥瘡', 'エアマット', '体圧', '寝返り困難', 'ブレーデン'],
  'taii-henkan': ['体位変換', '寝返り', '姿勢', '向き'],
  lift: ['リフト', '移乗', '全介助', '立てない', 'つり具'],
  'haikai-kanchi': ['徘徊', '認知症', 'センサー', '夜間', '離床', '見守り'],
  nyuyoku: ['入浴', 'シャワー', '浴槽', '洗い場', 'お風呂', 'またぐ', 'バス'],
  'koshikake-benza': ['便座', 'トイレ', 'ポータブル', '腰掛', '排泄', '補高', '洋式'],
};

const CONDITION_CATEGORY_MAP: Record<string, CategoryId[]> = {
  'パーキンソン': ['hokoki'],
  '脳卒中': ['tesuri', 'hokoki', 'kurumaisu'],
  '片麻痺': ['tesuri', 'hokoki', 'kurumaisu'],
  '認知症': ['haikai-kanchi', 'tesuri'],
  '膝': ['koshikake-benza', 'tesuri', 'nyuyoku'],
  '股関節': ['koshikake-benza', 'tesuri', 'nyuyoku'],
  '骨折': ['hokoki', 'tesuri', 'koshikake-benza'],
  '立ち上がり': ['tesuri', 'koshikake-benza'],
  '歩行': ['hokoki', 'tsue', 'tesuri'],
  '入浴': ['nyuyoku', 'lift'],
  'トイレ': ['koshikake-benza', 'tesuri'],
  '床ずれ': ['tokozure'],
  '褥瘡': ['tokozure'],
  '転倒': ['tesuri', 'tsue', 'hokoki'],
  'COPD': ['hokoki'],
  '心疾患': ['hokoki'],
  '移乗': ['lift', 'taii-henkan'],
  '寝返り': ['tokozure', 'taii-henkan'],
  '徘徊': ['haikai-kanchi'],
  '段差': ['slope', 'tesuri'],
  '車いす': ['kurumaisu', 'slope', 'lift'],
};

function localMatch(
  query: string,
  categoryFilter: CategoryId | null,
  stockOnly: boolean,
  products: Product[],
  stock: StockMap,
): Suggestion[] {
  const q = query;
  const words = q.split(/[\s、。，,]+/).filter(w => w.length >= 2);

  const scored = products
    .filter(p => !categoryFilter || p.categoryId === categoryFilter)
    .filter(p => !stockOnly || (stock[p.id] ?? 0) > 0)
    .map(p => {
      let score = 0;
      const inStock = (stock[p.id] ?? 0) > 0;
      if (inStock) score += 10;

      words.forEach(w => {
        if (p.name.includes(w)) score += 8;
        if (p.maker.includes(w)) score += 2;
        if ((p.tags ?? []).some(t => t.includes(w))) score += 5;
        const catKw = CATEGORY_KEYWORDS[p.categoryId] ?? [];
        if (catKw.some(k => k.includes(w) || w.includes(k))) score += 6;
      });

      Object.entries(CONDITION_CATEGORY_MAP).forEach(([cond, cats]) => {
        if (q.includes(cond) && (cats as string[]).includes(p.categoryId)) score += 18;
      });

      if (p.featured) score += 3;
      return { product: p, score };
    })
    .filter(({ score }) => score > 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map(({ product, score }) => ({
    id: product.id,
    reason: `入力された状況に適合する可能性があります（スコア: ${score}）。詳細はカタログでご確認ください。`,
  }));
}

// ── ワンショットAIプロンプト ──────────────────────────────────
function buildOneShotPrompt(
  query: string,
  categoryFilter: CategoryId | null,
  stockOnly: boolean,
  products: Product[],
  categories: Category[],
  stock: StockMap,
): string {
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const targets = categoryFilter ? products.filter(p => p.categoryId === categoryFilter) : products;
  const lines = targets.map(p => {
    const inStock = (stock[p.id] ?? 0) > 0;
    return `${p.id}|${p.name}|${p.maker}|${catMap[p.categoryId] ?? p.categoryId}|${inStock ? '◎' : '✕'}`;
  });

  return `あなたは10年以上の実務経験を持つ福祉用具専門相談員・作業療法士です。
以下の状況説明から、最適な福祉用具を即座に1〜3件提案してください。

【重要ルール】
・質問はしない。情報が不十分でも最善の判断で即座に提案する
・${stockOnly ? '在庫あり(◎)の商品のみから提案する' : '在庫あり(◎)を優先し、適切な商品があれば在庫なし(✕)も含めてよい'}
・各提案に「この利用者にこの製品が適している具体的な理由」を記載
・不適切な製品は絶対に提案しない

【商品リスト: ID|商品名|メーカー|品目|在庫(◎あり/✕なし)】
${lines.join('\n')}

【利用者の状況】
${query}

以下のJSON形式のみで回答（<result>タグで囲む）:
<result>
{"suggestions":[{"id":"商品ID","reason":"選定理由（具体的に）"}],"note":"補足コメント（任意）"}
</result>`;
}

// ── 詳細チャット用プロンプト ───────────────────────────────────
function buildChatSystemPrompt(products: Product[], categories: Category[], stock: StockMap): string {
  const catMap = Object.fromEntries(categories.map(c => [c.id, c.name]));
  const lines = products.map(p => {
    const inStock = (stock[p.id] ?? 0) > 0;
    return `${p.id}|${p.name}|${p.maker}|${catMap[p.categoryId] ?? p.categoryId}|${inStock ? '◎' : '✕'}`;
  });
  return `あなたは10年以上の実務経験を持つ福祉用具専門相談員・作業療法士です。
一問一答で利用者の状態を把握し、最適な福祉用具を提案してください。
質問は一度に1つだけ。必要情報が揃ったら提案する。

【商品リスト: ID|商品名|メーカー|品目|在庫(◎あり/✕なし)】
${lines.join('\n')}

必ず以下のJSON形式を <result> タグで囲んで返すこと:
<result>
{"message":"メッセージ","suggestions":[],"quickReplies":["選択肢1","選択肢2"]}
</result>`;
}

function parseChatResult(text: string): AiChatResult | null {
  const m = text.match(/<result>\s*([\s\S]*?)\s*<\/result>/);
  if (!m) return null;
  try { return JSON.parse(m[1]) as AiChatResult; } catch { return null; }
}

function parseSmartResult(text: string): SmartResult | null {
  const m = text.match(/<result>\s*([\s\S]*?)\s*<\/result>/);
  if (!m) return null;
  try { return JSON.parse(m[1]) as SmartResult; } catch { return null; }
}

// ── 提案カード ─────────────────────────────────────────────────
function SuggestionCard({ suggestion, products, stock, apiKey, chatHistory }: {
  suggestion: Suggestion; products: Product[]; stock: StockMap; apiKey: string; chatHistory: string;
}) {
  const product = products.find(p => p.id === suggestion.id);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [genLoading, setGenLoading] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [showReasons, setShowReasons] = useState(false);

  if (!product) return null;
  const inStock = (stock[product.id] ?? 0) > 0;
  const photoUrl = product.taisCode ? taisPhotoUrl(product.taisCode) : null;
  const detailUrl = product.taisCode ? taisDetailUrl(product.taisCode) : null;

  const generateReasons = async () => {
    if (!apiKey) return;
    setGenLoading(true);
    setShowReasons(true);
    setReasons([]);
    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: AI_MODEL,
          instructions: `福祉用具選定理由を3パターン作成。150字以内・ですます調・JSON配列のみ返す。`,
          input: `利用者状況: ${chatHistory}\n商品: ${product.name}（${product.maker}）\n理由: ${suggestion.reason}\n\n["パターン1","パターン2","パターン3"]`,
        }),
      });
      const raw = await res.json();
      type R = { output?: { type: string; content?: { type: string; text?: string }[] }[] };
      const text = (raw as R).output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text?.trim() ?? '';
      const match = text.match(/\[[\s\S]*?\]/);
      if (match) setReasons(JSON.parse(match[0]) as string[]);
    } catch { /* ignore */ }
    finally { setGenLoading(false); }
  };

  const copyReason = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  return (
    <div className="ai-card">
      <div className="ai-card__photo-wrap">
        {photoUrl && !photoFailed ? (
          detailUrl ? (
            <a href={detailUrl} target="_blank" rel="noreferrer">
              <img src={photoUrl} alt={product.name} className="ai-card__photo" onError={() => setPhotoFailed(true)} loading="lazy" />
            </a>
          ) : (
            <img src={photoUrl} alt={product.name} className="ai-card__photo" onError={() => setPhotoFailed(true)} loading="lazy" />
          )
        ) : (
          <span className="ai-card__photo-icon">📦</span>
        )}
      </div>
      <div className="ai-card__body">
        <div className="ai-card__name">{product.name}</div>
        <div className="ai-card__maker">{product.maker}</div>
        <div className="ai-card__reason">{suggestion.reason}</div>
        <div className={`ai-card__stock ${inStock ? 'ai-card__stock--in' : 'ai-card__stock--out'}`}>
          {inStock ? '✓ 在庫あり' : '在庫なし'}
        </div>
        {apiKey && (
          <button className="ai-card__reason-btn" onClick={generateReasons} disabled={genLoading}>
            {genLoading ? '生成中…' : '📋 選定理由を生成'}
          </button>
        )}
        {showReasons && (
          <div className="ai-card__reasons">
            {genLoading && <div className="ai-card__reasons-loading">生成中…</div>}
            {reasons.map((r, i) => (
              <div key={i} className="ai-card__reason-item">
                <div className="ai-card__reason-text">{r}</div>
                <button
                  className={`ai-card__copy-btn ${copiedIdx === i ? 'ai-card__copy-btn--copied' : ''}`}
                  onClick={() => copyReason(r, i)}
                >
                  {copiedIdx === i ? '✓ コピー済' : 'コピー'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── チャットモード(詳細相談) ───────────────────────────────────
const CHAT_OPENING: AiChatResult = {
  message: 'こんにちは！詳細な状況を伺いながら最適な福祉用具を提案します。\n\nまず確認させてください。在庫がある商品から探しますか？',
  suggestions: [],
  quickReplies: ['在庫あるものから探す', '在庫関係なく全部から探す'],
};
const CHAT_OPENING_MSG: ChatMessage = {
  role: 'assistant',
  content: `<result>${JSON.stringify(CHAT_OPENING)}</result>`,
};

function ChatMode({ products, categories, stock, apiKey }: {
  products: Product[]; categories: Category[]; stock: StockMap; apiKey: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([CHAT_OPENING_MSG]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, suggestions, loading]);

  const send = async (userText: string) => {
    if (!userText.trim() || loading || !apiKey) return;
    setError('');
    const userMsg: ChatMessage = { role: 'user', content: userText };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);
    try {
      const systemPrompt = buildChatSystemPrompt(products, categories, stock);
      const apiMessages = newMessages.filter(m => m !== CHAT_OPENING_MSG).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: AI_MODEL, instructions: systemPrompt, input: apiMessages }),
      });
      const raw = await res.json();
      if (!res.ok) throw new Error((raw as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
      type R = { output?: { type: string; content?: { type: string; text?: string }[] }[] };
      const text = (raw as R).output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text?.trim() ?? '';
      const result = parseChatResult(text);
      setMessages(prev => [...prev, { role: 'assistant', content: text }]);
      if (result?.suggestions?.length) {
        setSuggestions(result.suggestions);
        incrementProposalCounts(result.suggestions.map(s => s.id));
      } else if (result) setSuggestions([]);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };

  const getLastQuickReplies = () => {
    const last = [...messages].reverse().find(m => m.role === 'assistant');
    if (!last) return [];
    return parseChatResult(last.content)?.quickReplies ?? [];
  };

  const displayMsg = (msg: ChatMessage) => {
    if (msg.role === 'assistant') {
      const r = parseChatResult(msg.content);
      if (r?.message) return r.message;
      return msg.content.replace(/<result>[\s\S]*?<\/result>/g, '').trim();
    }
    return msg.content;
  };

  const chatHistory = messages
    .filter(m => m !== CHAT_OPENING_MSG)
    .map(m => {
      if (m.role === 'user') return `利用者: ${m.content}`;
      const r = parseChatResult(m.content);
      return r?.message ? `相談員: ${r.message}` : null;
    })
    .filter(Boolean).join('\n');

  return (
    <div className="ai-chat-mode">
      {error && <div className="ai-error">⚠ {error}</div>}
      <div className="ai-chat">
        {messages.map((msg, i) => (
          <div key={i} className={`ai-bubble ai-bubble--${msg.role}`}>
            <div className="ai-bubble__label">{msg.role === 'user' ? 'あなた' : 'AI'}</div>
            <div className="ai-bubble__text">{displayMsg(msg)}</div>
          </div>
        ))}
        {loading && (
          <div className="ai-bubble ai-bubble--assistant">
            <div className="ai-bubble__label">AI</div>
            <div className="ai-bubble__text ai-bubble__text--loading">
              <span className="ai-dot" /><span className="ai-dot" /><span className="ai-dot" />
            </div>
          </div>
        )}
        {!loading && getLastQuickReplies().length > 0 && (
          <div className="ai-quick-replies">
            {getLastQuickReplies().map((r, i) => (
              <button key={i} className="ai-quick-reply" onClick={() => send(r)}>{r}</button>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {suggestions.length > 0 && (
        <div className="ai-suggestions">
          <div className="ai-suggestions__title">提案商品</div>
          <div className="ai-suggestions__grid">
            {suggestions.map(s => (
              <SuggestionCard key={s.id} suggestion={s} products={products} stock={stock} apiKey={apiKey} chatHistory={chatHistory} />
            ))}
          </div>
        </div>
      )}
      <div className="ai-input-row">
        <textarea
          className="ai-input"
          placeholder={apiKey ? '自由入力… （Shift+Enterで送信）' : 'まずAPIキーを設定してください（🔑ボタン）'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); void send(input); } }}
          disabled={!apiKey || loading}
          rows={2}
        />
        <button className="ai-send" onClick={() => send(input)} disabled={!apiKey || !input.trim() || loading}>
          {loading ? '…' : '送信'}
        </button>
      </div>
    </div>
  );
}

// ── スマート選定モード ─────────────────────────────────────────
const CATEGORY_CHIPS: { id: CategoryId | ''; label: string }[] = [
  { id: '', label: '全品目' },
  { id: 'tesuri', label: '手すり' },
  { id: 'tsue', label: '杖' },
  { id: 'hokoki', label: '歩行器' },
  { id: 'kurumaisu', label: '車いす' },
  { id: 'slope', label: 'スロープ' },
  { id: 'tokushu-shindai', label: '特殊寝台' },
  { id: 'tokozure', label: '床ずれ防止' },
  { id: 'nyuyoku', label: '入浴補助' },
  { id: 'koshikake-benza', label: '腰掛便座' },
  { id: 'lift', label: 'リフト' },
  { id: 'haikai-kanchi', label: '徘徊感知' },
];

const EXAMPLE_QUERIES = [
  '2モーターの特殊寝台の在庫は？',
  '介助用で座幅42cmの車いすは？',
  '跳ね上げ式アームレストの車いすは？',
  '軽量で折りたたみできる歩行車は？',
  '浴槽のまたぎが困難な方向けの用具は？',
  '床ずれリスクが高い方向けのエアマットは？',
  'L字型のトイレ用手すりは？',
  'パーキンソン病に適した歩行器は？',
];

function SmartMode({ products, categories, stock, apiKey }: {
  products: Product[]; categories: Category[]; stock: StockMap; apiKey: string;
}) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<SmartResult | null>(null);
  const [stockOnly, setStockOnly] = useState<boolean>(true);
  const resultsRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (so: boolean, q: string, cat: CategoryId | '') => {
    if (!q.trim()) return;
    setLoading(true);
    setError('');
    setResults(null);
    setStockOnly(so);

    if (!apiKey) {
      const suggestions = localMatch(q, cat as CategoryId || null, so, products, stock);
      setResults({ suggestions, note: 'APIキー未設定のため、キーワードマッチングで検索しました。' });
      if (suggestions.length) incrementProposalCounts(suggestions.map(s => s.id));
      setLoading(false);
      return;
    }

    try {
      const prompt = buildOneShotPrompt(q, cat as CategoryId || null, so, products, categories, stock);
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: AI_MODEL, instructions: prompt, input: q }),
      });
      const raw = await res.json();
      if (!res.ok) throw new Error((raw as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`);
      type R = { output?: { type: string; content?: { type: string; text?: string }[] }[] };
      const text = (raw as R).output?.find(o => o.type === 'message')?.content?.find(c => c.type === 'output_text')?.text?.trim() ?? '';
      const result = parseSmartResult(text);
      if (result) {
        setResults(result);
        if (result.suggestions.length) incrementProposalCounts(result.suggestions.map(s => s.id));
      } else {
        setError('結果の解析に失敗しました。もう一度お試しください。');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [products, categories, stock, apiKey]);

  useEffect(() => {
    if (results) {
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
  }, [results]);

  return (
    <div className="smart-mode">
      <div className="smart-form">
        <label className="smart-form__label">商品・状況を入力してください</label>
        <textarea
          className="smart-form__input"
          placeholder="例: 2モーターの特殊寝台の在庫は？／介助用42cm幅の車いすは？"
          value={query}
          onChange={e => setQuery(e.target.value)}
          rows={3}
        />
        <div className="smart-examples">
          {EXAMPLE_QUERIES.map((q, i) => (
            <button key={i} className="smart-example" onClick={() => setQuery(q)}>{q}</button>
          ))}
        </div>

        <label className="smart-form__label" style={{ marginTop: 12 }}>品目で絞り込む（任意）</label>
        <div className="smart-chips">
          {CATEGORY_CHIPS.map(c => (
            <button
              key={c.id}
              className={`smart-chip ${categoryFilter === c.id ? 'smart-chip--active' : ''}`}
              onClick={() => setCategoryFilter(c.id)}
            >{c.label}</button>
          ))}
        </div>

        <div className="smart-search-btns">
          <button
            className="smart-search-btn smart-search-btn--stock"
            disabled={!query.trim() || loading}
            onClick={() => doSearch(true, query, categoryFilter)}
          >
            {loading && stockOnly ? '検索中…' : '在庫から探す'}
          </button>
          <button
            className="smart-search-btn smart-search-btn--all"
            disabled={!query.trim() || loading}
            onClick={() => doSearch(false, query, categoryFilter)}
          >
            {loading && !stockOnly ? '検索中…' : '在庫に関わらず探す'}
          </button>
        </div>
      </div>

      {error && <div className="ai-error">⚠ {error}</div>}

      {loading && (
        <div className="smart-loading">
          <span className="ai-dot" /><span className="ai-dot" /><span className="ai-dot" />
          <span style={{ marginLeft: 8 }}>提案を生成中…</span>
        </div>
      )}

      {results && !loading && (
        <div className="smart-results" ref={resultsRef}>
          <div className="smart-results__header">
            <span className="smart-results__title">提案結果 ({results.suggestions.length}件)</span>
            <span className={`smart-results__filter ${stockOnly ? 'smart-results__filter--stock' : ''}`}>
              {stockOnly ? '在庫あり優先' : '全商品対象'}
            </span>
          </div>
          {results.note && <div className="smart-note">{results.note}</div>}
          {results.suggestions.length === 0 ? (
            <div className="smart-empty">該当する商品が見つかりませんでした。条件を変えてお試しください。</div>
          ) : (
            <div className="ai-suggestions__grid">
              {results.suggestions.map(s => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  products={products}
                  stock={stock}
                  apiKey={apiKey}
                  chatHistory={`質問: ${query}`}
                />
              ))}
            </div>
          )}
          <div className="ai-stock-choice ai-stock-choice--after">
            <div className="ai-stock-choice__label">条件を変えて探しますか？</div>
            <div className="ai-stock-choice__btns">
              <button
                className={`ai-stock-choice__btn ${stockOnly ? 'ai-stock-choice__btn--active' : 'ai-stock-choice__btn--yes'}`}
                onClick={() => doSearch(true, query, categoryFilter)}
                disabled={loading}
              >
                在庫から探す
              </button>
              <button
                className={`ai-stock-choice__btn ${!stockOnly ? 'ai-stock-choice__btn--active' : 'ai-stock-choice__btn--no'}`}
                onClick={() => doSearch(false, query, categoryFilter)}
                disabled={loading}
              >
                在庫に関わらず探す
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────────────
export function AiSelector({ products, categories, stock, onClose }: Props) {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(AI_KEY_STORAGE) ?? '');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(!localStorage.getItem(AI_KEY_STORAGE));
  const [tab, setTab] = useState<'smart' | 'chat'>('smart');

  const saveApiKey = () => {
    const key = apiKeyInput.trim();
    if (!key.startsWith('sk-')) { return; }
    localStorage.setItem(AI_KEY_STORAGE, key);
    setApiKey(key);
    setShowKeyInput(false);
    if (supabaseEnabled) void saveSetting('ai_key', key);
  };

  return (
    <div className="ai-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ai-modal">
        <div className="ai-modal__header">
          <div>
            <div className="ai-modal__title">AI 福祉用具選定</div>
            <div className="ai-modal__sub">状況を入力するだけで最適な商品を提案します</div>
          </div>
          <div className="ai-modal__header-actions">
            <button className="ai-modal__keybtn" onClick={() => setShowKeyInput(v => !v)} title="APIキー設定">🔑</button>
            <button className="ai-modal__close" onClick={onClose}>✕ 閉じる</button>
          </div>
        </div>

        {showKeyInput && (
          <div className="ai-keybox">
            <div className="ai-keybox__label">OpenAI APIキー（ブラウザのみに保存）</div>
            <div className="ai-keybox__row">
              <input type="password" className="ai-keybox__input" placeholder="sk-..."
                value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveApiKey()} />
              <button className="ai-keybox__save" onClick={saveApiKey}>保存</button>
            </div>
            {apiKey && <div className="ai-keybox__current">現在のキー: {apiKey.slice(0, 12)}…</div>}
            {!apiKey && <div className="ai-keybox__note">※ APIキー未設定でもキーワードマッチングで利用できます</div>}
          </div>
        )}

        <div className="ai-tabs">
          <button className={`ai-tab ${tab === 'smart' ? 'ai-tab--active' : ''}`} onClick={() => setTab('smart')}>
            スマート選定
          </button>
          <button className={`ai-tab ${tab === 'chat' ? 'ai-tab--active' : ''}`} onClick={() => setTab('chat')}>
            詳細相談チャット
          </button>
        </div>

        <div className="ai-body">
          {tab === 'smart' ? (
            <SmartMode products={products} categories={categories} stock={stock} apiKey={apiKey} />
          ) : (
            <ChatMode products={products} categories={categories} stock={stock} apiKey={apiKey} />
          )}
        </div>
      </div>
    </div>
  );
}
