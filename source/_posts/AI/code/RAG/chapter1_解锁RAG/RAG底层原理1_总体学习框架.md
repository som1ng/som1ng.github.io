---
title: RAG底层原理1:总体学习框架
date: 2026-04-25 10:00:00
tags:
- AI开发
- RAG
- 基础知识
categories:
- AI
- 开发
- RAG
---



# Datawhale All-in-RAG 学习笔记与底层原理全解

> **前言**：本系列笔记是我跟随国内顶级开源社区 Datawhale 的 `all-in-rag` 教程进行系统学习的沉淀。我将剥离繁杂的业务代码，重点记录 RAG 架构中**数据加载、切块算法、向量引擎、高级召回策略以及系统评估**的底层逻辑。
> 目标是：不仅会用，更懂底层的数学与算法机制。

# 笔记大纲

## 模块一：RAG 理论基石

对应教程：RAG 核心概念、技术原理和应用场景

对应

- {% post_link AI/code/RAG/chapter1_解锁RAG/RAG底层原理2_RAG理论基石 "RAG底层原理2: RAG 理论基石" %}

- {% post_link AI/code/RAG/chapter1_解锁RAG/RAG底层原理3_环境配置与启动 "RAG底层原理3: 环境配置与启动" %}

## 模块二：数据清洗与分块策略 (Data Processing)

对应教程：从数据加载、清洗到文本分块的完整数据准备流程

**[02-01] 非结构化数据接入与解析难题**

* 文档加载器的三大核心任务：提取纯文本、抽取元数据 (Metadata)、整理为统一结构。

* PDF、Word、HTML 等复杂格式的清洗策略与表格/图片防丢失技巧。

**[02-02] 文本切块 (Chunking) 的算法机制**

* 字符分割 (Character Text Splitting) 与递归字符分割 (Recursive) 的源码逻辑解析。

* 什么是 Chunk Size 和 Overlap？它们对最终 RAG 召回精度的影响。

* _进阶思考：基于文档特定结构（如 Markdown 标题树）的切块优势。_

## 模块三：向量空间与索引优化 (Indexing & Embedding)

对应教程：向量嵌入、多模态嵌入、向量数据库构建及索引优化技术

**[03-01] 嵌入模型与多模态映射 (Embeddings & Multi-modal)**

* 词嵌入本质：文本如何被映射到高维稠密向量空间？

* 距离度量准则：余弦相似度 (Cosine) 与内积的几何意义。

* 多模态嵌入：如何把图片和文本映射到同一个向量空间以实现“以文搜图”？

**[03-02] 向量数据库与底层索引原理 (Vector Databases)**

* 为什么向量检索不能用传统的 B+ 树或 Hash 表？

* 核心索引算法：HNSW (分层导航小世界) 如何实现 $O(\log N)$ 的极速检索。

**[03-03] 结构化元数据与索引优化 (Index Optimization)**

* 为什么要为文本块附加 Metadata（如时间、作者、章节名）？

* 元数据过滤 (Metadata Filtering)：先通过结构化条件缩小范围，再进行向量检索的提效策略。

## 模块四：检索技术进阶 (Advanced Retrieval)

对应教程：混合检索、查询构建、Text2SQL等高级检索技术

**[04-01] 双路融合：混合检索架构 (Hybrid Search)**

* 稀疏检索算法基础：BM25 的词频与文档长度惩罚机制。

* 为什么向量检索会输给关键词？（精确匹配的短板）。

* 融合算法机制：RRF (倒数秩融合算法) 如何将不同维度的得分进行无量纲合并。

**[04-02] 查询改写与构建 (Query Transformation/Construction)**

* 基于 LLM 的提问改写：如何修复用户极其简短或带有指代（如“他”、“昨天”）的查询？

* Multi-Query 策略：一次生成多个相近查询并发检索的底层逻辑。

**[04-03] 结构化检索引擎：Text2SQL**

* 当用户问题涉及数据库统计运算时，如何让 LLM 直接生成 SQL 而不是做文本相似度匹配？

## 模块五：生成集成与严谨评估 (Generation & Evaluation)

对应教程：格式化生成、系统评估与优化方法

**[05-01] 检索后处理与生成集成 (Generation System)**

* Prompt Engineering 进阶：如何将检索到的多段背景知识与用户提问完美拼接？

* 结构化格式输出（让 LLM 稳定输出 JSON/特定格式的技巧）。

**[05-02] 量化指标：RAG 系统评估方法论 (Evaluation)**

* RAG 系统的三大核心痛点：无端联想、查非所问、答非所问。

* 基于大模型裁判 (LLM-as-a-Judge) 的自动化评估指标：
  
  * 忠实度 (Faithfulness)
  
  * 答案相关性 (Answer Relevance)
  
  * 上下文精准度 (Context Precision)

## 模块六：拓展架构与实战沉淀 (Extra & Practice)

对应教程：图 RAG 及具体项目实战经验

**[06-01] 图架构的引入：Graph RAG 初探**

* 图数据库入门：实体 (Node) 与关系 (Edge) 的抽象。

* 从单纯的“文本相似度”升级为基于图谱的“全局关联逻辑推理”。

**[06-02] 实战踩坑录 (Project Bad Cases & Solutions)**

* _（预留空间：记录你在运行 Datawhale 教程项目时遇到的典型报错、代码兼容性问题以及调参心得）_
