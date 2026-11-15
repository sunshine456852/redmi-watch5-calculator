# Redmi Watch5 Calculator
一个面向 Redmi Watch 5（2.07 英寸 AMOLED 方屏）的小米 Vela JS 应用，覆盖基础/科学计算、单位换算、一元二次方程求解三大场景


> 
---

## 一、应用概述

| 项目          | 内容                                               |
| ----------- | ------------------------------------------------ |
| 应用名称        | 科学计算器                                            |
| 包名（package） | `com.sunshine.scienticcalc`                      |
| 运行设备        | Redmi Watch 5（Vela OS / 澎湃OS 手表）                 |
| 设备类型        | `watch`                                          |
| 当前版本        | 1.0.0（versionCode 1）                             |
| 设计基准宽度      | `designWidth: 466`                               |

**核心功能**

1. **基础与科学计算**：四则、括号、百分比、ln/log、x^y、x²、x³、√、e^x、10^x、三角/反三角、π、e、阶乘 n!、排列 A、组合 C，DEG/RAD 一键切换。
2. **单位换算**：长度、能量、压强、温度、电容、物质的量、浓度（含密度 ρ、摩尔质量 M 的浓度模组），双向即时换算。
3. **方程求解**：一元二次方程 `ax² + bx + c = 0`，输出判别式 Δ 与双实根/重根/「无实数根」。

**显示规范**：计算结果最多保留 10 位小数（末尾 0 智能省略），过大或过小自动转科学记数法。

---

## 二、技术栈

| 层级 | 技术选型 |
| --- | --- |
| 应用框架 | 小米 **Vela JS 应用**（手表快应用），`.ux` 单文件（`<template>` / `<style>` / `<script>`） |
| 开发范式 | MVVM，数据驱动渲染，`private` 声明页面数据 |
| 构建工具 | **aiot-toolkit 2.0.5**（`aiot build`）+ `@aiot-toolkit/jsc 1.0.3` |
| 模块规范 | CommonJS（`module.exports` + `require`） |
| 计算引擎 | 纯 JavaScript 实现（无 `eval`），可独立在 Node 中测试 |
| 单元测试 | Node.js（原生断言脚本） |
| 图标处理 | Python + Pillow（PIL） |
| 调试/预览 | AIoT IDE（基于 VS Code）内置模拟器 |

> 注：Redmi Watch 5 属于 Vela 手表，正确工具链是 `aiot-toolkit`，**不是**手机快应用的 `hap-toolkit`。两者在组件白名单、CSS 支持、`config-watch.json` 要求上都有差异。

---

## 三、工程结构

```
redmi-watch5-calculator/
├── package.json                 # 项目配置：aiot-toolkit 依赖、build/test 脚本
├── src/
│   ├── manifest.json            # 应用清单：包名、设备类型、路由、显示配置
│   ├── config-watch.json        # 手表设备配置（Vela 要求存在，内容为 {}）
│   ├── app.ux                   # 应用级入口（生命周期）
│   ├── common/
│   │   ├── calc.js              # 纯逻辑引擎（解析/精度/换算/方程）
│   │   └── logo.png             # 应用图标（192×192）
│   └── pages/
│       └── index/
│           └── index.ux         # 主页面：三模式 UI + 交互逻辑
├── test/
│   ├── test.js                  # 引擎单元测试（62 例）
│   └── ui-sim.js                # UI 逻辑端到端模拟（30 例）
├── tools/
│   └── gen-icon.js              # 图标生成脚本（早期版本）
└── dist/                        # 编译产物（.rpk）
```

**文件职责**

- `calc.js`：与 UI 完全解耦的纯函数库，负责表达式求值、精度格式化、单位换算、方程求解。
- `index.ux`：视图与交互，负责按键状态机、三种模式切换、结果展示；通过 `require('../../common/calc.js')` 调用引擎。

---

## 四、实现逻辑

### 4.1 计算引擎（`common/calc.js`）

#### （1）词法分析（Tokenizer）

把表达式字符串拆成 token：

- `num`：数字（含小数点）
- `ident`：标识符（`sin` / `cos` / `tan` / `asin` / `acos` / `atan` / `ln` / `log` / `A` / `C` / `e`）
- `const`：常量 `π`
- `sqrt`：`√`
- `op`：`+ - × ÷ ^ ! % ( ) ,`

