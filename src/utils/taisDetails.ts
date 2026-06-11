// scripts/fetch-tais-details.mjs が生成する public/tais-details.json の読み込み

export interface TaisDetail {
  /** 製品概要(特徴) */
  summary: string;
  /** 仕様 [ラベル, 値] の配列 */
  specs: [string, string][];
}

export type TaisDetailMap = Record<string, TaisDetail>;

export async function loadTaisDetails(): Promise<TaisDetailMap> {
  try {
    const res = await fetch('/tais-details.json');
    if (!res.ok) return {};
    return (await res.json()) as TaisDetailMap;
  } catch {
    return {};
  }
}
