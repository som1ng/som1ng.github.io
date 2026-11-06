---
title: RAG底层原理13:Text2SQL
date: 2026-04-25 22:00:00
tags:
- AI开发
- RAG
- Text2SQL
categories:
- AI
- 开发
- RAG
---
# 前言

上一节的 Self-Query Retriever 是把自然语言翻译成向量数据库的元数据过滤条件。

这一节换了一个场景——把自然语言翻译成能够在关系型数据库（MySQL、PostgreSQL、SQLite 等）上执行的 SQL 语句。

本质上，两者做的是同一件事：

**利用 LLM 将自然语言转换为结构化查询语言，再交由数据库完成检索。**

不同的是，Self-Query 面向向量数据库的元数据过滤，而 Text2SQL 面向关系型数据库的 SQL 查询。

在 Text2SQL 场景中，向量库中存储的通常不是业务数据本身，而是数据库的结构化描述信息，例如表结构（DDL）、字段含义、表之间的关联关系以及示例 SQL 等。**RAG 的作用是帮助模型理解“数据库长什么样”，从而生成正确的 SQL，而不是直接返回问题的答案。**

因此，一个典型的 Text2SQL 流程如下：
```
用户问题 → RAG 检索数据库 Schema 信息 → LLM 生成 SQL → SQL 执行器查询数据库 → 返回查询结果 → LLM 组织最终答案
```