#### （2）语法分析（递归下降 + 优先级）

采用递归下降解析器，优先级从低到高：

```
parseAdd     →  + -
parseMul     →  × ÷
parseUnary   →  一元负号、√ 前缀
parsePower   →  ^（右结合，指数允许负号）
parsePostfix →  ! 阶乘、% 百分比
parsePrimary →  数字 / 常量 / 括号 / 函数调用 / A、C 双参函数
```

关键设计：

- **右结合幂**：`2^3^2` 解析为 `2^(3^2) = 512`。
- **负号优先级**：`-2^2` 解析为 `-(2^2) = -4`；`2^-2 = 0.25`。
- **百分号**：`x%` 按数学语义处理为 `x/100`，因此 `200×50% = 100`。
- **禁止 eval**：全程手写解析，不存在代码注入风险。

#### （3）浮点精度处理（硬性要求）

| 函数 | 作用 |
| --- | --- |
| `cleanArith(x)` | 对算术结果保留 15 位有效数字（`toPrecision(15)`），消除 `0.1+0.2=0.30000000000000004` 这类噪声 |
| `cleanTrig(x)` | 对三角函数结果，绝对值 < 1e-12 时归零（如 `sin(π)≈1.2e-16` → `0`） |
| `formatNumber(x)` | 显示格式化：定点最多 10 位小数并去尾零；`|x| ≥ 1e10` 或 `|x| < 1e-6` 时转科学记数法（尾数 10 位小数） |

示例：`1÷3` → `0.3333333333`；`0.1+0.2` → `0.3`；`2^100` → `1.2676506002e30`。

#### （4）三角函数与角度模式

- DEG 模式：先 `角度 × π / 180` 转弧度再计算；
- 反三角 `asin/acos/atan`：结果再按当前模式转回角度；
- `tan(90°)` 处余弦近似 0，直接返回 `∞`（避免出现 1.6e16 这种伪值）；
- 定义域保护：`asin/acos` 限定 `[-1,1]`，`ln/log` 真数须 > 0，`√` 不接受负数，越界抛出中文错误信息。

#### （5）阶乘、排列、组合

- 阶乘 `n!`：循环累乘，非负整数校验，`n > 170` 记为溢出（`∞`）；
- 排列 `A(n,m) = n·(n-1)·…·(n-m+1)`；
- 组合 `C(n,m)`：用递推 `r = r·(n-i)/(i+1)` 计算，避免大阶乘溢出且保证整数结果精确。

#### （6）单位换算（三种换算模型）

| 类型 | 模型 | 分类 |
| --- | --- | --- |
| `ratio` | 按到基准单位的系数换算（`base = v × factor`，再 `/ factorTo`） | 长度、能量、压强、电容、物质的量 |
| `temperature` | 仿射变换（以摄氏为基准做偏移换算） | 温度（℃ / K / ℉） |
| `concentration` | 需额外输入密度 ρ(g/mL) 与摩尔质量 M(g/mol) | 浓度（质量分数 % ↔ mol/L） |

浓度公式：

```
c (mol/L) = 1000 · ρ · w / M     （w 为质量分数小数）
w = c · M / (1000 · ρ)
```

物质的量换算使用 `N_A = 6.022 × 10²³`。

#### （7）一元二次方程

```
Δ = b² - 4ac
Δ < 0  → 无实数根
Δ = 0  → 重根 x = -b / 2a
Δ > 0  → x₁,₂ = (-b ± √Δ) / 2a
```

`|Δ| < 1e-12` 视为 0（防浮点误差导致"伪双根"）；`a = 0` 时提示"不是二次方程"。

---

### 4.2 UI 与交互（`pages/index/index.ux`）

#### （1）三模式切换

顶部胶囊栏切换 `mode`：`calc`（计算器）/ `convert`（单位换算）/ `solve`（方程求解），通过 `if="{{mode === 'calc'}}"` 条件渲染不同面板。

#### （2）计算器：表达式拼接状态机

页面状态：

```
mode / angleMode / expr（内部表达式）/ exprView（美化显示）
result（结果）/ error / justEvaluated（是否刚按=）/ answer（上次结果数值）/ kbPage（键盘页）
```

