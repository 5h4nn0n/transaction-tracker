/**
 * 站点首页 — 市场概览与数据分析摘要
 */
(function () {
    'use strict';
    var F = NT.fmt, C = NT.chg, B = NT.badge, CT = NT.chart;

    var chartInstance = null;

    document.addEventListener('DOMContentLoaded', function () {
        initChart();
        loadSummary();
        loadChart();

        document.addEventListener('themechange', function () {
            if (chartInstance) loadChart();
        });
    });

    function initChart() {
        var el = document.getElementById('homeChart');
        if (!el) return;
        el.innerHTML = '';
        chartInstance = echarts.init(el, null, { renderer: 'canvas' });
        window.addEventListener('resize', function () {
            if (chartInstance) chartInstance.resize();
        });
    }

    async function loadSummary() {
        try {
            var res = await fetch('/api/home/summary');
            var data = await res.json();
            renderStats(data);
            renderGainers(data.top_gainers || []);
            renderLosers(data.top_losers || []);
            renderPenetration(data.top_penetration || []);
            renderReports(data.recent_reports || []);
        } catch (e) {
            console.error('home summary error', e);
        }
    }

    async function loadChart() {
        try {
            var res = await fetch('/api/home/chart?days=30');
            var data = await res.json();
            renderChart(data);
        } catch (e) {
            console.error('home chart error', e);
        }
    }

    function renderStats(data) {
        var b = data.board || {};
        var e = data.etf || {};

        setText('statTotal', b.total || '-');
        setText('statUpDown', (b.up || 0) + ' / ' + (b.down || 0));
        setText('statAmount', b.amount_yi || '-');
        setText('asOf', b.as_of ? ('数据日期 ' + b.as_of) : '暂无数据');

        setText('statEtfTotal', e.total || '-');
        setText('statNtEtf', e.nt_count || '-');
        setText('statInstEtf', e.inst_count || '-');
        setText('statTotalShare', e.total_share_yi || '-');
        setText('statShareChg1d', e.share_chg_1d != null ? C.text(e.share_chg_1d) : '-');
        setText('dimMeta', e.latest_date ? ('份额更新 ' + e.latest_date) : '暂无份额数据');
    }

    function renderChart(data) {
        if (!chartInstance) return;
        var rows = data.share_total || [];
        if (!rows.length) {
            chartInstance.clear();
            document.getElementById('homeChart').innerHTML =
                '<div class="no-data">暂无份额数据</div>';
            return;
        }
        document.getElementById('homeChart').innerHTML = '';

        var T = CT.theme();
        var dates = rows.map(function (r) { return r.date; });
        var totals = rows.map(function (r) { return +(r.total / 1e8).toFixed(2); });
        var ntTotals = rows.map(function (r) {
            return r.nt_total ? +(r.nt_total / 1e8).toFixed(2) : null;
        });

        var series = [{
            name: '市场份额', type: 'line', data: totals,
            smooth: true, symbol: 'none',
            lineStyle: { width: 2.5, color: '#6366f1' },
            areaStyle: {
                color: {
                    type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                        { offset: 0, color: 'rgba(99,102,241,0.22)' },
                        { offset: 1, color: 'rgba(99,102,241,0.01)' }
                    ]
                }
            }
        }];
        if (ntTotals.some(function (v) { return v != null; })) {
            series.push({
                name: '汪汪队ETF份额', type: 'line', data: ntTotals,
                smooth: true, symbol: 'none',
                lineStyle: { width: 2, color: '#f59e0b' }
            });
        }

        chartInstance.setOption({
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                backgroundColor: T.tooltipBg,
                borderColor: T.tooltipBorder,
                textStyle: { color: T.tooltipText, fontSize: 12 },
                valueFormatter: function (v) { return v == null ? '-' : v + ' 亿份'; }
            },
            legend: {
                data: series.map(function (s) { return s.name; }),
                textStyle: { color: T.legendText, fontSize: 11 },
                top: 0, right: 0,
                icon: 'roundRect', itemWidth: 12, itemHeight: 3
            },
            grid: { left: 56, right: 16, top: 36, bottom: 32 },
            xAxis: {
                type: 'category', data: dates,
                axisLabel: { color: T.axisLabel, fontSize: 10 },
                axisLine: { lineStyle: { color: T.axisLine } },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value', name: '亿份',
                nameTextStyle: { color: T.axisLabel, fontSize: 10 },
                axisLabel: { color: T.axisLabel, fontSize: 10 },
                splitLine: { lineStyle: { color: T.splitLine } },
                axisLine: { show: false }
            },
            series: series
        }, true);
    }

    function renderGainers(rows) {
        var body = document.getElementById('gainerBody');
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="3" class="no-data">暂无数据</td></tr>';
            return;
        }
        body.innerHTML = rows.map(function (r) {
            return '<tr onclick="location.href=\'' + NT.url('detail/' + r.ts_code) + '\'">' +
                '<td>' + r.ts_code + '</td>' +
                '<td class="name-col">' + NT.esc(r.name) + '</td>' +
                '<td class="num ' + C.cls(r.chg_pct) + '">' + C.text(r.chg_pct) + '</td>' +
                '</tr>';
        }).join('');
    }

    function renderLosers(rows) {
        var body = document.getElementById('loserBody');
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="3" class="no-data">暂无数据</td></tr>';
            return;
        }
        body.innerHTML = rows.map(function (r) {
            return '<tr onclick="location.href=\'' + NT.url('detail/' + r.ts_code) + '\'">' +
                '<td>' + r.ts_code + '</td>' +
                '<td class="name-col">' + NT.esc(r.name) + '</td>' +
                '<td class="num ' + C.cls(r.chg_pct) + '">' + C.text(r.chg_pct) + '</td>' +
                '</tr>';
        }).join('');
    }

    function renderPenetration(rows) {
        var body = document.getElementById('penBody');
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="5" class="no-data">暂无数据</td></tr>';
            return;
        }
        body.innerHTML = rows.map(function (r) {
            return '<tr onclick="location.href=\'' + NT.url('stock/' + r.stock_code) + '\'">' +
                '<td>' + r.stock_code + '</td>' +
                '<td class="name-col">' + NT.esc(r.stock_name) + '</td>' +
                '<td class="num">' + (r.pen_value_yi || '-') + '</td>' +
                '<td class="num">' + (r.etf_count || '-') + '</td>' +
                '<td>' + B.fromFlags(r.is_nt_held, r.is_inst_held) + '</td>' +
                '</tr>';
        }).join('');
    }

    function renderReports(rows) {
        var body = document.getElementById('reportBody');
        if (!rows.length) {
            body.innerHTML = '<tr><td colspan="4" class="no-data">暂无公告</td></tr>';
            return;
        }
        body.innerHTML = rows.map(function (r) {
            return '<tr onclick="location.href=\'' + NT.url('stock/' + r.stock_code) + '\'">' +
                '<td class="muted-cell">' + (r.notice_date || '-') + '</td>' +
                '<td>' + NT.esc(r.stock_name || r.stock_code) + '</td>' +
                '<td class="report-title">' + NT.esc(r.title || '') + '</td>' +
                '<td><span class="tag tag-muted">' + NT.esc(r.category_group || '其他') + '</span></td>' +
                '</tr>';
        }).join('');
    }

    function setText(id, text) {
        var el = document.getElementById(id);
        if (el) el.textContent = text;
    }
})();
