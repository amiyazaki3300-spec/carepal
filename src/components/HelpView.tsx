import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, BookOpen, CheckCircle, Circle, List, RefreshCw,
  PenLine, Send, MessageCircle, RotateCcw, User,
} from 'lucide-react';
import { loadHelpPosts, saveHelpPost, resolveHelpPost, supabaseEnabled } from '../lib/supabase';
import type { HelpPost } from '../lib/supabase';

// ── マニュアル内容 ─────────────────────────────────────────────────────────

const USER_MANUAL = [
  {
    title: '📖 カタログの見方',
    body: `カタログは「ブック表示」と「一覧表示」の2種類があります。
左のメニュー「一覧」ボタンで切り替えられます。

ブック表示：本をめくるようにページを左右の矢印で移動できます。
一覧表示：全商品をスクロールして確認できます。`,
  },
  {
    title: '🔍 商品の検索',
    body: `画面左のメニューにある検索ボックスに商品名やメーカー名を入力すると該当ページへジャンプします。

絞込ボタンを押すと、在庫あり・カテゴリ・単位数などで絞り込めます。`,
  },
  {
    title: '🏢 事業所の選択',
    body: `ログイン後、事業所を選択すると各商品に「単位数」が表示されます。
事業所ごとに単位数が異なる場合があります。`,
  },
  {
    title: '📱 スマートフォンでの使い方',
    body: `スマートフォンでは自動的に一覧表示になります。
商品をタップすると詳細情報が表示されます。
在庫なしの商品には代替品が提案されます。`,
  },
  {
    title: '🤖 AI選定',
    body: `「AI選定」ボタンを押すと、条件に合った福祉用具をAIが提案します。
利用者の状況や希望を入力してください。`,
  },
  {
    title: '📊 ダッシュボード',
    body: `「ダッシュボード」では在庫状況や商品の概要を一覧で確認できます。`,
  },
  {
    title: '🛏 床ずれ比較',
    body: `「床ずれ比較」では床ずれ防止用具を並べて比較できます。
仕様や特徴を見比べて選定にお役立てください。`,
  },
  {
    title: '📄 PDF出力',
    body: `「PDF」ボタンを押すと現在表示中のカタログをPDF形式で保存できます。
全ページ・現在のページ・指定ページ範囲を選べます。`,
  },
];

const ADMIN_MANUAL = [
  {
    title: '✏️ 編集モードの起動',
    body: `ショートカットキー Ctrl+P で編集モードを開始/終了できます。
または左メニュー下部の「編集モード」ボタンを押してください。

編集中は Ctrl+O または「保存」ボタンで保存。
Escape キーで変更を破棄して終了できます。`,
  },
  {
    title: '🖼 画像の編集',
    body: `【移動】画像エリアをドラッグすると位置を移動できます。
【拡大縮小】画像右下の ⤡ ハンドルを左右にドラッグすると拡大・縮小できます。
【切り取り】編集モード中に画像をダブルクリックするとクロップ画面が開きます。
【差し替え】📷アイコンをクリックして新しい画像をアップロードできます。
ダブルクリックでリセット（元の位置・サイズに戻す）。`,
  },
  {
    title: '📝 テキストの編集',
    body: `編集モード中は商品名・メーカー名・説明文・価格・スペック行の値を直接クリックして編集できます。
編集後はクリック外（フォーカスを外す）で自動保存されます。`,
  },
  {
    title: '📋 スペック表の編集',
    body: `編集モード中にスペック表（商品コード・TAISコードの下の表）の値をクリックして直接編集できます。
「＋行を追加」ボタンで新しい行を追加できます。
追加した行は左側のラベル（項目名）も編集可能です。`,
  },
  {
    title: '⬛ テキスト・画像の追加',
    body: `カード下部の「＋テキスト」ボタンでテキストボックスを追加できます。
「＋画像」ボタンで追加画像を配置できます。
追加した要素はドラッグで移動、右下ハンドルでリサイズ、✕ボタンで削除できます。`,
  },
  {
    title: '🔄 商品カードの並び替え',
    body: `編集モード中、カード左上の ≡ ハンドルをドラッグすると同カテゴリ内で並び替えができます。
「◀頁」「頁▶」ボタンで商品を別ページへ移動できます。`,
  },
  {
    title: '📐 カードサイズの変更',
    body: `「↗大きく」ボタンでカードを大きく（featured）表示にできます。
「⇥1列」「⇤2列」「■全幅」でカードの横幅を変更できます。`,
  },
  {
    title: '🗂 カタログ管理（管理者設定）',
    body: `管理者設定 → カタログ管理タブで以下の操作ができます：
・カタログ確定：表示する商品を固定する
・商品の非表示・削除
・手動で商品を追加（TAISコード入力）
・代替品の設定`,
  },
  {
    title: '📦 在庫の更新',
    body: `管理者設定 → 在庫更新タブでExcelファイルをアップロードすると在庫数が更新されます。
カタログが確定済みの場合は在庫数のみ更新され、商品リストは変わりません。`,
  },
  {
    title: '🔑 初期商品設定',
    body: `管理者設定 → 設定タブ → 「初期商品設定のアップロード」でExcelをアップロードすると、
そのExcelに載っている商品だけが表示されるようになります（商品リストの初期化）。`,
  },
];