按键入口 `press(key)`：

- `AC`：清空表达式、结果、求值状态；
- `Del`：智能退格（函数名整体删除，如 `sin(` → 删 `sin`）；
- `=`：调用 `evaluateExpr()` 求值；
- `fn` / `123`：切换键盘页；
- 其余：进入 `append(key)` 做表达式拼接。

`append()` 的拼接规则（关键交互逻辑）：

| 按键类型 | 规则 |
| --- | --- |
| 数字 / 小数点 | 追加；前一位是 `π/e/)` 时自动补 `×`；禁止连续两个小数点 |
| 二元运算符 | 空表达式只允许 `-`；与前一位运算符重复时**替换**（`^` 后允许 `-` 作负指数） |
| 左括号 | 前一位是数字/右括号/常量时自动补 `×(` |
| 右括号 | 左括号数量足够、且前一位不是运算符/左括号时才允许 |
| 常量 π / e | 前置数字时自动补 `×` |
| 函数 sin/cos/…/√/A/C | 插入带左括号的形式（如 `sin(`）；前置数字时自动补 `×` |
| 幂简写 x^y / x² / x³ / e^x / 10^x | 转为 `^`、`^2`、`^3`、`e^`、`10^` |
| 阶乘 n! / 百分比 % | 仅当前一位是操作数时追加后缀 |

求值后行为（`justEvaluated`）：

- 按数字/常量/函数 → 清空，开始新算式；
- 按运算符 → 用上次结果继续运算（`answer` 经 `numToStr` 转成无噪声字符串）。

**实时预览**：每次按键后 `refreshPreview()` 尝试求值，成功则更新结果行，失败则留空，给用户即时反馈。

#### （3）键盘布局（Swiper 双页）

- 第 1 页（基础）：AC / Del / ( / )，7-9、4-6、1-3、0、.、%、÷ × - +，函数切换、=。
- 第 2 页（科学）：AC / Del / x^y / √，sin/cos/tan/π，asin/acos/atan/e，ln/log/x²/x³，e^x/10^x/n!/A，C/,/123/=。

通过 `swiper` 的 `index="{{kbPage}}"` 绑定当前页，`@change` 同步滑动切换。

#### （4）单位换算：双向输入

- 分类横向滚动选择（`for="{{cats}}"`）；
- 单位通过点击按钮循环切换（`cycleFrom` / `cycleTo`）；
- 双向输入：`convFocus` 标记当前编辑侧（from/to），输入哪侧就由哪侧推导另一侧；
- 浓度分类额外显示 ρ、M 两个输入框，缺参数时不做换算并清空结果。

#### （5）方程求解

a/b/c 三个输入行，点击选中（`eqActive`），用共享数字键盘输入；点"求解"调用引擎，展示 Δ 与根。

---

## 五、关键技术决策与踩坑记录

### 5.1 Vela 平台的 CSS / 组件硬约束

与手机快应用相比，Vela 手表对 CSS 和组件的支持更严格，开发中遇到并已修正：

| 约束                        | 现象                                 | 处理方式                                            |
| ------------------------- | ---------------------------------- | ----------------------------------------------- |
| 不支持 `linear-gradient`     | 编译警告                               | 全部改为纯色 `background-color`                       |
| 不支持 `transform`           | 编译警告                               | 去掉按键缩放动效                                        |
| 不支持 `:active` 伪类          | 编译报错 `PseudoClassSelector :active` | 去掉按压动画                                          |
| 不支持后代选择器                  | 编译报错 `Descendant Selector`         | 每个 `text` 单独 class（如 `.key-text`、`.tab-label`）  |
| `box-shadow` 需 APILevel3+ | 平台限制                               | 保留（格式 `x y blur color`）用于粘土质感投影                 |
| `scroll` 横向滚动             | `scroll-direction` 不支持             | 改用 `scroll-x="true"`                            |
| `text` 单行                 | `max-lines` 不支持                    | 改用 CSS `lines: 1`                               |
| 事件传参                      | —                                  | 支持 `@click="fn('arg')"`、`@click="setCat($idx)"` |

### 5.2 图标路径大小写问题（重要的坑）

