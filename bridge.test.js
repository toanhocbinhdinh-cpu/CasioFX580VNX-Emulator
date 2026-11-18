'use strict';
// Cổng xuất dữ liệu (engine.exportData, bridge.js) — đặc tả ở docs/CONG-XUAT-DU-LIEU.md.
// Chạy: node --test bridge.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = __dirname;
const files = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)"/g)]
  .map(m => m[1]).filter(f => !['ui.js', 'feedback.js', 'keypad.js', 'keyboard.js', 'app.js', 'bridge.js'].includes(f));
// Đối tượng tạo trong ngữ cảnh vm khác prototype: chép qua JSON trước khi so sánh sâu.
const J = o => JSON.parse(JSON.stringify(o));
function engine() {
  const context = vm.createContext({ console });
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  return vm.runInContext('createEngine()', context);
}

test('Tính toán: biểu thức trao đổi, chuỗi hiển thị và giá trị', () => {
  const en = engine();
  en.inputFraction(); en.inputDigit('1'); en.moveCursor('down'); en.inputDigit('2'); en.moveCursor('right');
  en.inputOperator('+'); en.inputFunction('sin('); en.inputDigit('3'); en.inputDigit('0'); en.inputCloseParen(); en.equals();
  const d = en.exportData();
  assert.equal(d.v, 1); assert.equal(d.mode, 'calculate'); assert.equal(d.angleUnit, 'deg');
  assert.equal(d.expr, '((1)/(2))+sin(30)'); assert.equal(d.text, '1/2+sin(30)'); assert.equal(d.value, 1);
});

test('Tính toán: log cơ số, căn bậc ba, căn bậc hai', () => {
  const en = engine();
  en.inputLogN(); en.inputDigit('2'); en.moveCursor('right'); en.inputDigit('8'); en.moveCursor('right');
  en.inputOperator('+'); en.inputCbrt(); en.inputDigit('8'); en.equals();
  assert.equal(en.exportData().expr, 'logb(2,8)+cbrt(8)');
  en.inputSqrt(); en.inputDigit('2'); en.equals();
  const d = en.exportData(); assert.equal(d.expr, 'sqrt(2)'); assert.ok(Math.abs(d.value - Math.SQRT2) < 1e-12);
});

test('Tính toán: thành phần không dịch được (Ans) thì expr là null, vẫn có text và value', () => {
  const en = engine();
  en.inputDigit('4'); en.equals(); en.inputAns(); en.inputOperator('×'); en.inputDigit('2'); en.equals();
  const d = en.exportData(); assert.equal(d.expr, null); assert.equal(d.value, 8); assert.ok(d.text.includes('Ans'));
});

test('Bảng giá trị: hàm f, khoảng và các dòng đã sinh', () => {
  const en = engine();
  en.setCalcMode('table'); en.inputXVariable(); en.inputPower(); en.inputDigit('2'); en.moveCursor('right');
  en.inputOperator('-'); en.inputDigit('1');
  en.equals(); en.equals(); en.equals(); en.equals();
  const d = J(en.exportData());
  assert.equal(d.mode, 'table'); assert.equal(d.f, 'x^(2)-1'); assert.equal(d.g, null);
  assert.deepEqual([d.start, d.end, d.step], [1, 5, 1]);
  assert.deepEqual(d.rows.map(r => [r.x, r.f]), [[1, 0], [2, 3], [3, 8], [4, 15], [5, 24]]);
});

test('Thống kê hai biến: kiểu hồi quy và các dòng x, y, tần số', () => {
  const en = engine();
  en.setCalcMode('statistics'); en.setStatisticsType('linear');
  for (const v of ['1', '2', '3']) { en.inputDigit(v); en.equals(); }
  for (let i = 0; i < 3; i++) en.moveCursor('up');
  en.moveCursor('right');
  for (const v of ['3', '5', '8']) { en.inputDigit(v); en.equals(); }
  const d = J(en.exportData());
  assert.equal(d.mode, 'statistics'); assert.equal(d.type, 'linear'); assert.equal(d.twoVar, true);
  assert.deepEqual(d.rows, [{ x: 1, y: 3, f: 1 }, { x: 2, y: 5, f: 1 }, { x: 3, y: 8, f: 1 }]);
});

