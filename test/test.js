/**
 * 计算引擎单元测试（Node.js 直接运行：node test/test.js）
 * 覆盖：精度、四则、括号、百分比、幂指、根号、三角函数(DEG/RAD)、
 *       阶乘、排列组合、科学记数法格式化、单位换算、一元二次方程。
 */
'use strict';

const calc = require('../src/common/calc.js');

let pass = 0;
let fail = 0;
const failures = [];

function eq(actual, expected, label) {
  if (Object.is(actual, expected)) {
    pass++;
  } else {
    fail++;
    failures.push(`✗ ${label}\n    期望: ${expected}\n    实际: ${actual}`);
  }
}

function approx(actual, expected, label, eps) {
  eps = eps || 1e-10;
  const a = typeof actual === 'number' ? actual : Number.NaN;
  const ok = Math.abs(a - expected) <= eps;
  if (ok) pass++;
  else { fail++; failures.push(`✗ ${label}\n    期望: ${expected}\n    实际: ${actual}`); }
}

const e = calc.evaluate;
const f = calc.formatNumber;

// ---------- 四则与精度 ----------
eq(f(e('0.1+0.2')), '0.3', '0.1+0.2 精度');
eq(f(e('0.1+0.2')), '0.3', '0.1+0.2 精度(重复校验)');
eq(f(e('1÷3')), '0.3333333333', '1/3 保留 10 位');
eq(f(e('2÷3')), '0.6666666667', '2/3 四舍五入');
eq(f(e('1+2×3')), '7', '优先级 乘法先于加法');
eq(f(e('(1+2)×3')), '9', '括号');
eq(f(e('10-4÷2')), '8', '除法先于减法');
eq(f(e('50%')), '0.5', '百分比');
eq(f(e('200×50%')), '100', '百分比乘法');
eq(f(e('5÷0')), '∞', '除零正无穷');
eq(f(e('-5÷0')), '-∞', '除零负无穷');
eq(f(e('0÷0')), '错误', '0/0 未定义');

// ---------- 幂指与根号 ----------
eq(f(e('2^10')), '1024', '2^10');
eq(f(e('2^3^2')), '512', '幂右结合 2^(3^2)');
eq(f(e('-2^2')), '-4', '-2^2 = -(2^2)');
eq(f(e('2^-2')), '0.25', '负指数');
eq(f(e('√16')), '4', '开方');
eq(f(e('√(16+9)')), '5', '开方括号');

// ---------- 常数 ----------
eq(f(e('π')), '3.1415926536', 'π');
eq(f(e('e')), '2.7182818285', '自然常数 e');

// ---------- 对数 ----------
eq(f(e('ln(e)')), '1', 'ln(e)');
eq(f(e('log(1000)')), '3', 'log10(1000)');

// ---------- 三角函数 DEG ----------
eq(f(e('sin(30)', 'DEG')), '0.5', 'sin30°');
eq(f(e('cos(60)', 'DEG')), '0.5', 'cos60°');
eq(f(e('tan(45)', 'DEG')), '1', 'tan45°');
eq(f(e('sin(180)', 'DEG')), '0', 'sin180° 归零');
eq(f(e('cos(90)', 'DEG')), '0', 'cos90° 归零');
eq(f(e('asin(0.5)', 'DEG')), '30', 'asin(0.5)=30°');
eq(f(e('atan(1)', 'DEG')), '45', 'atan(1)=45°');
eq(f(e('tan(90)', 'DEG')), '∞', 'tan90° 无穷');

// ---------- 三角函数 RAD ----------
eq(f(e('sin(π÷6)', 'RAD')), '0.5', 'sin(π/6) RAD');
eq(f(e('sin(π)', 'RAD')), '0', 'sin(π) RAD 归零');
eq(f(e('cos(π÷2)', 'RAD')), '0', 'cos(π/2) RAD 归零');

// ---------- 阶乘与排列组合 ----------
eq(f(e('5!')), '120', '5!');
eq(f(e('0!')), '1', '0!');
eq(f(e('A(5,2)')), '20', 'A(5,2)');
eq(f(e('C(5,2)')), '10', 'C(5,2)');

// ---------- 科学记数法格式化 ----------
eq(f(1.5e12), '1.5e12', '科学记数法 1.5e12');
eq(f(2.3e-9), '2.3e-9', '科学记数法 2.3e-9');
eq(f(-1.5e12), '-1.5e12', '负科学记数法');
eq(f(0), '0', '零');
eq(f(100), '100', '整数');

// ---------- 隐式乘(由 UI 层负责，此处验证引擎拒绝) ----------
let threw = false;
try { e('2π'); } catch (err) { threw = true; }
eq(threw, true, '引擎拒绝隐式乘法 2π（UI 层负责插入 ×）');

// ---------- 单位换算 ----------
const cats = calc.UNIT_CATEGORIES;
const length = cats[0];
eq(f(calc.convertUnit(1, 'km', 'm', length)), '1000', '1km→m');
eq(f(calc.convertUnit(1, 'm', 'cm', length)), '100', '1m→cm');
eq(f(calc.convertUnit(1, 'km', 'cm', length)), '100000', '1km→cm');

const energy = cats[1];
approx(calc.convertUnit(1, 'cal', 'J', energy), 4.184, '1cal→J');

const pressure = cats[2];
approx(calc.convertUnit(1, 'atm', 'Pa', pressure), 101325, '1atm→Pa');

const temp = cats[3];
eq(f(calc.convertUnit(0, 'C', 'K', temp)), '273.15', '0℃→K');
eq(f(calc.convertUnit(100, 'C', 'F', temp)), '212', '100℃→℉');
eq(f(calc.convertUnit(0, 'K', 'C', temp)), '-273.15', '0K→℃');

const cap = cats[4];
eq(f(calc.convertUnit(1, 'F', 'uF', cap)), '1000000', '1F→μF');

const amount = cats[5];
eq(f(calc.convertUnit(1, 'mol', 'particle', amount)), '6.022e23', '1mol→微粒数');
eq(f(calc.convertUnit(6.022e23, 'particle', 'mol', amount)), '1', '6.022e23 个→mol');

const conc = cats[6];
// 质量分数 10%，ρ=1.0 g/mL，M=100 g/mol → c = 1000*1.0*0.1/100 = 1 mol/L
eq(f(calc.convertUnit(10, 'massfraction', 'molarity', conc, { rho: 1.0, M: 100 })), '1', '浓度 10%→mol/L');

// ---------- 一元二次方程 ----------
let r = calc.solveQuadratic(1, -3, 2);
eq(f(r.delta), '1', 'Δ=x²-3x+2');
eq(f(r.roots[0]), '2', 'x₁=2');
eq(f(r.roots[1]), '1', 'x₂=1');

r = calc.solveQuadratic(1, 2, 1);
eq(r.roots.length, 1, '重根个数');
eq(f(r.roots[0]), '-1', '重根 x=-1');

r = calc.solveQuadratic(1, 0, 1);
eq(r.roots.length, 0, '无实根个数');
eq(f(r.delta), '-4', 'Δ<0');

// ---------- 汇总 ----------
console.log('\n========== 测试结果 ==========');
console.log(`通过: ${pass}  失败: ${fail}`);
if (failures.length) {
  console.log('\n--- 失败详情 ---');
  failures.forEach(s => console.log(s + '\n'));
  process.exit(1);
} else {
  console.log('全部测试通过 ✅');
  process.exit(0);
}
