---
title: PWN环境配置：强制ELF加载指定libc
date: 2026-03-14 21:45:00
tags:
- pwn
- pwninit
- ld.so
categories:
- PWN
- PWN_ATTACK
- PWN通用问题
---

如何强制 ELF 优先调用同一目录下的 libc？
=========================

在本地调试 Pwn 题目时，为了和远程服务器环境保持一致，我们必须强迫本地的 ELF 程序去加载题目提供的 `libc.so.6`。

**【致命前置警告】**： `libc`（C语言运行库）和 `ld`（动态链接器）是**死绑定的配套组件**！如果你只强制替换了 `libc`，而没有替换系统默认的 `ld`，大概率会在运行瞬间直接报错 `Segmentation fault`。因此，下面的高阶方法都会强调**两者同换**。

实战中，我们只需要掌握以下两种最核心的方法，足以应对 100% 的比赛场景。

## 自动化神器 `pwninit` (实战首选 / 有网环境)

实战中如果你有网络，请直接抛弃任何繁琐的手动步骤，使用这个自动化工具！

### 工具安装

`pwninit` 是基于 Rust 开发的第三方工具，且依赖 `patchelf` 和 `elfutils`，第一次使用前需要在终端执行以下命令进行安装：

```bash
# 1. 安装底层依赖
sudo apt update
sudo apt install patchelf elfutils

# 2. 从 GitHub 下载编译好的 pwninit 二进制可执行文件
wget https://github.com/io12/pwninit/releases/download/3.3.0/pwninit

# 3. 赋予执行权限，并移动到系统环境变量目录 (这样在任何地方都能直接敲 pwninit)
chmod +x pwninit
sudo mv pwninit /usr/local/bin/
```

### 使用方法

1. 把你的 `elf_file` 和 `libc.so.6` 扔进同一个空文件夹。

2. 终端输入一个命令：
      pwninit

3. 工具会自动下载配套的 `ld`，自动执行修改，并生成一个 `elf_file_patched` 的文件。你直接拿带 `_patched` 后缀的文件去做题，环境问题完美解决

底层接管法 —— 直接运行 `ld.so` (断网赛场神技)
---------------------------------

这是 AWDP 线下赛（纯断网环境）或者 `pwninit` 失效时最管用的一招。我们根本不修改原程序，而是去运行动态链接器，把程序当参数传给它。

**前提准备**：你的目录下需要有题目给的 `libc.so.6`，以及从你本地 `glibc-all-in-one` 中找出来的对应版本的 `ld.so`（例如 `ld-linux-x86-64.so.2`）。

### 如何精准获取配套的 ld.so？

该方法的核心前提是找到与题目 `libc.so.6` 绝对匹配的 `ld.so`。可通过以下标准流程获取：

**步骤 A：识别当前 libc 版本** 通过查阅库文件内部的编译信息，确认具体的操作系统与版本号：

```bash
strings libc.so.6 | grep GNU
# 输出示例: GNU C Library (Ubuntu GLIBC 2.31-0ubuntu9.9) stable release version 2.31.
```

**步骤 B：提取对应版本的 ld.so**

* **途径 1 (借助 glibc-all-in-one)**：本地环境应提前部署 `glibc-all-in-one` 工具。进入该工具目录，执行 `./download 2.31-0ubuntu9.18_amd64`。下载完成后，进入 `libs/` 对应的版本目录中，直接提取 `ld-linux-x86-64.so.2`。

* **途径 2 (借助 Docker 镜像)**：若无本地库缓存，可启动对应系统版本的 Docker 容器（例如 `ubuntu:20.04` 对应 glibc 2.31），使用 `docker cp` 命令将容器内 `/lib64/ld-linux-x86-64.so.2` 拷贝至宿主机当前目录。

### 终端调试执行

```bash
./ld-linux-x86-64.so.2 --library-path . ./elf_file
```

_原理_：完美绕过系统的任何默认设置！明确指定了使用当前的 `ld`，并且告诉这个 `ld` 只在当前目录（`.`）找库，最后运行目标程序。**此方法极其稳定，且不需要修改原文件分毫。**

### Pwntools 脚本内联执行 (写在 EXP 里)

在写 Python 漏洞利用脚本时，直接把上面的终端命令变成一个列表传给 `process` 即可：

```py
from pwn import *

# 告诉 pwntools 直接用同目录的 ld 启动程序
p = process(['./ld-linux-x86-64.so.2', '--library-path', '.', './elf_file'])

# 接下来正常进行交互和攻击...
```

附录：glibc-all-in-one 部署与使用指南
--------------------------------------

在断网或无法使用 `pwninit` 时，`glibc-all-in-one` 是获取任意版本 `ld.so` 和带有调试符号的 `libc` 的最强工具。建议在有网环境下提前完成部署并下载常用版本。

### 获取与初始化配置

在终端中依次执行以下命令，将其克隆至本地（建议放在常用的工具目录下，如 `~/tools/`）：

```bash
# 克隆仓库
git clone [https://github.com/matrix1001/glibc-all-in-one.git](https://github.com/matrix1001/glibc-all-in-one.git)

# 进入目录
cd glibc-all-in-one

# 赋予相关脚本执行权限
chmod a+x update_list extract download build

# 拉取最新的可用 glibc 列表 (重要！必须先执行)
./update_list

```

### 下载目标版本的 glibc

当你通过 `strings libc.so.6 | grep GNU` 确认了具体的版本号后（如 `2.31-0ubuntu9.9_amd64`），可以直接通过 `download` 脚本进行下载：

```bash
# 搜索本地支持下载的包
cat list | grep 2.31

# 注意：Ubuntu 官方源会定期清理旧补丁包（如 9.9 版本可能会失效报 404 错误）。
# 必须严格复制上方 `cat list` 输出中存在的版本号！
# 例如终端列表中显示有 2.31-0ubuntu9.18_amd64，则执行：
./download 2.31-0ubuntu9.18_amd64
```

### 提取 ld.so 进行使用

下载完成后，文件会被统一解压并存放在 `glibc-all-in-one/libs/` 目录中。

**获取路径**：`glibc-all-in-one/libs/2.31-0ubuntu9.9_amd64/ld-linux-x86-64.so.2`

在实战中，可直接将该目录下的 `ld-2.31.so` 复制到你的题目目录下，随后配合 **底层接管法 (`./ld-xxx.so --library-path .`)** 或 `patchelf` 进行环境配置。