test('Mode chưa hỗ trợ: unsupported, không lỗi', () => {
  const en = engine(); en.setCalcMode('matrix');
  const d = en.exportData(); assert.equal(d.mode, 'matrix'); assert.equal(d.unsupported, true);
});

test('Tính toán: giữ thứ tự chia với ký pháp khoa học, nhân ẩn và mũ nối tiếp', () => {
  let en = engine();
  en.inputDigit('1'); en.inputOperator('÷'); en.inputDigit('2');
  en.inputTimesTenPower(); en.inputDigit('3'); en.equals();
  assert.equal(en.exportData().expr, '1/(2*10^(3))');
  assert.equal(en.exportData().value, 1 / 2000);

  en = engine();
  en.inputDigit('1'); en.inputOperator('÷'); en.inputDigit('2'); en.inputPi(); en.equals();
  assert.equal(en.exportData().expr, '1/(2*pi)');
  assert.ok(Math.abs(en.exportData().value - 1 / (2 * Math.PI)) < 1e-12);

  en = engine();
  en.inputDigit('2'); en.inputOperator('²'); en.inputOperator('³'); en.equals();
  assert.equal(en.exportData().expr, '((2^2)^3)');
  assert.equal(en.exportData().value, 64);
});

test('Tính toán: giữ đơn vị của kết quả đang xem và không xuất lịch sử sau AC', () => {
  const en = engine();
  en.inputFunction('sin('); en.inputDigit('3'); en.inputDigit('0'); en.equals();
  en.setAngleUnit('rad');
  const before = en.getDisplay();
  const data = en.exportData();
  assert.equal(data.expr, 'sin(30)');
  assert.equal(data.angleUnit, 'deg');
  assert.ok(Math.abs(data.value - 0.5) < 1e-12);
  assert.equal(en.getDisplay(), before);
  en.clear();
  assert.deepEqual(J(en.exportData()), {
    v: 1, mode: 'calculate', angleUnit: 'rad', expr: null, text: '', value: null
  });
  en.inputDigit('2');
  assert.equal(en.exportData().expr, '2');
  assert.equal(en.exportData().value, null);
});

test('Bảng giá trị: chỉ xuất dòng đã sinh cho công thức đang dùng', () => {
  const en = engine();
  en.setCalcMode('table'); en.inputXVariable();
  en.equals(); en.equals(); en.equals();
  assert.equal(en.exportData().rows[0].f, 1);

  en.clear(); en.moveCursor('right'); en.inputOperator('+'); en.inputDigit('1');
  en.equals(); en.equals();
  const edited = J(en.exportData());
  assert.equal(edited.f, 'x+1');
  assert.deepEqual(edited.rows, []);
  en.equals();
  assert.equal(en.exportData().rows[0].f, 2);

  en.setAngleUnit('rad');
  assert.deepEqual(J(en.exportData().rows), []);
  en.inputDigit('2'); en.equals();
  en.setAngleUnit('deg');
  assert.deepEqual(J(en.exportData().rows), []);
});

// Nhập một hệ số rồi "=" sang ô kế (số âm dùng phím (−)).
function coef(en, v) {
  const s = String(v);
  if (s[0] === '-') en.inputNegative();
  for (const ch of s.replace('-', '')) ch === '.' ? en.inputDot() : en.inputDigit(ch);
  en.equals();
}
// Nhập đủ hệ số; "=" ở ô cuối chỉ đăng ký ô, thêm một "=" nữa mới giải.
function solve(en, values) { for (const v of values) coef(en, v); en.equals(); }

test('Phương trình bậc 2: hệ số, nghiệm và đỉnh parabol', () => {
  const en = engine(); en.setCalcMode('equation'); en.setEquationType('poly2');
  let d = J(en.exportData());
  assert.equal(d.mode, 'equation'); assert.equal(d.type, 'poly2'); assert.equal(d.degree, 2); assert.equal(d.solved, false);
  for (const v of [1, -3, 2]) coef(en, v);
  d = J(en.exportData());
  assert.deepEqual(d.coefficients, [1, -3, 2]); assert.equal(d.solved, false); assert.deepEqual(d.solutions, []);
  en.equals();
  d = J(en.exportData());
  assert.deepEqual(d.coefficients, [1, -3, 2]); assert.equal(d.solved, true); assert.equal(d.message, null);
  assert.deepEqual(d.solutions, [{ label: 'x₁', re: 2, im: 0 }, { label: 'x₂', re: 1, im: 0 }]);
  assert.deepEqual(d.extrema, [{ kind: 'min', x: 1.5, y: -0.25 }]);
});

