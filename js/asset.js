/**
 * 资产类别通用页（期货 / 黄金 / 汇率）
 *   /api/market/class/<asset_class>   类别排行 + 统计 + 头部K线
 *   /api/bars/<instrument_id>         单标的日线
 */
(function () {
    'use strict';
    var F = NT.fmt, C = NT.chg, CT = NT.chart;

    var PAGE_SIZE = 30;
    var CLASS = window.PAGE_ASSET_CLASS || '';
    var state = {
        data: null,
        keyword: '',
        selectedId: null,
    };
    var charts = {};
    var boardPager = null;

    function esc(s) { return NT.esc(s); }
    var num = F.num;
    var pctClass = C.cls;
    var pctText = C.text;
    var amountText = F.amount;
    var plainNum = F.plain;
    var cssVar = CT.cssVar;
    var theme = CT.theme;
    function ensureChart(key, el) { return CT.ensureChart(charts, key, el); }

    // ─── 启动 ───────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        bindEvents();
        boardPager = NT.pager.create({
            prevId: 'prevPage',
            nextId: 'nextPage',
            pageInfoId: 'pageInfo',
            pageSize: PAGE_SIZE
        }, function () { renderBoard(); });
        loadData();
        document.addEventListener('themechange', function () {
            if (state.selectedId) loadBars(state.selectedId);
        });
    });

    function bindEvents() {
        var search = document.getElementById('boardSearch');
        if (search) {
            search.addEventListener('input', function () {
                state.keyword = (search.value || '').trim().toLowerCase();
                if (boardPager) boardPager.reset();
                renderBoard();
            });
        }
    }

    // ─── 数据加载 ───────────────────────────────────────────
    async function loadData() {
        try {
            var res = await fetch('/api/market/class/' + CLASS);
            var data = await res.json();
            state.data = data;
            renderSummary(data);
            renderBoard();

            // 自动选第一个标的画图
            var rows = data.rows || [];
            if (rows.length) {
                selectRow(rows[0].instrument_id);
            }
        } catch (e) {
            console.error('load error', e);
            setText('boardMeta', '加载失败');
        }
    }

    function setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function renderSummary(data) {
        var stats = data.stats || {};
        var rows = data.rows || [];
        var up = stats.up_count || 0, down = stats.down_count || 0;
        setText('statTotal', rows.length);
        setText('statUpDown', up + ' / ' + down);
        setText('statAvg', pctText(stats.avg_chg_pct));
        setText('statAmount', (Number(stats.amount || 0) / 1e8).toFixed(0));

        var asOf = document.getElementById('asOf');
        if (asOf) {
            var date = '';
            for (var i = 0; i < rows.length; i++) {
                if (rows[i].quote_time) { date = rows[i].quote_time; break; }
                if (rows[i].bar_date) { date = rows[i].bar_date; break; }
            }
            asOf.textContent = date ? ('数据时间 ' + date) : '暂无数据';
        }
    }

    function filteredRows() {
        if (!state.data) return [];
        var rows = state.data.rows || [];
        var kw = state.keyword;
        if (!kw) return rows;
        return rows.filter(function (r) {
            var hay = ((r.name || '') + (r.symbol || '') + (r.instrument_id || '')).toLowerCase();
            return hay.indexOf(kw) >= 0;
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
            var price = r.last != null ? r.last : r.bar_close;
            var sel = r.instrument_id === state.selectedId ? ' selected' : '';
            return '<tr class="clickable' + sel + '" data-iid="' + esc(r.instrument_id) + '">' +
                '<td><span class="name-cell">' + esc(r.name || r.symbol) + '</span>' +
                '<span class="code-cell">' + esc(r.symbol || '') + '</span></td>' +
                '<td class="num">' + num(price) + '</td>' +
                '<td class="num ' + pctClass(r.chg_pct) + '">' + pctText(r.chg_pct) + '</td>' +
                '<td class="num">' + (r.volume ? plainNum(r.volume) : '—') + '</td>' +
                '<td class="num">' + (r.open_interest ? plainNum(r.open_interest) : '—') + '</td>' +
                '<td class="muted-cell">' + esc(r.quote_time || r.bar_date || '—') + '</td>' +
                '<td><span class="arrow">›</span></td>' +
                '</tr>';
        }).join('');

        // 绑定点击
        body.querySelectorAll('tr.clickable').forEach(function (tr) {
            tr.addEventListener('click', function () {
                selectRow(tr.dataset.iid);
            });
        });

        setText('boardMeta', rows.length + ' 条');
    }

    function selectRow(iid) {
        state.selectedId = iid;
        // 更新选中样式
        document.querySelectorAll('#boardBody tr.clickable').forEach(function (tr) {
            tr.classList.toggle('selected', tr.dataset.iid === iid);
        });
        loadBars(iid);
    }

    // ─── K 线图 ────────────────────────────────────────────
    async function loadBars(iid) {
        var el = document.getElementById('priceChart');
        if (!el) return;

        // 先用预加载的 charts 数据
        if (state.data && state.data.charts && state.data.charts[iid]) {
            renderChart(iid, state.data.charts[iid]);
            return;
        }

        // 没有预加载则请求 API
        try {
            var res = await fetch('/api/bars/' + encodeURIComponent(iid) + '?days=250');
            var data = await res.json();
            var bars = (data.bars || []).map(function (b) {
                return { date: b.date, close: b.close };
            });
            renderChart(iid, bars);
        } catch (e) {
            el.innerHTML = '<div class="no-data">加载失败</div>';
        }
    }

    function renderChart(iid, bars) {
        var el = document.getElementById('priceChart');
        if (!el || !window.echarts) return;
        if (!bars || bars.length < 2) {
            el.innerHTML = '<div class="no-data">日线数据不足</div>';
            return;
        }

        var chart = ensureChart('price', el);
        var T = theme();

        // 找名称
        var name = iid;
        if (state.data) {
            for (var i = 0; i < (state.data.rows || []).length; i++) {
                if (state.data.rows[i].instrument_id === iid) {
                    name = state.data.rows[i].name || iid;
                    break;
                }
            }
        }

        var dates = bars.map(function (b) { return b.date; });
        var values = bars.map(function (b) { return b.close; });

        chart.setOption({
            tooltip: {
                trigger: 'axis',
                backgroundColor: T.tooltipBg,
                borderColor: T.tooltipBorder,
                textStyle: { color: T.tooltipText }
            },
            grid: { left: 56, right: 24, top: 32, bottom: 32 },
            xAxis: {
                type: 'category', data: dates,
                axisLabel: { color: T.axisLabel, fontSize: 10 },
                axisLine: { lineStyle: { color: T.axisLine } }
            },
            yAxis: {
                type: 'value',
                nameTextStyle: { color: T.axisLabel, fontSize: 10 },
                axisLabel: { color: T.axisLabel },
                splitLine: { lineStyle: { color: T.splitLine } }
            },
            series: [{
                name: name,
                type: 'line',
                data: values,
                smooth: true,
                symbol: 'none',
                lineStyle: { width: 2, color: cssVar('--accent', '#0e7490') },
                areaStyle: {
                    color: {
                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(14,116,144,0.25)' },
                            { offset: 1, color: 'rgba(14,116,144,0.02)' }
                        ]
                    }
                }
            }]
        }, true);

        setText('chartMeta', name + ' · ' + bars.length + ' 日');
    }

    window.addEventListener('resize', function () {
        Object.keys(charts).forEach(function (k) {
            if (charts[k]) charts[k].resize();
        });
    });
})();