- `src` 下目录在磁盘上的真实名称是 `Common`（大写 C），而 `manifest.json` 的 `icon` 写的是 `/common/logo.png`（小写）。
- Windows 文件系统大小写不敏感，编译**不报错**；但打包进 rpk 后，图标资源落在 `Common/logo.png`。
- 手表（Linux 内核，大小写敏感）按 `/common/logo.png` 找不到图标 → **图标不显示**。
- 修复：强制重命名目录为小写 `common`，重编后 rpk 内路径与 manifest 完全一致。

> 经验：快应用资源路径务必保证目录名与 manifest 引用**大小写完全一致**。

### 5.3 单位换算的方向问题

最初用"当前聚焦字段"同时决定编辑目标与换算方向，导致切换单位时把上一步的**结果值**当成新输入反向换算。修正为：方向由用户实际输入的一侧决定，切换单位只重算不翻转。

### 5.4 排列组合缺逗号键

`A(n,m)` / `C(n,m)` 需要逗号分隔参数，最初键盘没有逗号键导致无法输入。已在科学页补上 `,` 键并增加逗号拼接校验。

---

## 六、验证与产物

| 验证项 | 方法 | 结果 |
| --- | --- | --- |
| 计算引擎 | `test/test.js`，62 条断言（精度、四则、幂、三角 DEG/RAD、阶乘、排列组合、单位换算、二次方程） | 62/62 通过 |
| UI 逻辑 | `test/ui-sim.js`，提取 `.ux` 的 `<script>` 构造 ViewModel 模拟按键/模式切换/换算/求解 | 30/30 通过 |
| 编译 | `npm run build`（aiot-toolkit） | `build success` |
| 产物结构 | Python `zipfile` 解包校验 rpk 内部条目与 manifest 字段 | 图标 `common/logo.png` 与 `icon=/common/logo.png` 一致；`deviceTypeList=["watch"]`；`entry=pages/index` |

**产物**：`dist/com.sunshine.scienticcalc.debug.1.0.0.rpk`（约 52 KB，aiot-toolkit 内置 debug 签名）。

---

## 七、构建与安装

### 构建

```bash
cd redmi-watch5-calculator
npm install          # 安装 aiot-toolkit、@aiot-toolkit/jsc
npm run build        # 等同 aiot build，产物在 dist/
```

### 安装到手表

1. 用 **AstroBox**（或表盘自定义工具）连接手表（需 Vela 系统设备）；
2. 设备 → 安装应用 → 选择 `dist/*.rpk`；
3. 等待手表端安装进度完成；
4. **重启手表**，在**应用列表**中查看「科学计算器」。

### 若装完不显示，按序排查

1. 重启手表（最常见）；
2. 去应用列表找，而不是表盘桌面；
3. 检查快应用数量是否达上限（Vela 默认最多 20 个）；
4. 若连的是 iPhone，安卓刷入的小程序会被隐藏；
5. 确认安装走完（不是只把文件下载到手机）。

---

## 八、已知限制与后续可优化项

- **签名**：当前为 debug 签名，适合侧载调试；正式发布需替换为 release 签名。
- **box-shadow**：依赖 APILevel3+，极旧平台可能不渲染阴影。
- **真机验证**：编译与逻辑测试均已通过，但最终视觉与触控体验需在真机/模拟器上确认。
- **表达式显示**：超长算式在窄屏上会截断（右对齐保留高位有效数字），可进一步做自动滚动到末尾。

---

## 九、核心代码索引

| 功能 | 文件 | 关键函数 |
| --- | --- | --- |
| 表达式求值 | `src/common/calc.js` | `tokenize` / `parseTokens` / `evaluate` |
| 精度格式化 | `src/common/calc.js` | `cleanArith` / `cleanTrig` / `formatNumber` |
| 单位换算 | `src/common/calc.js` | `convertUnit` / `convertConcentration` |
| 方程求解 | `src/common/calc.js` | `solveQuadratic` |
| 按键状态机 | `src/pages/index/index.ux` | `press` / `append` / `evaluateExpr` |
| 单位换算交互 | `src/pages/index/index.ux` | `setCat` / `cycleFrom` / `recomputeConv` |
| 方程交互 | `src/pages/index/index.ux` | `setEq` / `solveEq` |

---
