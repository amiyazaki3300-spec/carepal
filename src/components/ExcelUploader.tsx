import { useRef, useState } from 'react';
import { parseCatalogExcel, type CatalogData } from '../utils/inventory';

interface Props {
  onLoaded: (data: CatalogData) => void;
}

/** 在庫一覧Excel読み込みボタン(J列=商品コード/F列=品目/L列=在庫数) */
export function ExcelUploader({ onLoaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>('');

  async function handleFile(file: File) {
    try {
      const data = await parseCatalogExcel(file);
      onLoaded(data);
      setStatus(`✅ ${data.products.length}商品を読み込みました`);
    } catch (e) {
      setStatus(`⚠️ 読み込みに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="uploader">
      <button className="btn btn--secondary" onClick={() => inputRef.current?.click()}>
        📊 在庫Excelを読み込む
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />
      {status && <span className="uploader__status">{status}</span>}
    </div>
  );
}
