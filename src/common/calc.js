/**
 * 高中全能科学计算器 —— 纯逻辑引擎（无 DOM、无 eval）
 *
 * 运行环境：
 *   - 小米快应用（QuickApp / 手表版）：const calc = require('../Common/calc.js')
 *   - Node.js 单元测试：const calc = require('./calc.js')
 *
 * 能力：
 *   - 安全表达式解析（词法分析 + 递归下降 + 优先级），严禁 eval()
 *   - 浮点精度处理：显示至少 10 位小数，过大/过小自动科学记数法
 *   - 三角函数支持 DEG / RAD 角度模式
 *   - 单位换算（长度/能量/压强/温度/电容/物质的量/浓度）
 *   - 一元二次方程求解
 */

'use strict';

// ============================================================
// 一、基础工具
// ============================================================

// 消除算术浮点噪声：保留 15 位有效数字（double 精度内，不丢失 1e-13 级别的小量）
function cleanArith(x) {
  if (!isFinite(x)) return x;
  return parseFloat(x.toPrecision(15));
}

// 三角函数结果：把数学上应为 0 的极小浮点噪声（如 sin(π)≈1.2e-16）归零
function cleanTrig(x) {
  if (!isFinite(x)) return x;
  if (Math.abs(x) < 1e-12) return 0;
  return parseFloat(x.toPrecision(15));
}

// ============================================================
// 二、结果格式化（硬性要求：至少 10 位小数）
// ============================================================

// 去掉小数末尾多余的 0（含小数点本身）
function stripFixedZeros(s) {
  if (s.indexOf('.') < 0) return s;
  s = s.replace(/0+$/, '');
  s = s.replace(/\.$/, '');
  return s;
}

// 去掉科学记数法尾数末尾多余的 0，并把 e+12 简写为 e12
function stripSciZeros(s) {
  const m = s.match(/^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/);
  if (!m) return s;
  let mant = m[2];
  let frac = (m[3] || '').replace(/0+$/, '');
  if (frac) mant += '.' + frac;
  let exp = m[4].replace('+', '');
  return m[1] + mant + 'e' + exp;
}

/**
 * 格式化一个数值结果用于显示。
 * 规则：
 *  - 空值/非数字 → 空串；NaN → '错误'；±Infinity → '∞' / '-∞'
 *  - 0 → '0'
 *  - 1e-6 ≤ |x| < 1e10 → 定点，最多保留 10 位小数，末尾 0 省略
 *  - 否则 → 科学记数法，尾数保留 10 位小数，末尾 0 省略
 */
function formatNumber(x) {
  if (x === null || x === undefined) return '';
  if (typeof x !== 'number') return '错误';
  if (isNaN(x)) return '错误';
  if (x === Infinity) return '∞';
  if (x === -Infinity) return '-∞';
  if (x === 0) return '0';

  const abs = Math.abs(x);
  if (abs >= 1e10 || abs < 1e-6) {
    return stripSciZeros(x.toExponential(10));
  }
  return stripFixedZeros(x.toFixed(10));
}

// 把数值转成可再次参与计算的字符串（用于 '=' 后继续运算，避免 FP 噪声）
function numToStr(n) {
  if (n === null || n === undefined) return '';
  if (typeof n !== 'number' || isNaN(n)) return '';
  if (!isFinite(n)) return '';
  return String(parseFloat(n.toPrecision(15)));
}

// 表达式显示美化：把 ^2/^3 显示为 ²/³（仅当后面不是数字时，避免 2^23 误判）
function pretty(expr) {
  if (!expr) return '';
  return String(expr)
    .replace(/\^2(?!\d)/g, '²')
    .replace(/\^3(?!\d)/g, '³');
}

// ============================================================
// 三、表达式求值（无 eval）
// ============================================================