// ── 投稿カード ──────────────────────────────────────────────────────────────

function PostCard({ post, isAdmin, onRefresh }: { post: HelpPost; isAdmin: boolean; onRefresh: () => void }) {
  const [comment, setComment] = useState(post.admin_comment ?? '');
  const [saving, setSaving] = useState(false);

  const save = async (resolved: boolean) => {
    setSaving(true);
    await resolveHelpPost(post.id, comment, resolved);
    setSaving(false);
    onRefresh();
  };

  const date = new Date(post.created_at).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`help-post ${post.resolved ? 'help-post--resolved' : ''}`}>
      <div className="help-post__head">
        <span className="help-post__name"><User size={13} style={{verticalAlign:'middle',marginRight:4}}/>{post.name}</span>
        <span className="help-post__date">{date}</span>
        {post.resolved && <span className="help-post__badge"><CheckCircle size={11} style={{verticalAlign:'middle',marginRight:3}}/>解決済み</span>}
      </div>
      <p className="help-post__content">{post.content}</p>
      {post.admin_comment && (
        <div className="help-post__admin-reply">
          <span className="help-post__reply-label"><MessageCircle size={12} style={{verticalAlign:'middle',marginRight:3}}/>管理者より：</span>
          <p>{post.admin_comment}</p>
        </div>
      )}
      {isAdmin && !post.resolved && (
        <div className="help-post__admin-actions">
          <textarea
            className="help-post__textarea"
            placeholder="コメントを入力（任意）"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <button className="tb__btn tb__btn--primary" disabled={saving} onClick={() => save(true)}>
              <CheckCircle size={13} style={{verticalAlign:'middle',marginRight:4}}/>解決済みにする
            </button>
            {comment && (
              <button className="tb__btn" disabled={saving} onClick={() => save(false)}>
                <MessageCircle size={13} style={{verticalAlign:'middle',marginRight:4}}/>コメントのみ送信
              </button>
            )}
          </div>
        </div>
      )}
      {isAdmin && post.resolved && (
        <div style={{ marginTop: 8 }}>
          <button className="tb__btn" style={{ fontSize: '0.78rem' }} disabled={saving} onClick={() => save(false)}>
            <RotateCcw size={12} style={{verticalAlign:'middle',marginRight:4}}/>未解決に戻す
          </button>
        </div>
      )}
    </div>
  );
}

// ── マニュアル表示 ───────────────────────────────────────────────────────────

function ManualSection({ items }: { items: typeof USER_MANUAL }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="help-manual">
      {items.map((item, i) => (
        <div key={i} className={`help-manual__item ${open === i ? 'help-manual__item--open' : ''}`}>
          <button className="help-manual__title" onClick={() => setOpen(open === i ? null : i)}>
            {item.title}
            <span className="help-manual__chevron">{open === i ? '▲' : '▼'}</span>
          </button>
          {open === i && (
            <pre className="help-manual__body">{item.body}</pre>
          )}
        </div>
      ))}
    </div>
  );
}

// ── メイン HelpView ─────────────────────────────────────────────────────────

