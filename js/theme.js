/**
 * 主题管理 — 深色 / 明亮 切换
 *
 * 职责:
 *   1. 读写 localStorage, 在 <html data-theme="..."> 上落地
 *   2. 注入切换按钮 (优先放进 .nav-links, 否则浮动在右上角)
 *   3. 暴露 window.ChartTheme.get() 供 ECharts 取色
 *   4. 切换时派发 'themechange' 事件, 各页面据此重绘图表
 *
 * 说明: 首屏防闪烁由各 HTML <head> 里的一小段内联脚本负责,
 *       本文件不参与首帧渲染, 只负责交互与图表配色。
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'nt-theme';
    var DEFAULT_THEME = 'light';
    var root = document.documentElement;

    // ─── 图表配色表 ───
    var PALETTE = {
        dark: {
            tooltipBg: 'rgba(17,24,39,0.95)',
            tooltipBorder: 'rgba(99,102,241,0.3)',
            tooltipText: '#f1f5f9',
            axisLine: 'rgba(255,255,255,0.06)',
            splitLine: 'rgba(255,255,255,0.04)',
            axisLabel: '#64748b',
            legendText: '#94a3b8',
            pieBorder: '#0a0e17'
        },
        light: {
            tooltipBg: 'rgba(255,255,255,0.98)',
            tooltipBorder: 'rgba(99,102,241,0.35)',
            tooltipText: '#0f172a',
            axisLine: 'rgba(15,23,42,0.12)',
            splitLine: 'rgba(15,23,42,0.07)',
            axisLabel: '#64748b',
            legendText: '#475569',
            pieBorder: '#ffffff'
        }
    };

    // ─── 状态 ───
    function readStored() {
        try {
            var v = localStorage.getItem(STORAGE_KEY);
            return v === 'dark' || v === 'light' ? v : null;
        } catch (e) {
            return null;
        }
    }

    function current() {
        var attr = root.getAttribute('data-theme');
        if (attr === 'dark' || attr === 'light') return attr;
        return readStored() || DEFAULT_THEME;
    }

    function apply(theme, opts) {
        opts = opts || {};
        root.setAttribute('data-theme', theme);
        try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* 隐私模式忽略 */ }

        syncButton(theme);

        if (!opts.silent) {
            document.dispatchEvent(new CustomEvent('themechange', {
                detail: { theme: theme }
            }));
        }
    }

    // ─── 切换按钮 ───
    var button = null;

    function buildButton() {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'theme-toggle';
        btn.setAttribute('aria-label', '切换主题');
        btn.innerHTML =
            '<span class="theme-icon" aria-hidden="true"></span>' +
            '<span class="theme-text"></span>';
        btn.addEventListener('click', function () {
            apply(current() === 'light' ? 'dark' : 'light');
        });
        return btn;
    }

    function syncButton(theme) {
        if (!button) return;
        var light = theme === 'light';
        // 显示的是「点击后将切换到」的主题
        button.querySelector('.theme-icon').textContent = light ? '🌙' : '☀️';
        button.querySelector('.theme-text').textContent = light ? '深色' : '明亮';
        button.title = light ? '切换到深色主题' : '切换到明亮主题';
        button.setAttribute('aria-pressed', light ? 'false' : 'true');
    }

    function mountButton() {
        if (button) return;
        button = buildButton();

        var slot = document.querySelector('[data-theme-slot]') ||
            document.querySelector('.nav-links');

        if (slot) {
            slot.appendChild(button);
        } else {
            button.classList.add('floating');
            document.body.appendChild(button);
        }
        syncButton(current());
    }

    // ─── 对外接口 ───
    window.ChartTheme = {
        get: function () {
            return PALETTE[current()] || PALETTE[DEFAULT_THEME];
        },
        name: function () {
            return current();
        },
        isLight: function () {
            return current() === 'light';
        },
        set: function (theme) {
            apply(theme === 'dark' ? 'dark' : 'light');
        },
        toggle: function () {
            apply(current() === 'light' ? 'dark' : 'light');
        }
    };

    // ─── 启动 ───
    apply(current(), { silent: true });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountButton);
    } else {
        mountButton();
    }
})();
