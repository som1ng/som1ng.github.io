---
title: Windows提权1：信息收集与枚举
date: 2026-03-21 7:00:00
tags:
- 提权
- Windows
- 信息收集
categories:
- ISW
- Windows提权
---

自动化枚举声明
=======

> **写在前面：** 本篇只记录**纯手工**的信息收集命令，用于快速摸底和在极度严苛的杀软环境下生存。
> 
> 如果环境允许，**直接上传 `winPEASany.exe` 并运行**，关于winpeasany.exe用法见上一笔记



# 手工信息收集指南

我们在拿到一个低权限的 Shell 时，脑子里只需要过四个问题：**我是谁？我在哪？系统里运行着什么？有没有人乱扔密码？**
我是谁？(当前用户与特权)

--------------------------------

这是你拿到 Shell 后**应该立刻敲的第一组命令**

决定了你能用哪种提权手法

### 查看当前用户和所在组

* **CMD**:
  
  ```bash
  whoami
  net user
  net localgroup administrators
  ```

* **命令解析**：
  
  * `whoami`：查看当前执行命令的用户身份。
  
  * `net user`：列出当前系统上的所有本地用户（看看有没有可疑的后门用户）。
  
  * `net localgroup administrators`：查看本地管理员组里到底有谁。

* **PowerShell**:
  
  ```bash
  whoami
  Get-LocalUser
  Get-LocalGroupMember -Group "Administrators"
  ```

* **命令解析**：
  
  * `whoami`：同上。
  
  * `Get-LocalUser`：列出本地用户（比 CMD 的输出更详细，包含启用状态）。
  
  * `Get-LocalGroupMember`：查看管理员组的详细成员列表。

* **渗透联想**：看看自己是不是已经在某个高权限组（比如 `Backup Operators` 或 `Administrators`），或者找找系统里有没有其他奇怪的用户（可能是通往下一台机器的线索）。

### 查看当前特权 (极其重要)

* **CMD & PowerShell 通用**:
  
  ```bash
  whoami /priv
  ```

* **命令解析**：
  
  * `whoami /priv`：列出当前用户账户所拥有的所有“Windows 特权”。

* **渗透联想**：别管你是什么用户，只要你在输出结果里看到了 `SeImpersonatePrivilege` (模拟客户端后身份) 或 `SeAssignPrimaryTokenPrivilege` 且状态为 `Enabled` 或 `Disabled`（禁用的也能用），**立刻停止其他信息收集，直接准备土豆提权 (Potato Exploits) 打 SYSTEM**

我在哪？(系统与补丁信息打内核)
--------------------------

如果“土豆”打不通，我们就需要找系统的内核漏洞。内核漏洞能不能成，全看系统打了什么补丁。

内核漏洞我们一般放在最后打

### 查看系统版本与详细信息

* **CMD**:
  
  ```bash
  systeminfo
  ```

* **命令解析**：
  
  * `systeminfo`：输出操作系统的名称、版本号、架构、域信息以及安装的基础补丁等宏观信息。

* **PowerShell**:
  
  ```bash
  Get-ComputerInfo | select OsName, OsVersion, OsArchitecture
  ```

* **命令解析**：
  
  * `Get-ComputerInfo`：精确提取系统名称、具体的内部版本号和系统架构（32位还是64位）。

### 查看已安装的补丁 (KB号)

* **CMD**:
  
  ```bash
  wmic qfe get Caption,Description,HotFixID,InstalledOn
  ```

* **命令解析**：
  
  * `wmic qfe`：查询快速修复工程（补丁）。这段命令可以格式化输出补丁的描述、KB编号和安装时间。

* **PowerShell**:
  
  ```bash
  Get-HotFix | ft -AutoSize
  ```

* **命令解析**：
  
  * `Get-HotFix`：获取系统补丁列表，`ft -AutoSize` 是让输出表格根据内容自动调整列宽，方便阅读。

* **渗透联想**：拿到这些补丁信息（KBxxxxxxx）后，配合我们上一篇讲的 `WES-NG` 工具在 Kali 上离线对比，就能找出靶机漏打了哪个提权补丁（比如 CVE-2023-21768）。

系统里跑着什么？(网络与进程)
------------------------------

寻找脆弱的服务进程

很多时候，靶机对外只开了一个 80 端口，但内网或本地其实跑着很多只有 `127.0.0.1` 才能访问的脆弱服务（比如本地的 MySQL、老版本的第三方软件）。

### 查看网络连接 (寻找本地服务)

* **CMD**:
  
  ```bash
  netstat -ano
  ```

* **命令解析**：
  
  * `netstat -ano`：列出所有活动的网络连接和监听端口（`-a`），以数字形式显示地址和端口（`-n`），并显示对应的进程 ID (PID)（`-o`）。

* **PowerShell**:
  
  ```bash
  Get-NetTCPConnection -State Listen
  ```

