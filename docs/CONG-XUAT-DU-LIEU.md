# Cổng xuất dữ liệu (bridge.js)

Cho phép trang web chứa bản giả lập trong khung (`<iframe>`) đọc dữ liệu và tô sáng các phím cần bấm. Người dùng tự thực hiện các bước trên máy. Cổng chỉ hoạt động khi máy nằm trong khung của một trang đã được cấp quyền.

## Thành phần

| Tệp | Nội dung |
|---|---|
| `engine.js` | `serializeForExchange(nodes)`: dịch cây biểu thức thành chuỗi trao đổi; `engine.exportData()`; `exportData()` của handler Bảng giá trị, Thống kê, Phương trình và Bất phương trình |
| `bridge.js` | Nghe `postMessage` từ trang chứa, trả `engine.exportData()`; tô sáng phím theo lệnh `highlight` |
| `device.css` | Kiểu tô sáng phím `.key.bitex-guide` |
| `index.html`, `sw.js` | Nạp `bridge.js` sau `ui.js`; thêm vào bộ nhớ ngoại tuyến |
| `bridge.test.js` | `node --test bridge.test.js` |

## Giao thức

```
trang chứa → máy:  { bitex: 'hello',  id }
máy → trang chứa:  { bitex: 'hello',  id, ok: true, v: 1, model: 'fx-580VN X', features: ['calculate','table','statistics','equation','inequality','error','highlight'] }

trang chứa → máy:  { bitex: 'export', id }
máy → trang chứa:  { bitex: 'export', id, ok: true, data }      // data = engine.exportData()
trang chứa → máy:  { bitex: 'highlight', id, keys: ['cursor-left', 'cursor-right', 'delete', 'subtract'] }
máy → trang chứa:  { bitex: 'highlight', id, ok: true, keys: 4 }   // số phím tô được; keys: [] để tắt
                   { bitex: 'export', id, ok: false, error }   // khi có lỗi
```

Máy kiểm tra tin đến từ trang chứa trực tiếp và từ đúng origin đã cấu hình. Origin là giao thức, tên miền và cổng nếu có. Máy gửi kết quả về đúng origin đó.

Mặc định cổng tắt. Khi đóng gói, đặt biến môi trường `BITEX_EXPORT_ORIGINS` thành danh sách origin được BITEX phê duyệt, cách nhau bằng khoảng trắng. Dùng HTTPS và bỏ dấu `/` cuối, đường dẫn và ký tự đại diện. HTTP chỉ dùng để kiểm thử trên `localhost`, `127.0.0.1` hoặc `[::1]`. Ví dụ cục bộ:

```sh
BITEX_EXPORT_ORIGINS='http://127.0.0.1:8871' node build-release.js
```

Khi thử mã nguồn trực tiếp, đặt cùng danh sách trong thẻ `meta[name="bitex-export-origins"]` của bản thử cục bộ. Trang nhận nên dùng đúng origin của máy khi gửi yêu cầu và kiểm tra nguồn trả lời.

## `engine.exportData()`

Mọi kết quả có `v: 1` (phiên bản định dạng), `mode` (mode đang mở), `angleUnit` (`deg` | `rad` | `grad`).

**Tính toán** (`mode: 'calculate'`): xuất mục kết quả đang xem với đơn vị góc lúc tính, hoặc biểu thức đang gõ với đơn vị hiện hành và `value: null`. Sau AC, trả `expr: null`, `text: ""`, `value: null`. Người dùng có thể chủ động mở lại mục lịch sử bằng phím điều hướng để xuất mục đó. Màn SOLVE hoặc màn nhập biến CALC báo `unsupported`. Kết quả CALC có thể xuất số và chữ hiển thị, với `expr: null` vì phụ thuộc giá trị biến đã nhập.

```json
{ "v": 1, "mode": "calculate", "angleUnit": "deg", "expr": "((1)/(2))+sin(30)", "text": "1/2+sin(30)", "value": 1 }
```

**Bảng giá trị** (`mode: 'table'`): ô lỗi là `null`. Khi không có g(x), `g: null` và `gText: ""`. Chỉ xuất các dòng của bảng đã sinh ở đơn vị góc hiện hành. Trong lúc sửa hàm, chỉnh khoảng hoặc sau khi đổi đơn vị góc, `rows: []` cho tới khi sinh lại bảng với thiết lập phù hợp.