test('Phương trình bậc 2 vô nghiệm thực: nghiệm phức có phần ảo', () => {
  const en = engine(); en.setCalcMode('equation'); en.setEquationType('poly2');
  solve(en, [1, 0, 1]);
  const d = J(en.exportData());
  assert.deepEqual(d.solutions.map(r => [r.re, r.im]), [[0, 1], [0, -1]]);
  assert.deepEqual(d.extrema, [{ kind: 'min', x: 0, y: 1 }]);
});

test('Phương trình bậc 3: nghiệm số và cực đại, cực tiểu', () => {
  const en = engine(); en.setCalcMode('equation'); en.setEquationType('poly3');
  solve(en, [1, -6, 11, -6]);
  const d = J(en.exportData());
  assert.deepEqual(d.coefficients, [1, -6, 11, -6]);
  assert.deepEqual(d.solutions.map(r => Math.round(r.re * 1e9) / 1e9), [1, 3, 2]);
  assert.deepEqual(d.extrema.map(e => e.kind), ['max', 'min']);
  assert.ok(Math.abs(d.extrema[0].x - (6 - Math.sqrt(3)) / 3) < 1e-9);
  assert.ok(Math.abs(d.extrema[1].y + 2 * Math.sqrt(3) / 9) < 1e-9);
});

test('Phương trình bậc 4: xuất nghiệm mà không đổi màn hình và dọn nghiệm khi quay lại', () => {
  const en = engine();
  en.setCalcMode('equation');
  en.setEquationType('poly4');
  solve(en, [1, 0, -5, 0, 4]);
  const before = en.getState();
  const data = en.exportData();
  assert.equal(data.solved, true);
  assert.deepEqual(J(data.solutions).map(({ re }) => re).sort((a, b) => a - b), [-2, -1, 1, 2]);
  assert.deepEqual(en.getState(), before);
  en.clear();
  en.inputDigit('9'); // Chưa đăng ký nên dữ liệu vẫn giữ hệ số cũ.
  const editing = J(en.exportData());
  assert.equal(editing.solved, false);
  assert.deepEqual(editing.coefficients, [1, 0, -5, 0, 4]);
  assert.deepEqual(editing.solutions, []);
});

test('Hệ hai ẩn: hệ số theo hàng, nghiệm x, y; hệ vô nghiệm báo message', () => {
  let en = engine(); en.setCalcMode('equation'); en.setEquationType('simul2');
  solve(en, [1, 1, 3, 1, -1, 1]);
  let d = J(en.exportData());
  assert.equal(d.unknowns, 2); assert.deepEqual(d.coefficients, [[1, 1, 3], [1, -1, 1]]);
  assert.deepEqual(d.solutions, [{ label: 'x', re: 2, im: 0 }, { label: 'y', re: 1, im: 0 }]);
  assert.deepEqual(d.extrema, []);
  en = engine(); en.setCalcMode('equation'); en.setEquationType('simul2');
  solve(en, [1, 1, 1, 2, 2, 3]);
  d = J(en.exportData());
  assert.equal(d.solved, true); assert.equal(d.message, 'No Solution'); assert.deepEqual(d.solutions, []);
});

test('Bất phương trình: kiểu, hệ số và tập nghiệm dạng khoảng', () => {
  let en = engine(); en.setCalcMode('inequality');
  let d = J(en.exportData());
  assert.equal(d.mode, 'inequality'); assert.equal(d.type, null); assert.equal(d.solved, false);
  en.setInequalityType('poly2-gt');
  solve(en, [1, -3, 2]);
  d = J(en.exportData());
  assert.equal(d.type, 'poly2-gt'); assert.equal(d.degree, 2); assert.equal(d.relation, 'gt'); assert.equal(d.symbol, '>');
  assert.deepEqual(d.coefficients, [1, -3, 2]); assert.equal(d.solved, true);
  assert.deepEqual(d.result, { kind: 'set', segments: [
    { low: null, high: 1, includeLow: false, includeHigh: false }, { low: 2, high: null, includeLow: false, includeHigh: false }] });
  en = engine(); en.setCalcMode('inequality'); en.setInequalityType('poly2-le');
  solve(en, [1, -3, 2]);
  assert.deepEqual(J(en.exportData()).result.segments, [{ low: 1, high: 2, includeLow: true, includeHigh: true }]);
  en = engine(); en.setCalcMode('inequality'); en.setInequalityType('poly2-gt');
  for (const v of [1, 0, 1]) coef(en, v);
  d = J(en.exportData()); assert.equal(d.solved, false); assert.equal(d.result, null);
  en.equals(); assert.deepEqual(J(en.exportData()).result, { kind: 'all' });
  en = engine(); en.setCalcMode('inequality'); en.setInequalityType('poly2-lt');
  solve(en, [1, 0, 1]); assert.deepEqual(J(en.exportData()).result, { kind: 'none' });
});

