---
title: 异常处理机制-SEH

date: 2025/10/9
tags:
- 反调试技术
categories:
  - REVERSE
  - pe逆向
  - 反调试技术
---

# SEH

结构化异常处理（SEH）是 C 的Microsoft扩展，C++用于处理某些异常代码情况（如硬件故障）正常。 尽管 Windows 和 Microsoft C++支持 SEH，但我们建议在 C++ 代码中使用 ISO 标准C++异常处理。 它使代码更具可移植性和灵活性。 但是，若要维护现有代码或特定类型的程序，仍可能需要使用 SEH。



## 异常出现流程：

**首先异常被交给内核态 / 最底层****

当 CPU 检测到一个错误（如无效内存访问），它会中断当前进程，并将控制权交给 Windows 内核。内核会为进程创建一个**异常记录**（`EXCEPTION_RECORD`），其中包含异常代码、地址等信息。然后内核会查看进程是否正在被调试。

* **如果进程被调试**：内核将异常事件发送给调试器（**第一机会异常**）。调试器可以决定处理这个异常（继续执行）或不处理。

* **如果进程未被调试，或调试器不处理**：内核开始在用户态中寻找能处理这个异常的函数。

**如果异常未能被处理，则在用户态等待被veh处理，若无veh，则交给seh**

**如果链式seh，veh未能处理**，

* 当进程中发生异常时,此时会调用系统的`kernel32!UnhandledExceptionFIlter()`API。
* 该API会运行系统的最后一个异常处理器——**Top Level Exception Filter**或**Last Exception Filter**（通常行为是弹出错误消息框、终止进程）。
* `kernel32!UnhandledExceptionFilter()`调用了`ntdll!QueryInformationProcess(ProcessDebugPort)`。来判断是否正在调试进程。如果正在进行调试，则将异常传递给调试器。否则系统异常处理器终止进程。

# SEH结构体

```c
typedef struct _EXCEPTION_REGISTRATION_RECORD
{
    // 链表以Next成员为FFFFFFFF的结构体结束，表示链表的最后一个结点
    PEXCEPTION_REGISTRATION_RECORD Next;
    // Handler：异常处理函数
    PEXCEPTION_DISPOSITION Handler;
} EX

```



# SEH语法

```c
try-except-statement ：
  __try compound-statement __except ( filter-expression ) compound-statement

try-finally-statement ：
  __try compound-statement __finally compound-statement
```

# 正向实例：

## (a) `__try` / `__except` - 异常处理程序

```c++
#include <windows.h>
#include <excpt.h>
#include <stdio.h>

int main() {
    __try {
        // 可能会引发异常的代码
        int* p = NULL;
        *p = 42; // 这将引发一个访问违规异常 (EXCEPTION_ACCESS_VIOLATION)
    }
    __except(GetExceptionCode() == EXCEPTION_ACCESS_VIOLATION ? EXCEPTION_EXECUTE_HANDLER : EXCEPTION_CONTINUE_SEARCH) {
        // 异常过滤器返回 EXCEPTION_EXECUTE_HANDLER 时，执行这个块
        printf("Caught an access violation exception!\n");
        // 这里可以进行错误恢复、清理、记录日志等操作
    }

    printf("Program continues after handling the exception.\n");
    return 0;
}
```

* **`__try` 块**：包含可能出错的代码。

* **`__except` 块**：异常处理程序。**它是否能执行取决于其括号内的“异常过滤器表达式”**。

* **异常过滤器表达式**：这是一个必须返回以下三个值之一的表达式：
  
  * `EXCEPTION_EXECUTE_HANDLER` (1)： **执行处理程序**。系统会展开堆栈（清理 `__try` 块中已构造的局部 C++ 对象可能会成为问题），然后跳转到 `__except` 块。
  
  * `EXCEPTION_CONTINUE_SEARCH` (0)： **不处理**。系统继续向上一个（外层）的异常处理程序寻找能处理的 `__except` 块。
  
  * `EXCEPTION_CONTINUE_EXECUTION` (-1)： **继续执行**。从异常发生处重新开始执行。**极其危险！** 除非你能在过滤器里修复导致异常的问题（如虚拟内存分配），否则通常会立刻再次触发同一个异常，导致死循环。

