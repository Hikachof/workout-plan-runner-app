# Workout Plan Runner

PC/Codexが作成した `plans/current.json` を自動取得し、トレーニング実行と `workout_history.json` の書き出しを行うiPhone向けPWAです。

## 使い方

1. GitHub PagesのURLをiPhone Safariで開く。
2. 共有メニューから「ホーム画面に追加」を選ぶ。
3. PWAを起動すると最新計画が自動で読み込まれる。
4. メニューを実行して、必要なタイミングで実績JSONを書き出す。

計画JSONは公開リポジトリ内の `plans/current.json` に置きます。実績データは端末内に保存され、ユーザーが書き出すまで外部へ送信されません。
