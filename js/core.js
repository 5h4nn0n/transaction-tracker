/**
 * 前端公共工具（所有页面共用，在 base.html 的 <head> 中先于页面脚本加载）
 *   NT.base       站点根路径：Flask 下为 "/"，GitHub Pages 子路径下为 "/repo/"
 *   NT.url(path)  拼接站点内链接（页面跳转、静态资源统一走这里）
 *   NT.esc(str)   HTML 转义，拼接 innerHTML 时使用
 */
(function (global) {
    'use strict';

    var base = global.NT_BASE || '/';
    if (base.charAt(base.length - 1) !== '/') base += '/';

    var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    var NT = global.NT || {};
    NT.base = base;

    NT.url = function (path) {
        return base + String(path == null ? '' : path).replace(/^\/+/, '');
    };

    NT.esc = function (s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return ESC_MAP[c];
        });
    };

    global.NT = NT;
})(window);
