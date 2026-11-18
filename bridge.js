'use strict';
// Cổng xuất dữ liệu: trang chứa bản giả lập trong khung (iframe) hỏi dữ liệu
// đang có trên máy để dùng ở ứng dụng khác (vẽ đồ thị, thống kê…).
// Đặc tả: docs/CONG-XUAT-DU-LIEU.md. Đọc trạng thái và tô sáng phím hướng dẫn.
// Người dùng vẫn tự bấm phím. Mở riêng (không nằm trong khung) thì không làm gì.
//
//   trang chứa → máy:  { bitex: 'export', id }
//   máy → trang chứa:  { bitex: 'export', id, ok: true, data }  hoặc
//                      { bitex: 'export', id, ok: false, error }
//   trang chứa → máy:  { bitex: 'hello', id }
//   máy → trang chứa:  { bitex: 'hello', id, ok: true, v: 1, model: 'fx-580VN X', features: [...] }
//   trang chứa → máy:  { bitex: 'highlight', id, keys: ['cursor-left', 'delete', …] }
//   máy → trang chứa:  { bitex: 'highlight', id, ok: true, keys: số phím tô được }
// highlight tô sáng LẦN LƯỢT từng phím (phím ở SHIFT thì tô SHIFT trước): người
// dùng bấm đúng phím đang sáng thì sang phím kế; keys rỗng thì tắt tô sáng.
(function () {
  if (typeof window === 'undefined' || window.parent === window) return;
  const config = document.querySelector('meta[name="bitex-export-origins"]');
  const allowedOrigins = new Set((config?.content || '').trim().split(/\s+/).filter(Boolean));
  if (!allowedOrigins.size) return;
  const FEATURES = ['calculate', 'table', 'statistics', 'equation', 'inequality', 'error', 'highlight'];
  // ----- Tô sáng phím cần bấm (chỉ đổi lớp CSS, không bấm phím thay người dùng) -----
  let guide = null;
  const keyFor = name => document.querySelector('#keypad .key[data-action="' + name + '"], #keypad .key[data-digit="' + name + '"]');
  const shiftKeyFor = name => document.querySelector('#keypad .key[data-shift-action="' + name + '"]');
  function paint() {
    document.querySelectorAll('#keypad .key.bitex-guide').forEach(el => el.classList.remove('bitex-guide'));
    if (!guide || guide.i >= guide.list.length) { guide = null; return; }
    guide.list[guide.i].classList.add('bitex-guide');
  }
  function highlight(names) {
    const list = [];
    for (const name of Array.isArray(names) ? names : []) {
      if (typeof name !== 'string' || !/^[a-z0-9-]+$/.test(name)) continue;
      const plain = keyFor(name), shifted = plain ? null : shiftKeyFor(name);
      if (plain) list.push(plain);
      else if (shifted) { const shift = keyFor('shift'); if (shift) list.push(shift); list.push(shifted); }
    }
    guide = list.length ? { list, i: 0 } : null;
    paint();
    return list.length;
  }
  document.addEventListener('click', event => {
    const key = event.target && event.target.closest ? event.target.closest('.key') : null;
    if (guide && key && key === guide.list[guide.i]) { guide.i++; paint(); }
  }, true);
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin === 'null' || !allowedOrigins.has(event.origin)) return;
    const msg = event.data;
    if (!msg || typeof msg !== 'object' || !['export', 'hello', 'highlight'].includes(msg.bitex)) return;
    const reply = body => event.source.postMessage({ bitex: msg.bitex, id: msg.id, ...body }, event.origin);
    if (msg.bitex === 'hello') { reply({ ok: true, v: 1, model: 'fx-580VN X', features: FEATURES }); return; }
    if (msg.bitex === 'highlight') { reply({ ok: true, keys: highlight(msg.keys) }); return; }
    try {
      reply({ ok: true, data: engine.exportData() });
    } catch (e) {
      reply({ ok: false, error: String(e && e.message || e) });
    }
  });
})();
