---
title: Unity与.NET逆向

date: 2026/1/27
tags:
- .NET
categories:
  - REVERSE
  - ctf逆向中的misc
---



# .NET逆向处理：

拿到exe文件，先拖进dnspy，不识别就拖进ida分析

.NET编译可以是JIT和AOT两种类型



## JIT (Just in Time) —— 即时编译

**一句话解释：** 程序运行的时候，才开始一行一行（或一段一段）地把代码翻译成机器码。

* **流程：**`源代码 (C#)` $\rightarrow$ **编译器** $\rightarrow$ `中间语言 (IL/Bytecode)` $\rightarrow$ `用户运行` $\rightarrow$ **JIT 编译器 (现场翻译)** $\rightarrow$ `机器码`

* **特点：**
  
  * **产物：** 中间语言（IL）。这是一种“半成品”，它保留了极其丰富的原书信息（类名、变量名、结构）。
  
  * **跨平台：** 同一本“英文原著”，带个懂法语的翻译官就能在法国跑（Linux），带个懂德语的就能在德国跑（Windows）。
  
  * **逆向难度低：** 因为 IL 保留了太多信息，dnSpy 这种工具可以直接把 IL “逆向翻译”回源代码，几乎一模一样。

* **典型代表：** 标准的 C#, Java, Python (PyPy), JavaScript (V8)。

* **工具：** **dnSpy**, ILSpy (用来读 IL)。
  
  

## AOT (Ahead of Time) —— 提前编译

**解释：** 在程序运行之前，开发者就已经把代码翻译成了机器能懂的“最终指令”。

* **流程：**
  `源代码 (C#/C++)` $\rightarrow$ **编译器** $\rightarrow$ `机器码 (Machine Code/汇编)` $\rightarrow$ `用户运行`

* **特点：**
  
  * **产物：** 纯粹的机器码（01010...），对应 x86/x64 汇编指令。
  
  * **启动快：** 因为已经翻译好了，打开就能跑。
  
  * **逆向难度大：** 就像你拿到了翻译好的中文书，原文的“句式结构”、“独特的修辞”（即类名、函数名、元数据）很多都丢了。你只能看到最终意思。

* **典型代表：** C, C++, Rust, Go, **C# Native AOT**。

* **工具：** **IDA**, Ghidra (用来读汇编)。 
  
  
  
  

# Unity逆向处理：

unity题型一般分为两个框架：

mono框架IL2CPP 框架

一般unity逆向给你一个文件夹，里面是游戏内容，也可能是打包后的exe，这种打包过的直接后缀改为zip然后解压缩就可以了

## mono：

Mono 后端的 Unity 游戏，本质上就是运行在 Mono 虚拟机上的 .NET 程序。它的逆向流程和你熟悉的普通 .NET 逆向 **90% 是一样的**。

### 核心目标

找到 **`Assembly-CSharp.dll`**。

一般在` Game_Data/Managed/Assembly-CSharp.dll`

* Unity 的游戏逻辑默认都写在这个文件里。

* 其他 `UnityEngine.dll` 等都是官方库，通常不用看。

### 静态分析 (Static Analysis)

* **工具：** **dnSpy** (首选) 或 ILSpy。

* **流程：**
  
  1. 把 `Assembly-CSharp.dll` 拖进 dnSpy。
  
  2. 搜索关键字符串（如 "Cheat", "Coin", "Damage"）。
  
  3. 直接看 C# 源码，逻辑一览无余。

* **修改/破解：**
  
  1. 右键 -> `Edit Method`。
  
  2. 修改代码（例如 `return true;` 绕过校验）。
  
  3. `File` -> `Save Module...` 覆盖原文件。
  
  4. 启动游戏，修改生效。

### 动态调试 (Dynamic Debugging)

* Unity Mono 编译出的游戏通常带有调试符号（或者可以通过 dnSpy 强行调试）。

