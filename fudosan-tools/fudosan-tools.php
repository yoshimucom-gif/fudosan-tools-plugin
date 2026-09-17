<?php
/**
 * Plugin Name: 不動産売却ツール集
 * Description: 手取り額・譲渡所得税・仲介手数料・固定資産税の日割り・ふるさと納税の上限・囲い込みチェック・特例判定・必要書類・仲介と買取の比較の9つのツールを、ショートコード1本でページに置けます。計算はすべてブラウザ内で完結し、入力値をサーバーへ送りません。
 * Version: 1.3.0
 * Author: ミカタ株式会社
 * License: GPLv2 or later
 * Text Domain: fudosan-tools
 *
 * ★設計上の決めごと:
 *   - 計算はすべてブラウザ側（ftl-tools.js）で行う。入力値をサーバーへ送らないので、
 *     個人情報の保管・同意取得・スパム対策・DBテーブルがいらない。ページキャッシュとも干渉しない。
 *   - 見出し・導入文・解説はPHPでサーバー出力する（検索エンジンに読ませるため）。
 *     フォームと結果だけをJSが組み立てる。
 *   - 配色は :root ではなく .ftl のインラインstyleで渡す。同一ページに複数ツールを
 *     置いたとき、後から出力されたルールが他方の色を変えてしまうのを避けるため。
 *
 * ★税制・法令の数値は includes/tools-data.php と assets/ftl-tools.js の
 *   冒頭コメントに出典を書いている。改正があったら両方を直すこと。
 */

if (!defined('ABSPATH')) exit;

define('FTL_VER', '1.3.0');
define('FTL_OPT', 'ftl_options');
define('FTL_DIR', plugin_dir_path(__FILE__));
define('FTL_URL', plugin_dir_url(__FILE__));

/** 自動更新の置き場。空なら自動更新は無効 */
define('FTL_UPDATE_URL', 'https://raw.githubusercontent.com/yoshimucom-gif/fudosan-tools-plugin/main/update.json');

/* 更新チェッカー。is_admin() だけで囲わないこと（WP-Cron は管理画面外で走る） */
if (is_admin() || (defined('DOING_CRON') && DOING_CRON) || (defined('WP_CLI') && WP_CLI)) {
    require_once __DIR__ . '/includes/plugin-updater.php';
    new FTL_Tools_Updater(__FILE__, FTL_UPDATE_URL);
}

require_once __DIR__ . '/includes/tools-data.php';

/* =========================================================================
 * 設定
 * ======================================================================= */

function ftl_defaults() {
    return array(
        'accent'    => '#1F2E43',
        'brass'     => '#BB9C5E',
        'cta_url'   => '',
        'cta_label' => 'まずは査定価格を確かめる',
        'cta_note'  => '入力は1分ほど。しつこい営業はありません',
        'cta_on'    => array('tedori', 'jouto', 'kakoikomi', 'hikaku'),
        'index_base'=> '',
    );
}

function ftl_opt($key = null) {
    $o = wp_parse_args((array) get_option(FTL_OPT, array()), ftl_defaults());
    return $key === null ? $o : (isset($o[$key]) ? $o[$key] : null);
}

/* =========================================================================
 * アセット（ショートコードがあるページだけで読み込む）
 * ======================================================================= */

function ftl_register_assets() {
    wp_register_style('ftl', FTL_URL . 'assets/ftl.css', array(), FTL_VER);
    wp_register_script('ftl', FTL_URL . 'assets/ftl.js', array(), FTL_VER, true);
    wp_register_script('ftl-tools', FTL_URL . 'assets/ftl-tools.js', array('ftl'), FTL_VER, true);
}
add_action('wp_enqueue_scripts', 'ftl_register_assets');

function ftl_enqueue() {
    wp_enqueue_style('ftl');
    wp_enqueue_script('ftl');
    wp_enqueue_script('ftl-tools');
}

/* =========================================================================
 * 描画
 * ======================================================================= */

