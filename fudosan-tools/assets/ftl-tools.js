/* 不動産売却ツール集 — 各ツールの定義と計算
 *
 * 数値の根拠（2026-09時点）:
 *   仲介手数料の上限      … 宅地建物取引業法46条／報酬告示。800万円以下の特例は2024年7月1日施行
 *   印紙税                … 国税庁 タックスアンサー No.7108（軽減措置は令和9年3月31日まで）
 *   譲渡所得の税率        … 国税庁 No.3208（長期20.315%）／No.3211（短期39.63%）／No.3305（軽減税率）
 *   建物の減価償却        … 国税庁 No.3261（非事業用。取得価額×0.9×償却率×経過年数、95%が限度）
 *   相続空き家の特例      … 国税庁 No.3306（2024年1月1日以降の譲渡は相続人3人以上で2,000万円）
 *   レインズ登録・報告義務… 宅建業法34条の2。専任=7営業日以内・2週間に1回以上／専属専任=5営業日以内・1週間に1回以上
 *
 * 税額はいずれも概算。実際の申告は税務署または税理士に確認すること。
 */
(function () {
  'use strict';

  var FTL = (window.FTL = window.FTL || {});
  var T = (FTL.tools = FTL.tools || {});
  var yen = FTL.fmt.yen;
  var man = FTL.fmt.man;

  /* ===================== 共通の計算 ===================== */

  /** 仲介手数料の上限（税込）。速算式。800万円以下は特例で33万円まで受け取れる */
  function brokerage(price) {
    var base;
    if (price <= 2000000) base = price * 0.05;
    else if (price <= 4000000) base = price * 0.04 + 20000;
    else base = price * 0.03 + 60000;
    var normal = Math.floor(base * 1.1);
    var lowOk = price > 0 && price <= 8000000;
    return {
      normal: normal,
      low: lowOk ? 330000 : 0,
      lowApplies: lowOk,
      max: lowOk ? Math.max(normal, 330000) : normal,
      formula: price <= 2000000 ? '売買価格×5%' : (price <= 4000000 ? '売買価格×4%＋2万円' : '売買価格×3%＋6万円')
    };
  }

  /** 不動産譲渡契約書の印紙税（軽減後・令和9年3月31日まで） */
  function stamp(price) {
    var t = [
      [100000, 200], [500000, 200], [1000000, 500], [5000000, 1000],
      [10000000, 5000], [50000000, 10000], [100000000, 30000],
      [500000000, 60000], [1000000000, 160000], [5000000000, 320000]
    ];
    for (var i = 0; i < t.length; i++) if (price <= t[i][0]) return t[i][1];
    return 480000;
  }

  var STRUCT = [
    { v: 'wood', l: '木造', rate: 0.031 },
    { v: 'mortar', l: '木骨モルタル', rate: 0.034 },
    { v: 'rc', l: 'RC・SRC', rate: 0.015, s: 'マンション' },
    { v: 'steel3', l: '軽量鉄骨', rate: 0.036, s: '骨格材3mm以下' },
    { v: 'steel4', l: '軽量鉄骨', rate: 0.025, s: '3mm超4mm以下' }
  ];

  function structRate(v) {
    for (var i = 0; i < STRUCT.length; i++) if (STRUCT[i].v === v) return STRUCT[i].rate;
    return 0.031;
  }

  /** 保有月数（取得年月 "YYYY-MM" → 譲渡年月 "YYYY-MM"） */
  function months(fromYM, toYM) {
    var a = String(fromYM || '').split('-'), b = String(toYM || '').split('-');
    if (a.length < 2 || b.length < 2) return 0;
    return (+b[0] * 12 + +b[1]) - (+a[0] * 12 + +a[1]);
  }

  /** 非事業用建物の減価償却費相当額。国税庁 No.3261 */
  function depreciation(bldgCost, struct, holdMonths) {
    if (bldgCost <= 0) return 0;
    var years = Math.floor(holdMonths / 12) + (holdMonths % 12 >= 6 ? 1 : 0); // 6か月以上は1年
    var d = bldgCost * 0.9 * structRate(struct) * years;
    return Math.floor(Math.min(d, bldgCost * 0.95)); // 取得価額の95%が限度
  }

  /**
   * 譲渡所得税の概算。
   * 所有期間は「譲渡した年の1月1日時点」で判定する（国税庁 No.3208）。
   */
  function capitalGains(o) {
    var price = o.price || 0;
    var expenses = o.expenses || 0;
    var sellY = +String(o.sellYM || '').split('-')[0] || new Date().getFullYear();
    var hold = months(o.buyYM, sellY + '-01'); // 譲渡年1月1日時点までの月数
    var isLong = hold > 60;
    var isSuperLong = hold > 120;

    var dep = 0, acq;
    if (o.acqUnknown || !o.acqCost) {
      acq = Math.floor(price * 0.05); // 概算取得費
    } else {
      dep = depreciation(o.bldgCost || 0, o.struct, months(o.buyYM, o.sellYM));
      acq = Math.max(0, (o.acqCost || 0) - dep);
    }

    var gain = price - acq - expenses;
    var deduction = 0;
    if (o.use3000 && gain > 0) deduction = Math.min(gain, 30000000);
    var taxable = Math.max(0, gain - deduction);

    var incomeTax = 0, resTax = 0, label;
    if (o.useReduced && isSuperLong) {
      var under = Math.min(taxable, 60000000), over = Math.max(0, taxable - 60000000);
      incomeTax = under * 0.1021 + over * 0.15315;
      resTax = under * 0.04 + over * 0.05;
      label = '10年超の軽減税率（6,000万円以下14.21%／超20.315%）';
    } else if (isLong) {
      incomeTax = taxable * 0.15315;
      resTax = taxable * 0.05;
      label = '長期譲渡所得 20.315%';
    } else {
      incomeTax = taxable * 0.3063;
      resTax = taxable * 0.09;
      label = '短期譲渡所得 39.63%';
    }

    return {
      holdMonths: hold, isLong: isLong, isSuperLong: isSuperLong,
      dep: dep, acq: acq, gain: gain, deduction: deduction, taxable: taxable,
      incomeTax: Math.floor(incomeTax), resTax: Math.floor(resTax),
      total: Math.floor(incomeTax) + Math.floor(resTax),
      rateLabel: label
    };
  }

  FTL.calc = { brokerage: brokerage, stamp: stamp, depreciation: depreciation, capitalGains: capitalGains };

  /* 使い回す入力欄 */
  function priceField(def) {
    return {
      k: 'price', t: 'man', label: '売却価格（売買代金）', def: def || 3000,
      min: 0, max: 15000, step: 50, hint: '査定額や売り出し価格で構いません。'
    };
  }

  var TAX_NOTE = '税額は概算です。実際の申告額は取得時の資料や適用できる特例で変わります。税務署または税理士にご確認ください。';

  /* ===================== 1. 固定資産税の日割り精算 ===================== */

  T.kotei = {
    title: '固定資産税・都市計画税の日割り精算',
    groups: [{
      fields: [
        { k: 'tax', t: 'yen', label: '年税額（固定資産税＋都市計画税）', def: 120000, min: 0, max: 600000, step: 1000,
          hint: '納税通知書に書かれている1年分の合計額を入れてください。' },
        { k: 'date', t: 'date', label: '引渡し日（決済日）', defDays: 30 },
        { k: 'base', t: 'tiles', cols: 2, def: '1', label: '起算日',
          opts: [{ v: '1', l: '1月1日', s: '関東で多い' }, { v: '4', l: '4月1日', s: '関西で多い' }],
          hint: '法律ではなく商習慣です。どちらにするかは売買契約で決めます。' },
        { k: 'who', t: 'tiles', cols: 2, def: 'buyer', label: '引渡し日当日の負担',
          opts: [{ v: 'buyer', l: '買主' }, { v: 'seller', l: '売主' }] }
      ]
    }],
    compute: function (v) {
      var d = new Date(v.date + 'T00:00:00');
      if (isNaN(d.getTime())) return { headline: { label: '引渡し日を入れてください', value: '—' } };

      var baseMonth = v.base === '4' ? 3 : 0; // 0=1月, 3=4月
      var startY = d.getMonth() < baseMonth ? d.getFullYear() - 1 : d.getFullYear();
      var start = new Date(startY, baseMonth, 1);
      var end = new Date(startY + 1, baseMonth, 1); // 期間の翌日
      var dayMs = 86400000;
      var totalDays = Math.round((end - start) / dayMs);

      // 買主負担の開始日（当日を買主が持つなら引渡し日から）
      var buyerStart = new Date(d);
      if (v.who === 'seller') buyerStart.setDate(buyerStart.getDate() + 1);
      var buyerDays = Math.max(0, Math.min(totalDays, Math.round((end - buyerStart) / dayMs)));
      var sellerDays = totalDays - buyerDays;

      var buyerAmt = Math.floor(v.tax * buyerDays / totalDays);
      var sellerAmt = v.tax - buyerAmt;
      var fmt = function (x) { return x.getFullYear() + '年' + (x.getMonth() + 1) + '月' + x.getDate() + '日'; };

      return {
        headline: {
          label: '買主から受け取る精算金',
          value: Math.round(buyerAmt).toLocaleString('ja-JP'), unit: '円',
          sub: buyerDays + '日分（' + fmt(buyerStart) + '〜' + fmt(new Date(end - dayMs)) + '）'
        },
        bar: [
          { label: '売主の負担', value: sellerAmt, color: '#7c8b95' },
          { label: '買主の負担', value: buyerAmt, color: '#0f6f8f' }
        ],
        rows: [
          { label: '精算の対象期間', value: fmt(start) + '〜' + fmt(new Date(end - dayMs)) },
          { label: '期間の日数', value: totalDays + '日' + (totalDays === 366 ? '（うるう年）' : '') },
          { label: '売主の負担日数', value: sellerDays + '日' },
          { label: '売主の負担額', value: yen(sellerAmt) },
          { label: '買主の負担日数', value: buyerDays + '日' },
          { label: '買主の負担額（精算金）', value: yen(buyerAmt), kind: 'total' }
        ],
        notes: [
          '固定資産税は1月1日時点の所有者に1年分が課税されます。日割り精算は、その負担を引渡し日で分けるための商習慣で、法律上の義務ではありません。',
          '起算日を1月1日とするか4月1日とするかで精算金は変わります。売買契約書にどちらで計算するか明記してもらってください。',
          '1円未満の端数処理も契約で決めます。ここでは買主負担分を切り捨てて計算しています。',
          '精算金は税金ではなく売買代金の一部として扱われます。'
        ]
      };
    }
  };

  /* ===================== 2. 仲介手数料 ===================== */

  T.chukai = {
    title: '仲介手数料の計算',
    groups: [{
      fields: [
        priceField(3000),
        { k: 'low', t: 'check', def: false, label: '800万円以下の特例を適用する',
          text: '800万円以下の物件で、特例による報酬額の説明と合意がある',
          note: '2024年7月1日から、800万円以下の売買では最大33万円（税込）まで受け取れます' }
      ]
    }],
    compute: function (v) {
      var b = brokerage(v.price);
      var applied = (v.low && b.lowApplies) ? b.max : b.normal;

      var rows = [
        { label: '速算式', value: b.formula + '＋消費税10%' },
        { label: '本体（税抜）', value: yen(Math.floor(applied / 1.1)) },
        { label: '消費税', value: yen(applied - Math.floor(applied / 1.1)) },
        { label: '仲介手数料の上限（税込）', value: yen(applied), kind: 'total' }
      ];
      if (b.lowApplies) {
        rows.splice(1, 0, { label: '通常の上限', value: yen(b.normal), kind: 'sub' });
        rows.splice(2, 0, { label: '特例の上限', value: yen(330000), kind: 'sub' });
      }

      var steps = [500, 800, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 8000, 10000];
      var hit = -1, pm = Math.round(v.price / 10000);
      var trows = steps.map(function (m, i) {
        var bb = brokerage(m * 10000);
        if (hit < 0 && pm <= m) hit = i;
        return [m.toLocaleString('ja-JP') + '万円', yen(bb.normal), bb.lowApplies ? yen(330000) : '—'];
      });

      var flags = [];
      if (b.lowApplies) {
        flags.push({ level: v.low ? 'warn' : 'info', title: '800万円以下の特例',
          text: v.low
            ? '特例を使うと、通常の上限より' + yen(Math.max(0, 330000 - b.normal)) + '高くなります。あらかじめ説明を受け、合意したうえで媒介契約に記載されているか確認してください。'
            : '2024年7月1日から、800万円以下の売買では売主・買主それぞれから最大33万円（税込）まで受け取れるようになりました。適用にはあらかじめの説明と合意が必要です。' });
      }
      flags.push({ level: 'info', title: 'これは上限額です',
        text: '法律が定めているのは「これ以上受け取ってはいけない」という上限で、必ずこの金額になるわけではありません。値引きの相談はできます。' });
      flags.push({ level: 'warn', title: '広告費の別途請求',
        text: '通常の売却活動にかかる広告費は仲介手数料に含まれます。売主が特別に依頼した広告でなければ、別途請求は原則できません。' });

      return {
        headline: { label: '仲介手数料の上限（税込）', value: Math.round(applied).toLocaleString('ja-JP'), unit: '円',
          sub: b.formula + '＋消費税' },
        rows: rows,
        flags: flags,
        table: { head: ['売買価格', '通常の上限', '800万円以下の特例'], rows: trows, hit: hit },
        notes: [
          '消費税率10%で計算しています。仲介手数料には消費税がかかります。',
          '400万円以下の物件では、通常の計算に加えて現地調査等の費用を上乗せできる仕組みがありました。2024年7月からは800万円以下の物件に範囲が広がり、上限も30万円（税抜）に引き上げられています。',
          '上限額は「1つの取引で1社が受け取れる額」です。売主と買主の双方から受け取る場合、それぞれに上限が適用されます。'
        ]
      };
    }
  };

  /* ===================== 3. 手取り額シミュレーター ===================== */

  var joutoFields = [
    { k: 'acqKnown', t: 'tiles', cols: 2, def: 'yes', label: '買ったときの価格がわかる書類はありますか',
      opts: [{ v: 'yes', l: 'ある', s: '契約書など' }, { v: 'no', l: 'ない' }],
      hint: '書類がない場合は「売却価格の5%」を取得費とみなして計算します（概算取得費）。' },
    { k: 'acqCost', t: 'man', label: '購入価格（土地＋建物の合計）', def: 2500, min: 0, max: 15000, step: 50,
      when: function (v) { return v.acqKnown === 'yes'; } },
    { k: 'bldgCost', t: 'man', label: 'うち建物の価格', def: 1500, min: 0, max: 8000, step: 50,
      hint: '売買契約書の内訳や、購入時の消費税額から逆算した額を入れてください。0にすると減価償却を計算しません。',
      when: function (v) { return v.acqKnown === 'yes'; } },
    { k: 'struct', t: 'tiles', def: 'rc', label: '建物の構造',
      opts: STRUCT.map(function (s) { return { v: s.v, l: s.l, s: s.s || ('償却率 ' + s.rate) }; }),
      when: function (v) { return v.acqKnown === 'yes'; } },
    { k: 'buyYM', t: 'ym', label: '購入した時期', defY: new Date().getFullYear() - 15, defM: 4,
      when: function (v) { return v.acqKnown === 'yes'; } },
    { k: 'buyYM2', t: 'ym', label: '購入した時期', defY: new Date().getFullYear() - 15, defM: 4,
      when: function (v) { return v.acqKnown === 'no'; } },
    { k: 'home', t: 'tiles', cols: 2, def: 'yes', label: '自分が住んでいた家ですか',
      opts: [{ v: 'yes', l: 'はい' }, { v: 'no', l: 'いいえ' }],
      hint: '住まなくなってから3年目の年末までの売却なら、3,000万円特別控除の対象になり得ます。' },
    { k: 'use3000', t: 'check', def: true, label: '3,000万円特別控除を使う',
      text: '居住用財産の3,000万円特別控除を使う',
      note: '前年・前々年に同じ特例を使っていないこと、買主が親族等でないことが要件です',
      when: function (v) { return v.home === 'yes'; } },
    { k: 'useReduced', t: 'check', def: true, label: '10年超の軽減税率を使う',
      text: '所有期間10年超の軽減税率を使う',
      note: '3,000万円控除と併用できます。所有期間が10年以下のときは自動で無視されます',
      when: function (v) { return v.home === 'yes'; } }
  ];

  function joutoInput(v) {
    var now = new Date();
    return {
      price: v.price, expenses: v.jExpenses || 0,
      acqUnknown: v.acqKnown === 'no',
      acqCost: v.acqCost, bldgCost: v.bldgCost, struct: v.struct,
      buyYM: v.acqKnown === 'no' ? v.buyYM2 : v.buyYM,
      sellYM: now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2),
      use3000: v.home === 'yes' && v.use3000,
      useReduced: v.home === 'yes' && v.useReduced
    };
  }

  T.tedori = {
    title: '不動産売却の手取り額シミュレーター',
    groups: [
      { title: '売却の条件', fields: [
        priceField(3000),
        { k: 'loan', t: 'man', label: '住宅ローンの残債', def: 0, min: 0, max: 10000, step: 50,
          hint: '残っていなければ0のままで構いません。' }
      ] },
      { title: '売却にかかる費用', fields: [
        { k: 'brokerMode', t: 'tiles', cols: 2, def: 'auto', label: '仲介手数料',
          opts: [{ v: 'auto', l: '上限で計算' }, { v: 'manual', l: '金額を入れる' }] },
        { k: 'brokerManual', t: 'yen', label: '仲介手数料（税込）', def: 1056000, min: 0, max: 5000000, step: 10000,
          when: function (v) { return v.brokerMode === 'manual'; } },
        { k: 'units', t: 'num', unit: '個', label: '抵当権を抹消する不動産の個数', def: 2, min: 0, max: 10, step: 1,
          hint: '土地1筆＋建物1棟なら2です。登録免許税は1個につき1,000円。',
          when: function (v) { return v.loan > 0; } },
        { k: 'shiho', t: 'yen', label: '司法書士への報酬', def: 15000, min: 0, max: 100000, step: 1000,
          hint: '抵当権抹消の依頼料の目安です。事務所によって幅があります。',
          when: function (v) { return v.loan > 0; } },
        { k: 'other', t: 'yen', label: 'その他の費用', def: 0, min: 0, max: 5000000, step: 10000,
          hint: '測量、解体、ハウスクリーニング、残置物の処分、引越し費用など。' }
      ] },
      { title: '譲渡所得税の計算に使う項目', fold: true, fields: joutoFields }
    ],
    compute: function (v) {
      var b = brokerage(v.price);
      var broker = v.brokerMode === 'manual' ? v.brokerManual : b.normal;
      var st = stamp(v.price);
      var reg = v.loan > 0 ? (v.units * 1000 + v.shiho) : 0;
      var expenses = broker + st + (v.other || 0);

      var g = capitalGains(joutoInput({
        price: v.price, jExpenses: broker + st,
        acqKnown: v.acqKnown, acqCost: v.acqCost, bldgCost: v.bldgCost, struct: v.struct,
        buyYM: v.buyYM, buyYM2: v.buyYM2, home: v.home, use3000: v.use3000, useReduced: v.useReduced
      }));

      var costs = expenses + reg + g.total;
      var net = v.price - costs - v.loan;

      var rows = [
        { label: '売却価格', value: yen(v.price) },
        { label: '仲介手数料', value: '−' + yen(broker), kind: 'minus' },
        { label: '印紙税', value: '−' + yen(st), kind: 'minus' }
      ];
      if (reg > 0) {
        rows.push({ label: '抵当権抹消（登録免許税＋報酬）', value: '−' + yen(reg), kind: 'minus' });
        rows.push({ label: '登録免許税 ' + v.units + '個×1,000円', value: yen(v.units * 1000), kind: 'sub' });
        rows.push({ label: '司法書士報酬', value: yen(v.shiho), kind: 'sub' });
      }
      if (v.other > 0) rows.push({ label: 'その他の費用', value: '−' + yen(v.other), kind: 'minus' });
      rows.push({ label: '譲渡所得税・住民税', value: '−' + yen(g.total), kind: 'minus' });
      rows.push({ label: '所得税＋復興特別所得税', value: yen(g.incomeTax), kind: 'sub' });
      rows.push({ label: '住民税', value: yen(g.resTax), kind: 'sub' });
      if (v.loan > 0) rows.push({ label: '住宅ローンの返済', value: '−' + yen(v.loan), kind: 'minus' });
      rows.push({ label: '手元に残る金額', value: yen(net), kind: 'total' });

      var bar = [{ label: '手取り', value: Math.max(0, net), color: '#0f6f8f' }];
      if (v.loan > 0) bar.push({ label: 'ローン返済', value: v.loan, color: '#7c8b95' });
      bar.push({ label: '仲介手数料', value: broker, color: '#3fa2c4' });
      if (g.total > 0) bar.push({ label: '税金', value: g.total, color: '#b4232a' });
      var etc = st + reg + (v.other || 0);
      if (etc > 0) bar.push({ label: 'その他', value: etc, color: '#d98324' });

      var flags = [];
      if (net < 0) {
        flags.push({ level: 'ng', title: '売却代金だけでは足りません',
          text: '不足分は' + yen(Math.abs(net)) + 'です。自己資金を用意するか、住み替えローン、任意売却といった選択肢を金融機関に相談することになります。' });
      }
      if (g.gain <= 0) {
        flags.push({ level: 'ok', title: '譲渡益が出ていません',
          text: '売却価格より取得費と譲渡費用の合計が大きいため、譲渡所得税はかかりません。マイホームであれば、損失を他の所得と通算できる特例を使える場合があります。' });
      } else if (g.deduction > 0) {
        flags.push({ level: 'ok', title: '3,000万円特別控除で' + yen(g.deduction) + 'を差し引いています',
          text: '控除後の課税対象は' + yen(g.taxable) + 'です。' + (g.taxable === 0 ? '税額は0ですが、特例を使うには確定申告が必要です。' : '') });
      }
      if (v.acqKnown === 'no') {
        flags.push({ level: 'warn', title: '概算取得費で計算しています',
          text: '購入時の契約書が見つからないため、売却価格の5%（' + yen(g.acq) + '）を取得費としています。実際の購入価格がこれより高ければ税額は下がります。通帳、住宅ローンの金銭消費貸借契約書、登記時の書類などから購入価格を裏づけられないか探してみてください。' });
      }
      if (g.dep > 0) {
        flags.push({ level: 'info', title: '建物の減価償却を' + yen(g.dep) + '差し引きました',
          text: '建物は年々価値が減るものとして、取得費から償却相当額を引きます。ここを引かずに計算すると税額を少なく見積もることになります。' });
      }

      return {
        headline: { label: '手元に残る金額', value: Math.round(net).toLocaleString('ja-JP'), unit: '円',
          sub: '売却価格 ' + man(v.price) + ' − 費用 ' + man(costs) + (v.loan > 0 ? ' − ローン ' + man(v.loan) : '') },
        bar: bar, rows: rows, flags: flags,
        notes: [
          '所有期間は' + Math.floor(g.holdMonths / 12) + '年（譲渡年の1月1日時点）として、' + g.rateLabel + 'で計算しました。',
          TAX_NOTE,
          '引渡し時には固定資産税の日割り精算金を買主から受け取ります。ここには含めていません。',
          '住宅ローンを一括返済する際、金融機関によっては繰上返済手数料がかかります。'
        ]
      };
    }
  };

  /* ===================== 4. 譲渡所得税シミュレーター ===================== */

  T.jouto = {
    title: '譲渡所得税シミュレーター',
    groups: [
      { title: '売却の条件', fields: [
        priceField(3000),
        { k: 'jExpenses', t: 'yen', label: '譲渡費用（仲介手数料・印紙税など）', def: 1100000, min: 0, max: 8000000, step: 10000,
          hint: '売るために直接かかった費用です。測量費や解体費も含みます。' }
      ] },
      { title: '買ったときのこと', fields: joutoFields }
    ],
    compute: function (v) {
      var g = capitalGains(joutoInput(v));
      var y = Math.floor(g.holdMonths / 12);

      var rows = [
        { label: '収入金額（売却価格）', value: yen(v.price) },
        { label: '取得費', value: '−' + yen(g.acq), kind: 'minus' }
      ];
      if (v.acqKnown === 'no') {
        rows.push({ label: '概算取得費 売却価格×5%', value: yen(g.acq), kind: 'sub' });
      } else {
        rows.push({ label: '購入価格', value: yen(v.acqCost), kind: 'sub' });
        rows.push({ label: '減価償却費相当額', value: '−' + yen(g.dep), kind: 'sub' });
      }
      rows.push({ label: '譲渡費用', value: '−' + yen(v.jExpenses), kind: 'minus' });
      rows.push({ label: '譲渡所得', value: yen(g.gain) });
      if (g.deduction > 0) rows.push({ label: '特別控除', value: '−' + yen(g.deduction), kind: 'minus' });
      rows.push({ label: '課税対象となる譲渡所得', value: yen(g.taxable) });
      rows.push({ label: '所得税＋復興特別所得税', value: yen(g.incomeTax) });
      rows.push({ label: '住民税', value: yen(g.resTax) });
      rows.push({ label: '税額の合計', value: yen(g.total), kind: 'total' });

      var flags = [];
      flags.push({ level: 'info', title: '所有期間 ' + y + '年（' + (g.isLong ? '長期' : '短期') + '）',
        text: '所有期間は売った年の1月1日時点で判定します。今年の1月1日より前に5年を超えていれば長期、超えていなければ短期です。年末に売るか年明けに売るかで税率が倍近く変わることがあります。' });
      if (!g.isLong && g.holdMonths > 48) {
        flags.push({ level: 'warn', title: '長期になる時期が近いかもしれません',
          text: '短期（39.63%）と長期（20.315%）では税率が大きく違います。売り急ぐ事情がなければ、長期になる年まで待つ選択肢も検討する価値があります。' });
      }
      if (g.taxable === 0 && g.deduction > 0) {
        flags.push({ level: 'ok', title: '特別控除で税額が0になりました',
          text: '税額は0ですが、特例を使うためには確定申告が必要です。申告しないと控除は適用されません。' });
      }
      if (g.gain < 0) {
        flags.push({ level: 'ok', title: '譲渡損失が出ています',
          text: 'マイホームの売却で損失が出た場合、一定の要件を満たせば給与所得などと損益通算し、引ききれない分を翌年以降3年間繰り越せる特例があります。' });
      }
      if (v.acqKnown === 'yes' && (v.bldgCost || 0) === 0) {
        flags.push({ level: 'warn', title: '建物の価格が0のままです',
          text: '建物価格を入れないと減価償却を計算しないため、取得費が大きくなり税額を少なく見積もります。売買契約書の内訳や購入時の消費税額から逆算した額を入れてください。' });
      }

      return {
        headline: { label: '譲渡所得税・住民税の概算', value: Math.round(g.total).toLocaleString('ja-JP'), unit: '円',
          sub: g.rateLabel },
        bar: g.taxable > 0 ? [
          { label: '手元に残る譲渡所得', value: Math.max(0, g.taxable - g.total), color: '#0f6f8f' },
          { label: '所得税・復興特別所得税', value: g.incomeTax, color: '#b4232a' },
          { label: '住民税', value: g.resTax, color: '#d98324' }
        ] : null,
        rows: rows, flags: flags,
        notes: [
          '長期20.315%＝所得税15%＋復興特別所得税0.315%＋住民税5%。短期39.63%＝所得税30%＋復興特別所得税0.63%＋住民税9%。',
          '復興特別所得税は2037年分まで、所得税額の2.1%が上乗せされます。',
          '減価償却は非事業用（マイホーム等）の計算方法です。建物取得価額×0.9×償却率×経過年数で、取得価額の95%が限度になります。',
          '住民税は売った翌年度に課税されます。所得税と同じ時期に払うわけではありません。',
          TAX_NOTE
        ]
      };
    }
  };

  /* ===================== 5. ふるさと納税の上限（売却した年） ===================== */

  var INCOME_RATES = [
    { v: '5', l: '5%', s: '年収350万円前後', r: 0.05 },
    { v: '10', l: '10%', s: '年収500万円前後', r: 0.10 },
    { v: '20', l: '20%', s: '年収700〜900万円', r: 0.20 },
    { v: '23', l: '23%', s: '年収1,000万円前後', r: 0.23 },
    { v: '33', l: '33%', s: '年収1,500万円前後', r: 0.33 },
    { v: '40', l: '40%', s: '年収3,000万円前後', r: 0.40 }
  ];

  T.furusato = {
    title: '不動産を売った年のふるさと納税 上限額',
    groups: [
      { title: '売却で生じる所得', fields: [
        { k: 'taxable', t: 'man', label: '課税対象となる譲渡所得', def: 500, min: 0, max: 10000, step: 10,
          hint: '特別控除を引いたあとの金額です。「譲渡所得税シミュレーター」の「課税対象となる譲渡所得」をそのまま入れてください。' },
        { k: 'kind', t: 'tiles', label: '譲渡所得の区分',
          opts: [
            { v: 'long', l: '長期', s: '住民税5%' },
            { v: 'short', l: '短期', s: '住民税9%' },
            { v: 'reduced', l: '10年超の軽減', s: '住民税4%' }
          ], def: 'long' }
      ] },
      { title: '給与などの所得', fields: [
        { k: 'rate', t: 'tiles', label: '所得税の税率（給与などの総合課税分）',
          opts: INCOME_RATES, def: '10',
          hint: '源泉徴収票の「課税される所得金額」で決まります。分からなければ年収の目安から選んでください。' },
        { k: 'base', t: 'yen', label: '例年のふるさと納税の上限額', def: 60000, min: 0, max: 500000, step: 1000, opt: true,
          hint: '不動産を売らない年の上限です。ふるさと納税サイトのシミュレーターや、昨年の実績を入れてください。0でも構いません。' }
      ] }
    ],
    compute: function (v) {
      var resRate = v.kind === 'short' ? 0.09 : (v.kind === 'reduced' ? 0.04 : 0.05);
      var rate = 0.10;
      INCOME_RATES.forEach(function (x) { if (x.v === v.rate) rate = x.r; });

      var resTax = Math.floor(v.taxable * resRate);              // 譲渡所得にかかる住民税所得割
      var denom = 0.9 - rate * 1.021;
      var add = denom > 0 ? Math.floor(resTax * 0.2 / denom) : 0; // 特例控除の上限から逆算した増加分
      var total = add + (v.base || 0);

      return {
        headline: {
          label: '売却によって増える上限額', value: Math.round(add).toLocaleString('ja-JP'), unit: '円',
          sub: v.base > 0 ? '例年分と合わせて およそ ' + yen(total) : '例年分は別途加算してください'
        },
        bar: v.base > 0 ? [
          { label: '例年の上限', value: v.base, color: '#7c8b95' },
          { label: '売却で増える分', value: add, color: '#0f6f8f' }
        ] : null,
        rows: [
          { label: '課税対象となる譲渡所得', value: yen(v.taxable) },
          { label: '住民税所得割（譲渡所得分）', value: yen(resTax) },
          { label: '住民税率', value: (resRate * 100) + '%', kind: 'sub' },
          { label: '所得税の税率', value: (rate * 100) + '%', kind: 'sub' },
          { label: '売却によって増える上限額', value: yen(add) },
          { label: '例年の上限額', value: yen(v.base || 0) },
          { label: 'この年の上限額の目安', value: yen(total), kind: 'total' }
        ],
        flags: [
          { level: 'info', title: 'なぜ上限が上がるのか',
            text: 'ふるさと納税の上限は住民税の所得割額でおおむね決まります。不動産を売って譲渡所得が出ると、その分だけ所得割額が増えるため、上限も上がります。' },
          { level: 'warn', title: '売った年だけの話です',
            text: '上限が上がるのは譲渡所得が発生した年の1回だけです。翌年は元の水準に戻ります。寄付は売却した年の12月31日までに済ませる必要があります。' },
          { level: 'warn', title: 'ワンストップ特例は使えません',
            text: '譲渡所得があると確定申告をすることになるため、ワンストップ特例の申請をしていても無効になります。寄付金受領証明書を保管して、確定申告で寄付金控除を申告してください。' }
        ],
        notes: [
          '計算式は「住民税所得割額×20%÷（90%−所得税率×1.021）＋2,000円」です。ここでは譲渡所得によって増える分だけを計算しています。',
          '特別控除（3,000万円控除など）を使って課税対象がゼロになる場合、上限は増えません。',
          '住宅ローン控除や医療費控除など他の控除の状況によって実際の上限は変わります。金額が大きい場合は寄付の前に自治体または税理士に確認してください。',
          '算出される金額は目安です。上限を超えた分は自己負担になります。'
        ]
      };
    }
  };

  /* ===================== 6. 囲い込みチェッカー ===================== */

  var GOOD = [
    { v: 'reins', l: 'レインズの登録証明書を受け取った', w: 20, exclusive: true },
    { v: 'report', l: '契約どおりの頻度で活動報告が届いている', w: 20, exclusive: true },
    { v: 'detail', l: '問い合わせや内見の件数を具体的に教えてくれる', w: 15 },
    { v: 'check', l: 'レインズの売却依頼主用ページで公開状況を確認した', w: 15, exclusive: true },
    { v: 'other', l: '他社から「その物件は紹介できる」と言われた', w: 10 },
    { v: 'portal', l: 'スーモやアットホームなどのポータルサイトに載っている', w: 10 }
  ];

  var BAD = [
    { v: 'noreins', l: '登録証明書をもらっていない', w: 25, exclusive: true,
      note: '専任・専属専任では登録証明書を渡す義務があります' },
    { v: 'noreport', l: '報告が来ない、催促しないと来ない', w: 25, exclusive: true,
      note: '専任は2週間に1回以上、専属専任は1週間に1回以上が法律上の義務です' },
    { v: 'vague', l: '「今は問い合わせがありません」としか言われない', w: 15 },
    { v: 'refuse', l: '他社に問い合わせたら「紹介できない」「商談中」と言われた', w: 30,
      note: '実際には商談が入っていないのに他社を断るのが囲い込みです' },
    { v: 'noportal', l: 'ポータルサイトのどこにも載っていない', w: 15 },
    { v: 'pressure', l: '早い段階から値下げを繰り返し求められる', w: 10 },
    { v: 'inhouse', l: '「うちのお客様で決めたい」と言われた', w: 20 }
  ];

  T.kakoikomi = {
    title: '囲い込みチェッカー',
    groups: [
      { title: '契約の状況', fields: [
        { k: 'keiyaku', t: 'tiles', label: '結んでいる媒介契約', def: 'sennin',
          opts: [
            { v: 'ippan', l: '一般媒介' },
            { v: 'sennin', l: '専任媒介' },
            { v: 'senzoku', l: '専属専任' },
            { v: 'none', l: 'まだ未契約' }
          ] },
        { k: 'period', t: 'tiles', label: '契約してからの期間', def: 'm1',
          opts: [
            { v: 'm0', l: '2週間未満' },
            { v: 'm1', l: '2週間〜1か月' },
            { v: 'm3', l: '1〜3か月' },
            { v: 'm3p', l: '3か月以上' }
          ] }
      ] },
      { title: '確認できていること', fields: [
        { k: 'good', t: 'checks', label: '当てはまるものを選んでください', opts: GOOD, def: [] }
      ] },
      { title: '気になること', fields: [
        { k: 'bad', t: 'checks', label: '当てはまるものを選んでください', opts: BAD, def: [] }
      ] }
    ],
    compute: function (v) {
      var ippan = v.keiyaku === 'ippan' || v.keiyaku === 'none';
      var good = v.good || [], bad = v.bad || [];

      var gMax = 0, gGot = 0;
      GOOD.forEach(function (x) {
        if (ippan && x.exclusive) return; // 一般媒介にはレインズ登録・報告の法定義務がない
        gMax += x.w;
        if (good.indexOf(x.v) >= 0) gGot += x.w;
      });
      var penalty = 0;
      BAD.forEach(function (x) {
        if (ippan && x.exclusive) return;
        if (bad.indexOf(x.v) >= 0) penalty += x.w;
      });

      var score = Math.max(0, Math.min(100, Math.round(gGot / (gMax || 1) * 100) - penalty));

      var level, title, desc;
      if (!good.length && !bad.length) {
        // 何も選んでいない状態で最悪の判定を出すと誤解を与えるため、中立のまま待つ
        return {
          verdict: { level: 'info', title: 'あてはまる項目を選んでください',
            desc: '「確認できていること」と「気になること」からあてはまるものを選ぶと、状況を整理して表示します。' },
          flags: [{ level: 'info', title: 'まず手元で確かめられること',
            text: 'レインズの登録証明書を受け取っているか、活動報告が届いているか、ポータルサイトに掲載されているか。この3つが分かると判断しやすくなります。' }],
          notes: ['このチェックは売主が把握できる事実から状況を整理するものです。囲い込みの有無を断定するものではありません。']
        };
      }
      if (bad.indexOf('refuse') >= 0) {
        level = 'ng';
        title = '囲い込みが起きている可能性があります';
        desc = '他社からの紹介が断られているのは、囲い込みでもっとも典型的な兆候です。まずは事実を確認してください。';
      } else if (score >= 70) {
        level = 'ok';
        title = '今のところ気になる点は見当たりません';
        desc = 'レインズの登録と定期的な報告が確認できています。この状態が続いているかを、報告のたびに見ておいてください。';
      } else if (score >= 40) {
        level = 'warn';
        title = '確認しておきたい点があります';
        desc = '囲い込みと決まったわけではありませんが、確認していない項目があります。下の指摘を担当者に聞いてみてください。';
      } else {
        level = 'ng';
        title = '担当者に確認するか、他社にも相談したほうがよさそうです';
        desc = '売却活動の中身が売主に見えていない状態です。まず事実を確認し、改善されないようであれば契約の見直しも選択肢になります。';
      }

      var flags = [];
      if (!ippan) {
        var days = v.keiyaku === 'senzoku' ? '5営業日' : '7営業日';
        var freq = v.keiyaku === 'senzoku' ? '1週間に1回以上' : '2週間に1回以上';
        flags.push({ level: 'info', title: 'この契約で会社が負っている義務',
          text: '媒介契約の翌日から' + days + '以内にレインズへ登録し、登録証明書を売主に渡すこと。売却活動の状況を' + freq + '報告すること。どちらも宅建業法が定める義務です。' });
      } else {
        flags.push({ level: 'info', title: '一般媒介での注意',
          text: '一般媒介にはレインズへの登録義務も定期報告の義務もありません。そのぶん囲い込みは起きにくい一方、活動状況が見えにくくなります。登録と報告を任意で行ってもらえるか相談してみてください。' });
      }

      BAD.forEach(function (x) {
        if (bad.indexOf(x.v) < 0) return;
        if (ippan && x.exclusive) return;
        var t = {
          noreins: '登録証明書は、レインズに登録したことを示す書類です。渡す義務があるので、まず「登録証明書をください」と伝えてください。証明書に書かれたID とパスワードで、売主自身が公開状況を確認できます。',
          noreport: '報告の頻度は法律で決まっています。届いていないなら、その旨を伝えて書面での報告を求めてください。それでも改善しないときは、契約の更新をしない判断ができます。',
          vague: '問い合わせがない状態が続くなら、その原因（価格、写真、掲載先）を数字とともに説明してもらってください。件数を答えられない場合、そもそも動いていない可能性があります。',
          refuse: '知人や別の不動産会社から問い合わせてもらうと確認できます。本当に商談中なら、いつからどの段階なのかを担当者に説明してもらってください。説明が食い違うようなら、免許行政庁への相談も選択肢です。',
          noportal: 'レインズは業者向けのデータベースで、一般の買主は見られません。ポータルサイトに出ていなければ、買主の目に触れる機会がほとんどない状態です。どこに掲載しているか一覧で出してもらってください。',
          pressure: '値下げが必要な場合もありますが、根拠が必要です。問い合わせ件数と内見数の推移を示してもらい、価格が原因なのかを一緒に確認してください。',
          inhouse: '自社で買主を見つけると、売主と買主の双方から手数料を受け取れます。それ自体は違法ではありませんが、そのために他社の買主を遠ざけているのなら別の話です。他社経由でも売れることを明確に伝えてください。'
        }[x.v];
        flags.push({ level: 'ng', title: x.l, text: t });
      });

      if ((v.period === 'm3' || v.period === 'm3p') && !ippan && good.indexOf('check') < 0) {
        flags.push({ level: 'warn', title: 'レインズの公開状況をまだ見ていません',
          text: '登録証明書に記載されたIDとパスワードで、売主専用の画面から自分の物件の状態を確認できます。「公開中」になっているか、取引状況が「公開中」以外に変えられていないかを見てください。' });
      }
      if (v.keiyaku === 'none') {
        flags.push({ level: 'info', title: 'まだ契約していない段階なら',
          text: '媒介契約を結ぶ前に、レインズへの登録時期、報告の方法と頻度、掲載するポータルサイトを書面で確認しておくと、あとから確認しやすくなります。' });
      }

      return {
        verdict: { level: level, title: title, desc: desc, score: score, max: 100 },
        flags: flags,
        notes: [
          'このチェックは売主が把握できる事実から状況を整理するものです。囲い込みの有無を断定するものではありません。',
          '確認しても改善がない場合は、都道府県の宅建業担当課や公益社団法人 全国宅地建物取引業保証協会などの相談窓口があります。',
          'レインズの登録期限は休業日を除いて数えます。契約直後は少し待つ必要があります。'
        ]
      };
    }
  };

  /* ===================== 7. 特例判定チェックシート ===================== */

  T.tokurei = {
    title: '売却で使える特例の判定',
    groups: [
      { title: '売った不動産', fields: [
        priceField(3000),
        { k: 'who', t: 'tiles', cols: 1, def: 'live3', label: 'どんな家を売りましたか（売りますか）',
          opts: [
            { v: 'now', l: '今も自分が住んでいる家' },
            { v: 'live3', l: '住まなくなって3年目の年末まで' },
            { v: 'live3p', l: '住まなくなって3年以上たった家' },
            { v: 'sozoku', l: '相続した親の家（空き家）' },
            { v: 'other', l: 'それ以外（投資用・別荘など）' }
          ] },
        { k: 'gain', t: 'tiles', cols: 2, def: 'plus', label: '譲渡益・譲渡損',
          opts: [{ v: 'plus', l: '利益が出る' }, { v: 'minus', l: '損失が出る' }] },
        { k: 'hold', t: 'tiles', def: 'h10', label: '所有期間（売った年の1月1日時点）',
          opts: [
            { v: 'h5', l: '5年以下' },
            { v: 'h10', l: '5年超10年以下' },
            { v: 'h10p', l: '10年超' }
          ] }
      ] },
      { title: '共通の条件', fields: [
        { k: 'cond', t: 'checks', label: '当てはまるものを選んでください',
          opts: [
            { v: 'notkin', l: '買主は親子・夫婦などの特別な関係ではない' },
            { v: 'notused', l: '前年・前々年にこれらの特例を使っていない' },
            { v: 'live10', l: '売った家に10年以上住んでいた' },
            { v: 'kaikae', l: '住み替え先を買う（買った）' },
            { v: 'loan', l: '売却後も住宅ローンが残る' }
          ], def: ['notkin', 'notused'] }
      ] },
      { title: '相続した家の場合', fold: true, fields: [
        { k: 'sz', t: 'checks', label: '当てはまるものを選んでください',
          opts: [
            { v: 'old', l: '1981年5月31日以前に建てられた家' },
            { v: 'kodate', l: 'マンションなどの区分所有建物ではない' },
            { v: 'alone', l: '相続の直前まで被相続人が一人で住んでいた' },
            { v: 'y3', l: '相続開始から3年目の年末までに売る' },
            { v: 'taishin', l: '取り壊すか、耐震基準を満たすようにする' },
            { v: 'n3', l: '家屋と土地を取得した相続人が3人以上いる' }
          ], def: [] }
      ] }
    ],
    compute: function (v) {
      var c = v.cond || [], sz = v.sz || [];
      var has = function (a, x) { return a.indexOf(x) >= 0; };
      var isHome = v.who === 'now' || v.who === 'live3';
      var notKin = has(c, 'notkin'), notUsed = has(c, 'notused');
      var items = [];

      function push(name, level, why) { items.push({ level: level, title: name, text: why }); }

      /* 3,000万円特別控除 */
      if (v.gain === 'plus') {
        if (isHome && notKin && notUsed) {
          push('居住用財産の3,000万円特別控除', 'ok',
            '要件を満たしていそうです。譲渡所得から最大3,000万円を差し引けます。所有期間の長さは問われません。使うには確定申告が必要です。');
        } else if (v.who === 'live3p') {
          push('居住用財産の3,000万円特別控除', 'ng',
            '住まなくなった日から3年目の年末を過ぎているため、対象外です。この期限は延長できません。');
        } else if (v.who === 'other' || v.who === 'sozoku') {
          push('居住用財産の3,000万円特別控除', 'ng',
            '自分が住んでいた家ではないため対象外です。相続した空き家の場合は別の特例を確認してください。');
        } else {
          push('居住用財産の3,000万円特別控除', 'warn',
            '住んでいた家という条件は満たしますが、買主が親族でないこと、前年・前々年に同じ特例を使っていないことが必要です。');
        }
      }

      /* 10年超の軽減税率 */
      if (v.gain === 'plus' && isHome) {
        if (v.hold === 'h10p' && notKin && notUsed) {
          push('10年超所有の軽減税率', 'ok',
            '3,000万円控除と併用できます。控除後の課税譲渡所得のうち6,000万円以下の部分が14.21%、超える部分が20.315%になります。');
        } else if (v.hold !== 'h10p') {
          push('10年超所有の軽減税率', 'ng',
            '所有期間が売った年の1月1日時点で10年を超えていないため対象外です。売る時期を年明けにずらすと該当する場合があります。');
        }
      }

      /* 特定居住用財産の買換え特例 */
      if (v.gain === 'plus' && isHome && has(c, 'kaikae')) {
        var ok = v.hold === 'h10p' && has(c, 'live10') && v.price <= 100000000;
        push('特定居住用財産の買換え特例', ok ? 'ok' : 'warn',
          ok
            ? '所有10年超・居住10年以上・譲渡価格1億円以下の要件を満たしていそうです。ただしこれは課税の繰り延べで、税金が消えるわけではありません。3,000万円控除との併用はできないため、どちらが有利かを試算して選びます。'
            : '所有期間10年超、居住期間10年以上、譲渡価格1億円以下がすべて必要です。' + (v.price > 100000000 ? '売却価格が1億円を超えているため対象外です。' : '条件を満たしているか確認してください。'));
      }

      /* 相続空き家の3,000万円控除 */
      if (v.who === 'sozoku' && v.gain === 'plus') {
        var need = ['old', 'kodate', 'alone', 'y3', 'taishin'];
        var miss = need.filter(function (x) { return !has(sz, x); });
        var amount = has(sz, 'n3') ? '2,000万円' : '3,000万円';
        if (miss.length === 0 && v.price <= 100000000) {
          push('相続した空き家の' + amount + '特別控除', 'ok',
            '要件を満たしていそうです。控除額は' + amount + 'です。' +
            (has(sz, 'n3') ? '2024年1月1日以降の譲渡では、家屋と土地を取得した相続人が3人以上いる場合、控除額が2,000万円になります。' : '') +
            '市区町村が発行する「被相続人居住用家屋等確認書」が申告に必要です。');
        } else if (v.price > 100000000) {
          push('相続した空き家の3,000万円特別控除', 'ng', '譲渡価格が1億円を超えるため対象外です。');
        } else {
          push('相続した空き家の3,000万円特別控除', 'warn',
            'まだ確認できていない要件があります。' +
            (miss.indexOf('old') >= 0 ? '1981年5月31日以前の建築であること。' : '') +
            (miss.indexOf('kodate') >= 0 ? '区分所有建物でないこと。' : '') +
            (miss.indexOf('alone') >= 0 ? '相続の直前に被相続人が一人で住んでいたこと。' : '') +
            (miss.indexOf('y3') >= 0 ? '相続開始から3年目の年末までに売ること。' : '') +
            (miss.indexOf('taishin') >= 0 ? '取り壊すか耐震基準に適合させること。2024年1月1日以降の譲渡なら、買主が譲渡の翌年2月15日までに行っても認められます。' : ''));
        }
      }

      /* 譲渡損失 */
      if (v.gain === 'minus') {
        if (isHome && v.hold !== 'h5' && has(c, 'kaikae')) {
          push('居住用財産の買換えに係る譲渡損失の損益通算・繰越控除', 'ok',
            '給与所得などと損益通算でき、引ききれない分を翌年以降3年間繰り越せます。所有期間5年超と、買換え先の住宅ローンが必要です。');
        } else if (isHome && v.hold !== 'h5' && has(c, 'loan')) {
          push('特定居住用財産の譲渡損失の損益通算・繰越控除', 'ok',
            '買い換えない場合でも、売却価格で住宅ローンを返しきれないときは損益通算できます。ローン残高から売却価格を引いた額が上限です。');
        } else if (isHome) {
          push('譲渡損失の特例', 'warn',
            '所有期間5年超に加えて、買換えをするか、売却後もローンが残ることが必要です。どちらにも当てはまらない場合、損失を他の所得と通算することはできません。');
        } else {
          push('譲渡損失の特例', 'ng',
            'マイホーム以外の不動産の譲渡損失は、給与所得などと通算できません。');
        }
      }

      var okCount = items.filter(function (x) { return x.level === 'ok'; }).length;
      var warnCount = items.filter(function (x) { return x.level === 'warn'; }).length;

      return {
        verdict: {
          level: okCount > 0 ? 'ok' : (warnCount > 0 ? 'warn' : 'ng'),
          title: okCount > 0
            ? '使える可能性のある特例が ' + okCount + ' 件あります'
            : (warnCount > 0 ? '条件を確認すれば使える特例があります' : '今の条件で使える特例は見つかりませんでした'),
          desc: okCount > 0
            ? '特例はいずれも確定申告をして初めて適用されます。申告しなければ税額は軽くなりません。'
            : '入力を変えると結果が変わります。売る時期や順番を調整すると該当する場合があります。'
        },
        flags: items.length ? items : [{ level: 'info', text: '条件を選ぶと判定が表示されます。' }],
        notes: [
          'ここでの判定は主な要件だけを見たものです。細かい要件や併用の可否は個別に判断されます。',
          '3,000万円控除と10年超の軽減税率は併用できますが、買換え特例とは併用できません。どちらが有利かは金額によって変わります。',
          '相続した空き家の特例は、2016年4月1日から2027年12月31日までの譲渡が対象です。',
          '最終的な適用の可否は税務署または税理士にご確認ください。'
        ]
      };
    }
  };

  /* ===================== 8. 確定申告の必要書類 ===================== */

  T.shorui = {
    title: '売却後の確定申告 必要書類チェックリスト',
    groups: [
      { title: '売ったもの', fields: [
        { k: 'kind', t: 'tiles', def: 'home', label: '売った不動産',
          opts: [
            { v: 'home', l: 'マイホーム' },
            { v: 'sozoku', l: '相続した家' },
            { v: 'land', l: '土地だけ' },
            { v: 'other', l: '投資用・別荘' }
          ] },
        { k: 'tokurei', t: 'checks', label: '使う特例（分かる範囲で）',
          opts: [
            { v: 't3000', l: '居住用財産の3,000万円特別控除' },
            { v: 'tred', l: '10年超所有の軽減税率' },
            { v: 'tkaikae', l: '特定居住用財産の買換え特例' },
            { v: 'takiya', l: '相続した空き家の3,000万円特別控除' },
            { v: 'tloss', l: '譲渡損失の損益通算・繰越控除' }
          ], def: ['t3000'] },
        { k: 'moved', t: 'check', def: false, label: '売却後に住所が変わった',
          text: '売った家の住所と、今の住民票の住所が違う' }
      ] }
    ],
    compute: function (v) {
      var t = v.tokurei || [];
      var has = function (x) { return t.indexOf(x) >= 0; };
      var list = [];

      list.push({ group: 'どの場合も必要', items: [
        { label: '確定申告書 第一表・第二表' },
        { label: '確定申告書 第三表（分離課税用）', note: '譲渡所得は分離課税です' },
        { label: '譲渡所得の内訳書（土地・建物用）', note: '税務署から売主宛に郵送されることがあります' },
        { label: '売ったときの売買契約書の写し' },
        { label: '買ったときの売買契約書の写し', note: '取得費を証明する書類。見つからないと売却価格の5%で計算することになります' },
        { label: '仲介手数料・印紙代などの領収書の写し', note: '譲渡費用として差し引けます' },
        { label: '売った不動産の登記事項証明書', note: '法務局またはオンラインで取得できます' },
        { label: '本人確認書類とマイナンバーが分かるもの' },
        { label: '還付金を受け取る口座の情報' }
      ] });

      if (has('t3000') || has('tred')) {
        var items = [];
        if (v.moved || v.kind === 'home') {
          items.push({ label: '売った家の所在地の除票住民票', note: '売却から2か月経過後に交付されたもの' });
        }
        if (has('tred')) items.push({ label: '所有期間が10年超であることが分かる登記事項証明書' });
        items.push({ label: '売買契約書などで売却価格を確認できるもの' });
        list.push({ group: '3,000万円特別控除・軽減税率', items: items });
      }

      if (has('tkaikae')) {
        list.push({ group: '買換え特例', items: [
          { label: '買換え先の登記事項証明書' },
          { label: '買換え先の売買契約書の写し' },
          { label: '買換え先に住んだことが分かる住民票' },
          { label: '売った家の除票住民票' },
          { label: '売却価格が1億円以下であることが分かる書類' }
        ] });
      }

      if (has('takiya')) {
        list.push({ group: '相続した空き家の特例', items: [
          { label: '被相続人居住用家屋等確認書', note: '家屋のある市区町村が発行します。申請から交付まで日数がかかります' },
          { label: '耐震基準適合証明書または建設住宅性能評価書', note: '取り壊して売る場合は不要です' },
          { label: '被相続人の除票住民票' },
          { label: '相続人全員が分かる戸籍謄本' },
          { label: '売買契約書の写し（1億円以下であることの確認）' },
          { label: '家屋を取り壊した場合は、取壊し後の登記事項証明書' }
        ] });
      }

      if (has('tloss')) {
        list.push({ group: '譲渡損失の特例', items: [
          { label: '居住用財産の譲渡損失の金額の明細書' },
          { label: '通算後譲渡損失の損益通算及び繰越控除の計算書' },
          { label: '売った不動産の登記事項証明書' },
          { label: '住宅借入金の年末残高等証明書', note: '買換え先のローン、または売却後に残るローンのもの' },
          { label: '売った家の除票住民票' },
          { label: '繰り越す年も、毎年続けて確定申告すること', note: '1年でも申告しないと繰越が途切れます' }
        ] });
      }

      if (v.kind === 'sozoku' && !has('takiya')) {
        list.push({ group: '相続した不動産を売った場合', items: [
          { label: '被相続人が取得したときの売買契約書', note: '取得費と取得時期を引き継ぎます' },
          { label: '相続税の申告書（取得費加算の特例を使う場合）' },
          { label: '遺産分割協議書の写し' }
        ] });
      }

      var count = list.reduce(function (a, g) { return a + g.items.length; }, 0);

      return {
        headline: { label: '用意する書類', value: String(count), unit: '点' },
        list: list,
        flags: [
          { level: 'warn', title: '申告の時期',
            text: '売った翌年の2月16日から3月15日までが申告期間です。還付を受けるだけの申告は1月から受け付けています。' },
          { level: 'warn', title: '特例は申告しないと使えません',
            text: '3,000万円控除などを使って税額が0になる場合でも、確定申告をしなければ適用されません。' },
          { level: 'info', title: '取得費の書類が見つからないとき',
            text: '売却価格の5%を取得費とみなして計算することになり、税額が大きく増えます。通帳の記録、住宅ローンの金銭消費貸借契約書、購入時のパンフレット、登記時の書類などから購入価格を裏づけられないか探してみてください。' }
        ],
        notes: [
          '住民税の申告は不要です。確定申告の内容が市区町村に回り、翌年度の住民税に反映されます。',
          '被相続人居住用家屋等確認書は交付までに時間がかかります。売却の見込みが立った段階で市区町村に相談してください。',
          '必要な書類は状況によって変わります。最終的には税務署または税理士にご確認ください。'
        ]
      };
    }
  };

  /* ===================== 9. 仲介と買取の比較 ===================== */

  T.hikaku = {
    title: '仲介と買取、手元に残るお金の比較',
    groups: [
      { title: '2つの価格', fields: [
        { k: 'chukaiPrice', t: 'man', label: '仲介で売れそうな価格', def: 3000, min: 0, max: 15000, step: 50,
          hint: '査定額や、周辺の成約事例から見た価格です。' },
        { k: 'kaitoriPrice', t: 'man', label: '買取業者の提示価格', def: 2200, min: 0, max: 15000, step: 50,
          hint: '相場の6〜8割になることが多いです。' }
      ] },
      { title: '売れるまでの時間と費用', fields: [
        { k: 'monthsToSell', t: 'num', unit: 'か月', label: '仲介で売れるまでの見込み', def: 4, min: 1, max: 24, step: 1,
          hint: '一般的には3〜6か月が目安です。' },
        { k: 'koteiY', t: 'yen', label: '固定資産税・都市計画税（年額）', def: 120000, min: 0, max: 600000, step: 1000 },
        { k: 'kanri', t: 'yen', label: '管理費・修繕積立金（月額）', def: 0, min: 0, max: 100000, step: 1000,
          hint: 'マンションの場合。戸建てなら0で構いません。' },
        { k: 'kinri', t: 'yen', label: '住宅ローンの利息（月額）', def: 0, min: 0, max: 200000, step: 1000,
          hint: '返済予定表の利息分です。ローンがなければ0。' },
        { k: 'kaitoriBroker', t: 'check', def: false, label: '買取でも仲介手数料がかかる',
          text: '買取でも仲介会社が間に入る（仲介手数料がかかる）',
          note: '業者が直接買い取る場合、仲介手数料はかかりません' }
      ] }
    ],
    compute: function (v) {
      var monthly = Math.round(v.koteiY / 12) + v.kanri + v.kinri;

      var cBroker = brokerage(v.chukaiPrice).normal;
      var cStamp = stamp(v.chukaiPrice);
      var cHold = monthly * v.monthsToSell;
      var cNet = v.chukaiPrice - cBroker - cStamp - cHold;

      var kBroker = v.kaitoriBroker ? brokerage(v.kaitoriPrice).normal : 0;
      var kStamp = stamp(v.kaitoriPrice);
      var kHold = monthly * 1; // 買取は1か月程度で決済できることが多い
      var kNet = v.kaitoriPrice - kBroker - kStamp - kHold;

      var diff = cNet - kNet;
      var breakEven = monthly > 0 ? Math.ceil((cNet - kNet) / monthly) + v.monthsToSell : null;

      var flags = [];
      if (diff > 0) {
        var msg;
        if (monthly <= 0) {
          msg = '保有コスト（固定資産税・管理費・ローン利息）を入れると、期間を含めて比べられます。';
        } else if (breakEven && breakEven <= 60) {
          msg = '保有コストは月' + yen(monthly) + 'です。売れるまでに' + breakEven + 'か月以上かかると、買取と同じところまで下がります。';
        } else {
          // 価格差が大きすぎて、現実的な期間では逆転しない
          msg = '保有コストは月' + yen(monthly) + 'です。価格差が大きいため、現実的な期間で売れる限り仲介が有利なままです。買取を選ぶ理由があるとすれば、金額ではなく期限や手間のほうになります。';
        }
        flags.push({ level: 'ok', title: '仲介のほうが ' + yen(diff) + ' 多く残ります', text: msg });
      } else {
        flags.push({ level: 'warn', title: '買取のほうが ' + yen(Math.abs(diff)) + ' 多く残ります',
          text: '仲介で売れるまでの期間が長いため、保有コストが価格差を上回っています。' });
      }
      flags.push({ level: 'info', title: '価格以外の違い',
        text: '買取は数週間で現金化でき、内見の対応が不要で、契約不適合責任を免除されることが多いという利点があります。仲介は高く売れる可能性がある代わりに、いつ売れるか分かりません。' });
      flags.push({ level: 'info', title: '買取保証という選択肢',
        text: '一定期間は仲介で売り、売れなければ約束した価格で買い取ってもらう仕組みです。期間と保証価格を事前に書面で確認してください。' });

      return {
        headline: {
          label: diff >= 0 ? '仲介のほうが多く残る金額' : '買取のほうが多く残る金額',
          value: Math.abs(Math.round(diff)).toLocaleString('ja-JP'), unit: '円',
          sub: '仲介 ' + man(cNet) + ' ／ 買取 ' + man(kNet)
        },
        bar: [
          { label: '仲介の手残り', value: Math.max(0, cNet), color: '#0f6f8f' },
          { label: '買取の手残り', value: Math.max(0, kNet), color: '#7c8b95' }
        ],
        rows: [
          { label: '【仲介】売却価格', value: yen(v.chukaiPrice) },
          { label: '仲介手数料', value: '−' + yen(cBroker), kind: 'sub' },
          { label: '印紙税', value: '−' + yen(cStamp), kind: 'sub' },
          { label: '保有コスト ' + v.monthsToSell + 'か月分', value: '−' + yen(cHold), kind: 'sub' },
          { label: '仲介の手残り', value: yen(cNet) },
          { label: '【買取】売却価格', value: yen(v.kaitoriPrice) },
          { label: '仲介手数料', value: '−' + yen(kBroker), kind: 'sub' },
          { label: '印紙税', value: '−' + yen(kStamp), kind: 'sub' },
          { label: '保有コスト 1か月分', value: '−' + yen(kHold), kind: 'sub' },
          { label: '買取の手残り', value: yen(kNet) },
          { label: '差額', value: yen(Math.abs(diff)) + (diff >= 0 ? '（仲介が有利）' : '（買取が有利）'), kind: 'total' }
        ],
        flags: flags,
        notes: [
          '保有コストは固定資産税の月割り、管理費・修繕積立金、住宅ローンの利息を合計しています。月' + yen(monthly) + 'で計算しました。',
          '譲渡所得税はどちらの場合もかかります。価格が違えば税額も変わるため、ここでは比較から外しています。',
          '買取は引渡しまでが早いぶん、保有コストを1か月分として計算しています。',
          '仲介で売れるまでの期間は物件によって大きく変わります。数字を動かして、どのあたりで逆転するか見てみてください。'
        ]
      };
    }
  };
})();
