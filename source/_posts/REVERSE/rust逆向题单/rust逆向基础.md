---
title: rust逆向基础-rust基础语法
date: 2025-10-01
tags:

- rust
categories:
  - REVERSE
  - rust逆向基础
---

# 前言:

拖了很久的rust逆向都一直没学,正好编译原理要做rust语法分析器,顺便把rust语言学一下

## rust相比其他编程语言的优势:

- rust不通过` GC`(garbage collection)机制管理内存,例如python,golang等基于GC机制的编程语言会在exe运行时不断寻找虚拟地址中无用的内存空间.这会大大降低运行速度

- rust使用所有权机制管理内存,这也使得它相比与手动开辟内存的c/c++更安全

我们rust在逆向中通常用于网络编程,游戏编程,wasm,嵌入式.所以写游戏外挂,实现检测外挂都必须要学习rust.

# 语法:

## 变量:

rust中变量声明要用let.rust中每个变量类型可以自己指定,也可交给编译器推断,每个变量类型可以声明可变也可声明不可变.(注:如果要声明常量类型时,常量名一定要全大写,并且必须显示指定类型.例如` const MAX:u32=10;`)

### 整数类型

* 有符号：`i8, i16, i32, i64, i128, isize`

* 无符号：`u8, u16, u32, u64, u128, usize`

### 浮点数

* `f32`（32 位单精度）

* `f64`（64 位双精度，默认）

### 布尔型

- true

- false

### char型

### 字符串型

* `&str` → 字符串切片（不可变）

* `String` → 堆分配的可变字符串

```rust
fn main() {
    let n: i32= 5; // 变量后的：i32可以自己指定，也可让编译器推断
    let mut i: u32 = 5; // u32 表示32位无符号整数,mut表示可变
    println!("The value of n is {}",n); // println! 用来打印字符串到终端，n代表换行，!代表宏
    println!("The value of i is {}",i);
    i=7;
    println!("The value of i is {}",i);
    let x: f64 = 5.2;
    println!("The value of x is {}",x);
    let y: char ='d';
    println!("The value of y is {}",y);
    let t=true;
    println!("The value of t is {}",t);
    let str: &str="hello";
    println!("The value of str is {}",str);
    let mut s2: String = String::from("Hello");
    s2.push_str(", Rust!");        // 可变字符串
    println!("{}", s2);
}
```

输出结果:

```context
The value of n is 5
The value of i is 5
The value of i is 7
The value of x is 5.2
The value of y is d
The value of t is true
The value of str is hello
Hello, Rust!
```

## 控制语句:

### if-else if-else

```rust
// if
let n = 5;
if n < 0 {
    println!("负数");
} else {
    println!("非负数");
}
```



### 循环

- loop 一直循环

- while 有条件的循环

- for

可以通过break跳出循环,也可以通过continue继续当前循环.这和c++是一样的

```rust
// loop
let mut counter = 0;
let result = loop {
    counter += 1;
    if counter == 10 {
        break counter * 2; // 返回值
    }
};

// while
let mut i = 3;
while i > 0 {
    println!("{}", i);
    i -= 1;
}

// for
let arr = [10, 20, 30];
for val in arr {
    println!("{}", val);
}
```



### Match

match的用法和if-else很像,但是要注意match要把所有情况包含在内,不然编译阶段就报错

```rust
let x = 5;

match x {
    1 | 2 => println!("一或二"),
    3..=7 => println!("三到七之间"), // 范围匹配
    _ => println!("其他"),
}
```



## 函数

### 函数使用

基本的函数定义是`fn fucnction(a:i32,b:i32) -> i32`其中箭头右面的是返回值类型.rust函数表达力非常强

```rust
fn add(a:i32,b:i32)->i32{
    a+b //不加分号，rust会将最后一行作为返回值
}
fn main() {
    let a=1;
    let b=3;
    let res=add(a,b);
    println!("{}",res);//println!()是rust的输出函数，其中第一个参数必须是""包裹的字符串(不能用''替代)，第二个参数是占位符，占位符的值通过{}来传递
}

```

### 闭包:

闭包可以理解成python里的lambda差不多,相当于匿名函数

```rust
fn main() {
    let sum=|a:i32,b:i32|->i32{a+b};//这里定义时是用||包裹参数，调用时和正常函数一样
    let res=sum(1,2);
    println!("The sum is {}",res);
}
```

## rust复合类型

