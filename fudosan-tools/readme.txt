=== 不動産売却ツール集 ===
Contributors: mikata
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later

不動産売却に役立つ9つの計算ツール・診断ツールを、ショートコード1本でページに置けます。

== 説明 ==

次の9つのツールが使えます。

1. 不動産売却の手取り額シミュレーター … [fudosan_tool name="tedori"]
2. 譲渡所得税シミュレーター … [fudosan_tool name="jouto"]
3. 仲介手数料の計算と早見表 … [fudosan_tool name="chukai"]
4. 固定資産税・都市計画税の日割り精算 … [fudosan_tool name="kotei"]
5. 不動産を売った年のふるさと納税 上限額 … [fudosan_tool name="furusato"]
6. 囲い込みチェッカー … [fudosan_tool name="kakoikomi"]
7. 売却で使える特例の判定 … [fudosan_tool name="tokurei"]
8. 売却後の確定申告 必要書類チェックリスト … [fudosan_tool name="shorui"]
9. 仲介と買取、手元に残るお金の比較 … [fudosan_tool name="hikaku"]

ツール一覧のカードは [fudosan_tools_index base="/tools/"] で出せます。

= 属性 =

* head="off" … 見出しと導入文を出さない（記事の途中に埋めるとき）
* desc="off" … 解説を出さない
* cta="off" … 結果の下のボタンを出さない
* title="…" … 見出しを差し替える

= 入力値はサーバーに送りません =

計算はすべてブラウザの中で完結します。入力された金額や日付がサーバーに届くことはなく、
データベースにも保存されません。個人情報を扱わないため、同意チェックや利用目的の明示は
不要です。ページキャッシュがあっても、他の訪問者に入力値が配られることはありません。

= 設定 =

「設定 → 売却ツール」で、アクセントカラー、結果の下に出すボタンのURL・文言、
ボタンを出すツールを選べます。

== 変更履歴 ==

= 1.0.0 =
* 初版。9ツールを同梱