```json
{ "v": 1, "mode": "table", "angleUnit": "deg", "f": "x^(2)-1", "fText": "x^(2)-1", "g": null, "gText": "",
  "start": 1, "end": 5, "step": 1, "rows": [ { "x": 1, "f": 0, "g": null }, { "x": 2, "f": 3, "g": null } ] }
```

**Thống kê** (`mode: 'statistics'`): `type` là `id` trong `STATISTICS_TYPES` (`1var`, `linear`, `quad`, `log`, `exp-e`, `exp-ab`, `power`, `inverse`); mỗi dòng luôn đủ `x`, `y`, `f` như `newStatRow()`.

```json
{ "v": 1, "mode": "statistics", "angleUnit": "deg", "type": "linear", "label": "y=a+bx", "twoVar": true,
  "frequency": false, "rows": [ { "x": 1, "y": 3, "f": 1 } ] }
```

**Phương trình** (`mode: 'equation'`): `type` là `id` trong `EQUATION_TYPES` (`simul2`, `simul3`, `simul4`, `poly2`, `poly3`, `poly4`), `group` là `poly` hoặc `simul`. Đa thức có `degree`, `coefficients = [a, b, c, …]` (bậc cao trước); hệ có `unknowns`, `coefficients` gồm n hàng, mỗi hàng n hệ số rồi vế phải. Hệ số là giá trị đã đăng ký (ô đang gõ dở chưa tính). Ở màn hình nhập: `solved: false`, `solutions` và `extrema` rỗng. Ở màn hình nghiệm: `solved: true`; `solutions` là các nghiệm `{ label, re, im }` dạng số (nghiệm thực có `im: 0`; khi tắt nghiệm phức trong SETUP chỉ còn nghiệm thực); `extrema` là đỉnh parabol (bậc 2) hoặc cực đại, cực tiểu (bậc 3): `{ kind: 'max' | 'min', x, y }`; hệ suy biến hoặc không có nghiệm thực thì `message` là `No Solution`, `Infinite Solution` hoặc `No Real Roots`.

```json
{ "v": 1, "mode": "equation", "angleUnit": "deg", "type": "poly2", "group": "poly", "degree": 2, "unknowns": null,
  "coefficients": [1, -3, 2], "solved": true, "message": null,
  "solutions": [ { "label": "x₁", "re": 2, "im": 0 }, { "label": "x₂", "re": 1, "im": 0 } ],
  "extrema": [ { "kind": "min", "x": 1.5, "y": -0.25 } ] }
```

**Bất phương trình** (`mode: 'inequality'`): ở hai màn chọn bậc và quan hệ thì `type: null`. Sau khi chọn: `type` như `poly2-gt` (bậc 2–4; `gt` >, `lt` <, `ge` ≥, `le` ≤), `degree`, `relation`, `symbol`, `coefficients = [a, b, c, …]` (bậc cao trước, giá trị đã đăng ký). Ở màn hình nhập `solved: false`, `result: null`. Ở màn hình nghiệm `solved: true`, `result` là `{ kind: 'all' }` (mọi số thực), `{ kind: 'none' }` (vô nghiệm) hoặc `{ kind: 'set', segments: [{ low, high, includeLow, includeHigh }] }`; `low`/`high` là số, `null` cho vô cực; khoảng một điểm có `low = high`.

```json
{ "v": 1, "mode": "inequality", "angleUnit": "deg", "type": "poly2-gt", "degree": 2, "relation": "gt", "symbol": ">",
  "coefficients": [1, -3, 2], "solved": true,
  "result": { "kind": "set", "segments": [ { "low": null, "high": 1, "includeLow": false, "includeHigh": false },
                                          { "low": 2, "high": null, "includeLow": false, "includeHigh": false } ] } }
```

