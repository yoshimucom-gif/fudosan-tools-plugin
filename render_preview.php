<?php
/**
 * ブラウザ確認用のHTMLを書き出す。WordPressなしで動く。
 *
 *   C:\Users\yoshi\php-portable\php82\php.exe -n render_preview.php
 *
 * preview/index.html（全ツール）と preview/<スラッグ>.html（1ツールずつ）を作る。
 * preview/ は git 管理外。
 */

define('ABSPATH', __DIR__ . '/');

/* ---- WordPress の関数の最小限の代用 ---- */
function esc_html($s)  { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function esc_attr($s)  { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function esc_url($s)   { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }
function sanitize_key($s) { return preg_replace('/[^a-z0-9_\-]/', '', strtolower((string)$s)); }
function trailingslashit($s) { return rtrim((string)$s, '/') . '/'; }
function wp_parse_args($a, $d) { return array_merge($d, array_filter((array)$a, function ($v) { return $v !== null; })); }
function shortcode_atts($pairs, $atts, $sc = '') {
    $atts = (array)$atts; $out = array();
    foreach ($pairs as $k => $v) $out[$k] = array_key_exists($k, $atts) ? $atts[$k] : $v;
    return $out;
}
$GLOBALS['ftl_preview_opt'] = array(
    'accent'    => '#1F2E43',
    'brass'     => '#BB9C5E',
    'cta_url'   => 'https://example.com/satei/',
    'cta_label' => 'まずは査定価格を確かめる',
    'cta_note'  => '入力は1分ほど。しつこい営業はありません',
    'cta_on'    => array('tedori', 'jouto', 'kakoikomi', 'hikaku'),
    'index_base'=> '/tools/',
);
function get_option($k, $d = array()) { return $GLOBALS['ftl_preview_opt']; }
function add_shortcode($a, $b) {}
function add_action($a, $b, $c = 10, $d = 1) {}
function add_filter($a, $b, $c = 10, $d = 1) {}
function plugin_dir_path($f) { return dirname($f) . '/'; }
function plugin_dir_url($f)  { return '../fudosan-tools/'; }
function plugin_basename($f) { return basename(dirname($f)) . '/' . basename($f); }
function admin_url($p = '')  { return '/wp-admin/' . $p; }
function is_admin() { return false; }
function wp_register_style() {} function wp_register_script() {}
function wp_enqueue_style() {}  function wp_enqueue_script() {}
function register_setting() {}  function add_options_page() {}
function settings_fields() {}   function submit_button() {}
function checked() {}           function current_user_can() { return false; }
function esc_url_raw($s) { return $s; }
function sanitize_text_field($s) { return $s; }

require __DIR__ . '/fudosan-tools/fudosan-tools.php';

$tools = ftl_tools();
$dir = __DIR__ . '/preview';
if (!is_dir($dir)) mkdir($dir, 0777, true);

function page($title, $body) {
    return '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>' . esc_html($title) . '</title>'
        . '<link rel="stylesheet" href="../fudosan-tools/assets/ftl.css?t=' . time() . '">'
        . '<style>body{margin:0;padding:24px 16px 80px;background:#fff;max-width:900px;margin-inline:auto;'
        . 'font-family:-apple-system,"Hiragino Sans","Noto Sans JP",Meiryo,sans-serif}'
        . 'hr{margin:56px 0;border:0;border-top:1px dashed #ccd}</style>'
        . '</head><body>' . $body
        . '<script src="../fudosan-tools/assets/ftl.js?t=' . time() . '"></script>'
        . '<script src="../fudosan-tools/assets/ftl-tools.js?t=' . time() . '"></script>'
        . '</body></html>';
}

$all  = '<h2 style="font:800 20px/1.5 sans-serif;margin:0 0 10px">一覧（既定）</h2>';
$all .= ftl_shortcode_index(array('base' => '/tools/'));
$all .= '<h2 style="font:800 20px/1.5 sans-serif;margin:34px 0 10px">only＋cols=1＋style=row（記事の途中・サイドバー向け）</h2>';
$all .= ftl_shortcode_index(array('base' => '/tools/', 'only' => 'chukai,jouto,tedori',
        'cols' => '1', 'style' => 'row', 'title' => 'この記事に関係する計算ツール'));
$all .= '<h2 style="font:800 20px/1.5 sans-serif;margin:34px 0 10px">only＋cols=3</h2>';
$all .= ftl_shortcode_index(array('base' => '/tools/', 'only' => 'kotei,shorui,hikaku', 'cols' => '3'));
$all .= '<hr>';
foreach ($tools as $slug => $t) {
    $one = ftl_shortcode_tool(array('name' => $slug));
    file_put_contents("$dir/$slug.html", page($t['title'], $one));
    $all .= $one . '<hr>';
    echo "[ok] preview/$slug.html\n";
}
file_put_contents("$dir/index.html", page('不動産売却ツール集 プレビュー', $all));
echo "[ok] preview/index.html\n";
