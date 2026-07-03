# 作業進捗メモ

更新日: 2026-05-22

## 今日の作業内容

- React + Vite + Supabaseで、お茶の在庫・賞味期限管理PWAを作成した。
- Supabaseの `flora-pwa` プロジェクトに `tea_inventory` テーブルを用意した。
- 入荷登録、在庫一覧、CSV出力の3画面を作成した。
- 商品名をプルダウンで選べるようにした。
- 賞味期限が30日以内、または在庫数が5個以下の商品を警告表示できるようにした。
- Airレジ取り込みを想定したCSV出力を追加した。
- Androidスマホでも見やすいように、大きめの入力欄とボタンにした。
- Androidカメラで商品ラベルを撮影し、OCRで商品名と賞味期限を仮入力する機能を追加した。
- OCR用の画像は保存せず、処理中だけ一時データとして扱い、処理後に破棄する設計にした。
- Supabase Storage、Dropbox、スマホ本体への画像保存機能は作っていない。
- GitHub Pages用にGitHub Actionsの公開設定を追加した。
- 上書き防止のため、既存の `g-flora/flora-app` ではなく、新しい `g-flora/tea-inventory-pwa` にpushした。
- GitHub Secretsに、公開ビルドで必要なSecret名を登録した。

## 現在の状態

- ローカル作業フォルダ:
  `C:\Users\flora\フローラ Dropbox\【共有】スタッフ\Claude\flora-app`
- GitHub保存先:
  `g-flora/tea-inventory-pwa`
- 公開予定URL:
  `https://g-flora.github.io/tea-inventory-pwa/`
- GitHub Pages用のbase path:
  `/tea-inventory-pwa/`
- Supabaseプロジェクト:
  `flora-pwa`
- 使用テーブル:
  `tea_inventory`
- GitHub Actions:
  最新の公開ワークフローは成功済み。
- GitHub Secrets:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
- `.env.local` はローカル専用で、GitHubにはpushしていない。
- Supabaseの秘密キーや `.env` はcommitしていない。

## 未完了タスク

- GitHub Secretsを追加した後のGitHub Actionsを再実行して、公開サイトにSupabase接続情報が反映されるか確認する。
- 公開URL `https://g-flora.github.io/tea-inventory-pwa/` を開いて、スマホとPCで表示確認する。
- 公開URLでSupabase接続エラーが消えているか確認する。
- Androidスマホでカメラ起動とOCR仮入力を確認する。
- 入荷登録、在庫一覧、CSV出力を公開URL上で一通り確認する。
- 必要なら、README.mdの文字化け表示を直す。

## 明日最初にやること

1. GitHubの `g-flora/tea-inventory-pwa` を開く。
2. `Actions` タブを開く。
3. `Deploy GitHub Pages` を選ぶ。
4. `Run workflow` でGitHub Actionsを手動実行する。
5. 実行が緑のチェックになったら、公開URLを開く。
6. Supabase接続エラーが出ないことを確認する。

## 注意事項

- 上書き防止を最優先にする。
- `g-flora/flora-app` にはpushしない。
- `g-flora/flora-pwa` にもアプリ本体はpushしない。
- このPWAのGitHub管理先は `g-flora/tea-inventory-pwa` とする。
- `.env.local` やSupabaseの秘密キーはGitHubに入れない。
- 画像保存機能は作らない。OCR処理後は画像データを破棄する。
