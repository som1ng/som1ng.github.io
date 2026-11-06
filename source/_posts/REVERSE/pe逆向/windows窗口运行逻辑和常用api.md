---
title: windows窗口运行逻辑和常用api

date: 2025/10/15
tags:

- 窗口逆向
categories:
  - REVERSE
  - pe逆向
  - pe逆向基础
---



# 前言：

windows窗口编程就是创造一个窗口并实现消息循环，我们需要逆向的是窗口消息处理函数

# 流程：

## 入口点：

窗口的入口点是WinMain()函数

```c
int WINAPI WinMain(
    HINSTANCE hInstance, 
    HINSTANCE hPreInstance,
    LPSTR lpCmdeLine,
    int nCmdShow
) 
```

- HINSTANCE hInstance ：
  
  * 含义：当前模块（process module）的实例句柄。
  
  * 现代 Windows（32/64 位）中 `HINSTANCE` 与 `HMODULE` 等价，表示模块基址（即 exe 或 dll 的加载基址）。也就是说 `HINSTANCE == HMODULE`。
  
  * 常用场景：作为资源加载的句柄参数（`LoadIcon(hInstance, MAKEINTRESOURCE(IDI_APP))`、`FindResource(hInstance, ...)` 等）；也常用来创建窗口类 `WNDCLASSEX.hInstance`。
  
  * 获取方式：程序入口 `WinMain` 会直接给出；也可以在任意地方用 `GetModuleHandle(NULL)` 获取当前可执行模块句柄，或 `GetModuleHandle("mylib.dll")` 获取指定 DLL 的句柄。
  
  * x86/x64 区别：无差别。都是指向模块基址的句柄（底层为值型，大小随平台指针宽度而定）。
  
  * 只有在16位可执行程序里会有差别，因为16位同时多开exe，并不是独立的分割内存，而如今都是每个进程分配4gb

- HINSTANCE hPreInstance 已废弃，填null即可

- LPSTR lpcmdeline：含义：指向以空字符结尾的命令行字符串（`char*`，ANSI 版 `WinMain` 使用）。

- int nCmdShow：含义：程序窗口的初始显示状态，由操作系统或调用者（例如从快捷方式的“运行方式”设置或 `ShowWindow` 参数）传入。通常传给 `ShowWindow(hwnd, nCmdShow)`。

## 1.创建一个窗口类

```c++
WNDCLASSW myClass = { 0 };
myClass.lpszClassName = L"51hook";
myClass.lpfnWndProc = WindowProc;
```

其中WNDCLASSW的定义：

```c++
typedef struct tagWNDCLASSEX {
    UINT cbSize;
    UINT style;
    WNDPROC lpfnWndProc;    // 窗口过程指针
    int cbClsExtra;
    int cbWndExtra;
    HINSTANCE hInstance;
    HICON hIcon;
    HCURSOR hCursor;
    HBRUSH hbrBackground;
    LPCTSTR lpszMenuName;
    LPCTSTR lpszClassName;
    HICON hIconSm;
} WNDCLASSEX;
```

其中最重要的就是   WNDPROC lpfnWndProc;    // 窗口过程指针。做逆向只需要学会它的用法

## 2.注册窗口类

RegisterClassW(&myClass);

## 3.创建窗口

用 CreateWindowW

```c++
//3.创建窗口
    HWND hwindow = CreateWindowW(
        myClass.lpszClassName,

        L"51hook",
        WS_OVERLAPPEDWINDOW,
        CW_USEDEFAULT,
        0,
        CW_USEDEFAULT,
        0,
        NULL,
        NULL,
        hInstance,
        0
    );
```

函数定义：

```c++
HWND CreateWindowEx(
  DWORD dwExStyle,
  LPCTSTR lpClassName,
  LPCTSTR lpWindowName,
  DWORD dwStyle,
  int x, int y, int nWidth, int nHeight,
  HWND hWndParent,
  HMENU hMenu,
  HINSTANCE hInstance,
  LPVOID lpParam
);

```



* `dwExStyle`/`dwStyle`：窗口扩展样式 / 样式（WS__、WS_EX__）

* `lpClassName`：类名（或 Atom）

* `lpWindowName`：窗口标题（Caption）

* `hMenu`：菜单或子控件 ID（对于子窗口/控件是控件 ID）

* `lpParam`：传递给 `WM_CREATE` 的 `CREATESTRUCT*` 的 `lpCreateParams` 字段（常用于传递指针）  
  逆向：

* `CreateWindowEx` 返回的 `HWND` 常会被存到全局或成员变量中，搜索 `mov [global], eax`（x86）或 `mov [rip+..], rax`（x64）可定位。

* 若使用类 atom（整数），`lpClassName` 参数的高位为小值。

**补充：winapi中A版本和W版本（就是函数后的字母）区别只有参数可不可以是unicode的区别，W版本可以用unicode编码，比如说可以写字符串L'这是unicode编码'**

## 4.显示窗口

ShowWindow(hwindow, SW_SHOWNORMAL);

```c++
BOOL ShowWindow(HWND hWnd, int nCmdShow);
BOOL UpdateWindow(HWND hWnd);
```

