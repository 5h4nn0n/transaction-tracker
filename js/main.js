/**
 * 市场 ETF 看板 — 主页逻辑
 * 市场 ETF 数据, 汪汪队 ETF 通过 is_nt 标签突出显示
 */
(function () {
    'use strict';

    var F = NT.fmt, C = NT.chg, B = NT.badge, CT = NT.chart;

    const PAGE_SIZE = 50;
    let chartInstance = null;
    let tableData = [];
    let currentSort = { key: 'latest_share', dir: 'desc' };
    let lastChartData = null;
    let pager = null;

    document.addEventListener('DOMContentLoaded', () => {
        initChart();
        loadChartData(365);
        loadTableData();
        initTimeSelector();
        NT.sort.create('#etfTable', currentSort, s => { currentSort = s; sortAndRender(); });

        pager = NT.pager.create({
            prevId: 'prevPage',
            nextId: 'nextPage',
            pageInfoId: 'pageInfo',
            pageSize: PAGE_SIZE
        }, function () { renderTable(); });

        document.addEventListener('themechange', () => {
            if (lastChartData) renderChart(lastChartData);
        });
    });

    function initTimeSelector() {
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                loadChartData(parseInt(btn.dataset.days));
            });
        });
    }

    function initChart() {
        const el = document.getElementById('mainChart');
        el.innerHTML = '';
        chartInstance = echarts.init(el, null, { renderer: 'canvas' });
        window.addEventListener('resize', () => chartInstance && chartInstance.resize());
    }

    async function loadChartData(days) {
        try {
            const res = await fetch(`/api/overview/chart?days=${days}`);
            const data = await res.json();
            renderChart(data);
        } catch (e) { console.error('Chart load error:', e); }
    }

    function renderChart(data) {
        lastChartData = data;
        const T = CT.theme();
        const shareDates = data.share_total.map(d => d.date);
        const shareValues = data.share_total.map(d => (d.total / 1e8).toFixed(2));
        const ntShareValues = data.share_total.map(d => d.nt_total ? (d.nt_total / 1e8).toFixed(2) : null);

        const series = [{
            name: '市场ETF总份额(亿份)', type: 'line', yAxisIndex: 0, data: shareValues,
            smooth: true, showSymbol: false, lineStyle: { width: 2.5, color: '#6366f1' },
            areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [{ offset: 0, color: 'rgba(99,102,241,0.25)' }, { offset: 1, color: 'rgba(99,102,241,0.02)' }] } },
            z: 10,
        }];
        if (ntShareValues.some(v => v != null)) {
            series.push({ name: '汪汪队ETF份额(亿份)', type: 'line', yAxisIndex: 0, data: ntShareValues,
                smooth: true, showSymbol: false, lineStyle: { width: 2, color: '#f59e0b' }, z: 8 });
        }

        const colors = ['#06b6d4', '#ec4899', '#22c55e'];
        let ci = 0;
        const legendData = ['市场ETF总份额(亿份)'];
        if (ntShareValues.some(v => v != null)) legendData.push('汪汪队ETF份额(亿份)');

        for (const [code, info] of Object.entries(data.index_prices)) {
            const c = colors[ci++ % colors.length];
            legendData.push(info.name);
            series.push({ name: info.name, type: 'line', yAxisIndex: 1,
                data: info.data.map(d => d.close), smooth: true, showSymbol: false,
                lineStyle: { width: 1.8, color: c }, z: 5 });
        }

        chartInstance.setOption({
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis', backgroundColor: T.tooltipBg, borderColor: T.tooltipBorder,
                textStyle: { color: T.tooltipText, fontSize: 12 },
                axisPointer: { type: 'cross', crossStyle: { color: T.axisLabel } } },
            legend: { data: legendData, top: 4, textStyle: { color: T.legendText, fontSize: 11 },
                icon: 'roundRect', itemWidth: 14, itemHeight: 3 },
            grid: { left: 80, right: 80, top: 50, bottom: 40 },
            xAxis: { type: 'category', data: shareDates, axisLine: { lineStyle: { color: T.axisLine } },
                axisLabel: { color: T.axisLabel, fontSize: 10 }, axisTick: { show: false } },
            yAxis: [
                { type: 'value', name: '总份额(亿份)', nameTextStyle: { color: T.axisLabel, fontSize: 10 },
                    axisLabel: { color: T.axisLabel, fontSize: 10, formatter: '{value}' },
                    splitLine: { lineStyle: { color: T.splitLine } }, axisLine: { show: false } },
                { type: 'value', name: '价格(元)', nameTextStyle: { color: T.axisLabel, fontSize: 10 },
                    axisLabel: { color: T.axisLabel, fontSize: 10 }, splitLine: { show: false }, axisLine: { show: false } }
            ],
            dataZoom: [{ type: 'inside', start: 0, end: 100 }],
            series: series,
        }, true);
    }

    async function loadTableData() {
        try {
            const res = await fetch('/api/overview/table');
            const json = await res.json();
            tableData = json.data || json;
            const shareDate = json.latest_share_date || '-';
            document.getElementById('shareUpdateDate').innerHTML =
                `📅 份额数据更新至: <span class="date-value">${shareDate}</span>`;
            const lastUpdate = document.getElementById('lastUpdate');
            if (lastUpdate) lastUpdate.textContent = `共 ${tableData.length} 只 ETF`;
            const ntCount = tableData.filter(r => r.is_nt).length;
            document.getElementById('etfCount').textContent =
                `${tableData.length} 只${ntCount ? ` (汪汪队 ${ntCount})` : ''}`;
            sortAndRender();
        } catch (e) {
            document.getElementById('etfTableBody').innerHTML =
                '<tr><td colspan="16" class="no-data">数据加载失败, 请检查后端服务</td></tr>';
        }
    }

    function sortAndRender() {
        tableData = NT.sort.sortRows(tableData, currentSort.key, currentSort.dir);
        pager.setTotal(tableData.length);
        pager.setOffset(0);
        renderTable();
    }

    function renderTable() {
        const tbody = document.getElementById('etfTableBody');
        if (!tableData.length) {
            tbody.innerHTML = '<tr><td colspan="16" class="no-data">暂无数据</td></tr>';
            return;
        }
        const offset = pager.getOffset();
        const pageRows = tableData.slice(offset, offset + PAGE_SIZE);
        tbody.innerHTML = pageRows.map(row => {
            const shareB = row.latest_share == null ? '-' : (row.latest_share / 1e8).toFixed(2);
            const priceCls = C.cls(row.price_chg_pct);
            const priceTxt = C.text(row.price_chg_pct);
            const cov = row.basket_coverage;
            const covCls = cov == null || cov === 0 ? 'tag-muted' : cov >= 90 ? 'tag-inst' : 'tag-ss';
            const covTxt = cov == null || cov === 0 ? '未采集' : `${cov.toFixed(1)}%`;
            const ntBadge = row.is_nt ? B.nt() : (row.is_inst ? B.inst() : '');
            return `<tr onclick="location.href='${NT.url('detail/' + row.ts_code)}'" title="点击查看详情">
                <td>${row.ts_code}</td>
                <td class="name-col">${row.name || ''}</td>
                <td>${ntBadge}</td>
                <td>${row.close == null ? '-' : row.close.toFixed(3)}</td>
                <td class="${priceCls}">${priceTxt}</td>
                <td>${shareB}</td>
                ${chgCell(row.share_chg_1d)}${chgCell(row.share_chg_1w)}${chgCell(row.share_chg_1m)}${chgCell(row.share_chg_3m)}${chgCell(row.share_chg_1y)}
                <td>${row.nt_hold_ratio ? '<span class="badge badge-nt">' + row.nt_hold_ratio.toFixed(2) + '%</span>' : '-'}</td>
                <td>${row.pen_value ? (row.pen_value / 1e8).toFixed(2) : '-'}</td>
                <td>${row.pen_stock_count ? row.pen_stock_count + ' 只' : '-'}</td>
                <td><span class="tag ${covCls}">${covTxt}</span></td>
                <td style="font-size:0.75rem;color:var(--text-muted)">${row.latest_report_date || '-'}<br>${row.prev_report_date || '-'}</td>
            </tr>`;
        }).join('');
    }

    function chgCell(val) {
        if (val == null) return '<td class="val-neutral">-</td>';
        return `<td class="${C.cls(val)}">${C.text(val)}</td>`;
    }
})();