### 枚举:

简单来说，**枚举（`enum`）就是用来表示“一个值可能属于几种互斥情况之一”**，也就是“有限状态或选择”。

换句话说，它适合表示**有多种可能性，但每次只能选一个**的场景。

```rust
enum TrafficLight {
    Red,
    Yellow,
    Green,
}

let light = TrafficLight::Red;
match light {
    TrafficLight::Red => println!("停"),
    TrafficLight::Yellow => println!("准备"),
    TrafficLight::Green => println!("走"),
}
```

### 结构体基础:

结构体和enum不一样的点在于声明结构体时,要把内部变量的类型写出来.而enum就不用

其中对#[derive(Debug)]的解释:

| 部分        | 含义                                                | 记忆小技巧               |
| --------- | ------------------------------------------------- | ------------------- |
| `#[]`     | Rust 的 **属性（attribute）标记**，用来告诉编译器对后面的结构体/枚举做某些处理 | “井号括号 → 给编译器的指令”    |
| `derive`  | 自动 **派生/生成实现** trait 的代码                          | “derive = 自动生成某种功能” |
| `(Debug)` | 指定生成的 trait 是 `Debug`                             | “Debug = 调试打印能力”    |

```rust
#[derive(Debug)]
struct Node{
    x: i32,
    y: i32
}
fn main() {
    let n=Node{x: 1, y: 2};
    let x=n.x;
    let y=n.y;
    println!("{}", x);
    println!("{}", y);
    println!("{:?}", n); //打印结构体或enum类型，要用{:?},配合结构体定义上方的#[derive(Debug)]打印结构体
}
```

### 结构体进阶:

Rust 很多地方受 JavaScript 影响，在实例化结构体的时候用 JSON 对象的 key: value 语法来实现定义：

实例化时:

结构体类名 {
    字段名 : 字段值,
    ...
}

(1)在结构体内部用impl关键字实现内联函数:

```rust
struct Node{
    x: i32,
    y: i32,
}
impl Node{
    fn area(x:i32,y:i32)->i32{
        x*y
    }
}
fn main() {
    let n=Node{x: 1, y: 2};
    let x=n.x;
    let y=n.y;
    let s=Node::area(x, y);
    println!("{}",s);
}
```

 (2)用结构体中self指针实现

```rust
struct Node{
    x: i32,
    y: i32,
}
// impl Node{
//     fn area(x:i32,y:i32)->i32{
//         x*y
//     }
// }
impl Node{
    fn area(&self)->i32{
        self.x*self.y
    }
}
fn main() {
    let n=Node{x: 1, y: 2};
    let x=n.x;
    let y=n.y;
    //let s=Node::area(x, y);
    let s=n.area();
    println!("{}",s);
}
```

(3)结构体实现构造函数

```rust
struct Node{
    x: i32,
    y: i32,
}
impl Node{
    fn new(x:i32,y:i32)->Self{//默认构造函数名都叫new，但这不是个关键字
        Node{
            x:x,
            y:y
        }
    }
    fn area(&self)->i32{
        self.x*self.y
    }
}
fn main() {
    let n=Node::new(1,2);
    let x=n.x;
    let y=n.y;
    let s=n.area();
    println!("{}",s);
}
```

(4)self的用法:

* **`self` 小写** = 当前对象实例指针。

* **`Self` 大写** = 当前类型名。

self指针也分为可变和不可变的,可变的要在self前加关键字mut

```rust
#[derive(Debug)]
struct Person{
    name:String,
    age:u32
}
impl Person{
    fn new(name:String,age:u32)->Self{
        Person{name,age}
    }
    //不可变的this指针
    fn greet(&self)->String{
        format!("Hello,my name is {} and I am {} years old.",self.name,self.age)
    }
    //可变的this指针
    fn up_age(&mut self)->u32{
        self.age+=1;
        self.age
    }
}

fn main() {
    let a=Person::new("原子".to_string(), 18); //“原子”是静态str.&str类型，要转成可变的String
    println!("{:#?}",a); //{:#?}是调试格式，和{:?}的区别是，{:#?}会多出缩进，方便阅读
    println!("{}",a.greet());
    let mut b =a;
    b.up_age();
    println!("{}",b.greet());
}
```

输出:

```context
Person {
    name: "原子",
    age: 18,
}
Hello,my name is 原子 and I am 18 years old.
Hello,my name is 原子 and I am 19 years old.
```

