---
title: pe中的hook实现

date: 2025/10/9
tags:

- pe_hook
categories:
  - REVERSE
  - pe逆向
  - pe逆向基础
---



# 前言：

pe中的hook技术是指通过 DLL 注入（例如 CreateRemoteThread 注入、SetWindowsHookEx、frida-gadget 等实现方式）将代码注入目标进程，替换目标exe文件中的某个函数为自己的函数，而在这过程中我们没办法获得目标exe源码，只能用另一个进程去操作目标进程。本篇记录了IAT HOOK和inline hook。在日常生活中hook更多还是用frida的插桩技术实现（封装好了），不过底层hook的机制还是要了解，因为frida一旦被全方位检测拦截就没招了

注意：代码来自文末链接，但他讲的有问题，我把正确的代码改进后放在我的文章了

# IAT hook

原理：

进程运行时IAT表里存储了我们函数的真实地址rva，我们如果用注入的dll更改IAT里的地址为我们dll里实现的函数地址，就实现了hook。相当于elf文件中的got表劫持 

头文件：

```c
#pragma once
#include <Windows.h>
void* g_IATaddr = NULL;                // 指向 IAT 条目（存放函数指针的内存地址）
void* g_originalMessageBoxW = NULL;    // 保存原始 MessageBoxW 的函数地址
BOOL installhook(); // 安装钩子
BOOL uninstallhook(); // 卸载钩子
DWORD* getIATaddr(const char* dllname, const char* funcname, WORD ordinal); // 获取IAT地址
```

