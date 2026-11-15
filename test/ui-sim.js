/**
 * UI 逻辑端到端模拟测试（无需真机/模拟器）
 * 把 index.ux 的 <script> 提取出来，转成 CommonJS，在 Node 里构造 ViewModel，
 * 模拟按键/切换/输入，验证「表达式拼接 + 求值 + 换算 + 方程」整条链路。
 * 运行：node test/ui-sim.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const uxPath = path.join(root, 'src', 'pages', 'index', 'index.ux');
const tmpPath = path.join(root, 'src', 'pages', 'index', '.check-tmp.js');

// 1. 提取并转换
const ux = fs.readFileSync(uxPath, 'utf8');
const m = ux.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('未找到 script 块'); process.exit(1); }
let code = m[1].replace('export default', 'module.exports =');
fs.writeFileSync(tmpPath, code);

// 2. 载入并构造 ViewModel
const def = require(tmpPath);
const vm = {};
for (const k in def) {
  if (k === 'private') Object.assign(vm, def[k]);
  else if (typeof def[k] === 'function') vm[k] = def[k];
}

let pass = 0, fail = 0;
function eq(a, b, label) {
  if (Object.is(a, b)) pass++;
  else { fail++; console.log(`✗ ${label}  期望 ${b}  实际 ${a}`); }
}

// ---------- 计算器 ----------
vm.onInit();

// 1) 1+2×3 = 7
vm.press('AC'); vm.press('1'); vm.press('+'); vm.press('2'); vm.press('×'); vm.press('3'); vm.press('=');
eq(vm.result, '7', '1+2×3');

// 2) 求值后按数字开始新算式
vm.press('5');
eq(vm.expr, '5', '求值后按数字清空重来');
eq(vm.result, '5', '实时预览 5');

// 3) 求值后按运算符用结果继续
vm.press('='); // 5
vm.press('+'); vm.press('3'); vm.press('=');
eq(vm.result, '8', '结果继续 5+3');

// 4) 精度
vm.press('AC'); vm.press('0'); vm.press('.'); vm.press('1'); vm.press('+'); vm.press('0'); vm.press('.'); vm.press('2'); vm.press('=');
eq(vm.result, '0.3', '0.1+0.2 精度');

// 5) 幂右结合与负号
vm.press('AC'); vm.press('2'); vm.press('x^y'); vm.press('3'); vm.press('x^y'); vm.press('2'); vm.press('=');
eq(vm.result, '512', '2^3^2 右结合');

// 6) 三角函数 DEG
vm.press('AC'); vm.press('sin'); vm.press('3'); vm.press('0'); vm.press(')'); vm.press('=');
eq(vm.result, '0.5', 'sin(30°) DEG');

// 7) RAD 模式
vm.toggleAngle(); // 切到 RAD
eq(vm.angleMode, 'RAD', '切到 RAD');
vm.press('AC'); vm.press('sin'); vm.press('π'); vm.press('÷'); vm.press('6'); vm.press(')'); vm.press('=');
eq(vm.result, '0.5', 'sin(π/6) RAD');
vm.toggleAngle(); // 切回 DEG

// 8) 隐式乘法：2π
vm.press('AC'); vm.press('2'); vm.press('π');
eq(vm.expr, '2×π', '2π 自动补 ×');
vm.press('=');
eq(vm.result, '6.2831853072', '2π 结果');

// 9) 阶乘与排列组合
vm.press('AC'); vm.press('5'); vm.press('n!'); vm.press('=');
eq(vm.result, '120', '5!');
vm.press('AC'); vm.press('A'); vm.press('5'); vm.press(','); vm.press('2'); vm.press(')'); vm.press('=');
eq(vm.result, '20', 'A(5,2)');

// 10) 错误提示：负数开平方
vm.press('AC'); vm.press('√'); vm.press('-'); vm.press('4'); vm.press(')'); vm.press('=');
eq(vm.error, '负数不能开平方', '√(-4) 报错');

// ---------- 单位换算 ----------
vm.setMode('convert');
vm.setCat(0); // 长度
eq(vm.convFromName, '米(m)', '长度默认从米');
eq(vm.convToName, '千米(km)', '长度默认到千米');
vm.focusConv('from');
vm.convKey('1');
eq(vm.convToVal, '0.001', '1m→km');
vm.cycleTo(); // 到 cm
eq(vm.convToVal, '100', '1m→cm');

// 温度
vm.setCat(3);
eq(vm.convFromName, '摄氏度(℃)', '温度默认从℃');
vm.focusConv('from');
vm.convKey('0');
eq(vm.convToVal, '273.15', '0℃→K');

// 物质的量
vm.setCat(5);
vm.focusConv('from');
vm.convKey('1');
eq(vm.convToVal, '6.022e23', '1mol→微粒数');

// ---------- 方程求解 ----------
vm.setMode('solve');
function resetEq() { vm.eqA = ''; vm.eqB = ''; vm.eqC = ''; vm.eqDelta = ''; vm.eqMsg = ''; vm.eqRootCount = 0; }

resetEq();
vm.setEq('a'); vm.eqKey('1');
vm.setEq('b'); vm.eqKey('3');
vm.setEq('c'); vm.eqKey('2');
vm.solveEq();
eq(vm.eqDelta, '1', 'Δ = 1');
eq(vm.eqRootCount, 2, '两个实根');
eq(vm.eqX1, '-1', 'x₁=-1');
eq(vm.eqX2, '-2', 'x₂=-2');

// ± 符号切换
resetEq();
vm.setEq('a'); vm.eqKey('5'); vm.eqKey('±');
eq(vm.eqA, '-5', '± 切换符号');

// 无实根
resetEq();
vm.setEq('a'); vm.eqKey('1');
vm.setEq('b'); vm.eqKey('0');
vm.setEq('c'); vm.eqKey('1');
vm.solveEq();
eq(vm.eqMsg, '无实数根', 'x²+1 无实根');

// ---------- pretty / numToStr ----------
const calc = require(path.join(root, 'src', 'common', 'calc.js'));
eq(calc.pretty('2^2'), '2²', 'pretty 2^2→2²');
eq(calc.pretty('2^23'), '2^23', 'pretty 2^23 不变');
eq(calc.numToStr(0.1 + 0.2), '0.3', 'numToStr 精度');

// 清理
fs.unlinkSync(tmpPath);

console.log('\n========== UI 模拟测试 ==========');
console.log(`通过: ${pass}  失败: ${fail}`);
if (fail) process.exit(1);
else console.log('全部通过 ✅');