test('Lỗi: xuất loại lỗi, biểu thức, cây gọn và vị trí dấu (-) đặt sai', () => {
  let en = engine(); en.inputDigit('3'); en.inputNegative(); en.inputDigit('5'); en.equals();
  let d = J(en.exportData());
  assert.equal(d.mode, 'calculate');
  assert.deepEqual({ expr: d.expr, text: d.text, value: d.value }, { expr: null, text: '', value: null });
  assert.deepEqual(d.error, { message: 'Syntax ERROR', source: null, text: '3-5', expr: null, tree: [{ c: '3' }, { c: '-', neg: 1 }, { c: '5' }], at: [1] });
  en = engine(); en.inputDigit('5'); en.inputOperator('÷'); en.inputDigit('0'); en.equals();
  d = J(en.exportData()); assert.equal(d.error.message, 'Math ERROR'); assert.equal(d.error.expr, '5/0'); assert.equal(d.error.at, null);
  en = engine(); en.inputFraction(); en.inputDigit('1'); en.equals();
  assert.deepEqual(J(en.exportData()).error.tree, [{ t: 'frac', num: [{ c: '1' }], den: [] }]);
  en = engine(); en.inputSqrt(); en.inputDigit('2'); en.moveCursor('right'); en.inputFraction(); en.inputNegative(); en.inputDigit('1'); en.moveCursor('down'); en.inputDigit('2'); en.equals();
  assert.equal(J(en.exportData()).error, undefined, 'không lỗi thì không có error');
  en.moveCursor('left');
  assert.equal(J(en.exportData()).error, undefined, 'Goto xong thì hết lỗi');
  en = engine(); en.setCalcMode('equation'); en.setEquationType('poly2'); solve(en, [0, 1, 2]);
  d = J(en.exportData()); assert.equal(d.error.message, 'Math ERROR'); assert.deepEqual(d.error.tree, []); assert.deepEqual(d.coefficients, [0, 1, 2]);
});