其中，真正的业务数据仍然保存在关系型数据库中。SQL 可以由人工执行，也可以由后端程序、Agent、Function Calling 或 MCP Tool 等自动执行。本节重点关注如何利用 RAG 帮助模型理解数据库结构并生成正确的 SQL，至于 Agent 的自动查询流程将在其他模块中介绍。
![](https://datawhalechina.github.io/all-in-rag/chapter4/images/4_3_1.webp)

---

# 核心挑战：

Text2SQL 看起来直觉上很简单，但实际落地有三个主要问题：

**幻觉**：LLM 可能"脑补"出数据库里根本不存在的表名或字段名，生成的 SQL 执行直接报错。

**Schema 理解不足**：要生成带 `JOIN` 和 `WHERE` 的正确 SQL，LLM 必须理解表结构、字段含义、表间关系。没有这些信息就是蒙。

**输入模糊**：用户的提问会有拼写错误、业务术语（比如"花费"对应数据库里的 `cost` 字段），需要额外的容错和语义映射。

---

# 优化策略：

## 提供精确的 Schema：

最基础的一步。

把相关表的 `CREATE TABLE` 语句塞进 Prompt，相当于给 LLM 一张地图，让它知道有哪些表、字段叫什么、类型是什么。

没有这个，后面什么优化都没用。

## Few-shot 示例：

在 Prompt 里加几个"问题 → SQL"的示例对。

LLM 看了范例就能学到构建查询的模式，准确率提升明显。

## RAG 增强上下文：

这是 RAGFlow 的方案，更进一步。

单独为数据库建一个知识库，存三类知识：

- **DDL**：表结构定义（`CREATE TABLE` 语句）
- **Q-SQL 示例**：历史问答对，"问题 → SQL"
- **描述信息**：每个表、每个字段的业务含义，以及同义词映射（比如"花费" → `cost`）

用户提问时，先从知识库检索最相关的上下文，再拼进 Prompt 送给 LLM。

比直接把全库 Schema 塞进去要精准，Token 消耗也少。

## 错误修正（Reflection）：

SQL 生成后立即执行，如果数据库返回报错，把错误信息反馈给 LLM，让它修正 SQL 再重试。

最多重试 N 次。

这个机制能显著提高成功率，特别是处理复杂查询的时候。

---

# 框架实现（RAGFlow 方案）：

技术栈：Milvus + BGE-M3 + DeepSeek + SQLite。

三个模块：知识库、SQL生成器、Agent。

## 知识库模块（`knowledge_base.py`）：

```python
class SimpleKnowledgeBase:
    def __init__(self, milvus_uri: str = "http://localhost:19530"):
        self.client = MilvusClient(uri=milvus_uri)
        self.embedding_function = BGEM3EmbeddingFunction(use_fp16=False, device="cpu")
        self.collection_name = "text2sql_kb"
```

Collection 里只有一张表，用 `type` 字段区分三种知识：

```python
FieldSchema(name="type", dtype=DataType.VARCHAR, max_length=32)
# type 取值：ddl / qsql / description
```

这样 DDL、示例、描述全存在一起，检索时统一语义搜索，不需要维护多个集合。

检索用内积相似度：

```python
search_params={"metric_type": "IP"},  # 内积相似度
```

## SQL 生成模块（`sql_generator.py`）：

```python
self.llm = ChatDeepSeek(
    model="deepseek-chat",
    temperature=0,  # 确定性输出，相同输入相同结果
)
```

Prompt 结构固定，分三层：

```python
prompt = f"""你是一个SQL专家。请根据以下信息将用户问题转换为SQL查询语句。

数据库信息：
{context}    # 从知识库检索来的上下文，按 DDL→描述→示例 的顺序组织

用户问题：{user_query}

要求：
1. 只返回SQL语句，不要包含任何解释
...
SQL语句："""
```

上下文按类型分层组织：

```python
def _build_context(self, knowledge_results):
    # 分组
    ddl_info = [r for r in results if r['type'] == 'ddl']
    qsql_examples = [r for r in results if r['type'] == 'qsql']
    descriptions = [r for r in results if r['type'] == 'description']

    # 顺序：结构 → 描述 → 示例
    context += "=== 表结构信息 ===\n"
    context += "=== 表和字段描述 ===\n"
    context += "=== 查询示例 ===\n"
```

错误修复时用同一个知识库上下文，把原始 SQL 和报错一起喂给 LLM：

```python
def fix_sql(self, original_sql, error_message, knowledge_results):
    prompt = f"""请修复以下SQL语句的错误。
...
原始SQL：{original_sql}
错误信息：{error_message}
请返回修复后的SQL语句（只返回SQL，不要解释）："""
```

## Agent（`text2sql_agent.py`）：

控制整个流程，核心参数：

```python
self.max_retry_count = 3    # 最大重试次数
self.top_k_retrieval = 5    # 知识库检索数量
self.max_result_rows = 100  # 结果行数上限
```

主流程：

```python
def query(self, user_question: str):
    # 1. 知识库检索
    knowledge_results = self.knowledge_base.search(user_question, self.top_k_retrieval)

    # 2. 生成 SQL
    sql = self.sql_generator.generate_sql(user_question, knowledge_results)

    # 3. 执行 + 重试
    retry_count = 0
    while retry_count < self.max_retry_count:
        success, result = self._execute_sql(sql)
        if success:
            return {"success": True, "sql": sql, "results": result}
        else:
            sql = self.sql_generator.fix_sql(sql, result, knowledge_results)  # 出错则修复
            retry_count += 1
```

执行时自动加 `LIMIT`，防止全表扫描把结果炸出来：

```python
def _execute_sql(self, sql: str):
    if sql.strip().upper().startswith('SELECT') and 'LIMIT' not in sql.upper():
        sql = f"{sql.rstrip(';')} LIMIT {self.max_result_rows}"  # 兜底保护
```

结果以结构化 dict 返回，列名和数据分开：

```python
return True, {
    "columns": ["id", "name", "age", "city"],
    "rows": [{"id": 2, "name": "李四", "age": 32, "city": "上海"}],
    "count": 2
}
```

---

# 完整流程走一遍：

以"年龄大于30的用户有哪些"为例。

**Step 1：知识库检索**

BGE-M3 把 query 向量化，Milvus 返回 top-5 相关知识：

- DDL（相似度 0.85）：users 表结构，含 id/name/email/age/city 字段
- Q-SQL 示例（相似度 0.82）："查询年龄超过25岁的用户" → `SELECT * FROM users WHERE age > 25`
- 描述（相似度 0.78）：age 字段是整数，表示用户年龄

注意这里检索到的示例是 `age > 25`，不是 `age > 30`。LLM 会从示例里学到模式（`WHERE age > 数值`），然后把实际数值 30 替换进去。

**Step 2：SQL 生成**

LLM 分析 query → 识别字段（age）、操作符（大于）、阈值（30）→ 参考示例模式 → 生成：

```sql
SELECT * FROM users WHERE age > 30
```

**Step 3：执行**

Agent 自动加 LIMIT：

```sql
SELECT * FROM users WHERE age > 30 LIMIT 100
```

SQLite 逐行过滤，李四（32）和赵六（35）符合，最终返回：

```json
{
    "success": true,
    "sql": "SELECT * FROM users WHERE age > 30 LIMIT 100",
    "results": {
        "columns": ["id", "name", "email", "age", "city"],
        "rows": [
            {"id": 2, "name": "李四", "age": 32, "city": "上海"},
            {"id": 4, "name": "赵六", "age": 35, "city": "深圳"}
        ],
        "count": 2
    },
    "retry_count": 0
}
```

---

# 为什么不用现成框架：

LangChain 之类的高封装框架存在黑盒问题。

查询结果不对的时候，不知道是检索环节出了问题、还是 SQL 生成的问题、还是执行的问题，根本没法定位。

自己实现三个模块，每一步都可以单独打 log 调试，这才是可维护的方案。

---

# 参考：

- [LangChain Docs: Text to SQL](https://python.langchain.com/docs/tutorials/sql_qa/)
- [RAGFlow Blog: Implementing Text2SQL with RAGFlow](https://ragflow.io/blog/implementing-text2sql-with-ragflow)
- [all-in-rag chapter4](https://datawhalechina.github.io/all-in-rag/#/chapter4/13_text2sql)