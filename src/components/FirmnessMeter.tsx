import type { Firmness } from '../types';

const LABELS: Record<Firmness, string> = {
  1: 'とても柔らかい',
  2: '柔らかめ',
  3: 'ふつう',
  4: '硬め',
  5: 'とても硬い',
};

/** マットレスの硬さを視覚的に表示するメーター */
export function FirmnessMeter({ value }: { value: Firmness }) {
  return (
    <div className="firmness" title={`硬さ: ${LABELS[value]}`}>
      <span className="firmness__label">硬さ</span>
      <span className="firmness__soft">柔</span>
      <span className="firmness__dots">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={`firmness__dot ${n <= value ? 'is-on' : ''}`} />
        ))}
      </span>
      <span className="firmness__hard">硬</span>
      <span className="firmness__text">{LABELS[value]}</span>
    </div>
  );
}
