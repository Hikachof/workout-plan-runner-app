# Workout Plan Runner

PC/Codexが作成した `plans/current.json` を自動取得し、トレーニング実行と `workout_history.json` の書き出しを行うiPhone向けPWAです。

## 使い方

1. GitHub PagesのURLをiPhone Safariで開く。
2. 共有メニューから「ホーム画面に追加」を選ぶ。
3. PWAを起動すると最新計画が自動で読み込まれる。
4. メニューを実行して、必要なタイミングで実績JSONを書き出す。

計画JSONは公開リポジトリ内の `plans/current.json` に置きます。実績データは端末内に保存され、手動の記録出力またはGitHub自動同期を使うまで外部へ送信されません。

## GitHub自動同期

実績をGitHubへ自動同期する場合は、iPhone側の「GitHub同期」でfine-grained personal access tokenを1回だけ保存します。

推奨トークン設定:

- Repository access: `Hikachof/workout-plan-runner-app` のみ
- Repository permissions: Contents = Read and write
- 有効期限: 必要な範囲で短め

「終了して保存時に自動同期」をONにすると、トレーニング保存時に `history/workout_history.json` をGitHubへ更新します。トークンはiPhoneのPWA内にだけ保存し、リポジトリにはコミットしません。