test('bridge.js: chỉ trả lời trang chứa được phép, theo đúng id', () => {
  const run = (framed, origins = '') => {
    const listeners = [], sent = [], parent = { postMessage: (m, o) => sent.push([m, o]) };
    const window = { addEventListener: (t, f) => listeners.push(f) };
    window.parent = framed ? parent : window;
    // Phím giả: data-action / data-digit / data-shift-action như keypad.js.
    const mkKey = (attrs) => { const cls = new Set(); return { attrs, classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) },
      closest: function () { return this; } }; };
    const keys = [mkKey({ action: 'shift' }), mkKey({ action: 'cursor-left' }), mkKey({ action: 'delete' }), mkKey({ action: 'subtract' }),
      mkKey({ digit: '7' }), mkKey({ action: 'ln', 'shift-action': 'exp' })];
    const match = (sel) => keys.filter(k => sel.split(',').some(part => {
      const m = /data-([a-z-]+)="([^"]+)"/.exec(part); if (m) return k.attrs[m[1] === 'digit' ? 'digit' : m[1] === 'action' ? 'action' : m[1]] === m[2];
      return /bitex-guide/.test(part) && k.classList.contains('bitex-guide'); }));
    const docListeners = [];
    const document = { querySelector: (sel) => (/bitex-export-origins/.test(sel) ? { content: origins } : match(sel)[0] || null),
      querySelectorAll: (sel) => match(sel), addEventListener: (t, f) => docListeners.push(f) };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'bridge.js'), 'utf8'),
      { window, document, engine: { exportData: () => ({ v: 1, mode: 'calculate', expr: '2+3', value: 5 }) } });
    const lit = () => keys.filter(k => k.classList.contains('bitex-guide')).map(k => k.attrs.action || k.attrs.digit);
    const press = (i) => docListeners.forEach(f => f({ target: keys[i] }));
    return { listeners, sent, parent, lit, press };
  };
  const origin = 'https://classroom.example';
  assert.equal(run(false, origin).listeners.length, 0);
  assert.equal(run(true).listeners.length, 0);
  const f = run(true, origin);
  assert.equal(f.listeners.length, 1);
  const msg = { bitex: 'export', id: 7 };
  f.listeners[0]({ source: {}, origin, data: msg });
  f.listeners[0]({ source: f.parent, origin: 'https://other.example', data: msg });
  f.listeners[0]({ source: f.parent, origin: 'null', data: msg });
  f.listeners[0]({ source: f.parent, origin, data: { bitex: 'keylog', id: 9 } });
  assert.equal(f.sent.length, 0);
  f.listeners[0]({ source: f.parent, origin, data: msg });
  assert.deepEqual(J(f.sent[0][0]), { bitex: 'export', id: 7, ok: true, data: { v: 1, mode: 'calculate', expr: '2+3', value: 5 } });
  assert.equal(f.sent[0][1], origin);
  f.listeners[0]({ source: f.parent, origin, data: { bitex: 'hello', id: 8 } });
  assert.equal(f.sent[1][0].ok, true); assert.equal(f.sent[1][0].v, 1);
  assert.deepEqual(J(f.sent[1][0].features), ['calculate', 'table', 'statistics', 'equation', 'inequality', 'error', 'highlight']);
  // Tô sáng lần lượt: ◀ → DEL → −; phím ở SHIFT (eˣ) tô SHIFT trước; phím không có thì bỏ qua.
  const guide = { bitex: 'highlight', id: 9, keys: ['cursor-left', 'delete', 'subtract', 'exp', 'khong-co', 'tên không hợp lệ', null] };
  f.listeners[0]({ source: f.parent, origin: 'https://other.example', data: guide });
  assert.deepEqual(f.lit(), []);
  assert.equal(f.sent.length, 2);
  f.listeners[0]({ source: f.parent, origin, data: guide });
  assert.deepEqual(J(f.sent[2][0]), { bitex: 'highlight', id: 9, ok: true, keys: 5 });
  assert.deepEqual(f.lit(), ['cursor-left']);
  f.press(4); assert.deepEqual(f.lit(), ['cursor-left'], 'bấm phím khác thì vẫn giữ phím đang sáng');
  f.press(1); assert.deepEqual(f.lit(), ['delete']);
  f.press(2); f.press(3); assert.deepEqual(f.lit(), ['shift']);
  f.press(0); assert.deepEqual(f.lit(), ['ln']);
  f.press(5); assert.deepEqual(f.lit(), []);
  f.listeners[0]({ source: f.parent, origin, data: { bitex: 'highlight', id: 10, keys: ['delete'] } });
  f.listeners[0]({ source: f.parent, origin, data: { bitex: 'highlight', id: 11, keys: [] } });
  assert.deepEqual(f.lit(), []); assert.equal(f.sent[4][0].keys, 0);
});

test('Gói web: danh sách cho phép nằm trong HTML và thay đổi mã cache', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bitex-bridge-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const build = (name, origins) => spawnSync(process.execPath, [path.join(root, 'build-release.js'), path.join(dir, name)], {
    env: { ...process.env, BITEX_EXPORT_ORIGINS: origins }, encoding: 'utf8'
  });
  assert.equal(build('default', '').status, 0);
  const origins = 'https://classroom.example http://127.0.0.1:8871';
  const enabled = build('enabled', origins);
  assert.equal(enabled.status, 0, enabled.stderr);
  const html = fs.readFileSync(path.join(dir, 'enabled', 'index.html'), 'utf8');
  assert.ok(html.includes('name="bitex-export-origins" content="' + origins + '"'));
  const getManifest = name => JSON.parse(fs.readFileSync(path.join(dir, name, 'release.json'), 'utf8'));
  assert.notEqual(getManifest('default').offlineCache, getManifest('enabled').offlineCache);
  assert.ok(getManifest('enabled').files['bridge.js']);
  assert.notEqual(build('invalid', 'https://classroom.example/path').status, 0);
  assert.notEqual(build('wildcard', '*').status, 0);
});
