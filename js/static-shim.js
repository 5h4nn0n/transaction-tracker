/**
 * GitHub Pages 静态适配层
 * ---------------------------------------------------------------
 * 仅注入到 `build_static.py` 生成的 dist/ 站点中, 不参与 Flask 运行时,
 * 因此本地后端与原有逻辑完全不受影响。
 *
 * 作用: 拦截前端已有的 fetch('/api/...') 调用, 改为读取预渲染的 JSON,
 * 并对 /api/stocks/penetration 的筛选/排序/分页在浏览器端复算,
 * 语义与 app.py 中同名接口保持一致。
 */
(function () {
    'use strict';

    var BASE = window.NT_BASE || '/';
    if (BASE.charAt(BASE.length - 1) !== '/') BASE += '/';

    var origFetch = window.fetch ? window.fetch.bind(window) : null;
    if (!origFetch) return;

    // 与 app.py 的 SORTABLE 字段保持一致
    var SORTABLE = [
        'stock_code', 'stock_name', 'close', 'chg_pct', 'pen_value', 'pen_shares',
        'float_ratio', 'etf_count', 'total_weight', 'org_num_all',
        'inst_free_ratio', 'fund_ratio', 'ss_ratio', 'nt_holder_cnt'
    ];

    var DAY_OPTIONS = ['30', '90', '365'];
    var penetrationCache = null;

    // 联动窗口与 build_static.py 导出的文件一一对应
    var LINKAGE_WINDOWS = ['30', '60', '120'];
    var boardCache = null;

    // 与 app.py 的 REPORT_SORTABLE 保持一致
    var REPORT_SORTABLE = ['notice_date', 'stock_code', 'stock_name', 'category_group'];
    var reportsCache = null;

    function jsonResponse(data, status) {
        return new Response(JSON.stringify(data), {
            status: status || 200,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
    }

    function loadJSON(rel) {
        return origFetch(BASE + rel, { cache: 'no-cache' }).then(function (res) {
            if (!res.ok) throw new Error('missing: ' + rel);
            return res.json();
        });
    }

    function pickDays(raw) {
        return DAY_OPTIONS.indexOf(String(raw)) >= 0 ? String(raw) : '365';
    }

    // ─── /api/stocks/penetration 的浏览器端等价实现 ───
    function penetration(params) {
        if (!penetrationCache) penetrationCache = loadJSON('data/penetration_all.json');

        return penetrationCache.then(function (all) {
            var kw = (params.get('q') || '').trim();
            var sort = params.get('sort') || 'pen_value';
            if (SORTABLE.indexOf(sort) < 0) sort = 'pen_value';
            var order = (params.get('order') || 'desc').toLowerCase() === 'asc' ? 1 : -1;
            var limit = Math.min(Math.max(parseInt(params.get('limit') || '100', 10) || 100, 1), 500);
            var offset = Math.max(parseInt(params.get('offset') || '0', 10) || 0, 0);
            var minPen = (parseFloat(params.get('min_pen') || '0') || 0) * 1e8;
            var onlyInst = params.get('only_inst') === '1';
            var onlyNt = params.get('only_nt') === '1';

            var rows = all.filter(function (r) {
                if ((r.pen_value || 0) < minPen) return false;
                if (kw && (r.stock_code || '').indexOf(kw) < 0 &&
                    (r.stock_name || '').indexOf(kw) < 0) return false;
                if (onlyInst && !((r.inst_free_ratio || 0) > 0)) return false;
                if (onlyNt && !((r.nt_holder_cnt || 0) > 0)) return false;
                return true;
            });

            // 等价于 SQL: ORDER BY <field> {ASC|DESC} NULLS LAST, stock_code ASC
            rows.sort(function (a, b) {
                var av = a[sort], bv = b[sort];
                var an = (av === null || av === undefined || av === '');
                var bn = (bv === null || bv === undefined || bv === '');
                if (an && bn) return a.stock_code < b.stock_code ? -1 : 1;
                if (an) return 1;
                if (bn) return -1;
                if (av === bv) return a.stock_code < b.stock_code ? -1 : 1;
                return (av > bv ? 1 : -1) * order;
            });

            return {
                data: rows.slice(offset, offset + limit),
                total: rows.length,
                limit: limit,
                offset: offset
            };
        });
    }

    // ─── /api/reports 的浏览器端等价实现 ───
    // 对应 SQL: ORDER BY {sort} {order}, notice_date DESC, art_code
    // 数据文件为「列名 + 数组行」结构, 这里展开成接口同款对象
    function reports(params) {
        if (!reportsCache) {
            reportsCache = loadJSON('data/reports_all.json').then(function (pack) {
                var cols = pack.cols;
                return pack.rows.map(function (row) {
                    var o = {};
                    for (var i = 0; i < cols.length; i++) o[cols[i]] = row[i];
                    o.url = 'https://data.eastmoney.com/notices/detail/' +
                        o.stock_code + '/' + o.art_code + '.html';
                    o.pdf_url = 'https://pdf.dfcfw.com/pdf/H2_' + o.art_code + '_1.pdf';
                    return o;
                });
            });
        }

        return reportsCache.then(function (all) {
            var kw = (params.get('q') || '').trim();
            var group = params.get('group') || 'all';
            var days = parseInt(params.get('days') || '0', 10) || 0;
            var sort = params.get('sort') || 'notice_date';
            if (REPORT_SORTABLE.indexOf(sort) < 0) sort = 'notice_date';
            var order = (params.get('order') || 'desc').toLowerCase() === 'asc' ? 1 : -1;
            var limit = Math.min(Math.max(parseInt(params.get('limit') || '50', 10) || 50, 1), 500);
            var offset = Math.max(parseInt(params.get('offset') || '0', 10) || 0, 0);

            var since = '';
            if (days > 0) {
                var d = new Date();
                d.setDate(d.getDate() - days);
                since = d.toISOString().slice(0, 10);
            }

            var rows = all.filter(function (r) {
                if (group !== 'all' && r.category_group !== group) return false;
                if (since && (r.notice_date || '') < since) return false;
                if (kw) {
                    if ((r.stock_code || '').indexOf(kw) < 0 &&
                        (r.stock_name || '').indexOf(kw) < 0 &&
                        (r.title || '').indexOf(kw) < 0) return false;
                }
                return true;
            });

            rows.sort(function (a, b) {
                var av = a[sort], bv = b[sort];
                if (av !== bv) return (av > bv ? 1 : -1) * order;
                if (a.notice_date !== b.notice_date) return a.notice_date < b.notice_date ? 1 : -1;
                return (a.art_code || '') < (b.art_code || '') ? -1 : 1;
            });

            return {
                data: rows.slice(offset, offset + limit),
                total: rows.length,
                limit: limit,
                offset: offset
            };
        });
    }

    // ─── /api/market/board ───
    // 导出的是全量快照，筛选交给前端（与线上接口返回结构一致）
    function board(params) {
        if (!boardCache) boardCache = loadJSON('data/market_board.json');
        return boardCache.then(function (pack) {
            var limit = Math.min(
                Math.max(parseInt(params.get('limit') || '300', 10) || 300, 1), 5000);
            return {
                as_of: pack.as_of,
                quote_time: pack.quote_time,
                summary: pack.summary,
                rows: (pack.rows || []).slice(0, limit),
                total: pack.total
            };
        });
    }

    // ─── 路由映射 ───
    function route(rawUrl) {
        var url;
        try {
            url = new URL(rawUrl, window.location.origin);
        } catch (e) {
            return null;
        }

        var path = url.pathname;
        var q = url.searchParams;
        var m;

        // 首页聚合数据
        if (path === '/api/home/summary') {
            return loadJSON('data/home_summary.json');
        }
        if (path === '/api/home/chart') {
            return loadJSON('data/home_chart.json');
        }
        if (path === '/api/overview/chart') {
            return loadJSON('data/overview_chart_' + pickDays(q.get('days')) + '.json');
        }
        if (path === '/api/overview/table') {
            return loadJSON('data/overview_table.json');
        }
        if (path === '/api/stocks/summary') {
            return loadJSON('data/stocks_summary.json');
        }
        if (path === '/api/stocks/penetration') {
            return penetration(q);
        }
        if (path === '/api/reports') {
            return reports(q);
        }
        if (path === '/api/reports/summary') {
            return loadJSON('data/reports_summary.json');
        }
        if (path === '/api/market/board') {
            return board(q);
        }
        if (path === '/api/linkage') {
            var win = String(parseInt(q.get('window') || '60', 10) || 60);
            if (LINKAGE_WINDOWS.indexOf(win) < 0) win = '60';
            return loadJSON('data/linkage_' + win + '.json');
        }
        if (path === '/api/etf/theme-compare') {
            return loadJSON('data/etf_theme_compare.json');
        }
        if ((m = path.match(/^\/api\/detail\/([0-9A-Za-z]+)$/))) {
            return loadJSON('data/detail/' + m[1] + '_' + pickDays(q.get('days')) + '.json');
        }
        if ((m = path.match(/^\/api\/etf\/([0-9A-Za-z]+)\/constituents$/))) {
            return loadJSON('data/constituents/' + m[1] + '.json');
        }
        if ((m = path.match(/^\/api\/stock\/([0-9A-Za-z]+)$/))) {
            return loadJSON('data/stock/' + m[1] + '.json');
        }
        // 单股报告列表
        if ((m = path.match(/^\/api\/stock\/([0-9A-Za-z]+)\/reports$/))) {
            return loadJSON('data/stock_reports/' + m[1] + '.json');
        }
        // 资产类别排行（期货/黄金/汇率）
        if ((m = path.match(/^\/api\/market\/class\/([a-z]+)$/))) {
            return loadJSON('data/class_' + m[1] + '.json');
        }
        // 单标的日线（期货/黄金/汇率/ETF/个股）
        if ((m = path.match(/^\/api\/bars\/(.+)$/))) {
            // instrument_id 可能含冒号（如 SHFE:RB0），URL 中已编码为 %3A
            var iid = decodeURIComponent(m[1]);
            return loadJSON('data/bars/' + iid.replace(/[:/\\]/g, '_') + '.json');
        }
        return null;
    }

    window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : ((input && input.url) || '');
        var pending = null;
        try {
            pending = route(url);
        } catch (e) {
            pending = null;
        }
        if (!pending) return origFetch(input, init);

        return pending.then(function (data) {
            return jsonResponse(data, 200);
        }).catch(function () {
            return jsonResponse({ error: '静态站点暂未导出该数据' }, 404);
        });
    };
})();
