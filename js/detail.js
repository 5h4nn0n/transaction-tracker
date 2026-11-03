/**
 * ETF 市场看板 — ETF 详情页逻辑
 */
(function () {
    'use strict';

    var F = NT.fmt, C = NT.chg, B = NT.badge, CT = NT.chart;

    let chartInstance = null;
    let cachedData = null;

    const tsCode = window.NT_CODE || window.location.pathname.split('/').pop();

    document.addEventListener('DOMContentLoaded', () => {
        document.title = `${tsCode} — ETF 详情`;
        document.getElementById('etfCode').textContent = tsCode;
        initChart();
        loadData(365);
        loadConstituents();
        initTimeSelector();

        document.addEventListener('themechange', () => {
            if (cachedData) renderChart(cachedData);
        });
    });

    function initTimeSelector() {
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                loadData(parseInt(btn.dataset.days));
            });
        });
    }

    function initChart() {
        const el = document.getElementById('detailChart');
        el.innerHTML = '';
        chartInstance = echarts.init(el, null, { renderer: 'canvas' });
        window.addEventListener('resize', () => chartInstance && chartInstance.resize());
    }

    async function loadData(days) {
        try {
            const res = await fetch(`/api/detail/${tsCode}?days=${days}`);
            const data = await res.json();
            if (data.error) {
                document.getElementById('etfName').textContent = '未找到该 ETF';
                return;
            }
            cachedData = data;
            document.getElementById('etfName').textContent = data.info.name;
            document.title = `${tsCode} ${data.info.name} — ETF 详情`;

            const badgesEl = document.getElementById('etfBadges');
            const badges = [];
            if (data.info.is_nt) badges.push(B.nt());
            if (data.info.is_inst) badges.push(B.inst());
            if (data.info.fund_type) badges.push(B.tag('tag-muted', data.info.fund_type));
            badgesEl.innerHTML = badges.join(' ');

            const badge = document.getElementById('etfPenBadge');
            const basket = data.basket || {};
            if (basket.report_date) {
                badge.style.display = 'inline-flex';
                badge.textContent = `穿透篮子 ${basket.report_date} · ${basket.stock_num} 只 · 覆盖 ${basket.coverage}%`;
            }

            renderChart(data);
            renderHolders(data);
        } catch (e) { console.error('Load error:', e); }
    }

    function renderChart(data) {
        const priceDates = data.prices.map(d => d.date);
        const shareDates = data.shares.map(d => d.date);
        const allDates = [...new Set([...priceDates, ...shareDates])].sort();
        const priceMap = {}; data.prices.forEach(d => priceMap[d.date] = d.close);
        const shareMap = {}; data.shares.forEach(d => shareMap[d.date] = (d.total_share / 1e8).toFixed(2));
        const alignedPrices = allDates.map(d => priceMap[d] || null);
        const alignedShares = allDates.map(d => shareMap[d] || null);

        const T = CT.theme();
        chartInstance.setOption({
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis', backgroundColor: T.tooltipBg, borderColor: T.tooltipBorder,
                textStyle: { color: T.tooltipText, fontSize: 12 } },
            legend: { data: ['收盘价', '总份额(亿份)'], top: 4, textStyle: { color: T.legendText, fontSize: 11 },
                icon: 'roundRect', itemWidth: 14, itemHeight: 3 },
            grid: { left: 70, right: 80, top: 50, bottom: 40 },
            xAxis: { type: 'category', data: allDates, axisLine: { lineStyle: { color: T.axisLine } },
                axisLabel: { color: T.axisLabel, fontSize: 10 }, axisTick: { show: false } },
            yAxis: [
                { type: 'value', name: '价格(元)', nameTextStyle: { color: T.axisLabel, fontSize: 10 },
                    axisLabel: { color: T.axisLabel, fontSize: 10 }, splitLine: { lineStyle: { color: T.splitLine } }, axisLine: { show: false } },
                { type: 'value', name: '份额(亿份)', nameTextStyle: { color: T.axisLabel, fontSize: 10 },
                    axisLabel: { color: T.axisLabel, fontSize: 10 }, splitLine: { show: false }, axisLine: { show: false } }
            ],
            dataZoom: [{ type: 'inside', start: 0, end: 100 }],
            series: [
                { name: '收盘价', type: 'line', yAxisIndex: 0, data: alignedPrices, smooth: true, showSymbol: false,
                    lineStyle: { width: 2, color: '#06b6d4' }, z: 10 },
                { name: '总份额(亿份)', type: 'line', yAxisIndex: 1, data: alignedShares, smooth: true, showSymbol: false,
                    lineStyle: { width: 2, color: '#8b5cf6' },
                    areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [{ offset: 0, color: 'rgba(139,92,246,0.2)' }, { offset: 1, color: 'rgba(139,92,246,0.01)' }] } },
                    z: 5 },
            ],
        }, true);
    }

    function renderHolders(data) {
        document.getElementById('reportDates').innerHTML = `
            <span>📅 最新报告期: <strong>${data.latest_report_date || '-'}</strong></span>
            <span>📅 上期报告期: <strong>${data.prev_report_date || '-'}</strong></span>`;
        const prevMap = {};
        if (data.holders_prev) data.holders_prev.forEach(h => prevMap[h.holder_name] = h);
        const tbody = document.getElementById('holdersBody');
        if (!data.holders_latest || !data.holders_latest.length) {
            tbody.innerHTML = '<tr><td colspan="7" class="no-data">暂无持有人数据</td></tr>';
            return;
        }
        tbody.innerHTML = data.holders_latest.map((h, i) => {
            const prev = prevMap[h.holder_name];
            const prevAmt = prev ? (prev.hold_amount / 1e4).toFixed(2) : '-';
            const prevRatio = prev ? prev.hold_ratio.toFixed(2) : '-';
            const change = prev && prev.hold_amount > 0
                ? ((h.hold_amount - prev.hold_amount) / prev.hold_amount * 100).toFixed(2) : '新进';
            const changeDisplay = change === '新进' ? B.new() :
                `<span class="${C.cls(parseFloat(change))}">${parseFloat(change) > 0 ? '+' : ''}${change}%</span>`;
            return `<tr class="${h.is_nt ? 'nt-highlight' : ''}">
                <td>${i + 1}</td>
                <td class="holder-name" title="${h.holder_name}">${h.holder_name}${h.is_nt ? ' ' + B.nt() : ''}</td>
                <td>${(h.hold_amount / 1e4).toFixed(2)}</td>
                <td>${h.hold_ratio.toFixed(2)}</td>
                <td>${prevAmt}</td>
                <td>${prevRatio}</td>
                <td>${changeDisplay}</td>
            </tr>`;
        }).join('');
    }

    // ─── 成分股穿透 ───
    async function loadConstituents() {
        const tbody = document.getElementById('constBody');
        try {
            const res = await fetch(`/api/etf/${tsCode}/constituents`);
            const json = await res.json();
            const rows = json.data || [];
            if (!rows.length) {
                document.getElementById('basketMeta').textContent = '暂无成分股数据';
                tbody.innerHTML = '<tr><td colspan="11" class="no-data">该 ETF 暂无成分股数据（可转债 / 港股类 ETF 不适用 A 股穿透）</td></tr>';
                return;
            }
            const totalPen = rows.reduce((a, r) => a + (r.pen_value || 0), 0);
            document.getElementById('basketMeta').innerHTML =
                `${rows.length} 只成分股 · 穿透合计 ${(totalPen / 1e8).toFixed(2)} 亿元`;
            tbody.innerHTML = rows.map(r => {
                const ntTag = r.nt_holder_cnt > 0 ? B.tag('tag-nt', `${r.nt_holder_cnt} 席`) : '<span class="val-neutral">-</span>';
                return `<tr onclick="location.href='${NT.url('stock/' + r.stock_code)}'" title="查看个股穿透详情">
                    <td>${r.rank || '-'}</td>
                    <td class="name-col">${r.stock_name} <span style="color:var(--text-muted);font-size:0.72rem">${r.stock_code}</span></td>
                    <td>${r.weight == null ? '-' : r.weight.toFixed(2)}</td>
                    <td>${(r.etf_hold_shares / 1e4).toFixed(0)}</td>
                    <td>${(r.pen_shares / 1e4).toFixed(0)}</td>
                    <td>${r.pen_value ? (r.pen_value / 1e8).toFixed(2) : '-'}</td>
                    <td>${r.float_ratio == null ? '-' : r.float_ratio.toFixed(3)}</td>
                    <td>${r.stock_close == null ? '-' : Number(r.stock_close).toFixed(2)}</td>
                    <td class="${C.cls(r.stock_chg_pct)}">${C.text(r.stock_chg_pct)}</td>
                    <td>${r.org_num_all == null ? '-' : r.org_num_all}</td>
                    <td>${ntTag}</td>
                </tr>`;
            }).join('');
        } catch (e) {
            document.getElementById('basketMeta').textContent = '加载失败';
            tbody.innerHTML = '<tr><td colspan="11" class="no-data">成分股数据加载失败</td></tr>';
        }
    }
})();
