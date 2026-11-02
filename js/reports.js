/**
 * 报告汇总页 — 穿透个股的公告 / 定期报告
 */
(function () {
    'use strict';
    var B = NT.badge;

    const PAGE_SIZE = 50;

    const state = {
        q: '',
        group: 'all',
        days: 0,
        sort: 'notice_date',
        order: 'desc',
        offset: 0,
        total: 0,
    };

    const GROUP_CLASS = {
        '定期报告': 'tag-report',
        '业绩': 'tag-perf',
        '分红送配': 'tag-div',
        '股东股权': 'tag-holder',
        '融资并购': 'tag-fin',
        '治理会议': 'tag-gov',
        '其他': 'tag-other',
    };

    document.addEventListener('DOMContentLoaded', () => {
        loadSummary();
        loadTable();
        bindEvents();
    });

    // ─── 事件 ───
    var pager = null;

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

        // 时间范围
        document.querySelectorAll('.filter-bar [data-days]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-bar [data-days]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.days = parseInt(btn.dataset.days, 10) || 0;
                state.offset = 0;
                loadTable();
            });
        });

        // 类型分组
        document.querySelectorAll('#groupBar [data-group]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#groupBar [data-group]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.group = btn.dataset.group;
                state.offset = 0;
                loadTable();
            });
        });

        // 表头排序 — 使用组件
        NT.sort.create('#reportTable', { key: state.sort, dir: state.order }, function (s) {
            state.sort = s.key;
            state.order = s.dir;
            state.offset = 0;
            pager.reset();
            loadTable();
        });

        // 分页 — 使用组件
        pager = NT.pager.create({
            prevId: 'prevPage',
            nextId: 'nextPage',
            pageInfoId: 'pageInfo',
            pageSize: PAGE_SIZE
        }, function () {
            state.offset = pager.getOffset();
            loadTable();
        });
    }

    // ─── 统计 ───
    async function loadSummary() {
        try {
            const res = await fetch('/api/reports/summary');
            const d = await res.json();
            document.getElementById('statTotal').textContent = (d.total || 0).toLocaleString();
            document.getElementById('statStocks').innerHTML =
                `${(d.stock_count || 0).toLocaleString()}<small>只</small>`;
            document.getElementById('statRecent').textContent = (d.recent_30d || 0).toLocaleString();
            document.getElementById('statLatest').textContent = d.latest_date || '-';
            document.getElementById('reportMeta').innerHTML =
                `📅 最新报告: <span class="date-value">${d.latest_date || '-'}</span>` +
                ` · 覆盖 ${d.stock_count || 0} 只穿透个股`;
        } catch (e) {
            console.error('report summary error', e);
        }
    }

    // ─── 列表 ───
    async function loadTable() {
        const params = new URLSearchParams({
            q: state.q,
            group: state.group,
            days: state.days,
            sort: state.sort,
            order: state.order,
            limit: PAGE_SIZE,
            offset: state.offset,
        });

        const tbody = document.getElementById('reportTableBody');
        try {
            const res = await fetch('/api/reports?' + params.toString());
            const d = await res.json();
            state.total = d.total || 0;
            renderTable(d.data || []);
            pager.setTotal(state.total);
            pager.setOffset(state.offset);
        } catch (e) {
            console.error('report list error', e);
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">报告数据加载失败</td></tr>';
        }
    }

    function renderTable(rows) {
        const tbody = document.getElementById('reportTableBody');
        const meta = document.getElementById('filterMeta');
        meta.textContent = `共 ${state.total.toLocaleString()} 条`;

        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">没有符合条件的报告</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map(r => {
            const cls = GROUP_CLASS[r.category_group] || 'tag-other';
            const pdf = r.pdf_url || '';
            const detail = r.url || pdf;
            return `<tr>
                <td>${r.notice_date || '-'}</td>
                <td>${r.stock_code}</td>
                <td class="name-col"><a class="cell-link" href="${NT.url('stock/' + r.stock_code)}">${NT.esc(r.stock_name || r.stock_code)}</a></td>
                <td><span class="tag ${cls}">${r.category_group || '其他'}</span></td>
                <td class="report-title"><a class="cell-link" href="${pdf}" target="_blank" rel="noopener">${NT.esc(r.title)}</a></td>
                <td class="report-actions">
                    <a class="cell-link" href="${pdf}" target="_blank" rel="noopener">PDF</a>
                    <span class="sep">·</span>
                    <a class="cell-link" href="${detail}" target="_blank" rel="noopener">详情</a>
                </td>
            </tr>`;
        }).join('');
    }
})();
