# 不動産売却ツール集（WordPressプラグイン）

不動産売却に役立つ9つの計算・診断ツールを、ショートコード1本でページに置ける。
ミカタ株式会社の資産。fudosan-uru.jp 向けに作ったが、サイト依存の処理は無い。

- プラグイン本体: `fudosan-tools/fudosan-tools.php`
- ツールの見出し・導入文・解説: `fudosan-tools/includes/tools-data.php`
- 共通エンジン（フォーム生成・結果描画）: `fudosan-tools/assets/ftl.js`
- 各ツールの計算: `fudosan-tools/assets/ftl-tools.js`
- スタイル: `fudosan-tools/assets/ftl.css`
- 自動更新チェッカー: `fudosan-tools/includes/plugin-updater.php`
- 配布zip: `fudosan-tools.zip`（`build.py` が生成）
- 配信元: https://github.com/yoshimucom-gif/fudosan-tools-plugin

識別子は `FTL_*` / `ftl_*` / CSS `ftl-*`、設定は単一オプション `ftl_options`、
設定画面は「設定 → 売却ツール」。DBテーブルは作らない。

## 9つのツール

| スラッグ | ツール | 狙うKW（月間検索数の概算） |
|---|---|---|
| `tedori` | 不動産売却の手取り額シミュレーター | 不動産売却シミュレーション／手取り（約4,000） |
| `jouto` | 譲渡所得税シミュレーター | 譲渡所得税 計算 シミュレーション（約12,000） |
| `chukai` | 仲介手数料の計算と早見表 | 仲介手数料 計算／早見表（約19,700） |
| `kotei` | 固定資産税・都市計画税の日割り精算 | 固定資産税 日割り計算ツール（約1,860） |
| `furusato` | 不動産を売った年のふるさと納税 上限額 | ふるさと納税 譲渡所得（約1,650） |
| `kakoikomi` | 囲い込みチェッカー | 不動産 囲い込み（約2,470） |
| `tokurei` | 売却で使える特例の判定 | 譲渡所得 チェックシート／3000万円控除（約3,200） |
| `shorui` | 売却後の確定申告 必要書類チェックリスト | 不動産売却 確定申告 必要書類（約11,500） |
| `hikaku` | 仲介と買取、手元に残るお金の比較 | 不動産買取 デメリット／仲介（約1,450） |

```
[fudosan_tool name="tedori"]
[fudosan_tools_index base="/tools/"]
```

属性: `head="off"`（見出しと導入文を省く）/ `desc="off"`（解説を省く）/
`cta="off"`（ボタンを省く）/ `title="…"`（見出しを差し替える）

## 設計上の決めごと

- **計算はすべてブラウザ内で完結する。** 入力値をサーバーへ送らないので、DBテーブル・
  同意チェック・利用目的の明示・スパム対策・自動返信メールがいらない。
  `fudosan-honki` で一番重かった部分が丸ごと不要になる。
  ページキャッシュがあっても、他の訪問者に入力値が配られる事故が起きない。
- **見出し・導入文・解説はPHPでサーバー出力する。** 検索エンジンが読むのはこの部分。
  JSが組み立てるのはフォームと結果だけなので、JSが動かない環境でも本文は残る。
- **配色は `:root` ではなく `.ftl` のインラインstyleで渡す。** 同一ページに複数ツールを
  置いたとき、後から出力されたルールが他方の色を変えてしまうのを避けるため
  （`fudosan-honki` の幅の問題と同じ理由）。
- **選択肢はタイル。** セレクトボックスより離脱が少ない。
- **結果パネルはPCで右側に固定、スマホでは下に流す。** 入力しながら数字が動くのが見える。
- **未入力の状態で断定的な判定を出さない。** 囲い込みチェッカーは、何も選んでいないうちは
  中立の表示にしている。0点・赤字で出すと誤解を与えるため。

## 税制・法令の数値と出典

計算に使っている数値は `assets/ftl-tools.js` の冒頭コメントと
`includes/tools-data.php` の各ツールの `sources` に出典を書いている。
**改正があったらこの2か所を両方直すこと。**

| 項目 | 内容 | 出典 |
|---|---|---|
| 仲介手数料の上限 | 400万円超は3%＋6万円＋消費税 | 宅建業法46条・報酬告示 |
| 800万円以下の特例 | 30万円（税抜）＝33万円（税込）。2024年7月1日施行 | 国交省 報酬告示改正 |
| 印紙税 | 軽減措置は令和9年3月31日まで | 国税庁 No.7108 |
| 長期譲渡所得 | 20.315%（所得税15%＋復興0.315%＋住民税5%） | 国税庁 No.3208 |
| 短期譲渡所得 | 39.63%（所得税30%＋復興0.63%＋住民税9%） | 国税庁 No.3211 |
| 10年超の軽減税率 | 6,000万円以下14.21%／超20.315% | 国税庁 No.3305 |
| 建物の減価償却 | 非事業用。取得価額×0.9×償却率×経過年数、95%が限度 | 国税庁 No.3261 |
| 相続空き家の特例 | 2024年1月以降、相続人3人以上なら2,000万円。買主が翌年2月15日までに取壊し・耐震改修でも可 | 国税庁 No.3306 |
| レインズ登録 | 専任7営業日／専属専任5営業日。登録証明書の交付義務 | 宅建業法34条の2 |
| 業務報告 | 専任2週間に1回以上／専属専任1週間に1回以上 | 宅建業法34条の2 |
| 抵当権抹消 | 登録免許税は不動産1個につき1,000円 | 登録免許税法 |

ふるさと納税の上限は「住民税所得割額×20%÷（90%−所得税率×1.021）＋2,000円」で計算し、
譲渡所得によって増える分だけを出している。総合課税分の基礎控除は2025年度改正で動いているため、
給与分の上限までは計算していない（利用者に入れてもらう）。

## 更新の出し方

```
py build.py 1.0.1 "・○○を修正しました"
git add -A && git commit -m "v1.0.1" && git push
```

`build.py` がやること:

1. `fudosan-tools/fudosan-tools.php` の `Version:` ヘッダーと `FTL_VER` を書き換える
2. `update.json` の `version` と `changelog` を書き換える（changelogは上書き）
3. `fudosan-tools.zip` を再生成する（アーカイブ内パスは `/` 区切り。
   Windows の `Compress-Archive` は `\` 区切りのzipを作り、WPが正しく展開できない）

## 検証

```
C:\Users\yoshi\php-portable\php82\php.exe -n render_preview.php
```

`preview/index.html`（全ツール）と `preview/<スラッグ>.html` を書き出す。
WordPressなしで動く。`preview/` は git 管理外。

ブラウザで見るときは、このフォルダを配信して `preview/index.html` を開く。

```
py -m http.server 4412 --bind 127.0.0.1
```

構文チェック:

```
node --check fudosan-tools/assets/ftl.js
node --check fudosan-tools/assets/ftl-tools.js
C:\Users\yoshi\php-portable\php82\php.exe -l fudosan-tools/fudosan-tools.php
```

## ツールを足すとき

1. `assets/ftl-tools.js` に `T.<スラッグ> = { title, groups, compute }` を足す
2. `includes/tools-data.php` に見出し・導入文・解説・出典を足す

`compute` は入力値のオブジェクトを受け取り、`headline` / `verdict` / `bar` / `rows` /
`flags` / `list` / `table` / `notes` のうち必要なキーを返す。描画は `ftl.js` が引き受ける。
入力欄の型は `man`（万円）/ `yen` / `num` / `tiles` / `sel` / `check` / `checks` /
`date` / `ym`。`when` を書くと条件付きで出し入れできる。