self还有一个不经常用的用法:就是如果传入参数是self(不带&)的话:

```rust
struct Node {
    x: i32,
    y: i32,
}

impl Node {
    // 这里的 self 是按值传递，意味着把 Node 本身交给这个方法
    fn into_tuple(self) -> (i32, i32) {
        (self.x, self.y)
    }
}

fn main() {
    let n = Node { x: 1, y: 2 };
    let t = n.into_tuple();  //  这里 n 被 move 走
    println!("{:?}", t);

    // println!("{:?}", n.x); //  报错：因为 n 的所有权已经交出，不能再用
}


```

### 元组:

1.基本定义:元组就是把多个不同类型的值组合在一起的复合类型。  
语法：

```rust
let tup: (i32, f64, char) = (500, 6.4, 'a');
```

2.访问元素

有两种方式：

方式一：解构

```rust
let tup = (500, 6.4, 'a');
let (x, y, z) = tup;
println!("y 的值是: {}", y);

```

方式二：点语法（下标访问）

注意第一个元素下标是0

```rust
let tup = (500, 6.4, 'a');
println!("第一个元素是: {}", tup.0);
println!("第二个元素是: {}", tup.1);
println!("第三个元素是: {}", tup.2);

```

3.特点:可以包含不同类型的值

长度固定，不能改变

4.打印可利用{:?}来打印

# 核心机制&数据结构

## 栈和堆存放

1. 栈 (Stack) 的特点
* 后进先出 (LIFO) 的数据结构，内存分配和释放都非常快。

* 大小在编译时必须确定。

* 栈上的数据一般是 **固定大小、生命周期明确的值**。

```rust
let x = 42;       // i32，大小固定 4 字节
let y = true;     // bool，1 字节
let z = 'a';      // char，4 字节
let s : &str = 'hello'  //静态字符串切片,长度固定,在栈上
```

2. 堆 (Heap) 的特点
* 内存大小运行时才能确定。

* 需要手动申请（在 Rust 中由所有权系统管理，避免泄漏）。

* 分配和释放开销比栈大，但适合存放 **动态大小或不确定大小的数据**。

## 所有权机制

堆和栈上数据都有所有权的这个概念,但是栈上数据拷贝时不会move(转移所有权),而是使用copy(复制一个样本),堆会move

**栈上的数据**：如果它的类型实现了 Copy trait（比如 i32、bool、char、浮点数、简单元组），那么赋值时不会发生“严格意义上的 move”，而是直接 复制一份值。

- 所以原变量不会失效，看起来像“转移没事”。

实际上这不是“move”，而是 copy。

```rust
fn main() {
    let x = 10;
    let y = x;  // Copy，不是 move
    println!("x={}, y={}", x, y); //  x 还能用
}


```

**堆上的数据**：比如 `String`、`Vec`，它们没实现 `Copy`，赋值时会发生 **move**。

* 所有权转移后，原变量会失效，防止两个变量同时指向同一块堆内存。

```rust
fn main() {
    let s1 = String::from("hi");
    let s2 = s1;   // Move
    // println!("{}", s1); // 报错：s1 已经失效
    println!("{}", s2);   //  只有 s2 能用了
}


```

### 引用和可变引用:

引用 (Reference)

* 引用本质上就是 **借用 (borrow)**。

* 借用不会转移所有权，值的所有者依然是原来的变量。

* 分为：
  
  **不可变引用 (&T)**：可以有多个，但不能和可变引用同时存在。
  
  **可变引用 (&mut T)**：只能有一个，且不能和不可变引用共存。(可变引用要求被引用的变量是可变的)

```rust
fn main() {
    let a:String ="hello world".to_string();
    let r1=&a; //这里就算拷贝给r1,也能成功输出
    println!("{}",a);
}
```

### clone的使用:

```rust
#[derive(Debug,Clone)] //必须结构体里的所有字段都是可拷贝的，才可像正常u32，i32那样使用
struct man{
    name:String,
    age:u32
}
fn main() {
    let a = man{
        name:"原子".to_string(),
        age:18
    };
    let m=a.clone();
    println!("{:?}",a);
}
```

clone就相当于c++中的深拷贝,解决了两个指针指向同一块内存的问题,所以clone之后就可以正常赋值,并接着使用



### 生命周期:

生命周期用语法 `'a` 表示：

