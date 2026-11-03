/**
 * 市场 · 多资产联动
 *   /api/market/board  多资产行情（一次取全，前端筛选）
 *   /api/linkage       相关性矩阵 / 领先滞后 / 资金流
 */
(function () {
    'use strict';
    var F = NT.fmt, C = NT.chg, CT = NT.chart;

    var PAGE_SIZE = 50;
    var CLASS_NAMES = {
        index: '指数', etf: 'ETF', equity: '股票',
        futures: '期货', gold: '黄金', fx: '汇率'
    };
    var CLASS_ICONS = {
        index: '📈', etf: '🧺', equity: '🏢',
        futures: '🛢️', gold: '🥇', fx: '💱'
    };

    var state = {
        board: null,
        linkage: null,
        cls: '',
        keyword: '',
        window: 60,
        crossOnly: true
    };
    var charts = {};
    var boardPager = null;

    // ─── 工具（使用 NT 组件库）───────────────────────────────
    function esc(s) { return NT.esc(s); }
    var num = F.num;
    var pctClass = C.cls;
    var pctText = C.text;
    var amountText = F.amount;
    var plainNum = F.plain;
    var cssVar = CT.cssVar;
    var theme = CT.theme;
    function ensureChart(key, el) { return CT.ensureChart(charts, key, el); }
    function disposeChart(key) { CT.disposeChart(charts, key); }

    // ─── 启动 ───────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        bindEvents();
        boardPager = NT.pager.create({
            prevId: 'prevPage',
            nextId: 'nextPage',
            pageInfoId: 'pageInfo',
            pageSize: PAGE_SIZE
        }, function () { renderBoard(); });
        loadBoard();
        loadLinkage(state.window);
        loadThemeCompare();

        document.addEventListener('themechange', function () {
            if (state.linkage) {
                renderCorr(state.linkage);
                renderFlows(state.linkage);
            }
            if (state.themeCompare) renderThemeCompare(state.themeCompare);
        });
    });

    function bindEvents() {
        NT.chips.createGroup('#classFilter', function (value) {
            state.cls = value;
            if (boardPager) boardPager.reset();
            renderBoard();
        });

        var search = document.getElementById('boardSearch');
        if (search) {
            search.addEventListener('input', function () {
                state.keyword = (search.value || '').trim().toLowerCase();
                if (boardPager) boardPager.reset();
                renderBoard();
            });
        }

        // rangePicker 用 .time-btn 而非 .chip，手动绑定
        document.querySelectorAll('#rangePicker .time-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                document.querySelectorAll('#rangePicker .time-btn')
                    .forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                state.window = parseInt(btn.dataset.window, 10) || 60;
                loadLinkage(state.window);
            });
        });

        NT.chips.create('chipCross', function (active) {
            state.crossOnly = active;
            if (state.linkage) renderPairs(state.linkage);
        });
    }

    // ─── 行情看板 ───────────────────────────────────────────
    async function loadBoard() {
        try {
            var res = await fetch('/api/market/board?limit=3000');
            var data = await res.json();
            state.board = data;
            renderSummary(data);
            renderClassGrid(data.summary || []);
            renderBoard();
        } catch (e) {
            console.error('board load error', e);
            setText('boardMeta', '加载失败');
        }
    }

    function setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function renderSummary(data) {
        var rows = data.rows || [];
        var up = 0, down = 0, amount = 0;
        rows.forEach(function (r) {
            if (r.chg_pct > 0) up++;
            else if (r.chg_pct < 0) down++;
            if (r.amount) amount += Number(r.amount);
        });

        setText('statTotal', data.total || rows.length);
        setText('statUpDown', up + ' / ' + down);
        setText('statAmount', (amount / 1e8).toFixed(0));

        var asOf = document.getElementById('asOf');
        if (asOf) asOf.textContent = data.as_of ? ('数据日期 ' + data.as_of) : '暂无数据';
    }

    function renderClassGrid(summary) {
        var el = document.getElementById('classGrid');
        if (!el) return;
        if (!summary.length) {
            el.innerHTML = '';
            return;
        }
        el.innerHTML = summary.map(function (s, index) {
            var name = CLASS_NAMES[s.asset_class] || s.asset_class;
            var icon = CLASS_ICONS[s.asset_class] || '📊';
            var avg = s.avg_chg_pct;
            var classId = Object.prototype.hasOwnProperty.call(CLASS_NAMES, s.asset_class)
                ? s.asset_class
                : 'other_' + index;
            var cardId = 'home_market_class_' + classId;
            return '<div class="class-card" id="' + cardId + '">' +
                '<div class="class-card-head"><span class="emoji">' + icon + '</span>' +
                esc(name) + '<span class="class-count">' + (s.total || 0) + '</span></div>' +
                '<div class="class-card-body">' +
                '<span class="' + pctClass(avg) + '">' + pctText(avg) + '</span>' +
                '<span class="class-detail">↑' + (s.up_count || 0) +
                ' ↓' + (s.down_count || 0) + '</span>' +
                '</div><span class="card-id-badge" aria-label="卡片编号 ' + cardId +
                '">ID: ' + cardId + '</span></div>';
        }).join('');
    }

    function filteredRows() {
        if (!state.board) return [];
        var rows = state.board.rows || [];
        var kw = state.keyword;
        return rows.filter(function (r) {
            if (state.cls && r.asset_class !== state.cls) return false;
            if (kw) {
                var hay = ((r.name || '') + (r.symbol || '') + (r.instrument_id || ''))
                    .toLowerCase();
                if (hay.indexOf(kw) < 0) return false;
            }
            return true;
        });
    }

    function renderBoard() {
        var body = document.getElementById('boardBody');
        if (!body) return;
        var rows = filteredRows();
        if (boardPager) boardPager.setTotal(rows.length);
        var offset = boardPager ? boardPager.getOffset() : 0;
        var shown = rows.slice(offset, offset + PAGE_SIZE);

        if (!shown.length) {
            body.innerHTML = '<tr><td colspan="7" class="no-data">没有匹配的标的</td></tr>';
            setText('boardMeta', '0 条');
            return;
        }

        body.innerHTML = shown.map(function (r) {
            var cls = CLASS_NAMES[r.asset_class] || r.asset_class;
            var price = r.last != null ? r.last : r.bar_close;
            return '<tr>' +
                '<td><span class="name-cell">' + esc(r.name || r.symbol) + '</span>' +
                '<span class="code-cell">' + esc(r.symbol || '') + '</span></td>' +
                '<td><span class="tag tag-muted">' + esc(cls) + '</span></td>' +
                '<td class="num">' + num(price) + '</td>' +
                '<td class="num ' + pctClass(r.chg_pct) + '">' + pctText(r.chg_pct) + '</td>' +
                '<td class="num">' + amountText(r.amount) + '</td>' +
                '<td class="num">' + (r.open_interest ? plainNum(r.open_interest) : '—') + '</td>' +
                '<td class="muted-cell">' + esc(r.quote_time || r.bar_date || '—') + '</td>' +
                '</tr>';
        }).join('');

        setText('boardMeta', rows.length + ' 条');
    }

    // ─── 联动 ───────────────────────────────────────────────
    async function loadLinkage(win) {
        try {
            var res = await fetch('/api/linkage?window=' + win);
            var data = await res.json();
            state.linkage = data;
            renderCorr(data);
            renderPairs(data);
            renderLeaders(data);
            renderFlows(data);
            renderRotation(data);

            var link = document.getElementById('statLink');
            if (link) link.textContent = (data.instruments || []).length;
            setText('corrMeta', data.as_of ? (data.window + ' 日 · ' + data.as_of) : '暂无数据');
        } catch (e) {
            console.error('linkage load error', e);
            setText('corrMeta', '加载失败');
        }
    }

    function renderCorr(data) {
        var el = document.getElementById('corrChart');
        if (!el || !window.echarts) return;
        var list = data.instruments || [];
        if (list.length < 2) {
            disposeChart('corr');
            el.innerHTML = '<div class="no-data">日线数据不足，先跑一次 collectors.bars</div>';
            return;
        }
        var chart = ensureChart('corr', el);

        var names = list.map(function (i) { return i.name; });
        var cells = [];
        for (var i = 0; i < list.length; i++) {
            for (var j = 0; j < list.length; j++) {
                var v = data.matrix[i][j];
                cells.push([j, i, v === null || v === undefined ? '-' : v]);
            }
        }

        var T = theme();
        var light = window.ChartTheme ? ChartTheme.isLight() : true;
        var colors = light
            ? ['#2563eb', '#f1f5f9', '#dc2626']
            : ['#1d4ed8', '#0f172a', '#b91c1c'];

        chart.setOption({
            animation: false,
            tooltip: {
                position: 'top',
                backgroundColor: T.tooltipBg,
                borderColor: T.tooltipBorder,
                textStyle: { color: T.tooltipText },
                formatter: function (p) {
                    var a = names[p.data[1]];
                    var b = names[p.data[0]];
                    var v = p.data[2];
                    return a + ' × ' + b + '<br/>相关系数：' +
                        (v === '-' ? '样本不足' : Number(v).toFixed(3));
                }
            },
            grid: { left: 110, right: 24, top: 16, bottom: 120 },
            xAxis: {
                type: 'category', data: names, splitArea: { show: true },
                axisLabel: { color: T.axisLabel, rotate: 60, fontSize: 10 },
                axisLine: { lineStyle: { color: T.axisLine } }
            },
            yAxis: {
                type: 'category', data: names, splitArea: { show: true },
                axisLabel: { color: T.axisLabel, fontSize: 10 },
                axisLine: { lineStyle: { color: T.axisLine } }
            },
            visualMap: {
                min: -1, max: 1, calculable: false, orient: 'horizontal',
                left: 'center', bottom: 8, itemWidth: 12, itemHeight: 90,
                textStyle: { color: T.axisLabel },
                inRange: { color: colors }
            },
            series: [{
                type: 'heatmap',
                data: cells,
                emphasis: {
                    itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.3)' }
                }
            }]
        }, true);
    }

    function renderPairs(data) {
        var body = document.getElementById('pairBody');
        if (!body) return;
        var pairs = data.pairs || [];
        if (state.crossOnly) {
            var cross = pairs.filter(function (p) { return p.cross_asset; });
            if (cross.length) pairs = cross;
        }
        if (!pairs.length) {
            body.innerHTML = '<tr><td colspan="5" class="no-data">样本不足，暂无法计算</td></tr>';
            setText('pairMeta', '0 组');
            return;
        }

        body.innerHTML = pairs.map(function (p) {
            var lag = '同步';
            if (p.lead_days) {
                lag = (p.lead_id === p.a ? p.name_a : p.name_b) +
                    ' 领先 ' + p.lead_days + ' 天';
            }
            return '<tr>' +
                '<td>' + esc(p.name_a) + '</td>' +
                '<td>' + esc(p.name_b) + '</td>' +
                '<td class="num ' + pctClass(p.corr) + '">' + num(p.corr, 3) + '</td>' +
                '<td><span class="tag tag-muted">' + esc(p.label) + '</span></td>' +
                '<td>' + esc(lag) + '</td>' +
                '</tr>';
        }).join('');
        setText('pairMeta', pairs.length + ' 组');
    }

    function renderLeaders(data) {
        var body = document.getElementById('leaderBody');
        if (!body) return;
        var rows = (data.leaders || []).slice(0, 10);
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="3" class="no-data">样本不足</td></tr>';
            return;
        }
        body.innerHTML = rows.map(function (r) {
            return '<tr>' +
                '<td>' + esc(r.name) + '</td>' +
                '<td><span class="tag tag-muted">' +
                esc(CLASS_NAMES[r.asset_class] || r.asset_class) + '</span></td>' +
                '<td class="num ' + pctClass(r.avg_lead) + '">' +
                (r.avg_lead > 0 ? '+' : '') + num(r.avg_lead, 2) + '</td>' +
                '</tr>';
        }).join('');
        setText('leaderMeta', rows.length + ' 项');
    }

    function renderFlows(data) {
        var el = document.getElementById('flowChart');
        if (!el || !window.echarts) return;
        var flows = data.flows || [];
        if (!flows.length) {
            disposeChart('flow');
            el.innerHTML = '<div class="no-data">暂无 ETF 份额数据</div>';
            return;
        }
        var chart = ensureChart('flow', el);

        var dates = flows.map(function (f) { return f.trade_date; });
        var values = flows.map(function (f) {
            return f.net_inflow == null ? null : +(f.net_inflow / 1e8).toFixed(2);
        });
        var cumulative = [];
        var acc = 0;
        values.forEach(function (v) {
            acc += (v || 0);
            cumulative.push(+acc.toFixed(2));
        });

        var T = theme();
        chart.setOption({
            tooltip: {
                trigger: 'axis',
                backgroundColor: T.tooltipBg,
                borderColor: T.tooltipBorder,
                textStyle: { color: T.tooltipText },
                valueFormatter: function (v) { return v == null ? '—' : v + ' 亿'; }
            },
            legend: {
                data: ['当日净流入', '累计净流入'],
                textStyle: { color: T.legendText }, top: 0, right: 0
            },
            grid: { left: 56, right: 16, top: 36, bottom: 32 },
            xAxis: {
                type: 'category', data: dates,
                axisLabel: { color: T.axisLabel, fontSize: 10 },
                axisLine: { lineStyle: { color: T.axisLine } }
            },
            yAxis: {
                type: 'value', name: '亿元',
                nameTextStyle: { color: T.axisLabel, fontSize: 10 },
                axisLabel: { color: T.axisLabel },
                splitLine: { lineStyle: { color: T.splitLine } }
            },
            series: [
                {
                    name: '当日净流入', type: 'bar', data: values,
                    itemStyle: {
                        color: function (p) {
                            return p.value >= 0
                                ? cssVar('--color-up', '#dc2626')
                                : cssVar('--color-down', '#15803d');
                        }
                    }
                },
                {
                    name: '累计净流入', type: 'line', data: cumulative,
                    smooth: true, symbol: 'none',
                    lineStyle: { width: 2, color: '#6366f1' }
                }
            ]
        }, true);
    }

    function renderRotation(data) {
        var body = document.getElementById('rotBody');
        if (!body) return;
        var rows = data.rotation || [];
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="4" class="no-data">暂无数据</td></tr>';
            return;
        }
        body.innerHTML = rows.map(function (r) {
            return '<tr>' +
                '<td>' + esc(r.name) + '</td>' +
                '<td class="num">' + (r.count || 0) + '</td>' +
                '<td class="num ' + pctClass(r.momentum) + '">' + pctText(r.momentum) + '</td>' +
                '<td class="num ' + pctClass(r.inflow) + '">' +
                (r.inflow ? amountText(r.inflow) : '—') + '</td>' +
                '</tr>';
        }).join('');
        setText('rotMeta', rows.length + ' 类');
    }

    // ─── 汪汪队 ETF 维度对比 ───────────────────────────────
    async function loadThemeCompare() {
        try {
            var res = await fetch('/api/etf/theme-compare?days=365');
            var data = await res.json();
            state.themeCompare = data;
            renderThemeCompare(data);
        } catch (e) {
            console.error('theme compare load error', e);
            setText('themeCompareMeta', '加载失败');
        }
    }

    function renderThemeCompare(data) {
        var el = document.getElementById('themeCompareChart');
        if (!el || !window.echarts) return;
        var series = data.series || [];
        if (!series.length) {
            disposeChart('themeCompare');
            el.innerHTML = '<div class="no-data">暂无 ETF 份额数据</div>';
            return;
        }
        var chart = ensureChart('themeCompare', el);
        var T = theme();
        var dates = series.map(function (s) { return s.date; });
        var ntValues = series.map(function (s) { return +(s.nt_share / 1e8).toFixed(2); });
        var otherValues = series.map(function (s) { return +(s.other_share / 1e8).toFixed(2); });

        var meta = '上交所份额口径：汪汪队 ' + data.nt_etf_count + ' / ' + data.total_etf_count + ' 只 ETF';
        setText('themeCompareMeta', meta);

        chart.setOption({
            tooltip: {
                trigger: 'axis',
                backgroundColor: T.tooltipBg,
                borderColor: T.tooltipBorder,
                textStyle: { color: T.tooltipText },
                valueFormatter: function (v) { return v == null ? '—' : v + ' 亿份'; }
            },
            legend: {
                data: ['汪汪队 ETF（上交所）份额', '其他 ETF（上交所）份额'],
                textStyle: { color: T.legendText }, top: 0, right: 0
            },
            grid: { left: 56, right: 16, top: 36, bottom: 32 },
            xAxis: {
                type: 'category', data: dates,
                axisLabel: { color: T.axisLabel, fontSize: 10 },
                axisLine: { lineStyle: { color: T.axisLine } }
            },
            yAxis: {
                type: 'value', name: '亿份',
                nameTextStyle: { color: T.axisLabel, fontSize: 10 },
                axisLabel: { color: T.axisLabel },
                splitLine: { lineStyle: { color: T.splitLine } }
            },
            series: [
                {
                    name: '汪汪队 ETF（上交所）份额', type: 'line', data: ntValues,
                    smooth: true, symbol: 'none',
                    lineStyle: { width: 2.5, color: '#6366f1' },
                    areaStyle: {
                        color: {
                            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [
                                { offset: 0, color: 'rgba(99,102,241,0.2)' },
                                { offset: 1, color: 'rgba(99,102,241,0.01)' }
                            ]
                        }
                    }
                },
                {
                    name: '其他 ETF（上交所）份额', type: 'line', data: otherValues,
                    smooth: true, symbol: 'none',
                    lineStyle: { width: 2, color: '#06b6d4' }
                }
            ]
        }, true);
    }

    window.addEventListener('resize', function () {
        Object.keys(charts).forEach(function (k) {
            if (charts[k]) charts[k].resize();
        });
    });
})();