/** 16進の色から、濃い版と薄い版を作る */
function ftl_shades($hex, $darken = 0.78, $lighten = 0.92) {
    if (!preg_match('/^#[0-9a-fA-F]{6}$/', (string) $hex)) return null;
    list($r, $g, $b) = array(hexdec(substr($hex, 1, 2)), hexdec(substr($hex, 3, 2)), hexdec(substr($hex, 5, 2)));
    return array(
        'base'  => $hex,
        'dark'  => sprintf('#%02x%02x%02x', (int) ($r * $darken), (int) ($g * $darken), (int) ($b * $darken)),
        'light' => sprintf('#%02x%02x%02x',
            (int) ($r + (255 - $r) * $lighten), (int) ($g + (255 - $g) * $lighten), (int) ($b + (255 - $b) * $lighten)),
    );
}

/**
 * 配色をCSS変数のインラインstyleに変換する。
 * サイトのテーマ設定（theme_mod diver_color_custom）に合わせた2色で組む。
 *   濃色 … ヘッダー帯・フッターと同じ紺。合計行・選択中のタイル・フォーカス
 *   差し色 … ヘッダーCTAと同じ真鍮。ラベルの下線・矢印・ボタン
 * 枠線そのものはCSS側の薄いグレーのまま。濃色で囲うと強すぎる。
 */
function ftl_accent_style() {
    $o = ftl_opt();
    $css = '';
    if ($n = ftl_shades($o['accent'])) {
        $css .= sprintf('--ftl-navy:%s;--ftl-navy-d:%s;--ftl-navy-l:%s;', $n['base'], $n['dark'], $n['light']);
    }
    if ($b = ftl_shades($o['brass'], 0.9, 0.9)) {
        $css .= sprintf('--ftl-brass:%s;--ftl-brass-l:%s;', $b['base'], $b['light']);
    }
    return $css;
}

/** CTAブロック。URLが未設定なら何も出さない */
function ftl_cta_html($slug) {
    $o = ftl_opt();
    if (empty($o['cta_url'])) return '';
    $on = is_array($o['cta_on']) ? $o['cta_on'] : array();
    if (!in_array($slug, $on, true)) return '';
    $html  = '<a class="ftl-cta" data-cta="1" href="' . esc_url($o['cta_url']) . '">';
    $html .= esc_html($o['cta_label']);
    if (!empty($o['cta_note'])) $html .= '<small>' . esc_html($o['cta_note']) . '</small>';
    $html .= '</a>';
    return $html;
}

/**
 * [fudosan_tool name="tedori"]
 *   title="" … 見出しを差し替える
 *   desc="off" … 解説（サーバー出力）を出さない
 *   head="off" … 見出しと導入文を出さない（記事の途中に埋めるとき）
 */
function ftl_shortcode_tool($atts) {
    $a = shortcode_atts(array(
        'name'  => '', 'title' => '', 'desc' => 'on', 'head' => 'on', 'cta' => 'on',
    ), $atts, 'fudosan_tool');

    $slug  = sanitize_key($a['name']);
    $tools = ftl_tools();
    if (!isset($tools[$slug])) {
        return '<!-- fudosan_tool: 「' . esc_html($a['name']) . '」というツールはありません -->';
    }
    $t = $tools[$slug];
    ftl_enqueue();

    $style = ftl_accent_style();
    $out  = '<div class="ftl" data-tool="' . esc_attr($slug) . '"' . ($style ? ' style="' . esc_attr($style) . '"' : '') . '>';

    if ($a['head'] !== 'off') {
        $out .= '<div class="ftl-head">';
        $out .= '<span class="ftl-eyebrow">' . esc_html($t['eyebrow']) . '</span>';
        $out .= '<h2 class="ftl-title">' . esc_html($a['title'] !== '' ? $a['title'] : $t['title']) . '</h2>';
        $out .= '<p class="ftl-lead">' . esc_html($t['lead']) . '</p>';
        $out .= '</div>';
    }

    $out .= '<noscript><div class="ftl-noscript">この計算ツールはブラウザの中で計算します。ご利用にはJavaScriptを有効にしてください。</div></noscript>';
    $out .= '<div class="ftl-app"></div>';

    if ($a['cta'] !== 'off') $out .= ftl_cta_html($slug);

    if ($a['desc'] !== 'off') {
        $out .= '<div class="ftl-desc">' . $t['desc'] . '</div>';
        if (!empty($t['sources'])) {
            $links = array();
            foreach ($t['sources'] as $s) {
                $links[] = '<a href="' . esc_url($s[1]) . '" target="_blank" rel="noopener nofollow">' . esc_html($s[0]) . '</a>';
            }
            $out .= '<p class="ftl-src">出典：' . implode('／', $links) . '</p>';
        }
    }

    $out .= '</div>';
    return $out;
}
add_shortcode('fudosan_tool', 'ftl_shortcode_tool');

