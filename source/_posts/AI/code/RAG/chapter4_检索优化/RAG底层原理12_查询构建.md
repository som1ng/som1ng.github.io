---
title: RAG底层原理12:查询构建
date: 2026-04-25 21:00:00
tags:
- AI开发
- RAG
- 查询构建
categories:
- AI
- 开发
- RAG
---

# 前言：

RAG 系统的检索部分，大多数情况下只做向量相似度搜索。

但实际场景里数据不都是非结构化的，会有 SQL 数据库、带元数据的文档、图数据库等。

Query Construction 就是解决这个问题的——用 LLM 把用户的自然语言 query 翻译成对应数据源的结构化查询。

---

# 文本到元数据过滤器：

## 基本思路：

向量索引里的 chunk，常常会带上元数据（Metadata），比如：

- 文档来源
- 发布日期
- 作者
- 章节/类别

这些元数据可以做精确过滤，相当于在语义搜索之上多加了一层 `WHERE` 条件。

## Self-Query Retriever：

LangChain 里实现这个功能的核心组件，工作流程：

1. 定义元数据结构（告诉 LLM 每个字段叫什么、是什么类型）
2. 用户输入自然语言 query
3. LLM 把 query 拆成两部分：
    - **查询字符串**：用于语义搜索的部分
    - **元数据过滤器**：结构化的过滤条件
4. 两个一起发给向量数据库执行

举个例子，query 是"关于2022年发布的机器学习的论文"：

- 查询字符串：`"机器学习的论文"`
- 元数据过滤器：`year == 2022`

## 代码走读：

以 B 站视频为例。

### 数据加载和预处理：

```python
loader = BiliBiliLoader(video_urls=video_urls)
docs = loader.load()

for doc in docs:
    original = doc.metadata
    metadata = {
        'title': original.get('title', '未知标题'),
        'author': original.get('owner', {}).get('name', '未知作者'),  # 嵌套结构要手动提取
        'source': original.get('bvid', '未知ID'),
        'view_count': original.get('stat', {}).get('view', 0),
        'length': original.get('duration', 0),
    }
    doc.metadata = metadata
```

注意这里对元数据做了扁平化处理。原始爬虫获取的信息结构是嵌套 dict，比如 `owner.name`、`stat.view`，直接用 Self-Query Retriever 会识别不到，所以要先手动拉平。

### 定义元数据结构：

```python
metadata_field_info = [
    AttributeInfo(
        name="length",
        description="视频长度，以秒为单位的整数",  # 描述要清晰，LLM 靠这个理解字段含义
        type="integer"
    ),
    AttributeInfo(
        name="view_count",
        description="视频观看次数（整数）",
        type="integer",
    ),
    # ...
]
```

`AttributeInfo`（属性信息） 里的 `description` 很关键，LLM 是根据这个来判断用户 query 里哪些词对应哪个字段的。

### 创建检索器：

```python
retriever = SelfQueryRetriever.from_llm(
    llm=llm,
    vectorstore=vectorstore,
    document_contents="记录视频标题、作者、观看次数等信息的视频元数据",
    metadata_field_info=metadata_field_info,
    enable_limit=True,
    verbose=True
)
```

`from_llm` 内部做了两件事：

1. 创建一个查询构造链，负责把自然语言翻译成通用结构化查询对象
2. 根据 vectorstore 类型（这里是 Chroma）匹配对应的翻译器，把通用对象转成 Chroma 能执行的过滤语法

`temperature=0` 是必要的——这类精确转换任务需要确定性输出，不能有随机性。

### 执行结果：

```
查询: '时长大于600秒的视频'
Generated Query: query=' ' filter=Comparison(comparator=<Comparator.GT: 'gt'>, attribute='length', value=600)
```

可以看到 LLM 成功把"时长大于600秒"转成了 `length > 600` 的过滤条件。

---

# 文本到 Cypher：

## 什么是 Cypher：

图数据库（Neo4j）的查询语言，相当于图数据库里的 SQL。

语法直观，比如：

```
(:Person {name:"Tomaz"})-[:LIVES_IN]->(:Country {name:"Slovenia"})
```

就是描述"Tomaz 住在 Slovenia"这个关系。

## 原理：

和 Self-Query Retriever 基本一样，把"自然语言 → 元数据过滤器"换成了"自然语言 → Cypher 查询语句"。

LangChain 有现成的 `GraphCypherQAChain`，流程：

1. 接收自然语言问题
2. LLM 根据图谱 Schema 生成 Cypher
3. 在图数据库执行
4. （可选）把结果再交给 LLM 生成自然语言回答

这类任务对 LLM 能力要求较高，通常用参数量更大的模型。

---

# 思考题答案：

原文留了一个问题：为什么查询"时间最短的视频"结果是错的？

看输出：

```
Generated Query: query=' ' filter=None limit=1
```

filter 是 None，也就是没有任何过滤条件，只有 `limit=1`。

原因是 Self-Query Retriever 擅长处理**过滤条件**（大于/小于/等于某个值），但处理不了**排序+取极值**的语义。

"时间最短"的正确翻译应该是 `ORDER BY length ASC LIMIT 1`，但 Self-Query Retriever 的查询构造器没有排序能力，LLM 把"最短"识别不了，退化成了 `filter=None limit=1`，最终只是做了一次普通语义检索，跟时长无关。

简单来说：Self-Query Retriever 只能做"过滤"，做不了"排序取最值"。

---

# 参考：

- [LangChain Blog: Query Construction](https://blog.langchain.ac.cn/query-construction/)
- [all-in-rag chapter4](https://datawhalechina.github.io/all-in-rag/#/chapter4/12_query_construction)