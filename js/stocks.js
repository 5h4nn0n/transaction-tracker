/**
 * 市场个股排行 — ETF 穿透分析页
 * 市场 ETF 穿透到个股, 汪汪队/机构作为维度筛选
 */
(function () {
    'use strict';

    var F = NT.fmt, C = NT.chg, B = NT.badge, CT = NT.chart;

    const PAGE_SIZE = 50;
    const COLSPAN = 13;

    const state = {
        q: '', sort: 'pen_value', order: 'desc', offset: 0, total: 0,
        onlyInst: false, onlyNt: false, minPen: 0,
    };

    let topChart = null, distChart = null, themeChart = null, instTypeChart = null;
    let lastSummary = null;
    let pager = null;

    document.addEventListener('DOMContentLoaded', () => {
        initCharts();
        loadSummary();
        loadTable();
        bindEvents();

        document.addEventListener('themechange', () => {
            if (!lastSummary) return;
            renderTopChart(lastSummary.top_stocks);
            renderDistChart(lastSummary.etf_distribution);
            renderThemeChart(lastSummary);
            renderInstTypeChart(lastSummary.inst_distribution);
        });
    });

    // ─── 事件绑定 ───
    function bindEvents() {
        let timer = null;
        document.getElementById('searchInput').addEventListener('input', e => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                state.q = e.target.value.trim();
                state.offset = 0;
                loadTable();
            }, 300);
        });

        NT.chips.create('chipInst', v => { state.onlyInst = v; state.offset = 0; loadTable(); });
        NT.chips.create('chipNt', v => { state.onlyNt = v; state.offset = 0; loadTable(); });
        NT.chips.create('chipBig', v => { state.minPen = v ? 1 : 0; state.offset = 0; loadTable(); });

        NT.sort.create('#penTable', { key: state.sort, dir: state.order }, s => {
            state.sort = s.key; state.order = s.dir; state.offset = 0; loadTable();
        });

        pager = NT.pager.create({
            prevId: 'prevPage', nextId: 'nextPage',
            pageInfoId: 'pageInfo', filterMetaId: 'filterMeta',
            pageSize: PAGE_SIZE,
        }, () => { state.offset = pager.getOffset(); loadTable(); });

        window.addEventListener('resize', () => {
            [topChart, distChart, themeChart, instTypeChart].forEach(c => c && c.resize());
        });
    }

    // ─── 图表 ───
    function initCharts() {
        const els = ['topChart', 'distChart', 'themeChart', 'instTypeChart'];
        const charts = [];
        els.forEach(id => {
            const el = document.getElementById(id);
            if (!el) { charts.push(null); return; }
            el.innerHTML = '';
            charts.push(echarts.init(el));
        });
        [topChart, distChart, themeChart, instTypeChart] = charts;
    }

    async function loadSummary() {
        try {
            const res = await fetch('/api/stocks/summary');
            const d = await res.json();
            document.getElementById('statStockCount').textContent = d.stock_count.toLocaleString();
            document.getElementById('statPenValue').innerHTML = `${(d.total_pen_value / 1e8).toFixed(0)}<small>亿元</small>`;
            document.getElementById('statEtfNav').innerHTML = `${(d.etf_nav_size / 1e8).toFixed(0)}<small>亿元</small>`;
            document.getElementById('statNtNav').textContent = `其中汪汪队持有 ${(d.nt_nav_size / 1e8).toFixed(0)} 亿元`;
            document.getElementById('statCoverage').innerHTML = `${d.avg_coverage.toFixed(1)}<small>%</small>`;
            document.getElementById('statEtfCount').textContent =
                `${d.etf_count} 只 ETF 参与穿透 (市场 ${d.etf_total || 0}, 汪汪队 ${d.etf_nt_count || 0})`;
            document.getElementById('reportDate').innerHTML =
                `📅 穿透篮子报告期: <span class="date-value">${d.report_date || '-'}</span>`;
            renderTopChart(d.top_stocks);
            renderDistChart(d.etf_distribution);
            renderThemeStats(d);
            renderThemeChart(d);
            renderInstTypeChart(d.inst_distribution);
            lastSummary = d;
        } catch (e) { console.error('summary error', e); }
    }

    function renderTopChart(rows) {
        const data = rows.slice().reverse();
        const T = CT.theme();
        topChart.setOption({
            backgroundColor: 'transparent',
            grid: { left: 92, right: 66, top: 12, bottom: 18 },
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
                backgroundColor: T.tooltipBg, borderColor: T.tooltipBorder,
                textStyle: { color: T.tooltipText, fontSize: 12 },
                formatter: p => {
                    const r = data[p[0].dataIndex];
                    return `<b>${r.stock_name} ${r.stock_code}</b><br/>穿透市值: ${F.yi(r.pen_value)} 亿元<br/>穿透股数: ${F.wan(r.pen_shares)} 万股<br/>涉及 ETF: ${r.etf_count} 只`;
                },
            },
            xAxis: { type: 'value',
                axisLabel: { color: T.axisLabel, fontSize: 10, formatter: v => `${(v / 1e8).toFixed(0)}亿` },
                splitLine: { lineStyle: { color: T.splitLine } }, axisLine: { show: false } },
            yAxis: { type: 'category', data: data.map(r => r.stock_name),
                axisLabel: { color: T.legendText, fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
            series: [{ type: 'bar', data: data.map(r => r.pen_value), barWidth: '62%',
                itemStyle: { borderRadius: [0, 4, 4, 0],
                    color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                        { offset: 0, color: 'rgba(99,102,241,0.55)' }, { offset: 1, color: '#8b5cf6' }]) },
                label: { show: true, position: 'right', color: T.legendText, fontSize: 10,
                    formatter: p => `${(p.value / 1e8).toFixed(1)}亿` } }],
        }, true);
    }

    function renderDistChart(rows) {
        const palette = ['#6366f1', '#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#22c55e', '#ef4444', '#14b8a6', '#a855f7', '#64748b'];
        const T = CT.theme();
        distChart.setOption({
            backgroundColor: 'transparent',
            tooltip: { trigger: 'item', backgroundColor: T.tooltipBg, borderColor: T.tooltipBorder,
                textStyle: { color: T.tooltipText, fontSize: 12 },
                formatter: p => `<b>${p.name}</b><br/>穿透市值 ${(p.value / 1e8).toFixed(2)} 亿元 (${p.percent}%)` },
            legend: { type: 'scroll', orient: 'vertical', right: 6, top: 'center',
                itemWidth: 9, itemHeight: 9, textStyle: { color: T.legendText, fontSize: 10 } },
            series: [{ type: 'pie', radius: ['42%', '68%'], center: ['32%', '50%'],
                avoidLabelOverlap: true, itemStyle: { borderColor: T.pieBorder, borderWidth: 2 }, label: { show: false },
                data: rows.map((r, i) => ({ name: r.etf_name, value: r.pen_value, itemStyle: { color: palette[i % palette.length] } })) }],
        }, true);
    }

    // ─── 汪汪队/机构专题统计 ───
    function renderThemeStats(d) {
        const el = document.getElementById('themeStats');
        if (!el) return;
        const yi = v => (v == null ? '-' : (v / 1e8).toFixed(0));
        el.innerHTML = `
            <div class="theme-stat-item"><span class="label">🛡️ 汪汪队 ETF 规模</span><span class="value">${yi(d.nt_nav_size)}<small>亿元</small></span></div>
            <div class="theme-stat-item"><span class="label">🧺 市场 ETF 规模</span><span class="value">${yi(d.etf_nav_size)}<small>亿元</small></span></div>
            <div class="theme-stat-item"><span class="label">📊 汪汪队 ETF 数量</span><span class="value">${d.etf_nt_count || 0}<small> / ${d.etf_total || 0} 只</small></span></div>
            <div class="theme-stat-item"><span class="label">💰 ETF 持有市值</span><span class="value">${yi(d.total_etf_hold_value)}<small>亿元</small></span></div>`;
    }

    function renderThemeChart(d) {
        if (!themeChart) return;
        const T = CT.theme();
        const dist = d.etf_distribution || [];
        let ntValue = 0, otherValue = 0;
        dist.forEach(r => { if (r.is_nt) ntValue += (r.pen_value || 0); else otherValue += (r.pen_value || 0); });
        themeChart.setOption({
            backgroundColor: 'transparent',
            tooltip: { trigger: 'item', backgroundColor: T.tooltipBg, borderColor: T.tooltipBorder,
                textStyle: { color: T.tooltipText, fontSize: 12 },
                formatter: p => `<b>${p.name}</b><br/>穿透市值 ${(p.value / 1e8).toFixed(2)} 亿元 (${p.percent}%)` },
            legend: { orient: 'vertical', right: 6, top: 'center', itemWidth: 9, itemHeight: 9, textStyle: { color: T.legendText, fontSize: 10 } },
            series: [{ type: 'pie', radius: ['44%', '70%'], center: ['35%', '50%'], avoidLabelOverlap: true,
                itemStyle: { borderColor: T.pieBorder, borderWidth: 2 },
                label: { show: true, position: 'outside', color: T.legendText, fontSize: 10, formatter: '{b}\n{d}%' },
                data: [
                    { name: '汪汪队 ETF', value: ntValue, itemStyle: { color: '#6366f1' } },
                    { name: '其他 ETF', value: otherValue, itemStyle: { color: '#06b6d4' } },
                ] }],
        }, true);
    }

    function renderInstTypeChart(dist) {
        if (!instTypeChart) return;
        const T = CT.theme();
        const data = Object.entries(dist || {}).map(([name, value]) => ({ name, value: value / 1e8 }))
            .filter(d => d.value > 0).sort((a, b) => b.value - a.value);
        if (!data.length) { instTypeChart.clear(); document.getElementById('instTypeChart').innerHTML = '<div class="no-data">暂无机构持仓数据</div>'; return; }
        const colors = ['#6366f1', '#06b6d4', '#f59e0b', '#ec4899'];
        instTypeChart.setOption({
            backgroundColor: 'transparent',
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: T.tooltipBg, borderColor: T.tooltipBorder,
                textStyle: { color: T.tooltipText, fontSize: 12 },
                formatter: p => `<b>${p[0].name}</b><br/>穿透市值 ${p[0].value.toFixed(2)} 亿元` },
            grid: { left: 80, right: 40, top: 12, bottom: 18 },
            xAxis: { type: 'value', axisLabel: { color: T.axisLabel, fontSize: 10, formatter: v => `${v.toFixed(0)}亿` },
                splitLine: { lineStyle: { color: T.splitLine } }, axisLine: { show: false } },
            yAxis: { type: 'category', data: data.map(d => d.name).reverse(), axisLabel: { color: T.legendText, fontSize: 11 },
                axisLine: { show: false }, axisTick: { show: false } },
            series: [{ type: 'bar', data: data.slice().reverse().map((d, i) => ({ value: d.value,
                itemStyle: { color: colors[i % colors.length], borderRadius: [0, 4, 4, 0] } })),
                barWidth: '55%', label: { show: true, position: 'right', color: T.legendText, fontSize: 10, formatter: p => `${p.value.toFixed(2)} 亿` } }],
        }, true);
    }

    // ─── 表格 ───
    async function loadTable() {
        const params = new URLSearchParams({ q: state.q, sort: state.sort, order: state.order,
            limit: PAGE_SIZE, offset: state.offset, min_pen: state.minPen });
        if (state.onlyInst) params.set('only_inst', '1');
        if (state.onlyNt) params.set('only_nt', '1');
        const tbody = document.getElementById('penTableBody');
        try {
            const res = await fetch(`/api/stocks/penetration?${params}`);
            const json = await res.json();
            state.total = json.total;
            renderTable(json.data);
            pager.setTotal(json.total);
            pager.setOffset(state.offset);
            pager.setMeta(`共 ${json.total.toLocaleString()} 只个股`);
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="${COLSPAN}" class="no-data">数据加载失败，请检查后端服务</td></tr>`;
        }
    }

    function renderTable(rows) {
        const tbody = document.getElementById('penTableBody');
        if (!rows || !rows.length) {
            tbody.innerHTML = `<tr><td colspan="${COLSPAN}" class="no-data">没有符合条件的个股</td></tr>`;
            return;
        }
        const maxFloatRatio = Math.max(...rows.map(r => r.float_ratio || 0), 0.0001);
        tbody.innerHTML = rows.map(r => {
            const instTag = r.inst_free_ratio > 0 ? B.tag('tag-inst', `${r.org_num_all || 0} 家`) : '<span class="val-neutral">-</span>';
            const ssTag = r.ss_ratio > 0 ? B.tag('tag-ss', `${F.pct(r.ss_ratio)}%`) : '<span class="val-neutral">-</span>';
            const badges = [];
            if (r.nt_holder_cnt > 0) badges.push(B.nt());
            if (r.inst_free_ratio > 0) badges.push(B.inst());
            const badgeCell = badges.length ? badges.join(' ') : '<span class="val-neutral">-</span>';
            const ntSeatTag = r.nt_holder_cnt > 0 ? B.tag('tag-nt', `${r.nt_holder_cnt} 席`) : '<span class="val-neutral">-</span>';
            const width = Math.max(3, (r.float_ratio || 0) / maxFloatRatio * 100);
            return `<tr onclick="location.href='${NT.url('stock/' + r.stock_code)}'" title="点击查看个股穿透详情">
                <td>${r.stock_code}</td>
                <td class="name-col"><a class="cell-link" href="${NT.url('stock/' + r.stock_code)}">${r.stock_name || ''}</a></td>
                <td>${badgeCell}</td>
                <td>${r.close == null ? '-' : Number(r.close).toFixed(2)}</td>
                <td class="${C.cls(r.chg_pct)}">${C.text(r.chg_pct)}</td>
                <td>${F.yi(r.pen_value)}</td>
                <td>${F.wan(r.pen_shares)}</td>
                <td><div class="bar-cell"><div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div><span class="bar-text">${F.pct(r.float_ratio, 3)}%</span></div></td>
                <td>${r.etf_count}</td>
                <td>${instTag}</td>
                <td>${r.inst_free_ratio == null ? '-' : F.pct(r.inst_free_ratio) + '%'}</td>
                <td>${ssTag}</td>
                <td>${ntSeatTag}</td>
            </tr>`;
        }).join('');
    }
})();