/**
 * 一覧のリンク先の前半を決める。
 *   属性 base → 設定画面の値 → 公開済みのツールページから自動で割り出す、の順。
 *
 * 自動割り出しは、ツールのスラッグと同じ名前の固定ページを探し、そのURLから
 * 末尾のスラッグを落とす。/tools/tedori/ が見つかれば /tools/ を得る。
 * 設定を入れ忘れても動くようにするための保険で、結果は1時間キャッシュする。
 */
function ftl_detect_base() {
    $cached = get_transient('ftl_index_base');
    if ($cached !== false) return $cached;

    $base = '';
    foreach (array_keys(ftl_tools()) as $slug) {
        $pages = get_posts(array(
            'post_type' => 'page', 'name' => $slug, 'post_status' => 'publish',
            'numberposts' => 1, 'no_found_rows' => true, 'suppress_filters' => false,
        ));
        if (!$pages) continue;
        $link = get_permalink($pages[0]);
        if (!$link) continue;
        $candidate = preg_replace('#' . preg_quote($slug, '#') . '/?$#', '', $link);
        if ($candidate && $candidate !== $link) { $base = $candidate; break; }
    }
    set_transient('ftl_index_base', $base, HOUR_IN_SECONDS);
    return $base;
}

/**
 * [fudosan_tools_index]
 *   base="/tools/"        … ツールページのURLの前半。「base + スラッグ + /」がリンク先になる
 *                           省略すると設定画面の値を使う
 *   only="chukai,jouto"   … このツールだけを、書いた順に出す（記事の内容に合わせて絞る）
 *   exclude="kotei"       … このツールを外す（only と併用しない）
 *   cols="1|2|3"          … 列数を固定する。省略すると幅に合わせて折り返す
 *   style="card|row"      … card=説明つきのカード（既定）／row=1行ずつの詰めた並び
 *   title="関連する計算ツール" … 見出しを付ける
 */
function ftl_shortcode_index($atts) {
    $a = shortcode_atts(array(
        'base' => '', 'only' => '', 'exclude' => '', 'cols' => '', 'style' => 'card', 'title' => '',
    ), $atts, 'fudosan_tools_index');

    $base = $a['base'] !== '' ? $a['base'] : ftl_opt('index_base');
    if ($base === '') $base = ftl_detect_base();
    if ($base === '') {
        return '<!-- fudosan_tools_index: ツールページが見つかりません。'
             . '各ツールの固定ページを公開するか、設定 → 売却ツール でリンク先の前半を入れてください -->';
    }
    $base = trailingslashit($base);

    $tools = ftl_tools();
    $keys  = array_keys($tools);

    /* only は書いた順を保つ。存在しないスラッグは黙って捨てる */
    $only = array_values(array_filter(array_map('sanitize_key',
        array_map('trim', explode(',', (string) $a['only'])))));
    if ($only) {
        $keys = array_values(array_intersect($only, $keys));
    } else {
        $skip = array_filter(array_map('sanitize_key',
            array_map('trim', explode(',', (string) $a['exclude']))));
        $keys = array_values(array_diff($keys, $skip));
    }
    if (!$keys) return '<!-- fudosan_tools_index: 出すツールがありません -->';

    ftl_enqueue();

    $cls = 'ftl-index';
    if (in_array((string) $a['cols'], array('1', '2', '3'), true)) $cls .= ' is-cols-' . $a['cols'];
    if ($a['style'] === 'row') $cls .= ' is-row';

    $style = ftl_accent_style();
    $out  = '<div class="ftl"' . ($style ? ' style="' . esc_attr($style) . '"' : '') . '>';
    if ($a['title'] !== '') {
        $out .= '<div class="ftl-head"><h2 class="ftl-title">' . esc_html($a['title']) . '</h2></div>';
    }
    $out .= '<div class="' . esc_attr($cls) . '">';
    foreach ($keys as $slug) {
        $t = $tools[$slug];
        $out .= '<a class="ftl-card" href="' . esc_url($base . $slug . '/') . '">';
        $out .= '<b>' . esc_html($t['title']) . '</b>';
        if ($a['style'] !== 'row') $out .= '<span>' . esc_html($t['lead']) . '</span>';
        $out .= '</a>';
    }
    $out .= '</div></div>';
    return $out;
}
add_shortcode('fudosan_tools_index', 'ftl_shortcode_index');