其中的GetExceptionCode()函数值包含`EXCEPTION_ACCESS_VIOLATION`, `EXCEPTION_INT_DIVIDE_BY_ZERO`, `EXCEPTION_STACK_OVERFLOW`等等，对应不同出错类型



## (b) `__try` / `__finally` - 终止处理程序

这种结构**不处理异常**，而是保证无论 `__try` 块是如何退出的（正常执行完毕、`return`、`goto`、`break` 或由于异常），`__finally` 块中的代码**一定会被执行**。用于实现资源清理（如关闭文件、释放锁）。

```c++
HANDLE hFile = INVALID_HANDLE_VALUE;

__try {
    hFile = CreateFileA("test.txt", ...);
    if (hFile == INVALID_HANDLE_VALUE) {
        __leave; // 跳转到 __finally 块的另一种方式
    }
    // 对文件进行一些操作，可能会引发异常
    SomeRiskyOperation(hFile);
}
__finally {
    // 无论上面如何退出，这里都会执行
    if (hFile != INVALID_HANDLE_VALUE) {
        CloseHandle(hFile);
        hFile = INVALID_HANDLE_VALUE;
    }
}
// 执行完 __finally 后，异常（如果有）会继续向外传播
```





# 逆向实战：

注意：32位pe和64位peSEH使用方式不同，注意甄别

## 1.32位例题：

```asmatmel
.text:00401140                 push    ebp
.text:00401141                 mov     ebp, esp
.text:00401143                 push    0FFFFFFFEh
.text:00401145                 push    offset stru_403758
.text:0040114A                 push    offset SEH_401140
.text:0040114F                 mov     eax, large fs:0
.text:00401155                 push    eax
```

在使用SEH的函数汇编你会看到这样一段

第一第二行是创建函数的基本操作，这里不多解释，第三行0xFFFFFFFE叫做`Trylevel/`enclosing``

`-1` (`0xFFFFFFFF`) 表示：函数中没有任何 try/except（即编译器没生成 ScopeTable）。

`-2` (`0xFFFFFFFE`) 表示：函数有 ScopeTable，但**当前没有任何激活的 try 块**。

所以翻译过来就是目前这个seh只有一层(还没进入try)，具体进入try的部分见什么修改了Trylevel,如下最后是try结束

```asmatmel
.text:004011B3                 mov     [ebp+ms_exc.registration.TryLevel], 0 //try开始
.text:004011BA                 mov     [ebp+var_38], 0
.text:004011C1                 mov     eax, [ebp+var_1C]
.text:004011C4                 mov     edx, [ebp+var_24]
.text:004011C7                 mov     ecx, [ebp+var_20]
.text:004011CA                 mov     ebx, [ebp+arg_0]
.text:004011CD                 div     [ebp+var_38]    //明显除0异常
.text:004011D0                 mov     [ebp+ms_exc.registration.TryLevel], 0FFFFFFFEh //try结束
```

第4行`push offset stru_403758`

* 把指向 `.rdata` 中 scope table（你之前贴的 `stru_403758`） 的地址压栈。

* 这个表包含了 filter/handler 的地址、cookie 偏移等，运行时的异常处理器用它来决定**哪个 try/except（或 finally）块应该响应当前异常**

第5行`push offset SEH_401140`

* 把一个“handler 地址”或“该函数专用的异常处理 stub”的地址压栈。IDA 给它取名为 `SEH_401140`（或许是个局部的 handler/veneer）。

* 当异常发生并且运行时走到这个注册记录时，系统会调用这个 handler（这个 handler 通常是编译器生成的代码 / 运行时枢纽，它会读取 scope table，调用相应的 filter/handler 函数

