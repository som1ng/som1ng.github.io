---
title: wasm逆向基础

date: 2025/11/20
tags:

- wasm
categories:
  - REVERSE
  - js逆向
  - wasm逆向基础
---

# 什么是wasm：

WebAssembly 简称Wasm，是一个低级编程语言。WebAssembly是可移植性的[抽象语法树，被设计来提供比JavaScript更快速的编译及执行。WebAssembly将让开发者能运用自己熟悉的编程语言（最初以C/C +作为实现目标）编译，再藉虚拟机引擎在浏览器内执行。

其中wasm文件的文件格式：
总的来说，`wasm`文件类型设计两种:**.wasm和.wat**  
其中  
**.wasm就是可以直接在浏览器上运行的程序（二进制文件），而.wat是人类可读的.wasm代码的转换**（txt形式文件）

# 静态分析wasm代码

## wabt：

[GitHub - WebAssembly/wabt: The WebAssembly Binary Toolkit](https://github.com/WebAssembly/wabt)

全称 **WebAssembly Binary Toolkit**，是一组专门处理 WebAssembly 的命令行工具，

有了它，你就能得到wasm的类c语言来阅读，或者得到相应的wat格式

.wasm->.c

```bash
wasm2c test.wasm -o test.c
```

.wasm->.wat

```bash
wasm2wat test.wasm -o test.wat
```



## 在ida里分析wasm文件：

我们上面不是拿到了一个test.c吗，我们可以在本地编译这个文件，就可以得到一个类似exe的东西，我们不能执行它，因为这个.c文件没有main函数，wasm的目的只是导出函数共js代码使用。但可以拖进ida pro分析它的导出表



我这里用vitual studio 2022里自带的命令行

` x64_x86 Cross Tools Command Prompt for VS 2022`来编译

```bash
cl /I"D:\ctf\reverse_tools\js逆向\wasm静态分析\wabt-1.0.39\include" test.c /link "D:\ctf\reverse_tools\js逆向\wasm静态分析\wabt-1.0.39\lib\wasm-rt-impl.lib" /out:test.exe
```

效果：

```bash
C:\Users\Lenovo\OneDrive\Desktop>cl /I"D:\ctf\reverse_tools\js逆向\wasm静态分析\wabt-1.0.39\include" test.c /link "D:\ctf\reverse_tools\js逆向\wasm静态分析\wabt-1.0.39\lib\wasm-rt-impl.lib" /out:test.exe
用于 x86 的 Microsoft (R) C/C++ 优化编译器 19.42.34433 版
版权所有(C) Microsoft Corporation。保留所有权利。

test.c
Microsoft (R) Incremental Linker Version 14.42.34433.0
Copyright (C) Microsoft Corporation.  All rights reserved.

/out:test.exe
D:\ctf\reverse_tools\js逆向\wasm静态分析\wabt-1.0.39\lib\wasm-rt-impl.lib
/out:test.exe
test.obj
LINK : fatal error LNK1561: 必须定义入口点

C:\Users\Lenovo\OneDrive\Desktop>
```

然后把生成的.obj文件拖进ida pro看导出表就可以分析了



i32_load形式的函数为取值函数，第一个参数为取值对象，第二个参数为偏移  
i32_store形式的函数为操作存储函数，第一个参数为存储对象，第二个参数为存储位置，第三个参数为操作方式

# 在js代码定位调用的wasm函数

利用 WebAssembly API
----------------------

如果代码里直接出现：

```javascript
WebAssembly.instantiate(buffer, imports)
WebAssembly.instantiateStreaming(fetch('xxx.wasm'), imports)
```

这是最直接的证据，说明加载了一个 `.wasm` 文件。返回值通常包含 `instance.exports`，可以直接访问 WASM 导出函数
Emscripten 封装
-----------------

Emscripten 编译的 WASM 会生成一个 JS “模块对象”，常见特点：

```js
var mod = Module(); // 或者 import * as mod from './module.js'
```

调用 WASM 导出函数通常通过 `mod.cwrap` 或 `mod.ccall`

```js
const fn = mod.cwrap("check", "number", ["string", "number"]);
fn("input", 5);
```

`cwrap` / `ccall` 是 **明显的标志**，说明 JS 调用的是 WASM 函数，而不是普通 JS 函数

cwrap里第一个是wasm函数名，第二个是返回值类型，第三个是参数列表类型
WASM 模块实例方法
-----------

有些代码直接引用 `instance.exports`：

```js
const result = instance.exports.check(inputDataPtr, len);
```

`instance.exports` 的函数都是 WASM 里导出的函数

参数通常是数字或指针（内存地址），因为 WASM 内部是线性内存
内存操作的痕迹
-------

WASM 使用线性内存，JS 里可能会看到：

```js
mod.HEAP8[index] = value;
mod.HEAPU32[offset] = someInt;
```

对 `HEAP8`、`HEAP16`、`HEAP32`、`HEAPU8` 等数组的读写，通常是给 WASM 内存传值

如果没有这些操作，仍然可以调用 WASM，但这种操作是典型特征