* `ShowWindow` 常在窗口创建后调用以显示窗口（`nCmdShow`=SW_SHOW, SW_SHOWNORMAL 等）

* `UpdateWindow` 触发 `WM_PAINT`（如果需要）

## 5.消息循环

```c++
MSG msg;
    while (GetMessage(&msg, NULL, 0, 0))
    {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
```

### GetMessage:

获取消息，如果不是WM_quit就接着循环

### TranslateMessage / DispatchMessage

* `TranslateMessage`：将虚拟键消息转换为字符消息（WM_KEYDOWN -> WM_CHAR）

* `DispatchMessage`：把消息派发到目标窗口的 WndProc（最终调用 `CallWindowProc`）

## 6.分析WndProc

```c++
LRESULT CALLBACK WindowProc(   //消息处理函数
    _In_ HWND   hwnd, //窗口句柄
    _In_ UINT   uMsg, // 接收的消息
    _In_ WPARAM wParam, //小参数，低6位放
    _In_ LPARAM lParam //long 参数，高16位放鼠标x坐标，低16位放鼠标y坐标
) {
    switch (uMsg)
    {
    case WM_CREATE:
        MessageBoxW(hwnd, L"窗口创建了", L"提示", MB_OK);
        break;
    case WM_CLOSE:
        MessageBoxW(hwnd, L"窗口关闭了", L"提示", MB_OK);
        DestroyWindow(hwnd);
        PostQuitMessage(0);
        break;
    default:
        break;
    }
    return DefWindowProcW(hwnd,uMsg,wParam,lParam);
}
```

其中函数参数：

| 参数              | 类型   | 典型用途         | 注意点            |
| --------------- | ---- | ------------ | -------------- |
| `HWND hwnd`     | 窗口句柄 | 唯一标识窗口实例     | 用于区分不同窗口       |
| `UINT uMsg`     | 消息ID | 指定当前消息类型     | 用于 `switch` 分发 |
| `WPARAM wParam` | 辅助参数 | 消息相关状态/标志/ID | 含义因消息而异        |
| `LPARAM lParam` | 扩展参数 | 附加数据，如坐标、句柄  | 依赖消息类型解释       |

最常见的wparam和lparam的用法：

| 消息类型             | wParam 含义                          |
| ---------------- | ---------------------------------- |
| `WM_KEYDOWN`     | 虚拟键码（VK_XXX）                       |
| `WM_LBUTTONDOWN` | 鼠标按键状态（MK_CONTROL / MK_SHIFT 等标志）  |
| `WM_COMMAND`     | 高16位是通知码（如按钮点击），低16位是控件ID(父窗口内的代号) |
| `WM_TIMER`       | 定时器ID                              |

| 消息                                                                                         | lParam 含义                                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| `WM_MOUSEMOVE`(鼠标移动), `WM_LBUTTONDOWN`(鼠标左键被按下) 等                                          | 低16位 = X坐标， 高16位 = Y坐标                                        |
| `WM_COMMAND`(操作菜单、控件，快捷键、加速键，或程序调用 SendMessage(hwnd, WM_COMMAND, …) 时，系统就会发送这个消息给对应的窗口过程。) | 如果来自控件（子窗口）：lParam 是该控件的 HWND。如果来自菜单/加速键：lParam 为 0（因此可以用来区分） |

具体消息和处理逆向我们还需要进一步积累，这里只是起抛砖引玉的作用 

# 实际例子：

```c++
#include<Windows.h>
#include<iostream>
LRESULT CALLBACK WindowProc(   //消息处理函数
    _In_ HWND   hwnd,
    _In_ UINT   uMsg,
    _In_ WPARAM wParam,
    _In_ LPARAM lParam
) {
    switch (uMsg)
    {
    case WM_CREATE:
        MessageBoxW(hwnd, L"窗口创建了", L"提示", MB_OK);
        break;
    case WM_CLOSE:
        MessageBoxW(hwnd, L"窗口关闭了", L"提示", MB_OK);
        DestroyWindow(hwnd);
        PostQuitMessage(0);
        break;
    default:
        break;
    }
    return DefWindowProcW(hwnd,uMsg,wParam,lParam);
}
int WINAPI WinMain(
    HINSTANCE hInstance,
    HINSTANCE hPreInstance,
    LPSTR lpCmdeLine,
    int nCmdShow
) 
{
    //1.创建一个窗口类
    WNDCLASSW myClass = { 0 };
    myClass.lpszClassName = L"51hook";
    myClass.lpfnWndProc = WindowProc;
    //2.注册窗口类
    RegisterClassW(&myClass);
    //3.创建窗口
    HWND hwindow = CreateWindowW(
        myClass.lpszClassName,
 
        L"51hook",
        WS_OVERLAPPEDWINDOW,
        CW_USEDEFAULT,
        0,
        CW_USEDEFAULT,
        0,
        NULL,
        NULL,
        hInstance,
        0
    );
    //4.显示窗口
    ShowWindow(hwindow, SW_SHOWNORMAL);
​
    //5.获取消息
    MSG msg = { 0 };
    while (GetMessageW(&msg, 0,0,0)) {
        DispatchMessageW(&msg);//分发消息给消息处理函数
    }
​
    return 0;
}
```