export function HelpView({ authMode }: { authMode: 'user' | 'admin' }) {
  const isAdmin = authMode === 'admin';
  const [tab, setTab] = useState<'posts' | 'new' | 'manual'>(isAdmin ? 'posts' : 'manual');
  const [posts, setPosts] = useState<HelpPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('open');

  const refresh = useCallback(async () => {
    setLoading(true);
    const data = await loadHelpPosts();
    setPosts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'posts') void refresh();
  }, [tab, refresh]);

  const submit = async () => {
    if (!name.trim() || !content.trim()) return;
    setSubmitting(true);
    await saveHelpPost(name.trim(), content.trim());
    setSubmitting(false);
    setSubmitted(true);
    setName(''); setContent('');
    setTimeout(() => setSubmitted(false), 3000);
  };

  const filteredPosts = posts.filter(p =>
    filter === 'all' ? true : filter === 'resolved' ? p.resolved : !p.resolved
  );

  const adminTabs = [['posts', 'posts-label'], ['manual', 'manual-label']] as const;
  const userTabs = [['manual', 'manual-label'], ['new', 'new-label'], ['posts', 'posts-user-label']] as const;
  const tabLabel = (t: string) => {
    if (t === 'posts-label') return <><ClipboardList size={13} style={{verticalAlign:'middle',marginRight:4}}/>投稿一覧</>;
    if (t === 'manual-label') return <><BookOpen size={13} style={{verticalAlign:'middle',marginRight:4}}/>マニュアル</>;
    if (t === 'new-label') return <><PenLine size={13} style={{verticalAlign:'middle',marginRight:4}}/>投稿する</>;
    return <><ClipboardList size={13} style={{verticalAlign:'middle',marginRight:4}}/>みんなの投稿</>;
  };
  const tabs = isAdmin
    ? adminTabs.map(([t, l]) => [t, l] as [string, string])
    : userTabs.map(([t, l]) => [t, l] as [string, string]);

  return (
    <div className="help-view">
      <div className="help-view__tabs">
        {tabs.map(([t, labelKey]) => (
          <button
            key={t}
            className={`tb__btn ${tab === t ? 'tb__btn--active' : ''}`}
            onClick={() => setTab(t as typeof tab)}
          >{tabLabel(labelKey)}</button>
        ))}
      </div>

      {/* 投稿一覧 */}
      {tab === 'posts' && (
        <div className="help-view__section">
          <div className="help-filter">
            {(['open', 'resolved', 'all'] as const).map(f => (
              <button key={f} className={`help-filter__btn ${filter === f ? 'help-filter__btn--active' : ''}`}
                onClick={() => setFilter(f)}>
                {f === 'open' ? <><Circle size={11} style={{verticalAlign:'middle',marginRight:3}}/>未解決</> : f === 'resolved' ? <><CheckCircle size={11} style={{verticalAlign:'middle',marginRight:3}}/>解決済み</> : <><List size={11} style={{verticalAlign:'middle',marginRight:3}}/>全て</>}
              </button>
            ))}
            <button className="tb__btn" style={{ marginLeft: 'auto', fontSize: '0.78rem' }} onClick={refresh}><RefreshCw size={12} style={{verticalAlign:'middle',marginRight:4}}/>更新</button>
          </div>
          {!supabaseEnabled && (
            <p className="help-view__note">⚠️ Supabaseが未設定のため投稿の読み込みができません。</p>
          )}
          {loading ? (
            <p className="help-view__note">読み込み中…</p>
          ) : filteredPosts.length === 0 ? (
            <p className="help-view__note">投稿がありません。</p>
          ) : (
            filteredPosts.map(p => (
              <PostCard key={p.id} post={p} isAdmin={isAdmin} onRefresh={refresh} />
            ))
          )}
        </div>
      )}

      {/* 新規投稿フォーム（利用者のみ） */}
      {tab === 'new' && (
        <div className="help-view__section">
          <p className="help-view__desc">改善してほしい点や困っていることをお気軽にお送りください。管理者が確認し返答します。</p>
          {!supabaseEnabled && (
            <p className="help-view__note">⚠️ Supabaseが未設定のため投稿できません。管理者にご連絡ください。</p>
          )}
          <label className="help-label">お名前</label>
          <input className="login__input" style={{ marginBottom: 12 }} value={name} onChange={e => setName(e.target.value)} placeholder="例：宮崎" />
          <label className="help-label">内容</label>
          <textarea className="help-textarea" value={content} onChange={e => setContent(e.target.value)}
            placeholder="例：○○の機能をもっと使いやすくしてほしい" rows={5} />
          <button className="tb__btn tb__btn--primary" style={{ marginTop: 12 }}
            disabled={!name.trim() || !content.trim() || submitting || !supabaseEnabled}
            onClick={submit}>
            {submitting ? '送信中…' : <><Send size={13} style={{verticalAlign:'middle',marginRight:4}}/>送信</>}
          </button>
          {submitted && <p style={{ color: '#2e9e5b', marginTop: 8 }}><CheckCircle size={13} style={{verticalAlign:'middle',marginRight:4}}/>送信しました！ありがとうございます。</p>}
        </div>
      )}

      {/* マニュアル */}
      {tab === 'manual' && (
        <div className="help-view__section">
          <ManualSection items={isAdmin ? ADMIN_MANUAL : USER_MANUAL} />
        </div>
      )}
    </div>
  );
}