/* =========================================================================
 * 管理画面
 * ======================================================================= */

function ftl_admin_menu() {
    add_options_page('売却ツール', '売却ツール', 'manage_options', 'fudosan-tools', 'ftl_settings_page');
}
add_action('admin_menu', 'ftl_admin_menu');

function ftl_admin_init() {
    register_setting('ftl_group', FTL_OPT, array('sanitize_callback' => 'ftl_sanitize'));
}
add_action('admin_init', 'ftl_admin_init');

function ftl_sanitize($in) {
    $d = ftl_defaults();
    $o = array();
    $o['accent']    = preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($in['accent'] ?? '')) ? $in['accent'] : $d['accent'];
    $o['brass']     = preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($in['brass'] ?? '')) ? $in['brass'] : $d['brass'];
    $o['cta_url']   = esc_url_raw(trim((string) ($in['cta_url'] ?? '')));
    $o['cta_label'] = sanitize_text_field((string) ($in['cta_label'] ?? $d['cta_label']));
    $o['cta_note']  = sanitize_text_field((string) ($in['cta_note'] ?? ''));
    $o['index_base']= esc_url_raw(trim((string) ($in['index_base'] ?? '')));
    $on = isset($in['cta_on']) && is_array($in['cta_on']) ? $in['cta_on'] : array();
    $o['cta_on'] = array_values(array_intersect(array_map('sanitize_key', $on), array_keys(ftl_tools())));
    delete_transient('ftl_index_base'); // 設定を変えたら自動割り出しを取り直す
    return $o;
}