第6行`mov eax, large fs:0`

* 从 `fs:[0]` 读取当前线程的 SEH 链表头（在 x86 Windows 中，FS 段基址指向 TIB，TIB 的第一个 dword 就是 SEH 链表头）。`large` 是汇编器的语法，表示读取完整的 32 位值。

* 把当前链表头（即“之前的注册记录”的指针）读出来保存到 EAX。

第7行`push eax`

* 把旧的 `fs:[0]`（即之前的链表头）压栈 —— 这就是新注册记录的 `Next` 字段（保存链表的前驱，以便函数退出时能恢复）。

* 在压栈/设置 `fs:[0]` 后，新的记录就会被插到链表最前面，变成当前活动的异常注册记录。

退出函数时解除seh

```asmatmel
loc_401268:
    mov     ecx, [ebp+ms_exc.registration.Next]
    mov     large fs:0, ecx        ; 恢复 fs:[0] = 上一个 SEH 节点
    pop     ecx
    pop     edi
    pop     esi
    pop     ebx
    mov     esp, ebp
    pop     ebp
    retn

```



# 总结逆向流程：

我们需要在stru_403758找到相应的过滤函数，和处理异常函数，该题中

```asmatmel
                stru_403758     dd 0FFFFFFFEh           ; GSCookieOffset
.rdata:00403758                                         ; DATA XREF: sub_401140+5↑o
.rdata:0040375C                 dd 0                    ; GSCookieXOROffset
.rdata:00403760                 dd 0FFFFFFB0h           ; EHCookieOffset
.rdata:00403764                 dd 0                    ; EHCookieXOROffset
.rdata:00403768                 dd 0FFFFFFFEh           ; ScopeRecord.EnclosingLevel
.rdata:0040376C                 dd offset loc_4011D9    ; ScopeRecord.FilterFunc
.rdata:00403770                 dd offset loc_4011DF    ; ScopeRecord.HandlerFunc
```

前3个没什么用，第四个是我们上面的Trylevel，第5个是过滤函数，第6个是我们的处理函数，也就是ctf中反调试替换掉的逻辑

```asmatmel
               loc_4011D9:                             ; DATA XREF: .rdata:stru_403758↓o
.text:004011D9                 mov     eax, 1
.text:004011DE                 retn
.text:004011DF ; ---------------------------------------------------------------------------
.text:004011DF
.text:004011DF loc_4011DF:                             ; DATA XREF: .rdata:stru_403758↓o
.text:004011DF                 mov     esp, [ebp+ms_exc.old_esp]
.text:004011E2                 mov     edi, [ebp+var_24]
.text:004011E5                 mov     ecx, edi
.text:004011E7                 shr     ecx, 4
.text:004011EA                 mov     eax, edi
.text:004011EC                 shl     eax, 5
.text:004011EF                 xor     ecx, eax
.text:004011F1                 add     ecx, edi
.text:004011F3                 mov     eax, [ebp+arg_0]
.text:004011F6                 mov     eax, [eax]
.text:004011F8                 add     eax, [ebp+var_20]
.text:004011FB                 xor     ecx, eax
.text:004011FD                 xor     [ebp+var_1C], ecx
.text:00401200                 push    offset Buffer   ; "Something happend..."
.text:00401205                 call    ds:puts
.text:0040120B                 add     esp, 4
.text:0040120E                 mov     [ebp+ms_exc.registration.TryLevel], 0FFFFFFFEh
.text:00401215                 mov     esi, [ebp+var_28]
```

这里过滤函数返回值保存在eax中，这里也就是返回了1，说明EXCEPTION_EXECUTE_HANDLER要处理这个异常，把原函数逻辑替换为下面的处理函数然后就可以接着进行逆向分析了，try中遇到error，那条出错指令汇编跳过，执行exception指令，然后执行try{}下面的语句。