**Lỗi** (mọi mode): khi máy đang hiện màn hình lỗi, `data` có thêm `error = { message, source, text, expr, tree, at }`. `message` là chữ trên màn hình (`Math ERROR`, `Syntax ERROR`, `Stack ERROR`, `Argument ERROR`, `Dimension ERROR`, `Cannot Solve`, `Time Out`, `Range ERROR`, `Variable ERROR`); `source` là `calc` / `solve` khi lỗi trong CALC / SOLVE, ngoài ra `null`; `text`, `expr` là chuỗi hiển thị và chuỗi trao đổi của biểu thức gây lỗi; `tree` là cây gọn của biểu thức: ký tự `{ c, neg? (phím (−)), k? (hằng), s? (biến thống kê), e? (ký hiệu kỹ thuật) }`, mẫu nhập `{ t: 'frac' | 'sqrt' | 'sup' | 'logn' | …, <ô>: [...] }` theo `TEMPLATE_SLOT_FIELDS`; `at` là đường dẫn tới node lỗi (`[chỉ số, tên ô, chỉ số, …]`) khi máy biết — hiện là dấu (−) đặt sau số, đúng chỗ phím ◀ ▶ (Goto) đặt con trỏ. Mode có màn hình riêng (Bảng, Phương trình…) có `tree: []`, phần còn lại của `data` vẫn là dữ liệu của mode.

```json
{ "v": 1, "mode": "calculate", "angleUnit": "deg",
  "error": { "message": "Syntax ERROR", "source": null, "text": "3-5", "expr": null,
             "tree": [ { "c": "3" }, { "c": "-", "neg": 1 }, { "c": "5" } ], "at": [1] } }
```

**Tô sáng phím** (`highlight`): `keys` là tên hành động của phím như `data-action`, `data-digit`, `data-shift-action` trong `keypad.js` (vd. `cursor-left`, `delete`, `subtract`, `7`, `exp`). Máy tô sáng lần lượt từng phím (lớp CSS `bitex-guide`); phím ở SHIFT thì tô SHIFT trước. Người dùng bấm đúng phím đang sáng thì sang phím kế, hết danh sách thì tắt. Lệnh chỉ đổi giao diện, không bấm phím thay người dùng.

**Mode khác**: `{ v, mode, angleUnit, unsupported: true }`.

## Chuỗi trao đổi (`expr`, `f`, `g`)

Một dòng, chỉ ký tự ASCII, dấu chấm thập phân: số, `x`, `+ - * / ^ ( ) ,`, hằng `pi`, `e`, hàm `sqrt cbrt root(x,n) abs ln log10 logb(b,x) sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh`. Phân số viết `((tử)/(mẫu))`, hỗn số `(nguyên+(tử)/(mẫu))`, Ký pháp khoa học có phần số đứng trước được nhóm thành một toán hạng, ví dụ `1÷2×10³` xuất thành `1/(2*10^(3))`. Dấu nhân ẩn được ghi thành dấu `*` và nhóm bằng ngoặc để giữ đúng thứ tự tính. Đối số lượng giác theo `angleUnit`.

Biểu thức có thành phần không dịch được (Σ, ∫, d/dx, Ans, biến nhớ A–F, M, hằng số khoa học, đổi đơn vị, GCD, Pol…) thì giá trị là `null`; bên nhận khi đó chỉ dùng số liệu (`value`, `rows`), vẫn có `text` / `fText` để hiển thị.

## Nhật ký phím cho người kiểm thử

Mở **Tiện ích → Nhật ký phím** để trình chiếu chuỗi phím cùng với máy tính. Khung nhật ký ở bên phải trên màn hình rộng và phía dưới trên màn hình hẹp. Chuỗi cập nhật ngay khi bấm phím và giữ 500 thao tác gần nhất trong phiên. Khi đang xem các phím cũ, khung giữ vị trí cuộn.

**Sao chép** tạo chuỗi như `[AC] [1] [+] [2] [=]` để dán vào phiếu góp ý. **Tải ảnh PNG** xuất toàn bộ phím đang lưu. **Tải JSON** giữ số thứ tự, mã phím, nhãn, chế độ, phím bổ trợ và phiên bản. **Xóa** bắt đầu lại từ bước 1 và giữ nguyên phép tính đang hiển thị.

Nhật ký chỉ nằm trong bộ nhớ trang và được xuất khi người dùng chọn. Trang nhúng chỉ đọc các loại dữ liệu trong `features`.

## Mở rộng

Thêm mode mới: viết `exportData()` trong handler của mode đó, thêm tên mode vào `features` của `bridge.js`, thêm ca vào `bridge.test.js`. Đổi cấu trúc dữ liệu thì tăng `v`.