function ftl_settings_page() {
    if (!current_user_can('manage_options')) return;
    $o = ftl_opt();
    $tools = ftl_tools();
    ?>
    <div class="wrap">
      <h1>売却ツール</h1>
      <p>ページや記事に <code>[fudosan_tool name="スラッグ"]</code> を貼ると、そのツールが表示されます。</p>

      <form method="post" action="options.php">
        <?php settings_fields('ftl_group'); ?>

        <h2>配色</h2>
        <table class="form-table" role="presentation">
          <tr>
            <th scope="row"><label for="ftl-accent">濃色</label></th>
            <td>
              <input type="color" id="ftl-accent" name="<?php echo FTL_OPT; ?>[accent]" value="<?php echo esc_attr($o['accent']); ?>">
              <p class="description">
                合計行の罫、選択中のタイル、フォーカス枠に使います。
                サイトのヘッダー帯・フッターと同じ色（カスタマイズ &gt; カラー の「サブ」）を入れてください。
                既定は <code>#1F2E43</code>。
              </p>
            </td>
          </tr>
          <tr>
            <th scope="row"><label for="ftl-brass">差し色</label></th>
            <td>
              <input type="color" id="ftl-brass" name="<?php echo FTL_OPT; ?>[brass]" value="<?php echo esc_attr($o['brass']); ?>">
              <p class="description">
                ラベルの下線、一覧カードの矢印、ボタンに使います。
                サイトのヘッダーにあるCTAボタンと同じ色が揃います。既定は <code>#BB9C5E</code>。
              </p>
            </td>
          </tr>
        </table>

        <h2>結果の下に出すボタン</h2>
        <table class="form-table" role="presentation">
          <tr>
            <th scope="row"><label for="ftl-cta-url">リンク先URL</label></th>
            <td>
              <input type="url" class="regular-text" id="ftl-cta-url" name="<?php echo FTL_OPT; ?>[cta_url]" value="<?php echo esc_attr($o['cta_url']); ?>" placeholder="https://example.com/satei/">
              <p class="description">空にするとボタンを出しません。</p>
            </td>
          </tr>
          <tr>
            <th scope="row"><label for="ftl-cta-label">ボタンの文言</label></th>
            <td><input type="text" class="regular-text" id="ftl-cta-label" name="<?php echo FTL_OPT; ?>[cta_label]" value="<?php echo esc_attr($o['cta_label']); ?>"></td>
          </tr>
          <tr>
            <th scope="row"><label for="ftl-cta-note">ボタンの下の一言</label></th>
            <td><input type="text" class="regular-text" id="ftl-cta-note" name="<?php echo FTL_OPT; ?>[cta_note]" value="<?php echo esc_attr($o['cta_note']); ?>"></td>
          </tr>
          <tr>
            <th scope="row">ボタンを出すツール</th>
            <td>
              <?php foreach ($tools as $slug => $t) : ?>
                <label style="display:block;margin-bottom:4px;">
                  <input type="checkbox" name="<?php echo FTL_OPT; ?>[cta_on][]" value="<?php echo esc_attr($slug); ?>"
                    <?php checked(in_array($slug, (array) $o['cta_on'], true)); ?>>
                  <?php echo esc_html($t['title']); ?>
                </label>
              <?php endforeach; ?>
              <p class="description">計算して終わる性質のツール（日割り計算など）では、出さないほうが自然です。</p>
            </td>
          </tr>
        </table>

        <h2>ツール一覧</h2>
        <table class="form-table" role="presentation">
          <tr>
            <th scope="row"><label for="ftl-index-base">一覧のリンク先の前半</label></th>
            <td>
              <input type="text" class="regular-text" id="ftl-index-base" name="<?php echo FTL_OPT; ?>[index_base]" value="<?php echo esc_attr($o['index_base']); ?>" placeholder="/tools/">
              <p class="description">
                <code>[fudosan_tools_index]</code> のリンク先は「ここ＋スラッグ＋/」になります。
                <strong>空のままでも構いません。</strong>その場合は、ツールのスラッグと同じ名前の
                公開済み固定ページを探して自動で決めます（例: <code>/tools/tedori/</code> があれば <code>/tools/</code>）。
              </p>
            </td>
          </tr>
        </table>

        <?php submit_button(); ?>
      </form>

      <h2>ショートコード一覧</h2>
      <table class="widefat striped" style="max-width:920px">
        <thead><tr><th style="width:290px">書き方</th><th>出るもの</th></tr></thead>
        <tbody>
        <?php foreach ($tools as $slug => $t) : ?>
          <tr>
            <td><code>[fudosan_tool name="<?php echo esc_html($slug); ?>"]</code></td>
            <td><strong><?php echo esc_html($t['title']); ?></strong><br><span style="color:#666"><?php echo esc_html($t['lead']); ?></span></td>
          </tr>
        <?php endforeach; ?>
          <tr>
            <td><code>[fudosan_tools_index]</code></td>
            <td>ツール一覧のカード</td>
          </tr>
        </tbody>
      </table>
      <p style="color:#666;max-width:920px">
        <strong>ツール本体の属性</strong>：<code>head="off"</code> で見出しと導入文を省略（記事の途中に埋めるとき）、
        <code>desc="off"</code> で解説を省略、<code>cta="off"</code> でボタンを省略、
        <code>title="…"</code> で見出しを差し替えます。
      </p>
      <p style="color:#666;max-width:920px">
        <strong>一覧の属性</strong>：<code>only="chukai,jouto"</code> で書いた順に指定のツールだけ、
        <code>exclude="kotei"</code> で除外、<code>cols="1|2|3"</code> で列数を固定、
        <code>style="row"</code> で説明を出さない詰めた並び（記事の途中やサイドバー向け）、
        <code>title="関連する計算ツール"</code> で見出しを付けます。
        <code>base</code> を省略すると上の「一覧のリンク先の前半」を使います。
      </p>
      <p style="color:#666;max-width:920px">
        例：<code>[fudosan_tools_index only="chukai,tedori" cols="1" style="row" title="この記事に関係する計算ツール"]</code>
      </p>
    </div>
    <?php
}

/* 「設定」リンクをプラグイン一覧に出す */
function ftl_action_links($links) {
    array_unshift($links, '<a href="' . admin_url('options-general.php?page=fudosan-tools') . '">設定</a>');
    return $links;
}
add_filter('plugin_action_links_' . plugin_basename(__FILE__), 'ftl_action_links');