```rust
fn example<'a>(s: &'a str) {
    println!("{}", s);
}

```

当结构体里有引用时，必须标注生命周期：

```rust
struct Person<'a> {
    name: &'a str,
    age: u32,
}

fn main() {
    let name = String::from("Alice");
    let p = Person { name: &name, age: 20 }; // name 生命周期必须 ≥ p 生命周期
}

```

生命周期的核心思想:**引用永远不能比它指向的数据活得长**。

编译器在编译期检查生命周期，保证安全。

`'a` 是标识符，用来关联多个引用的生命周期。



## 常用数据结构:

### String:

&str:是String类型的一个切片.长度确定放在栈上.

String一般长度不确定,放在堆上

#### 创建:

```rust
let s1 = String::new();              // 空字符串
let s2 = String::from("hello");      // 从字面量创建
let s3 = "world".to_string();        // &str 转 String

```

#### 添加:

```rust
let mut s = String::from("Hello");
s.push('!');          // 添加单个字符
s.push_str(" World"); // 添加字符串切片

```

#### 拼接:

```rust
let s1 = String::from("Hello");
let s2 = String::from("World");

// 使用 + 或 format! 宏
let s3 = s1 + &s2;           // s1 被移动，s2 被借用
let s4 = format!("{} {}", s2, "!!!");  // 不移动任何变量

```

#### 获取长度和容量

```rust
let s = String::from("hello");
println!("length: {}", s.len());    // 字节数
println!("capacity: {}", s.capacity()); // 堆上分配的容量

```

#### 删除内容

```rust
let mut s = String::from("Hello World");
s.pop();              // 删除最后一个字符
s.clear();            // 清空整个字符串

```

#### 索引与切片

```rust
let s = String::from("hello");
// let c = s[0]; //  String 不支持直接索引
let slice = &s[0..2]; //  切片，返回 &str，必须按字节边界


```

#### 查找和替换

```rust
let s = String::from("hello world");

println!("{}", s.contains("world"));  // true
println!("{}", s.find("world").unwrap()); // 6，找到索引
let new_s = s.replace("world", "Rust");
println!("{}", new_s); // hello Rust

```

#### 分割字符串

```rust
let s = String::from("a,b,c");
let v: Vec<&str> = s.split(',').collect();
println!("{:?}", v); // ["a", "b", "c"]

```

#### 遍历

```rust
let s = String::from("hello");

// 遍历字符
for c in s.chars() {
    println!("{}", c);
}

// 遍历字节
for b in s.bytes() {
    println!("{}", b);
}

```

### Vector:

#### 创建:

```rust
let mut v: Vec<i32> = Vec::new();   // 空 vector
let mut v = vec![1, 2, 3];          // 使用宏 vec! 初始化

```

#### 添加元素

```rust
let mut v = Vec::new();
v.push(10);   // 尾部插入
v.push(20);

```

#### 访问元素

```rust
let v = vec![1, 2, 3, 4];

println!("{}", v[0]);        // 下标访问 (可能 panic 越界)
println!("{:?}", v.get(2));  // 安全访问 -> Some(3)
println!("{:?}", v.get(10)); // None，不会 panic

```

#### 修改元素

```rust
let mut v = vec![10, 20, 30];
v[1] = 200;

```

#### 删除元素

```rust
let mut v = vec![1, 2, 3, 4];
v.pop();          // 删除最后一个 -> Some(4)
v.remove(0);      // 删除指定下标 -> 返回删除的元素 (这里删除 1)

```

#### 遍历

```rust
let v = vec![10, 20, 30];

for x in &v {              // 只读遍历
    println!("{}", x);
}

for x in &mut v {          // 可修改遍历
    *x += 1;
}

```

### HashMap:

相当于c++中stl里的map

```rust
use std::collections::HashMap;

fn main() {
    // 1. 创建一个 HashMap
    let mut scores = HashMap::new();

    // 2. 增加（插入）元素
    scores.insert("Alice", 10);
    scores.insert("Bob", 20);

    // 3. 修改（如果 key 已存在，会覆盖旧值）
    scores.insert("Alice", 30);  // Alice 的值从 10 -> 30

    // 4. 访问（用 get，返回 Option<&V>）
    if let Some(score) = scores.get("Alice") {
        println!("Alice 的分数是 {}", score);
    }

    // 5. 删除（移除某个 key）
    scores.remove("Bob");

    println!("{:?}", scores);
}

```