* **命令解析**：
  
  * `Get-NetTCPConnection`：仅过滤出状态为 `Listen`（正在监听）的 TCP 端口，输出比 CMD 更清爽。

* **渗透联想**：重点关注监听在 `127.0.0.1` 或 `0.0.0.0` 上的奇怪端口。如果有 `3306` (MySQL) 或 `8080`，可能可以通过端口转发打本地服务的漏洞提权。

### 查看运行中的进程

* **CMD**:
  
  ```bash
  tasklist /SVC
  ```

* **命令解析**：
  
  * `tasklist /SVC`：列出所有进程，并且展示该进程下具体挂载了哪些系统服务（这对排查服务提权非常有用）。

* **PowerShell**:
  
  ```bash
  Get-Process
  ```

* **命令解析**：
  
  * `Get-Process`：列出当前运行的所有进程的基本信息。

* **渗透联想**：看看有没有非微软的杀毒软件（比如 `360tray.exe`, `avp.exe`），或者企业常用的高权限代理客户端。如果有杀软，你的后续操作就要极度小心了。

找密码与第三方服务
---------------------

除了系统本身的漏洞，最大的提权点往往是**人犯的错**：运维把密码写在了文件里，或者安装第三方软件时给了过高的权限。

### 寻找保存的凭据 (凭据管理器)

有些粗心的管理员在使用远程桌面 (RDP) 或访问共享文件夹后，勾选了“记住密码”。

* **CMD & PowerShell 通用**:
  
  ```bash
  cmdkey /list
  ```

* **命令解析**：
  
  * `cmdkey /list`：列出当前用户保存在 Windows 凭据管理器中的所有凭据记录。

* **渗透联想**：如果看到有 `Domain:target...` 的条目，说明这台机器存着某个用户的凭据，后续可以利用 `runas` 或 Mimikatz 提取出来。

### 暴力搜索敏感文件 (找配置文件中的明文密码)

在 Linux 里你用 `grep`，在 Windows 也可以全盘搜

* **CMD**:
  
  ```bash
  findstr /si password *.txt *.xml *.ini *.config
  ```

* **命令解析**：
  
  * `findstr`：文本搜索工具。`-s` 代表递归搜索子目录，`-i` 代表忽略大小写。这句话的意思是：在当前目录及所有子目录下，寻找包含 `password` 字符的这四种文件。 (注：这个命令在 C 盘根目录下跑会很慢，建议在 `C:\inetpub\` 或 `C:\Users\` 下跑)

* **PowerShell**:
  
  ```bash
  Get-ChildItem -Path C:\Users\ -Include *.txt,*.xml,*.ini,*.config -Recurse -ErrorAction SilentlyContinue | Select-String -Pattern "password"
  ```

* **命令解析**：
  
  * 前半句遍历 `C:\Users\` 目录下的目标扩展名文件，忽略报错；后半句用 `Select-String` (类似于 grep) 从这些文件中提取含有 `password` 的行。

### 寻找第三方自启动服务 (Unquoted Service Path 考点)

过滤掉系统自带的 `C:\Windows\` 目录下的服务，只看第三方安装的、且设置为“自动启动”的服务。

* **CMD**:
  
  ```bash
  wmic service get name,displayname,pathname,startmode | findstr /i "auto" | findstr /i /v "c:\windows\\"
  ```

* **命令解析**：
  
  * `wmic service`：获取服务信息。
  
  * 第一个 `findstr "auto"` 过滤出开机自启的服务。
  
  * 第二个 `findstr /v "c:\windows\\"` (`/v` 是反向选择) 过滤掉微软原生的系统服务。

* **PowerShell**:
  
  ```bash
  Get-CimInstance win32_service | Select Name, PathName, StartMode | Where-Object {$_.StartMode -eq 'Auto' -and $_.PathName -notmatch 'C:\\Windows\\'} | fl
  ```

* **命令解析**：
  
  * `Get-CimInstance win32_service`：获取系统服务实例。
  
  * `Where-Object`：过滤掉系统自带服务和非自启服务。
  
  * `| fl`：使用 `Format-List` 格式输出，确保 `PathName`完整显示，不被省略号截断。

* **渗透联想**：如果找出来的服务路径里有空格，且没有用双引号 `""` 括起来（比如 `C:\Program Files\My App\service.exe`），这就是经典的**未引用的服务路径**提权漏洞！
- 例子：
  
  ```bash
  Name      : OfficePLUS Service
  PathName  : C:\Program Files\Microsoft OfficePLUS\3.15.0.34264\addin\MSOfficePLUSService.exe
  StartMode : Auto
  Name      : KingoSoftService
  PathName  : C:\Users\Lenovo\AppData\Local\Kingosoft\Kingo Root\update_15645\bin\KingoSoftService.exe "C:\Users\Lenovo\A
              ppData\Local\Kingosoft\Kingo Root\update_15645\bin\checkupdate.exe"
  StartMode : Auto
  # 路径里有空格且没用""包裹启动路径
  ```
  
  