* 将 `mono-2.0-bdwgc.dll` (Unity 目录下的) 替换为 dnSpy 提供的调试版 mono.dll（如果是老版本 Unity）。

* 在 dnSpy 里选择 `Debug` -> `Start Debugging`，选择游戏 exe，直接下断点调试。

### 常见阻碍

* **DLL 加密：** 有的游戏打开 `Managed` 文件夹，发现 DLL 头部被加密了（dnSpy 报错）。
  
  * **解法：** 使用 **GameGuardian** (安卓) 或 **Process Hacker** (PC) 在游戏运行时将解密后的 DLL 从内存 Dump 出来

* **混淆：** 类似于 BeeByte 等混淆插件。
  
  * **解法：** 使用 **de4dot** 尝试去混淆，或者硬啃。
    
    

## 二、IL2CPP 框架逆向流程

这是现代商业手游和大型 PC 游戏的主流。Unity 这里的操作是：**把 C# 代码转换成 C++ 代码，再编译成机器码。**

IL（中间语言）没了，dnSpy 也就瞎了。你面对的是汇编指令。

### 核心文件

**Android**

源\lib\armeabi-v8a\libil2cpp.so

源\assets\bin\Data\Managed\Metadata\global-metadata.dat

**PC**

<app-name>_Data/il2cpp_data/Metadata/global-metadata.dat

UnityPlayer.dll

其中

**`GameAssembly.dll` (或 .so)：** 存放了所有的代码逻辑（汇编）。

**`global-metadata.dat`：** 存放了所有的字符串、类名、方法名、属性名。**这是解密的钥匙！**

### 神器：Il2CppDumper

