# お茶在庫管理PWA

React + Vite + Supabaseで作った、お茶の入荷日・賞味期限・在庫数を管理する最小構成PWAです。

## できること

- 入荷登録
- 在庫一覧と警告表示
- 賞味期限30日以内の「賞味期限注意」
- 在庫数が発注基準数以下の「在庫少」
- Airレジ取り込みを想定したCSV出力
- Androidカメラで商品ラベルを撮影してOCR仮入力
- Androidスマホで見やすい大きめの入力欄とボタン

## セットアップ

```bash
npm install
cp .env.example .env.local
npm run dev
```

PowerShellで`npm.ps1`がブロックされる場合は、`npm.cmd install`や`npm.cmd run dev`を使ってください。

`.env.local`にはSupabaseのProject URLとPublishable keyを設定してください。

```env
VITE_SUPABASE_URL=https://vurhjgsrdzqyrppwyqfz.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key-or-legacy-anon-key
```

## Supabase

`tea_inventory`テーブルのSQLは[supabase/tea_inventory.sql](supabase/tea_inventory.sql)にあります。

このMVPではログイン機能を入れていないため、RLSを有効にしたうえで`anon`/`authenticated`からの読み書きを許可しています。社外公開する前に、Supabase Authとユーザー単位のRLSへ切り替えてください。

## OCR

入荷登録画面の`ラベル撮影`から、Android端末のカメラで商品ラベルを読み取れます。

- 撮影画像はSupabase Storage、Dropbox、スマホ本体には保存しません。
- 画像はブラウザのメモリ上でOCR処理にだけ使い、処理後に破棄します。
- Supabaseに保存するのは、商品名、賞味期限、入荷日、在庫数などのテキストデータだけです。
- OCR結果は自動登録せず、フォームへ仮入力します。必ず確認・修正してから登録してください。
- Androidのカメラ起動はHTTPS環境で動きます。Vercelなどへ公開したURLで使ってください。

## ビルド確認

```bash
npm run build
npm run serve:dist
```

`serve:dist`はビルド済みの`dist`を`http://localhost:4173`で確認するための簡易サーバーです。

## CSV列

CSVは以下の列で出力します。

```csv
商品コード,商品名,現在在庫数,更新在庫数,更新種別,更新メモ
```

更新種別は`棚卸し・在庫確認`、更新メモは登録時のメモを使用します。
