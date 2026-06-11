// テクノエイド協会(TAIS)のURL生成ユーティリティ

/**
 * 商品詳細ページURL
 * 例: 00180-000009 →
 * https://www.techno-aids.or.jp/ServiceWelfareGoodsDetail.php?RowNo=0&YouguCode1=00180&YouguCode2=000009
 */
export function taisDetailUrl(taisCode: string, rowNo = 0): string {
  const [code1, code2] = taisCode.split('-');
  return `https://www.techno-aids.or.jp/ServiceWelfareGoodsDetail.php?RowNo=${rowNo}&YouguCode1=${code1}&YouguCode2=${code2}`;
}

/**
 * 商品写真URL(詳細ページのサムネイルと同じ画像)
 * 例: 00180-000009 → https://www.techno-tais.jp/Images/photo/00180000009.jpg
 */
export function taisPhotoUrl(taisCode: string): string {
  return `https://www.techno-tais.jp/Images/photo/${taisCode.replace('-', '')}.jpg`;
}
