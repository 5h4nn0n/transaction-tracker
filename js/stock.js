/**
 * 市场 ETF 穿透 — 个股穿透详情页
 */
(function () {
    'use strict';
    var F = NT.fmt, C = NT.chg, B = NT.badge, CT = NT.chart;

    // 静态站用目录式 URL，末段为空，因此优先取模板注入的 NT_CODE
    const stockCode = window.NT_CODE || window.location.pathname.split('/').pop();
    let data = null;
    let priceChart = null;
    let instChart = null;
    let currentHolderList = 'sdltgd';

    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('stockCode').textContent = stockCode;
        initCharts();
        bindEvents();
        load();

        // 主题切换后按新配色重绘图表
        document.addEventListener('themechange', () => {
            if (!data) return;
            renderPriceChart();
            renderInstChart();
        });
    });

    function bindEvents() {
        document.querySelectorAll('.time-selector .time-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.time-selector .time-btn').forEach(b =>
                    b.classList.remove('active'));
                btn.classList.add('active');
                currentHolderList = btn.dataset.list;
                renderHolders();
            });
        });
        window.addEventListener('resize', () => {
            priceChart && priceChart.resize();
            instChart && instChart.resize();
        });
    }

    function initCharts() {
        const p = document.getElementById('priceChart');
        p.innerHTML = '';
        priceChart = echarts.init(p);
        const i = document.getElementById('instChart');
        i.innerHTML = '';
        instChart = echarts.init(i);
    }

    async function load() {
        try {
            const res = await fetch(`/api/stock/${stockCode}`);
            const json = await res.json();
            if (json.error) {
                document.getElementById('stockName').textContent = json.error;
                return;
            }
            data = json;
            renderHeader();
            renderStats();
            renderPriceChart();
            renderInstChart();
            renderSources();
            renderInstTable();
            renderHolders();
            loadReports();
            document.title = `${data.info.stock_name} ${stockCode} — 穿透详情`;
        } catch (e) {
            console.error('load error', e);
            document.getElementById('stockName').textContent = '数据加载失败';
        }
    }

    // ─── 头部 ───
    function renderHeader() {
        const info = data.info || {};
        const s = data.summary || {};
        document.getElementById('stockName').textContent = info.stock_name || '-';
        document.getElementById('stockMeta').innerHTML = `
            <span>总市值 <b>${info.total_mv == null ? '-' : info.total_mv.toFixed(0)}</b> 亿</span>
            <span>流通市值 <b>${info.float_mv == null ? '-' : info.float_mv.toFixed(0)}</b> 亿</span>
            <span>PE(TTM) <b>${info.pe_ttm == null ? '-' : info.pe_ttm.toFixed(1)}</b></span>
            <span>换手率 <b>${info.turnover == null ? '-' : info.turnover.toFixed(2)}</b>%</span>
            <span>行情更新 <b>${(info.updated_at || '').slice(0, 16).replace('T', ' ')}</b></span>
        `;
        document.getElementById('stockPrice').innerHTML = `
            <span class="price">${info.close == null ? '-' : Number(info.close).toFixed(2)}</span>
            <span class="chg ${C.cls(info.chg_pct)}">${C.text(info.chg_pct)}</span>
        `;
        // 维度标签
        document.getElementById('stockBadges').innerHTML = B.fromFlags(info.is_nt_held, info.is_inst_held);
    }

    // ─── 穿透指标 ───
    function renderStats() {
        const s = data.summary || {};
        document.getElementById('statPenValue').innerHTML =
            `${s.pen_value == null ? '-' : (s.pen_value / 1e8).toFixed(2)}<small>亿元</small>`;
        document.getElementById('statPenShares').innerHTML =
            `${s.pen_shares == null ? '-' : (s.pen_shares / 1e4).toFixed(1)}<small>万股</small>`;
        document.getElementById('statPenRatio').textContent =
            `占流通市值 ${F.pct(s.float_ratio, 3)}%`;

        document.getElementById('statEtfCount').innerHTML =
            `${s.etf_count || 0}<small>只</small>`;
        const top = (data.sources || [])[0];
        document.getElementById('statEtfTop').textContent =
            top ? `最大来源 ${top.etf_name} (${top.weight.toFixed(2)}%)` : '-';

        document.getElementById('statInst').innerHTML =
            `${F.pct(s.inst_free_ratio)}<small>%</small>`;
        document.getElementById('statInstNum').textContent =
            s.org_num_all ? `${s.org_num_all} 家机构 (${s.inst_report_date || '-'})` : '暂无机构持仓数据';

        document.getElementById('statNtSeat').innerHTML =
            `${s.nt_holder_cnt || 0}<small>席</small>`;
    }

    // ─── 价格走势 ───
    function renderPriceChart() {
        const prices = data.prices || [];
        if (!prices.length) {
            document.getElementById('priceChart').innerHTML =
                '<div class="no-data">暂无价格数据</div>';
            return;
        }
        const T = CT.theme();
        priceChart.setOption({
            backgroundColor: 'transparent',
            grid: { left: 56, right: 20, top: 24, bottom: 32 },
            tooltip: {
                trigger: 'axis',
                backgroundColor: T.tooltipBg,
                borderColor: T.tooltipBorder,
                textStyle: { color: T.tooltipText, fontSize: 12 },
                axisPointer: { type: 'cross', crossStyle: { color: T.axisLabel } },
            },
            xAxis: {
                type: 'category',
                data: prices.map(p => p.date),
                axisLabel: { color: T.axisLabel, fontSize: 10 },
                axisLine: { lineStyle: { color: T.axisLine } },
                axisTick: { show: false },
            },
            yAxis: {
                type: 'value',
                scale: true,
                axisLabel: { color: T.axisLabel, fontSize: 10 },
                splitLine: { lineStyle: { color: T.splitLine } },
                axisLine: { show: false },
            },
            dataZoom: [{ type: 'inside', start: 40, end: 100 }],
            series: [{
                name: '收盘价',
                type: 'line',
                data: prices.map(p => p.close),
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 2, color: '#06b6d4' },
                areaStyle: {
                    color: {
                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(6,182,212,0.22)' },
                            { offset: 1, color: 'rgba(6,182,212,0.01)' },
                        ],
                    },
                },
            }],
        }, true);
    }

    // ─── 机构持仓结构 ───
    function renderInstChart() {
        const series = (data.inst_series || []).slice(-1);
        if (!series.length) {
            document.getElementById('instChart').innerHTML =
                '<div class="no-data">暂无机构持仓数据</div>';
            return;
        }
        const latest = series[0];
        const types = (data.org_type_names || {});
        const T = CT.theme();
        // '07'(其他) 在东财口径中主要是法人/大股东, 不属于机构资金, 不纳入结构图
        const order = ['01', '02', '03', '04', '05', '06'];
        const colors = {
            '01': '#6366f1', '02': '#06b6d4', '03': '#f59e0b',
            '04': '#22c55e', '05': '#ec4899', '06': '#a855f7', '07': '#64748b',
        };

        const items = order
            .filter(k => (latest.types || {})[k] && latest.types[k].free_ratio != null)
            .map(k => ({
                name: types[k] || k,
                value: Number(latest.types[k].free_ratio),
                num: latest.types[k].org_num || 0,
                color: colors[k],
            }))
            .sort((a, b) => b.value - a.value);

        const all = (latest.types || {})['00'];
        const other = (latest.types || {})['07'];
        const instOnly = all && other
            ? Number(all.free_ratio) - Number(other.free_ratio)
            : (all ? Number(all.free_ratio) : null);

        instChart.setOption({
            backgroundColor: 'transparent',
            title: {
                text: `报告期 ${latest.report_date}`,
                left: 12, top: 6,
                textStyle: { color: T.axisLabel, fontSize: 11, fontWeight: 400 },
            },
            grid: { left: 74, right: 62, top: 42, bottom: 26 },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                backgroundColor: T.tooltipBg,
                borderColor: T.tooltipBorder,
                textStyle: { color: T.tooltipText, fontSize: 12 },
                formatter: p => {
                    const it = items[p[0].dataIndex];
                    return `<b>${it.name}</b><br/>占流通股比: ${it.value.toFixed(2)}%<br/>机构家数: ${it.num}`;
                },
            },
            xAxis: {
                type: 'value',
                name: '占流通股比%',
                nameTextStyle: { color: T.axisLabel, fontSize: 10 },
                axisLabel: { color: T.axisLabel, fontSize: 10 },
                splitLine: { lineStyle: { color: T.splitLine } },
                axisLine: { show: false },
            },
            yAxis: {
                type: 'category',
                data: items.map(i => i.name).reverse(),
                axisLabel: { color: T.legendText, fontSize: 11 },
                axisLine: { show: false },
                axisTick: { show: false },
            },
            series: [{
                type: 'bar',
                data: items.slice().reverse().map(i => ({
                    value: i.value,
                    itemStyle: { color: i.color, borderRadius: [0, 4, 4, 0] },
                })),
                barWidth: '52%',
                label: {
                    show: true,
                    position: 'right',
                    color: T.legendText,
                    fontSize: 10,
                    formatter: p => {
                        const it = items.slice().reverse()[p.dataIndex];
                        return `${it.value.toFixed(2)}% · ${it.num}家`;
                    },
                },
            }],
            graphic: instOnly != null ? [{
                type: 'text',
                right: 12,
                top: 6,
                style: {
                    text: `机构合计 ${instOnly.toFixed(2)}%（不含法人股东）`,
                    fill: T.axisLabel,
                    fontSize: 10,
                },
            }] : [],
        }, true);
    }

    // ─── 穿透来源 ───
    function renderSources() {
        const rows = data.sources || [];
        const tbody = document.getElementById('sourceBody');
        const total = rows.reduce((a, r) => a + (r.pen_value || 0), 0);
        document.getElementById('sourceMeta').textContent =
            `${rows.length} 只 ETF 合计穿透 ${(total / 1e8).toFixed(2)} 亿元`;

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8" class="no-data">该个股未出现在 ETF 成分股中</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const penValue = r.pen_value || r.pen_value_nav || 0;
            return `<tr onclick="location.href='${NT.url('detail/' + r.etf_code)}'" title="查看该 ETF 详情">
                <td>${r.etf_code}</td>
                <td class="name-col">${r.etf_name}</td>
                <td>${r.report_date}</td>
                <td>${F.pct(r.weight)}</td>
                <td>${F.wan2(r.etf_hold_shares)}</td>
                <td>${F.pct(r.nt_ratio * 100)}</td>
                <td>${F.wan2(r.pen_shares)}</td>
                <td>${(penValue / 1e8).toFixed(2)}</td>
            </tr>`;
        }).join('');
    }

    // ─── 机构持仓明细 ───
    function renderInstTable() {
        const series = data.inst_series || [];
        const tbody = document.getElementById('instBody');
        if (!series.length) {
            document.getElementById('instDate').textContent = '暂无数据';
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">暂无机构持仓数据</td></tr>';
            return;
        }
        const latest = series[series.length - 1];
        document.getElementById('instDate').textContent = `报告期 ${latest.report_date}`;
        const names = data.org_type_names || {};
        const order = ['00', '01', '02', '03', '04', '05', '06', '07'];

        tbody.innerHTML = order
            .filter(k => (latest.types || {})[k])
            .map(k => {
                const v = latest.types[k];
                const cls = k === '00' ? 'nt-highlight' : '';
                return `<tr class="${cls}">
                    <td>${names[k] || k}</td>
                    <td>${v.org_num == null ? '-' : v.org_num}</td>
                    <td>${F.wan2(v.hold_shares)}</td>
                    <td>${F.pct(v.free_ratio)}</td>
                    <td>${F.pct(v.total_ratio)}</td>
                </tr>`;
            }).join('');
    }

    // ─── 十大股东 ───
    function renderHolders() {
        const holders = (data.holders || {})[currentHolderList] || {};
        const dates = data.holder_dates || [];
        const tbody = document.getElementById('holderBody');

        document.getElementById('holderDates').innerHTML = dates.length
            ? dates.map((d, i) => `<span>📅 ${i === 0 ? '最新报告期' : '上期'}: <strong>${d}</strong></span>`).join('')
            : '<span>暂无股东数据</span>';

        const latestDate = dates[0];
        const rows = latestDate ? holders[latestDate] || [] : [];
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">暂无股东数据</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(h => {
            const ntTag = h.is_nt ? B.tag('tag-nt', '汪汪队') : '';
            return `<tr class="${h.is_nt ? 'nt-highlight' : ''}">
                <td>${h.rank}</td>
                <td class="holder-name" title="${h.holder_name}">${h.holder_name}${ntTag}</td>
                <td>${h.holder_type || '-'}</td>
                <td>${F.wan2(h.hold_num)}</td>
                <td>${F.pct(h.hold_ratio)}</td>
                <td>${h.hold_change || '-'}</td>
            </tr>`;
        }).join('');
    }
    // ─── 该股公告 / 报告 ───
    async function loadReports() {
        const tbody = document.getElementById('reportBody');
        try {
            const res = await fetch(`/api/stock/${stockCode}/reports?limit=30`);
            const json = await res.json();
            const rows = json.data || [];
            document.getElementById('reportMeta').textContent =
                `${json.total || 0} 条 · 显示最近 ${rows.length} 条`;
            if (!rows.length) {
                tbody.innerHTML = '<tr><td colspan="4" class="no-data">该股暂无公告数据</td></tr>';
                return;
            }
            tbody.innerHTML = rows.map(r => {
                const date = (r.notice_date || '').slice(0, 10);
                const group = r.category_group || '';
                const title = r.title || '';
                const url = r.url || '';
                const pdf = r.pdf_url || '';
                return `<tr>
                    <td class="muted-cell">${date}</td>
                    <td class="report-title">${NT.esc(title)}</td>
                    <td><span class="tag tag-muted">${NT.esc(group)}</span></td>
                    <td>${url ? `<a href="${url}" target="_blank" rel="noopener">查看</a>` : ''}
                        ${pdf ? ` <a href="${pdf}" target="_blank" rel="noopener">PDF</a>` : ''}</td>
                </tr>`;
            }).join('');
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="4" class="no-data">报告加载失败</td></tr>';
        }
    }
})();