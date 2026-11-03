/**
 * 前端可复用组件库（所有页面共用，在 core.js 之后、页面脚本之前加载）
 *
 * 提供:
 *   NT.fmt      数值格式化工具 (fmtYi / fmtWan / fmtPct / amountText / num)
 *   NT.chg      涨跌色与文本 (cls / text)
 *   NT.badge    维度标签 HTML 生成 (nt / inst / new / tag)
 *   NT.sort     表格排序 (createSortable)
 *   NT.pager    分页组件 (createPager)
 *   NT.chips    筛选 chip 组 (createChipGroup)
 *   NT.chart    图表主题与工具 (theme / ensureChart / disposeChart)
 *   NT.table    表格渲染器 (createTable)
 */
(function (global) {
    'use strict';

    var NT = global.NT || {};

    // ─── 数值格式化 ────────────────────────────────────
    var fmt = {
        yi: function (v) {
            return v == null ? '-' : (v / 1e8).toFixed(2);
        },
        wan: function (v) {
            return v == null ? '-' : (v / 1e4).toFixed(0);
        },
        wan2: function (v) {
            return v == null ? '-' : (v / 1e4).toFixed(2);
        },
        pct: function (v, digits) {
            digits = digits == null ? 2 : digits;
            return v == null ? '-' : Number(v).toFixed(digits);
        },
        num: function (v, digits) {
            if (v === null || v === undefined || v === '') return '—';
            var n = Number(v);
            if (!isFinite(n)) return '—';
            return n.toFixed(digits == null ? 2 : digits);
        },
        amount: function (v) {
            if (v === null || v === undefined) return '—';
            var n = Number(v);
            if (!isFinite(n) || n === 0) return '—';
            if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
            if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(2) + ' 万';
            return n.toFixed(0);
        },
        plain: function (v) {
            if (v === null || v === undefined) return '—';
            var n = Number(v);
            if (!isFinite(n) || n === 0) return '—';
            return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
        }
    };

    // ─── 涨跌色与文本 ────────────────────────────────────
    var chg = {
        cls: function (v) {
            if (v == null) return 'val-neutral';
            return v > 0 ? 'val-up' : v < 0 ? 'val-down' : 'val-neutral';
        },
        text: function (v, digits) {
            digits = digits == null ? 2 : digits;
            if (v == null) return '-';
            return (v > 0 ? '+' : '') + Number(v).toFixed(digits) + '%';
        }
    };

    // ─── 维度标签 HTML 生成 ──────────────────────────────
    var badge = {
        nt: function (extra) {
            return '<span class="badge badge-nt">' + (extra || '汪汪队') + '</span>';
        },
        inst: function (extra) {
            return '<span class="badge badge-inst">' + (extra || '机构') + '</span>';
        },
        new: function () {
            return '<span class="badge badge-new">✨ 新进</span>';
        },
        tag: function (cls, text) {
            return '<span class="tag ' + cls + '">' + text + '</span>';
        },
        // 根据数据自动生成标签组合
        fromFlags: function (isNt, isInst) {
            var html = '';
            if (isNt) html += badge.nt();
            if (isInst) html += badge.inst();
            return html;
        }
    };

    // ─── 表格排序 ────────────────────────────────────────
    /**
     * 创建可排序的表头交互
     * @param {string} tableSelector 表格选择器
     * @param {object} initialSort  { key, dir } 初始排序
     * @param {function} onSort 排序变化回调
     * @returns {object} { key, dir, set } 状态与方法
     */
    function createSortable(tableSelector, initialSort, onSort) {
        var state = { key: initialSort.key, dir: initialSort.dir || 'desc' };

        document.querySelectorAll(tableSelector + ' thead th[data-sort]').forEach(function (th) {
            th.addEventListener('click', function () {
                var key = th.dataset.sort;
                if (state.key === key) {
                    state.dir = state.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    state.key = key;
                    state.dir = 'desc';
                }
                // 更新表头指示器
                document.querySelectorAll(tableSelector + ' thead th').forEach(function (h) {
                    h.classList.remove('sorted-asc', 'sorted-desc');
                });
                th.classList.add(state.dir === 'asc' ? 'sorted-asc' : 'sorted-desc');
                if (onSort) onSort(state);
            });
        });

        return {
            get key() { return state.key; },
            get dir() { return state.dir; },
            set: function (k, d) { state.key = k; state.dir = d; }
        };
    }

    /**
     * 对数组排序 (与 SQL ORDER BY ... NULLS LAST 语义一致)
     */
    function sortRows(rows, key, dir) {
        var mult = dir === 'asc' ? 1 : -1;
        return rows.slice().sort(function (a, b) {
            var va = a[key], vb = b[key];
            var an = (va === null || va === undefined || va === '');
            var bn = (vb === null || vb === undefined || vb === '');
            if (an && bn) return 0;
            if (an) return 1;
            if (bn) return -1;
            if (typeof va === 'string') return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            if (va === vb) return 0;
            return (va > vb ? 1 : -1) * mult;
        });
    }

    // ─── 分页组件 ────────────────────────────────────────
    /**
     * 创建分页组件
     * @param {object} opts { prevId, nextId, pageInfoId, filterMetaId, pageSize }
     * @param {function} onPageChange(offset, page) 回调
     * @returns {object} { setTotal, setOffset, getOffset, update }
     */
    function createPager(opts, onPageChange) {
        var offset = 0;
        var total = 0;
        var pageSize = opts.pageSize || 50;
        var prevBtn = document.getElementById(opts.prevId);
        var nextBtn = document.getElementById(opts.nextId);
        var pageInfo = document.getElementById(opts.pageInfoId);
        var filterMeta = opts.filterMetaId ? document.getElementById(opts.filterMetaId) : null;

        if (prevBtn) prevBtn.addEventListener('click', function () {
            offset = Math.max(0, offset - pageSize);
            update();
            if (onPageChange) onPageChange(offset);
        });
        if (nextBtn) nextBtn.addEventListener('click', function () {
            offset = Math.min(offset + pageSize, Math.max(0, (pagesCount() - 1) * pageSize));
            update();
            if (onPageChange) onPageChange(offset);
        });

        function pagesCount() {
            return Math.max(1, Math.ceil(total / pageSize));
        }

        function update() {
            var page = Math.floor(offset / pageSize) + 1;
            var pages = pagesCount();
            if (pageInfo) pageInfo.textContent = page + ' / ' + pages;
            if (prevBtn) prevBtn.disabled = offset === 0;
            if (nextBtn) nextBtn.disabled = offset + pageSize >= total;
        }

        return {
            setTotal: function (t) { total = t; update(); },
            setOffset: function (o) { offset = o; update(); },
            getOffset: function () { return offset; },
            reset: function () { offset = 0; update(); },
            setMeta: function (text) { if (filterMeta) filterMeta.textContent = text; }
        };
    }

    // ─── 筛选 Chip 组 ───────────────────────────────────
    /**
     * 创建 chip 切换交互
     * @param {string} chipId chip 元素 ID
     * @param {function} onToggle(active) 回调
     */
    function createChip(chipId, onToggle) {
        var el = document.getElementById(chipId);
        if (!el) return;
        el.addEventListener('click', function () {
            var next = !el.classList.contains('active');
            el.classList.toggle('active', next);
            if (onToggle) onToggle(next);
        });
    }

    /**
     * 创建 chip 组（互斥选择）
     * @param {string} containerId chip 容器选择器
     * @param {function} onSelect(value, chipEl) 回调
     */
    function createChipGroup(containerSelector, onSelect) {
        var chips = document.querySelectorAll(containerSelector + ' .chip');
        chips.forEach(function (chip) {
            chip.addEventListener('click', function () {
                chips.forEach(function (c) { c.classList.remove('active'); });
                chip.classList.add('active');
                if (onSelect) onSelect(chip.dataset.value || chip.dataset.class || '', chip);
            });
        });
    }

    // ─── 图表工具 ────────────────────────────────────────
    var chart = {
        theme: function () {
            return (global.ChartTheme && ChartTheme.get()) || {};
        },
        ensureChart: function (charts, key, el) {
            var chart = charts[key];
            if (!chart || (chart.isDisposed && chart.isDisposed())) {
                el.innerHTML = '';
                chart = echarts.init(el);
                charts[key] = chart;
            }
            return chart;
        },
        disposeChart: function (charts, key) {
            var c = charts[key];
            if (c) { c.dispose(); charts[key] = null; }
        },
        cssVar: function (name, fallback) {
            var v = getComputedStyle(document.documentElement).getPropertyValue(name);
            return (v || '').trim() || fallback;
        }
    };

    // ─── 导出 ────────────────────────────────────────────
    NT.fmt = fmt;
    NT.chg = chg;
    NT.badge = badge;
    NT.sort = { create: createSortable, sortRows: sortRows };
    NT.pager = { create: createPager };
    NT.chips = { create: createChip, createGroup: createChipGroup };
    NT.chart = chart;

    global.NT = NT;
})(window);