```c
#include "mydll.h"
#include <stdio.h>
#include <windows.h>
#include<string.h>
int WINAPI hookMessageboxW(HWND hWnd, LPCWSTR lpText, LPCWSTR lpCaption, UINT uType)
{
    MessageBoxA(NULL, "Hooked!", "Hooked", MB_OK);
    // 如果需要调用原函数，可以在这里调用
    return 0;
}
DWORD* getIATaddr(const char* dllname, const char* funcname, WORD ordinal)
{
    HMODULE hModule = GetModuleHandle(0);
    if (hModule == NULL)
    {
        printf("GetModuleHandle failed\n");
        return 0;
    }
    printf("GetModuleHandle success\n");
    DWORD dwmodule = (DWORD)hModule;

    PIMAGE_DOS_HEADER pDosHeader = (PIMAGE_DOS_HEADER)dwmodule;
    PIMAGE_NT_HEADERS pNtHeader = (PIMAGE_NT_HEADERS)(dwmodule + pDosHeader->e_lfanew);
    PIMAGE_OPTIONAL_HEADER pOptionalHeader = &pNtHeader->OptionalHeader;
    PIMAGE_IMPORT_DESCRIPTOR pImageImportTable = (PIMAGE_IMPORT_DESCRIPTOR)(
        pOptionalHeader->DataDirectory[1].VirtualAddress + dwmodule);

    while (pImageImportTable->Name)
    {
        char* iatDllName = (char*)(pImageImportTable->Name + dwmodule);
        if (_stricmp(iatDllName, dllname) == 0)
        {
            PIMAGE_THUNK_DATA pINT = (PIMAGE_THUNK_DATA)(pImageImportTable->OriginalFirstThunk + dwmodule);
            PIMAGE_THUNK_DATA pIAT = (PIMAGE_THUNK_DATA)(pImageImportTable->FirstThunk + dwmodule);

            while (pINT->u1.Function)
            {
                if (pINT->u1.Ordinal & 0x80000000)
                {
                    WORD importOrdinal = (WORD)(pINT->u1.Ordinal & 0xFFFF);
                    if (importOrdinal == ordinal)
                    {
                        return (DWORD*)pIAT;
                    }
                }
                else
                {
                    PIMAGE_IMPORT_BY_NAME pIBN = (PIMAGE_IMPORT_BY_NAME)(pINT->u1.AddressOfData + dwmodule);
                    // 字符串内容比较
                    if (strcmp((char*)pIBN->Name, funcname) == 0)
                    {
                        return (DWORD*)pIAT;
                    }
                }
                pINT++;
                pIAT++;
            }
        }
        pImageImportTable++; // 遍历下一个 DLL
    }
    return 0;
}

BOOL installhook()
{
    if (!g_IATaddr) return FALSE;

    SIZE_T ptrSize = sizeof(void*);
    DWORD oldProtect;
    if (!VirtualProtect(g_IATaddr, ptrSize, PAGE_EXECUTE_READWRITE, &oldProtect)) {
        OutputDebugStringA("installhook: VirtualProtect failed\n");
        return FALSE;
    }

    // 从 IAT 条目读取并保存原始函数指针
    g_originalMessageBoxW = *(void**)g_IATaddr;

    // 写入 hook 函数地址（按指针宽度写入）
    *(void**)g_IATaddr = (void*)hookMessageboxW;

    // 恢复保护
    VirtualProtect(g_IATaddr, ptrSize, oldProtect, &oldProtect);
    return TRUE;
}

BOOL uninstallhook()
{
    if (!g_IATaddr) return FALSE;

    SIZE_T ptrSize = sizeof(void*);
    DWORD oldProtect;
    if (!VirtualProtect(g_IATaddr, ptrSize, PAGE_EXECUTE_READWRITE, &oldProtect)) {
        OutputDebugStringA("uninstallhook: VirtualProtect failed\n");
        return FALSE;
    }

    // 恢复原始函数地址（若已保存）
    if (g_originalMessageBoxW) {
        *(void**)g_IATaddr = g_originalMessageBoxW;
    }

    VirtualProtect(g_IATaddr, ptrSize, oldProtect, &oldProtect);
    return TRUE;
}

BOOL WINAPI DllMain(HINSTANCE hinstDLL, DWORD fdwReason, LPVOID lpvReserved)
{
    if (fdwReason == DLL_PROCESS_ATTACH)
    {
        DisableThreadLibraryCalls(hinstDLL); // 建议保留
        OutputDebugStringA("DLL_PROCESS_ATTACH\n");

        g_IATaddr = getIATaddr("user32.dll", "MessageBoxW", 0);
        if (g_IATaddr) {
            if (!installhook()) {
                OutputDebugStringA("DllMain: installhook failed\n");
            }
            else {
                OutputDebugStringA("DllMain: hook installed\n");
            }
        }
        else {
            OutputDebugStringA("DllMain: getIATaddr returned NULL\n");
        }
    }
    else if (fdwReason == DLL_PROCESS_DETACH)
    {
        OutputDebugStringA("DLL_PROCESS_DETACH\n");
        uninstallhook();
    }
    return TRUE;
}
```