const OPS = '+-×÷^!%,()';
const FUNCS_1 = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log']; // 单参函数
const FUNCS_2 = ['A', 'C']; // 双参函数（排列 A / 组合 C）
const CONSTS = { 'π': Math.PI, 'e': Math.E };

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === ' ') { i++; continue; }
    if ((c >= '0' && c <= '9') || c === '.') {
      let j = i;
      let dot = false;
      while (j < n && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) {
        if (src[j] === '.') {
          if (dot) throw new Error('数字格式错误');
          dot = true;
        }
        j++;
      }
      tokens.push({ t: 'num', v: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < n && /[a-zA-Z]/.test(src[j])) j++;
      tokens.push({ t: 'ident', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === 'π') { tokens.push({ t: 'const', v: 'π' }); i++; continue; }
    if (c === '√') { tokens.push({ t: 'sqrt' }); i++; continue; }
    if (OPS.indexOf(c) >= 0) { tokens.push({ t: 'op', v: c }); i++; continue; }
    throw new Error('无法识别的字符：' + c);
  }
  return tokens;
}

function toRad(x, mode) { return mode === 'DEG' ? x * Math.PI / 180 : x; }
function fromRad(x, mode) { return mode === 'DEG' ? x * 180 / Math.PI : x; }

function sin(x, mode) { return cleanTrig(Math.sin(toRad(x, mode))); }
function cos(x, mode) { return cleanTrig(Math.cos(toRad(x, mode))); }
function tan(x, mode) {
  const r = toRad(x, mode);
  const c = Math.cos(r);
  if (Math.abs(c) < 1e-12) return Infinity; // 90°、270° 等：正切无定义
  return cleanTrig(Math.tan(r));
}
function asin(x, mode) {
  if (x < -1 || x > 1) throw new Error('asin 定义域为 [-1, 1]');
  return cleanTrig(fromRad(Math.asin(x), mode));
}
function acos(x, mode) {
  if (x < -1 || x > 1) throw new Error('acos 定义域为 [-1, 1]');
  return cleanTrig(fromRad(Math.acos(x), mode));
}
function atan(x, mode) { return cleanTrig(fromRad(Math.atan(x), mode)); }
function ln(x) {
  if (x <= 0) throw new Error('ln 真数须为正数');
  return cleanArith(Math.log(x));
}
function log10(x) {
  if (x <= 0) throw new Error('log 真数须为正数');
  return cleanArith(Math.log10(x));
}
function sqrt(x) {
  if (x < 0) throw new Error('负数不能开平方');
  return cleanArith(Math.sqrt(x));
}

function factorial(n) {
  if (!isFinite(n)) throw new Error('阶乘参数无效');
  if (n < 0 || Math.abs(n - Math.round(n)) > 1e-9) throw new Error('阶乘须为非负整数');
  n = Math.round(n);
  if (n > 170) return Infinity;
  let r = 1;
  for (let i = 2; i <= n; i++) r = cleanArith(r * i);
  return r;
}

function checkInt(x, name) {
  if (!isFinite(x) || Math.abs(x - Math.round(x)) > 1e-9) throw new Error(name + ' 须为整数');
}

function permutation(n, m) {
  checkInt(n, 'A 的 n');
  checkInt(m, 'A 的 m');
  n = Math.round(n); m = Math.round(m);
  if (n < 0 || m < 0) throw new Error('排列参数须为非负整数');
  if (m > n) throw new Error('排列需 m ≤ n');
  let r = 1;
  for (let i = 0; i < m; i++) r = cleanArith(r * (n - i));
  return r;
}

function combination(n, m) {
  checkInt(n, 'C 的 n');
  checkInt(m, 'C 的 m');
  n = Math.round(n); m = Math.round(m);
  if (n < 0 || m < 0) throw new Error('组合参数须为非负整数');
  if (m > n) throw new Error('组合需 m ≤ n');
  m = Math.min(m, n - m);
  let r = 1;
  for (let i = 0; i < m; i++) r = cleanArith(r * (n - i) / (i + 1));
  return r;
}

function applyBinary(op, a, b) {
  switch (op) {
    case '+': return cleanArith(a + b);
    case '-': return cleanArith(a - b);
    case '×': return cleanArith(a * b);
    case '÷':
      if (b === 0) {
        if (a === 0) return NaN;
        return a > 0 ? Infinity : -Infinity;
      }
      return cleanArith(a / b);
    case '^': return cleanArith(Math.pow(a, b));
  }
  throw new Error('未知运算符 ' + op);
}

function callFunc1(name, x, mode) {
  switch (name) {
    case 'sin': return sin(x, mode);
    case 'cos': return cos(x, mode);
    case 'tan': return tan(x, mode);
    case 'asin': return asin(x, mode);
    case 'acos': return acos(x, mode);
    case 'atan': return atan(x, mode);
    case 'ln': return ln(x);
    case 'log': return log10(x);
  }
  throw new Error('未知函数 ' + name);
}

// 递归下降解析器（返回数值）
function parseTokens(tokens, mode) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function expectOp(val) {
    const tk = peek();
    if (tk && tk.t === 'op' && tk.v === val) { pos++; return; }
    throw new Error('缺少 ' + val);
  }

  function parseExpression() { return parseAdd(); }

  function parseAdd() {
    let left = parseMul();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = next().v;
      left = applyBinary(op, left, parseMul());
    }
    return left;
  }

  function parseMul() {
    let left = parseUnary();
    while (peek() && peek().t === 'op' && (peek().v === '×' || peek().v === '÷')) {
      const op = next().v;
      left = applyBinary(op, left, parseUnary());
    }
    return left;
  }

  function parseUnary() {
    if (peek() && peek().t === 'op' && peek().v === '-') { next(); return cleanArith(-parseUnary()); }
    if (peek() && peek().t === 'op' && peek().v === '+') { next(); return parseUnary(); }
    if (peek() && peek().t === 'sqrt') { next(); return sqrt(parseUnary()); }
    return parsePower();
  }

  function parsePower() {
    let left = parsePostfix();
    if (peek() && peek().t === 'op' && peek().v === '^') {
      next();
      left = applyBinary('^', left, parseUnary()); // 右结合，指数允许负号
    }
    return left;
  }

  function parsePostfix() {
    let v = parsePrimary();
    while (peek() && peek().t === 'op' && (peek().v === '!' || peek().v === '%')) {
      const op = next().v;
      v = (op === '!') ? factorial(v) : cleanArith(v / 100);
    }
    return v;
  }

  function parsePrimary() {
    const tk = peek();
    if (!tk) throw new Error('表达式不完整');
    if (tk.t === 'num') { next(); return tk.v; }
    if (tk.t === 'const') { next(); return CONSTS[tk.v]; }
    if (tk.t === 'op' && tk.v === '(') {
      next();
      const v = parseExpression();
      expectOp(')');
      return v;
    }
    if (tk.t === 'ident') {
      next();
      const name = tk.v;
      if (name === 'e') return Math.E; // 自然常数
      if (FUNCS_1.indexOf(name) >= 0) {
        expectOp('(');
        const arg = parseExpression();
        expectOp(')');
        return callFunc1(name, arg, mode);
      }
      if (FUNCS_2.indexOf(name) >= 0) {
        expectOp('(');
        const a = parseExpression();
        expectOp(',');
        const b = parseExpression();
        expectOp(')');
        return name === 'A' ? permutation(a, b) : combination(a, b);
      }
      throw new Error('未知函数 ' + name);
    }
    throw new Error('表达式不完整');
  }

  const result = parseExpression();
  if (pos < tokens.length) throw new Error('表达式无法解析');
  return cleanArith(result);
}

