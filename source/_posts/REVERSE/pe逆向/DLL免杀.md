---
title: DLL免杀

date: 2025/10/15
tags:
- DLL
- 免杀
categories:
  - REVERSE
  - pe逆向
  - pe逆向基础
---

# 前言：

整理一下面试准备的攻防知识点，顺便把自己有疑问的地方也记进来。

---

# Windows 调用链

先把基础搞清楚，不然后面的东西没法理解。

```
用户代码
  ↓
Win32 API        kernel32.dll / kernelbase.dll
  ↓
Native API       ntdll.dll          ← 用户态最后一层
  ↓
────────────── Ring3 / Ring0 边界 ──────────────
  ↓
syscall 指令
  ↓
NT 内核          ntoskrnl.exe
```

ntdll 里的 Native API（比如 `NtAllocateVirtualMemory`）本质上只干两件事：

- 把系统调用号（SSN，Syscall Service Number）放进 `eax`
- 执行 `syscall` 陷入内核

相当于一个跑腿的，自己不干活。

---

# Ring3 API Hook
## 防守方：Inline Hook

EDR 把 ntdll 里敏感函数的**前 5 字节**改成 `JMP`，执行流被拐到检测模块。


```asm
; hook 前
NtAllocateVirtualMemory:
    mov r10, rcx      ; 4C 8B D1
    mov eax, 0x18     ; B8 18 00 00 00
    syscall           ; 0F 05
    ret               ; C3

; hook 后
NtAllocateVirtualMemory:
    jmp 0x7FF6_XXXX   ; E9 XX XX XX XX  ← 前5字节没了
    ...
```

EDR 在自己的检测模块里看：内存属性是不是 RWX、调用栈来源是不是正常模块、操作目标是不是其他进程。

漏洞点：hook 写在当前进程地址空间的 ntdll 映射里，执行流不过 ntdll，hook 就失效了。

---

## 攻击方：Direct Syscalls

既然 ntdll 被污染了，就直接跳过它，自己在代码用内联汇编构造 `syscall`。


```asm
; 自己模拟 ntdll 跑腿的工作
mov r10, rcx     ; 备份第一个参数（原因见下）
mov eax, 0x18    ; 直接写 SSN
syscall          ; 陷入内核，ntdll 的 hook 形同虚设
ret
```

**疑问：为什么 x64 要 `mov r10, rcx`？**

64 Windows 调用约定（`fastcall`）里，函数的前四个参数放 `rcx`、`rdx`、`r8`、`r9`。正常函数调用没问题。

但 `syscall` 指令执行时，CPU 硬件行为会把 `rcx` 用来保存用户态返回地址（RIP），`r11` 保存 `RFLAGS`。这是 CPU 规范定死的，没得商量。

所以 `rcx` 里原来的第一个参数就被覆盖了。

ntdll 的解决方式就是在 `syscall` 之前先 `mov r10, rcx`，把第一个参数挪到 `r10`。内核的系统调用处理代码知道这个约定，去 `r10` 取第一个参数，`rdx`/`r8`/`r9` 取后面的参数。

---

## 关键难点：动态获取 SSN

SSN 随 Windows 版本变化，硬编码换台电脑就崩，必须运行时动态拿。

**方案1：读磁盘 ntdll**

从 `C:\Windows\System32\ntdll.dll` 重新读一份文件到内存，解析导出表，找目标函数，读 `mov eax, ??` 的操作数就是 SSN。拿到的是未被 hook 的原始字节，简单可靠。

**方案2：Hell's Gate**

直接读内存里的 ntdll。函数头部可能已经是 `JMP` 了，`mov eax` 没了。

```
目标函数被 hook → 向相邻函数扫描 → 找未被 hook 的函数
→ 提取其 SSN → 利用 SSN 递增规律推算目标 SSN
```

**疑问：SSN 真的严格连续吗？**

ntdll 里 Nt 系列函数的 SSN 按函数名字母序大致递增，但不是绝对严格的，不同版本可能有插入或删除。Hell's Gate 依赖这个规律，主流版本可靠，极端情况需要更健壮的扫描逻辑。

**方案3：SysWhispers**

工具自动生成带动态 SSN 查找的汇编 + 头文件，直接集成进项目，红队最常用。

---
# 阻断 ETW (Event Tracing for Windows) 遥测
## 防守方：ETW 遥测

绕过了 API Hook 还不够，ETW（Event Tracing for Windows）相当于系统的监控摄像头。

敏感 API 被调用时，系统通过 ntdll 里的 `EtwEventWrite` 向外发事件，EDR 订阅这些事件做行为分析。门卫绕过了，摄像头还在。

---

## 攻击方：ETW Patching

`EtwEventWrite` 在 Ring3 跑，进程对自己地址空间里这段内存有修改权限。把初始汇编改为ret；让它一执行就直接返回，什么都不上报。


```c
// 1. 找函数地址
FARPROC pEtw = GetProcAddress(GetModuleHandleA("ntdll.dll"), "EtwEventWrite");

// 2. 改可写
DWORD oldProtect;
VirtualProtect(pEtw, 1, PAGE_EXECUTE_READWRITE, &oldProtect);

// 3. 写 RET
*(BYTE*)pEtw = 0xC3;  // x64 直接 ret

// x86 不能直接写 0xC3，见下面疑问
// 正确做法：33 C0 C2 14 00 （xor eax,eax + ret 0x14）

// 4. 恢复保护
VirtualProtect(pEtw, 1, oldProtect, &oldProtect);
```

**疑问：为什么 x86 不能直接 `0xC3`？**

x86 用 `stdcall`，被调用方负责清理参数栈。直接 `ret` 不清理，调用栈直接坏掉，程序很快崩。`ret 0x14` 表示返回同时弹出 20 字节参数，对应 `EtwEventWrite` 的参数大小。x64 的 `fastcall` 由调用方清栈，所以直接 `0xC3` 没问题。

---

# 延伸点

**PE 头部抹除**

反射注入 DLL 修复好 IAT 和重定位之后，把 MZ/PE 头所在内存页清零。运行起来之后头部没用了，留着是 YARA 内存扫描的特征靶。

**RWX 内存规避**

直接申请 `PAGE_EXECUTE_READWRITE` 是高危特征，现代 EDR 对此极敏感。更好的做法：

```
申请 RW → 写入 shellcode/DLL → VirtualProtect 改为 RX
```

**Indirect Syscall**

内核会检查 `syscall` 的返回地址（RIP），如果 RIP 不在 ntdll 范围内就可疑。Indirect Syscall 的思路：自己设置好 SSN，然后 `JMP` 到 ntdll 里 `syscall` 指令的地址去执行，内核看到的 RIP 仍在 ntdll 内。

---

# 攻防全景

```
EDR 手段                 →    绕过方案
─────────────────────────────────────────────────
ntdll Inline Hook        →    Direct Syscall
ETW 遥测                 →    ETW Patching
RWX 内存检测              →    RW→RX 两步走
内存特征扫描（YARA）       →    PE Header Wiping
syscall RIP 来源检测      →    Indirect Syscall
```