我们可以随便写个主进程函数，然后把这个dll文件注入看能否hook成功。注入dll的方式有很多，可以看我注入dll的那篇。当然最简单是用github上别人造好的轮子来搞dll注入。这里放一个我觉得还不错的项目[GitHub - Joe1sn/S-inject: 支持x86/x64的DLL和Shellcode 的Windows注入的免杀工具，支持图形化界面](https://github.com/Joe1sn/S-inject)

主进程函数：

```c
// main.c
#include <windows.h>

#define ID_BTN_SHOW 1001

// 窗口过程
LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam)
{
    switch (msg)
    {
    case WM_CREATE:
        // 在窗口上创建一个按钮
        CreateWindowW(L"BUTTON", L"点击我弹窗",
                      WS_TABSTOP | WS_VISIBLE | WS_CHILD | BS_DEFPUSHBUTTON,
                      20, 20, 150, 30,
                      hwnd, (HMENU)ID_BTN_SHOW, (HINSTANCE)GetWindowLongPtr(hwnd, GWLP_HINSTANCE), NULL);
        return 0;

    case WM_COMMAND:
        if (LOWORD(wParam) == ID_BTN_SHOW && HIWORD(wParam) == BN_CLICKED) {
            // 按钮被点击 — 弹窗
            MessageBoxW(hwnd, L"Hello World", L"Hello", MB_OK | MB_ICONINFORMATION);
        }
        return 0;

    case WM_DESTROY:
        PostQuitMessage(0);
        return 0;
    }

    return DefWindowProcW(hwnd, msg, wParam, lParam);
}

// 程序入口（GUI 程序使用 WinMain）
int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance, LPSTR lpCmdLine, int nShowCmd)
{
    const wchar_t CLASS_NAME[] = L"SampleWindowClass";

    WNDCLASSW wc = { 0 };
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.lpszClassName = CLASS_NAME;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);

    if (!RegisterClassW(&wc)) {
        MessageBoxW(NULL, L"RegisterClass failed", L"Error", MB_OK | MB_ICONERROR);
        return 0;
    }

    HWND hwnd = CreateWindowExW(
        0,
        CLASS_NAME,
        L"示例 - 点击按钮弹窗",
        WS_OVERLAPPEDWINDOW,
        CW_USEDEFAULT, CW_USEDEFAULT, 300, 150,
        NULL,
        NULL,
        hInstance,
        NULL
    );

    if (!hwnd) {
        MessageBoxW(NULL, L"CreateWindow failed", L"Error", MB_OK | MB_ICONERROR);
        return 0;
    }

    ShowWindow(hwnd, nShowCmd);
    UpdateWindow(hwnd);

    // 消息循环
    MSG msg;
    while (GetMessage(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    return (int)msg.wParam;
}


```

在x64复现成功了，上面代码兼容x86，如果想hookx86程序要在编译时编译成x86dll。我把复现过程的问题列下面：

## 可能出现问题1：

```c
int WINAPI hookMessageboxW(HWND hWnd, LPCWSTR lpText, LPCWSTR lpCaption, UINT uType)
{
    MessageBoxA(NULL, "Hooked!", "Hooked", MB_OK);
    // 如果需要调用原函数，可以在这里调用
    return 0;
}
```

- 这里面hook时用的MessageBoxW，会导致循环调用，会卡死

- 定义hookMessageboxW时没加WINAPI ，这会导致调用约定不一致，会报错

## 可能出现问题2：

不要用他视频里的DWORD来一味声明，不然64位系统里地址是64位，会被截断导致地址错误

## 可能出现问题3：

```c
if (strcmp((char*)pIBN->Name, funcname) == 0)
{
    return (DWORD*)pIAT;
}
```

**症状**：函数查找失败（总找不到目标函数）。  
**原因**：`pIBN->Name == funcname` 比较的是地址而非内容。  
**修复**：用 `_stricmp((char*)pIBN->Name, funcname)` 或 `strcmp`（按是否区分大小写）。

# inline hook

上面的IAT表有个问题，就是不在导入表里的函数你没办法hook啊，所以inline hook就是用来解决这个问题的。

- 原理：

直接修改目标函数的前几条机器指令（通常是函数入口），替换成跳转指令（如 b <new_func> 或 ldr pc, [addr]）；

- 优点：

可以 Hook 几乎任意函数（导出或非导出、静态或动态）

精细控制，适合保护/加壳/代码注入等底层用途

- 缺点：

对 CPU 架构高度依赖（ARM64、ARMv7）

对汇编、内存保护、缓存等有要求（必须关闭写保护）

稳定性较低，不当使用可能 crash

代码：

main.h

```c
#pragma once
#include<iostream>
#include<Windows.h>
int WINAPI MyMessageBoxW(
    _In_opt_ HWND hWnd,
    _In_opt_ LPCWSTR lpText,
    _In_opt_ LPCWSTR lpCaption,
    _In_ UINT uType);
BOOL InstallHook();
BOOL UnInstallHook();

```

main.cpp

```c
#include "mydll.h"
#include <Windows.h>
#include <stdint.h>

uintptr_t g_unhookfun = 0;
BYTE g_oldcode[16] = { 0 }; // 保存原函数前16个字节
BYTE g_newcode[16] = { 0 }; // hook 指令占用前12字节，剩余用 NOP 填充

// 思路：
// 1、找到我们要HOOK函数地址
// 2、保存要HOOK的函数的前16个字节
// 3、构建 mov rax, imm64; jmp rax （12字节）指令写入目标函数前
// 4、安装/卸载时写回/恢复这16字节

int WINAPI MyMessageBoxW(
    HWND hWnd,
    LPCWSTR lpText,
    LPCWSTR lpCaption,
    UINT uType)
{
    UnInstallHook();
    int result = MessageBoxW(hWnd, L"51HOOK", lpCaption, uType);
    InstallHook();
    return result;
}

// 构建 mov rax, imm64; jmp rax （12 字节）
static void BuildMovRaxJmp(BYTE* buf, uintptr_t target)
{
    buf[0] = 0x48; buf[1] = 0xB8; // mov rax, imm64
    memcpy(buf + 2, &target, 8);  // imm64 (little endian)
    buf[10] = 0xFF; buf[11] = 0xE0; // jmp rax
}

// 安装钩子
BOOL InstallHook()
{
    DWORD oldProtect = 0;
    if (g_unhookfun == 0)
    {
        return FALSE;
    }

    // 改写前12字节为 mov rax, imm64; jmp rax
    BuildMovRaxJmp(g_newcode, (uintptr_t)MyMessageBoxW);

    // 把剩下的字节用 NOP 填充（保证覆盖 16 字节）
    for (int i = 12; i < 16; ++i) g_newcode[i] = 0x90;

    if (!VirtualProtect((LPVOID)g_unhookfun, sizeof(g_newcode), PAGE_EXECUTE_READWRITE, &oldProtect)) return FALSE;
    memcpy((void*)g_unhookfun, g_newcode, sizeof(g_newcode));
    VirtualProtect((LPVOID)g_unhookfun, sizeof(g_newcode), oldProtect, &oldProtect);
    FlushInstructionCache(GetCurrentProcess(), (LPCVOID)g_unhookfun, sizeof(g_newcode));
    return TRUE;
}

// 卸载钩子
BOOL UnInstallHook()
{
    DWORD oldProtect = 0;
    if (g_unhookfun == 0)
    {
        return FALSE;
    }
    if (!VirtualProtect((LPVOID)g_unhookfun, sizeof(g_oldcode), PAGE_EXECUTE_READWRITE, &oldProtect)) return FALSE;
    memcpy((void*)g_unhookfun, g_oldcode, sizeof(g_oldcode));
    VirtualProtect((LPVOID)g_unhookfun, sizeof(g_oldcode), oldProtect, &oldProtect);
    FlushInstructionCache(GetCurrentProcess(), (LPCVOID)g_unhookfun, sizeof(g_oldcode));
    return TRUE;
}

// 初始化函数
BOOL InitHook()
{
    // 找到要Hook函数的地址
    HMODULE hModule = LoadLibraryA("user32.dll");
    if (hModule == 0)
    {
        return FALSE;
    }

    g_unhookfun = (uintptr_t)GetProcAddress(hModule, "MessageBoxW");

    // 保存函数的前16个字节（旧函数的前若干字节）
    memcpy(g_oldcode, (void*)g_unhookfun, sizeof(g_oldcode));

    // 构建 hook 指令到 g_newcode（在 InstallHook 会写入）
    BuildMovRaxJmp(g_newcode, (uintptr_t)MyMessageBoxW);
    for (int i = 12; i < 16; ++i) g_newcode[i] = 0x90; // NOP 填充

    return TRUE;
}

BOOL WINAPI DllMain(HINSTANCE hInstance, DWORD callReason, LPVOID lpReserved)
{
    if (callReason == DLL_PROCESS_ATTACH)
    {
        InitHook();
        InstallHook();
    }
    else if (callReason == DLL_PROCESS_DETACH)
    {
        UnInstallHook();
    }
    return TRUE;
}
```

我是在x64程序上复现的，关键在于对jmp指令的处理，x86版本要稍作修改，按视频里的来

# Reference：

【【保姆级教程】16 节吃透 Windows PE 文件格式！从解析到 Hook 攻防全覆盖】https://www.bilibili.com/video/BV1cXT4z7Etf?p=8&vd_source=ef1be23ebedc3f547905767af45d9f93