/**
 * 求值入口。
 * @param {string} expr 表达式（如 "1÷3"、"sin(30)"、"2^10"）
 * @param {string} mode 角度模式 'DEG' | 'RAD'
 * @returns {number} 计算结果；空表达式返回 null；非法表达式抛异常
 */
function evaluate(expr, mode) {
  if (expr === null || expr === undefined) return null;
  const s = String(expr).trim();
  if (s === '') return null;
  const tokens = tokenize(s);
  if (tokens.length === 0) return null;
  return parseTokens(tokens, mode || 'DEG');
}

// ============================================================
// 四、单位换算
// ============================================================

const NA = 6.022e23; // 阿伏伽德罗常数（需求指定 6.022×10²³）

const UNIT_CATEGORIES = [
  {
    id: 'length', name: '长度', type: 'ratio',
    units: [
      { id: 'm', name: '米(m)', factor: 1 },
      { id: 'km', name: '千米(km)', factor: 1e3 },
      { id: 'cm', name: '厘米(cm)', factor: 1e-2 },
      { id: 'mm', name: '毫米(mm)', factor: 1e-3 },
      { id: 'um', name: '微米(μm)', factor: 1e-6 },
      { id: 'nm', name: '纳米(nm)', factor: 1e-9 }
    ]
  },
  {
    id: 'energy', name: '能量', type: 'ratio',
    units: [
      { id: 'J', name: '焦耳(J)', factor: 1 },
      { id: 'kJ', name: '千焦(kJ)', factor: 1e3 },
      { id: 'cal', name: '卡路里(cal)', factor: 4.184 }
    ]
  },
  {
    id: 'pressure', name: '压强', type: 'ratio',
    units: [
      { id: 'Pa', name: '帕斯卡(Pa)', factor: 1 },
      { id: 'kPa', name: '千帕(kPa)', factor: 1e3 },
      { id: 'atm', name: '标准大气压(atm)', factor: 101325 },
      { id: 'mmHg', name: '毫米汞柱(mmHg)', factor: 101325 / 760 }
    ]
  },
  {
    id: 'temp', name: '温度', type: 'temperature',
    units: [
      { id: 'C', name: '摄氏度(℃)' },
      { id: 'K', name: '开尔文(K)' },
      { id: 'F', name: '华氏度(℉)' }
    ]
  },
  {
    id: 'capacitance', name: '电容', type: 'ratio',
    units: [
      { id: 'F', name: '法拉(F)', factor: 1 },
      { id: 'uF', name: '微法(μF)', factor: 1e-6 },
      { id: 'pF', name: '皮法(pF)', factor: 1e-12 }
    ]
  },
  {
    id: 'amount', name: '物质的量', type: 'ratio',
    units: [
      { id: 'mol', name: '摩尔(mol)', factor: 1 },
      { id: 'particle', name: '微粒数(个)', factor: 1 / NA }
    ]
  },
  {
    id: 'concentration', name: '浓度', type: 'concentration',
    units: [
      { id: 'massfraction', name: '质量分数(%)' },
      { id: 'molarity', name: '物质的量浓度(mol/L)' }
    ]
  }
];