你不能直接用 IDA 看 `GameAssembly.dll`，因为里面全是 `sub_123456`，没有名字。`Il2CppDumper` 的作用就是把 `metadata` 里的名字提取出来，贴回到 DLL 上。[GitHub - Jumboperson/Il2CppDumper: Better version of https://github.com/Jumboperson/PokemonGoDumper](https://github.com/Jumboperson/Il2CppDumper)

#### 使用

` Il2CppDumper.exe <executable-file> <global-metadata> <output-directory>`

#### 输出文件

**DummyDll**

文件夹，包含所有还原的DLL文件

使用[dnSpy](https://github.com/0xd4d/dnSpy)，[ILSpy](https://github.com/icsharpcode/ILSpy)或者其他.Net反编译工具即可查看具体信息

可用于提取Unity的`MonoBehaviour`和`MonoScript`，适用于[UtinyRipper](https://github.com/mafaca/UtinyRipper)或者[UABE](https://7daystodie.com/forums/showthread.php?22675-Unity-Assets-Bundle-Extractor)等

**ida.py**

用于IDA

**ida_with_struct.py**

用于IDA, 读取il2cpp.h文件并在IDA中应用结构信息

**il2cpp.h**

包含结构体的头文件

**ghidra.py**

用于Ghidra

**Il2CppBinaryNinja**

用于BinaryNinja

**ghidra_wasm.py**

用于Ghidra, 和[ghidra-wasm-plugin](https://github.com/nneonneo/ghidra-wasm-plugin)一起工作

**script.json**

用于IDA和Ghidra脚本

**stringliteral.json**

包含所有stringLiteral信息

**关于config.json**

* `DumpMethod`，`DumpField`，`DumpProperty`，`DumpAttribute`，`DumpFieldOffset`, `DumpMethodOffset`, `DumpTypeDefIndex`
  
  * 是否在dump.cs输出相应的内容

* `GenerateDummyDll`，`GenerateScript`
  
  * 是否生成这些内容

* `DummyDllAddToken`
  
  * 是否在DummyDll中添加token

* `RequireAnyKey`
  
  * 在程序结束时是否需要按键退出

* `ForceIl2CppVersion`，`ForceVersion`
  
  * 当ForceIl2CppVersion为`true`时，程序将根据ForceVersion指定的版本读取il2cpp的可执行文件（Metadata仍然使用header里的版本），在部分低版本的il2cpp中可能会用到（比如安卓20版本下，你可能需要设置ForceVersion为16程序才能正常工作）

* `ForceDump`
  
  * 强制将文件视为dump文件

* `NoRedirectedPointer`
  
  * 将dump文件中的指针视为未重定向的, 从某些设备dump出的文件需要设置该项为`true`

#### 常见问题

##### `ERROR: Metadata file supplied is not valid metadata file.`

global-metadata.dat已被加密。关于解密的问题请去相关破解论坛寻求帮助，请不要在issues提问！

如果你的文件是`libil2cpp.so`并且你拥有一台已root的安卓手机，你可以尝试我的另一个项目[Zygisk-Il2CppDumper](https://github.com/Perfare/Zygisk-Il2CppDumper)，它能够无视global-metadata.dat加密

##### `ERROR: Can't use auto mode to process file, try manual mode.`

请注意PC平台的可执行文件是`GameAssembly.dll`或者`*Assembly.dll`

你可以打开一个新的issue，并上传文件，我会尝试解决

##### `ERROR: This file may be protected.`

Il2CppDumper检测到可执行文件已被保护，使用`GameGuardian`从游戏内存中dump `libil2cpp.so`，然后使用Il2CppDumper载入按提示操作，可绕过大部分保护

如果你拥有一台已root的安卓手机，可以尝试另一个项目[Zygisk-Il2CppDumper](https://github.com/Perfare/Zygisk-Il2CppDumper)，它能够绕过几乎所有保护





### 静态分析

随后把dll文件或者so文件放入相对应的 IDA，再按 ALT + F7 选择**ida_with_struct.py**，再选择**script.json**，**il2cpp.h**，导入符号表就可以分析了





### 动态分析 (Hook 与 修改)

因为是机器码，你不能像 Mono 那样直接用 dnSpy 修改并保存。通常采用 **Hook (挂钩)** 技术。

* **Frida (安卓/PC)：**
  
  * 编写 JavaScript 脚本，根据函数偏移地址（Offset）进行 Hook。
  
  * 比如：`Interceptor.attach(base_addr.add(0x123456), ...)`，强行修改入参或返回值。

* **Cheat Engine / 内存修改器：**
  
  * 搜索数值，定位内存，编写汇编注入脚本（AA Script）。

* **DLL 劫持 / 注入：**
  
  * 编写一个 C++ DLL，注入到游戏进程，利用 `MinHook` 等库，修改关键函数的逻辑。
    
    
    
    

## IL2CPP框架的metadata混淆（进阶）

### 第一阶段：怎么看 Metadata 是否被混淆？(诊断)

拿到 `global-metadata.dat` 后，不要急着丢进 Dumper，先用 **Hex Editor (如 010 Editor / HxD)** 打开它，看“头”和“身”。

#### 看“魔数”

标准的 `global-metadata.dat` 文件头的前 4 个字节是固定的。

* **正常情况：** 你会看到十六进制：**`AF 1B B1 FA`** (小端序读取就是 `0xFAB11BAF`)。

* **被混淆/加密：** 如果你看到的是乱七八糟的字节（例如 `12 34 56 78` 或完全随机），或者全是 `00`，说明文件头被改了，或者整个文件被加密了。

#### 看 Il2CppDumper 的报错

直接把 `GameAssembly.dll` 和 `global-metadata.dat` 拖进 Il2CppDumper。

* **正常：** 顺利输出 `dump.cs` 和 `script.json`。

* **被混淆：** 控制台会报红字错误：
  
  * `ERROR: Metadata file supplied is not valid metadata file.` (头不对)
  
  * `ERROR: Invalid Sanity` (版本号校验失败)

#### 看熵值

如果文件头是正常的 `AF 1B B1 FA`，但 Dumper 还是报错，可能是**中间混淆**。

* **正常：** Metadata 里会有大量的明文字符串（如 `UnityEngine`, `PlayerController`）。在 Hex Editor 右侧的文本区能看到很多可读单词。

* **被混淆：** 右侧文本区看起来全是乱码，或者看起来像压缩包一样密集。这说明字符串池被加密了。

* * *

### 第二阶段：如果被混淆，该怎么分析？

既然游戏能运行，说明它**一定要在内存里解密 Metadata**。我们的核心思路就是：**等它解密完，直接去抢！**

#### 策略一：内存 Dump 法

既然你已经学会了 **Process Hacker** 和内存提取，这招对你来说最顺手。

**原理：** 游戏启动 -> 读取加密的 metadata -> **在内存中解密** -> 传给 IL2CPP 引擎初始化。我们要做的就是在这个“解密后”的时间点，把那一块内存 Dump 下来。

**操作步骤 (PC端为例)：**

1. **运行游戏**，进入主界面。

2. 打开 **Process Hacker** (管理员)。

3. 在游戏进程内存中搜索特征码 **`AF 1B B1 FA`**。
   
   * 因为解密后的 Metadata 必须恢复这个头，引擎才能识别。

4. 找到后，把从这个头开始的整块内存（通常几 MB 大小）Dump 出来。

5. 把 Dump 出来的文件重命名为 `global-metadata.dat`，配合原来的 `GameAssembly.dll` 丢进 Il2CppDumper。
   
   * _注：这种方法叫“落地还原”。_

**针对安卓端 (Frida/Zygisk)：** 如果是在手机上，手动搜内存太慢，推荐使用自动化工具：

* **Zygisk-Il2CppDumper：** 这是一个 Magisk 模块。安装后启动游戏，它会自动 Hook 游戏的初始化函数，把解密好的 metadata 自动保存到手机存储里。

* **frida-il2cpp-bridge：** 使用 Frida 脚本直接 dump。

#### 策略二：静态逆向解密逻辑

如果你想搞清楚它是怎么加密的（比如为了写通用的解密器），就需要逆向 `GameAssembly.dll`。

**原理：** IL2CPP 引擎加载 Metadata 的代码是开源的。通常入口在 `il2cpp::vm::MetadataLoader::LoadMetadataFile`。开发者通常会修改这个函数，在读取文件后插入一段 `XOR` 或 `AES` 解密代码。

**IDA 分析流程：**

1. **定位加载函数：**
   
   * 在 IDA 中打开 `GameAssembly.dll`。
   
   * 搜索字符串 `"global-metadata.dat"`。
   
   * 找到引用这个字符串的代码位置，通常就是加载函数。

2. **分析修改：**
   
   * 正常代码通常是：`OpenFile` -> `MapFile` -> `Return`。
   
   * 混淆代码通常是：`OpenFile` -> `ReadFile` -> **`Loop (XOR / Shift)`** -> `Return`。
   
   * 那个多出来的 **Loop (循环)** 就是解密算法。

3. **还原：**
   
   * 看懂汇编逻辑（比如只是每个字节异或 `0x77`），自己写个 Python 脚本把文件跑一遍即可还原。

#### 策略三：结构体修复 (针对“重命名”混淆)

有时候文件没加密，但 Il2CppDumper 出来的类名全是 `Class01`, `Method02`。这叫**符号混淆 (Renaming)**。

* **现象：** Dumper 能工作，但出来的名字全是乱码或无意义字符。

* **原因：** 开发者在打包时（通常是 Unity 的 obfuscator 插件）就把原来的英文名替换掉了。

* **对策：**
  
  * **这种无法还原名字**（因为原始名字已经被删了，就像 C++ 编译后一样）。
  
  * **只能靠猜：**
    
    * 看结构：继承自 `MonoBehaviour`，有 `Start`, `Update` 方法。
    
    * 看字符串引用：如果在某个方法里引用了 `"Not enough gold"`，那这个方法大概率是 `BuyItem`。
    
    * 这是最痛苦的逆向，需要结合游戏逻辑慢慢推导。
