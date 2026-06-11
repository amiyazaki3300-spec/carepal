import type { Category } from '../types';

// 表示順: レンタル品目 → 購入品目
// serviceCode は介護保険の福祉用具貸与サービスコード(介護給付/予防給付)
export const CATEGORIES: Category[] = [
  {
    id: 'tesuri', name: '手すり', kind: 'rental',
    color: '#e8833a', serviceCode: { kaigo: '171007', yobo: '671007' },
    guide: '工事不要の置き型・突っ張り型が中心です。立ち座りの動作、移動の経路、設置スペースを確認して選びましょう。寸法と設置事例写真を参考に、ご自宅に合うサイズをお選びください。',
  },
  {
    id: 'tsue', name: '歩行補助つえ', kind: 'rental',
    color: '#6aa84f', serviceCode: { kaigo: '171010', yobo: '671010' },
    guide: '多点杖・ロフストランドクラッチなどが対象です。握力や腕の力、バランス能力に合わせて支持面の広さを選びましょう。長さは腕を自然に下げた手首の高さが目安です。',
  },
  {
    id: 'hokoki', name: '歩行器', kind: 'rental',
    color: '#45818e', serviceCode: { kaigo: '171009', yobo: '671009' },
    guide: '固定型・交互型・キャスター付きがあります。屋内外どちらで使うか、持ち上げる力があるか、休憩用の座面が必要かで選定します。',
  },
  {
    id: 'slope', name: 'スロープ', kind: 'rental',
    color: '#bf9000', serviceCode: { kaigo: '171008', yobo: '671008' },
    guide: '段差の高さと設置可能な長さから勾配を確認しましょう。車いすの種類(自走・介助・電動)によって必要な勾配が異なります。',
  },
  {
    id: 'kurumaisu', name: '車いす', kind: 'rental',
    color: '#cc4125', serviceCode: { kaigo: '171001', yobo: '671001' },
    guide: '自走式・介助式・モジュール型から、体格・使用場所・介助者の有無に合わせて選定します。座幅は腰の幅+3〜5cmが目安です。',
  },
  {
    id: 'kurumaisu-fuzoku', name: '車いす付属品', kind: 'rental',
    color: '#d5699a', serviceCode: { kaigo: '171002', yobo: '671002' },
    guide: 'クッション・テーブル・ブレーキ延長などです。座位保持や褥瘡予防の必要性に応じてクッションの素材を選びましょう。',
  },
  {
    id: 'tokushu-shindai', name: '特殊寝台', kind: 'rental',
    color: '#1f4e79', serviceCode: { kaigo: '171003', yobo: '671003' },
    guide: '背上げ・高さ調整・膝上げの機能数(モーター数)で選びます。起き上がりや立ち上がりの自立度、介助者の負担を考慮しましょう。',
  },
  {
    id: 'shindai-fuzoku', name: '特殊寝台付属品', kind: 'rental',
    color: '#3d85c6', serviceCode: { kaigo: '171004', yobo: '671004' },
    guide: 'マットレス・サイドレール・介助バーなどです。マットレスは「硬さメーター」を参考に、寝返りのしやすさ(硬め)と体圧分散(柔らかめ)のバランスで選びましょう。',
  },
  {
    id: 'tokozure', name: '床ずれ防止用具', kind: 'rental',
    color: '#6fa8dc', serviceCode: { kaigo: '171005', yobo: '671005' },
    guide: 'エアマットレスや体圧分散マットレスです。自力で寝返りできるか、褥瘡リスク(OHスケール等)に応じて静止型かエア型かを選定します。',
  },
  {
    id: 'taii-henkan', name: '体位変換器', kind: 'rental',
    color: '#8e7cc3', serviceCode: { kaigo: '171006', yobo: '671006' },
    guide: 'クッションタイプやスライドシートなどです。介助者の負担軽減と、ご本人の安楽な姿勢保持の両面から選びましょう。',
  },
  {
    id: 'lift', name: '移動用リフト', kind: 'rental',
    color: '#38761d', serviceCode: { kaigo: '171012', yobo: '671012' },
    guide: '床走行式・据置式・つり具で構成されます。移乗の場面(ベッド⇔車いす、入浴など)と住環境に合わせて選定します。つり具のサイズ適合が重要です。',
  },
  {
    id: 'haikai-kanchi', name: '認知症老人徘徊感知機器', kind: 'rental',
    color: '#a64d79', serviceCode: { kaigo: '171011', yobo: '671011' },
    guide: 'マットセンサー・赤外線センサーなどです。検知したい場所(ベッドサイド・出入口)と通知方法を確認して選びましょう。',
  },
  {
    id: 'haisetsu', name: '自動排泄処理装置', kind: 'rental',
    color: '#5b7c99', serviceCode: { kaigo: '171013', yobo: '671013' },
    guide: '尿のみ対応か便も対応かで給付対象が異なります。ご本人の排泄状況と介護環境を踏まえてご相談ください。',
  },
  {
    id: 'sonota', name: 'その他', kind: 'rental', color: '#999999',
    guide: '上記以外のレンタル対象商品です。用途に応じてご相談ください。',
  },
  {
    id: 'nyuyoku', name: '入浴補助用具', kind: 'purchase', color: '#76a5af',
    guide: '【購入品目】シャワーチェア・浴槽手すり・浴槽内いすなどです。浴室の寸法と動作(またぎ・立ち座り)を確認して選びましょう。',
  },
  {
    id: 'koshikake-benza', name: '腰掛便座(ポータブルトイレ)', kind: 'purchase', color: '#c27ba0',
    guide: '【購入品目】設置場所のスペース、座面の高さ、ひじ掛けの形状を確認しましょう。木製家具調は安定感があり、樹脂製は手入れが簡単です。',
  },
];