function tempToBase(v, unit) {
  if (unit === 'C') return v;
  if (unit === 'K') return v - 273.15;
  if (unit === 'F') return (v - 32) * 5 / 9;
  throw new Error('未知温度单位');
}
function baseToTemp(v, unit) {
  if (unit === 'C') return v;
  if (unit === 'K') return v + 273.15;
  if (unit === 'F') return v * 9 / 5 + 32;
  throw new Error('未知温度单位');
}

/**
 * 浓度换算（需密度 ρ g/mL 与摩尔质量 M g/mol）。
 * 质量分数 w(%) ↔ 物质的量浓度 c(mol/L)：c = 1000·ρ·w / M，w = c·M / (1000·ρ)
 */
function convertConcentration(value, from, to, rho, M) {
  if (from === 'massfraction' && to === 'molarity') {
    const w = value / 100;
    return cleanArith(1000 * rho * w / M);
  }
  if (from === 'molarity' && to === 'massfraction') {
    const c = value;
    return cleanArith(c * M / (1000 * rho) * 100);
  }
  return value; // 同单位
}

/**
 * 通用换算：value 从 fromUnit 换算到 toUnit。
 * @param {number} value 输入值
 * @param {string} fromId 源单位 id
 * @param {string} toId 目标单位 id
 * @param {object} cat 分类对象（UNIT_CATEGORIES 中的一项）
 * @param {object} extra 浓度所需的 { rho, M }
 */
function convertUnit(value, fromId, toId, cat, extra) {
  if (fromId === toId) return value;
  if (cat.type === 'ratio') {
    const fu = cat.units.find(u => u.id === fromId);
    const tu = cat.units.find(u => u.id === toId);
    const base = value * fu.factor;
    return cleanArith(base / tu.factor);
  }
  if (cat.type === 'temperature') {
    return cleanArith(baseToTemp(tempToBase(value, fromId), toId));
  }
  if (cat.type === 'concentration') {
    const rho = extra && parseFloat(extra.rho);
    const M = extra && parseFloat(extra.M);
    if (!rho || rho <= 0) throw new Error('请输入密度 ρ(g/mL)');
    if (!M || M <= 0) throw new Error('请输入摩尔质量 M(g/mol)');
    return convertConcentration(value, fromId, toId, rho, M);
  }
  throw new Error('未知换算类型');
}

// ============================================================
// 五、一元二次方程 ax² + bx + c = 0
// ============================================================

function solveQuadratic(a, b, c) {
  if (typeof a !== 'number' || isNaN(a)) throw new Error('请填写系数 a');
  if (typeof b !== 'number' || isNaN(b)) b = 0;
  if (typeof c !== 'number' || isNaN(c)) c = 0;
  if (a === 0) throw new Error('a 不能为 0（否则不是二次方程）');

  let delta = b * b - 4 * a * c;
  if (Math.abs(delta) < 1e-12) delta = 0;

  if (delta < 0) return { delta: delta, roots: [] };
  if (delta === 0) return { delta: delta, roots: [cleanArith(-b / (2 * a))] };
  const s = Math.sqrt(delta);
  const x1 = cleanArith((-b + s) / (2 * a));
  const x2 = cleanArith((-b - s) / (2 * a));
  return { delta: delta, roots: [x1, x2] };
}

// ============================================================
// 导出
// ============================================================

module.exports = {
  evaluate: evaluate,
  formatNumber: formatNumber,
  numToStr: numToStr,
  pretty: pretty,
  UNIT_CATEGORIES: UNIT_CATEGORIES,
  convertUnit: convertUnit,
  solveQuadratic: solveQuadratic
};
