---
title: 异常处理机制-VEH

date: 2025/10/9
tags:
- 反调试技术
categories:
  - REVERSE
  - pe逆向
  - 反调试技术
---



# VEH

这是 SEH 的一个增强扩展，通过 `AddVectoredExceptionHandler` 添加。VEH 处理器会在调试器和所有 SEH 处理器**之前**被调用。它们更像是一种“通知”机制，可以观察或拦截进程中的所有异常。

# 与veh有关的函数

| 函数名                                | 作用                                                                         | 参数解释                                                                                                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AddVectoredExceptionHandler**    | 注册一个新的向量化异常处理函数（VEH）。注册后，当线程出现异常（例如访问违规、除零、`RaiseException`）时，系统会回调你提供的函数。 | **ULONG FirstHandler**：是否把此 handler 放在最前面。 `1` → 高优先级（最先被调用） `0` → 低优先级（放在队列后面）**PVECTORED_EXCEPTION_HANDLER VectoredHandler**：回调函数地址，函数类型为 `LONG CALLBACK handler(EXCEPTION_POINTERS* ExceptionInfo)`。返回值控制异常是否继续传播。 |
| **RemoveVectoredExceptionHandler** | 移除已注册的 VEH。                                                                | **PVOID HandlerHandle**：`AddVectoredExceptionHandler` 返回的句柄。                                                                                                                                                          |
| **RaiseException**                 | 主动抛出一个软件异常，会触发 VEH。                                                        | **DWORD dwExceptionCode**：异常码（自定义或系统定义）。**DWORD dwExceptionFlags**：是否可继续执行。`0` 表示可继续，`EXCEPTION_NONCONTINUABLE` 表示不可继续。**DWORD nNumberOfArguments**：额外参数个数。*_const ULONG_PTR _lpArguments__：异常参数数组（可选）。               |
| **EXCEPTION_POINTERS**             | VEH 的回调参数结构，包含异常上下文。                                                       | 成员有两个：**ExceptionRecord**：描述异常的详细信息（代码、参数、地址等）。**ContextRecord**：保存异常发生时 CPU 的寄存器状态（`Rip/Eip`, `Rsp/Esp`, `Rax`, `Rcx`...）。可读写！修改后返回 `EXCEPTION_CONTINUE_EXECUTION` 可以改变执行流。                                          |

## 正向实例：

```c++
// veh_demo.cpp
#include <windows.h>
#include <iostream>
using namespace std;

// ======================= 1. 被“隐藏”的函数 =======================
void SecretFunc()
{
    cout << "[SecretFunc] VEH 修改 RIP 后跳转到这里执行！" << endl;
    cout << "[SecretFunc] 恭喜，VEH 已成功拦截并重定向执行流！" << endl;
    ExitProcess(0);
}

// ======================= 2. VEH 回调函数 =======================
LONG CALLBACK MyVectoredHandler(EXCEPTION_POINTERS* ExceptionInfo)
{
    cout << "[VEH] 异常捕获！" << endl;
    cout << "  ExceptionCode: 0x" << hex << ExceptionInfo->ExceptionRecord->ExceptionCode << endl;
    cout << "  ExceptionAddress: " << ExceptionInfo->ExceptionRecord->ExceptionAddress << endl;

    // 判断是不是我们自己触发的异常（0xDEADC0DE）
    if (ExceptionInfo->ExceptionRecord->ExceptionCode == 0xDEADC0DE)
    {
        cout << "[VEH] 捕获到自定义异常，修改上下文..." << endl;

#ifdef _M_X64
        ExceptionInfo->ContextRecord->Rip = (DWORD64)&SecretFunc; // x64
#else
        ExceptionInfo->ContextRecord->Eip = (DWORD)&SecretFunc;   // x86
#endif

        // 返回 EXCEPTION_CONTINUE_EXECUTION，让程序从修改后的地址继续执行
        return EXCEPTION_CONTINUE_EXECUTION;
    }

    // 其他异常交给系统处理
    return EXCEPTION_CONTINUE_SEARCH;
}

// ======================= 3. 主函数 =======================
int main()
{
    cout << "[Main] 注册 VEH..." << endl;

    // 注册 VEH，优先级高
    PVOID hHandler = AddVectoredExceptionHandler(1, MyVectoredHandler);
    if (!hHandler)
    {
        cerr << "AddVectoredExceptionHandler failed! error=" << GetLastError() << endl;
        return 1;
    }

    cout << "[Main] 准备触发自定义异常..." << endl;

    // 手动触发异常
    RaiseException(0xDEADC0DE, 0, 0, nullptr);

    cout << "[Main] 如果看到这行，说明 VEH 没有拦截执行流。" << endl;

    // 移除 VEH
    RemoveVectoredExceptionHandler(hHandler);
    return 0;
}

```

输出：

```context

[Main] 注册 VEH...
[Main] 准备触发自定义异常...
[VEH] 异常捕获！
  ExceptionCode: 0xdeadc0de
  ExceptionAddress: 00007FF6F8B21000
[VEH] 捕获到自定义异常，修改上下文...
[SecretFunc] VEH 修改 RIP 后跳转到这里执行！
[SecretFunc] 恭喜，VEH 已成功拦截并重定向执行流！

```

 

# 总结：

| 函数                             | 用途       | 常用返回                                    |
| ------------------------------ | -------- | --------------------------------------- |
| AddVectoredExceptionHandler    | 注册 VEH   | 返回 handler 句柄                           |
| RemoveVectoredExceptionHandler | 移除 VEH   | 成功返回非 0                                 |
| RaiseException                 | 主动抛出异常   | 会调用 VEH                                 |
| MyVectoredHandler              | 回调处理异常   | 返回 CONTINUE_EXECUTION 或 CONTINUE_SEARCH |
| ExceptionInfo->ContextRecord   | 保存寄存器上下文 | 可修改以改变执行流                               |
