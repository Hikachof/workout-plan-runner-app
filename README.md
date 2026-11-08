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

### トークンJSONで読み込む場合

実token入りのJSONはGitHubに置かず、iPhoneのファイルアプリやiCloud Driveなど自分だけが読める場所に保存します。PWAの「トークンJSON読込」から選ぶと、tokenを端末内に保存します。

形式:

```json
{
  "token": "github_pat_xxx"
}
```

このリポジトリには `github-token.example.json` だけを置きます。実token入りの `github-token.json` は `.gitignore` に入れてあります。

## 2.0（2026-11-08 作り直し）

- 画面：今日・記録・計画・設定の 4 つ。黒と黄緑の見た目。
- 重さの刻み：ダンベル 1 個の刻み（既定 4kg から 1.5kg ずつ）が基準。`weightType` が `left_right_total` / `both_hands_total`（2 個の合計で記録）の種目は、その 2 倍の刻み（8kg から 3kg ずつ）。`per_dumbbell`（片手の重さ）・`single_dumbbell`（1 個）は 1 個の刻み。刻みは設定で変えられる。計画を作るときは、この刻みに乗る重さを書く。
- 休憩タイマーは終わる時刻で数える。トレーニング中は画面を消さない（設定で切り替え）。
- 記録の同期は、GitHub の記録と合わせてから書く（上書きで消えない）。
- コード：`assets/js/`（役割ごとのファイル）、`assets/css/`。テストは `node --test tests/*.test.js`。
