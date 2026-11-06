import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';
import {buildCategoryTree,flattenCategories,matchesCategory} from '../src/utils/categories.ts';

const walk=async dir=>(await Promise.all((await fs.readdir(dir,{withFileTypes:true})).map(entry=>entry.isDirectory()?walk(path.join(dir,entry.name)):[path.join(dir,entry.name)]))).flat();
const posts=[];
for(const file of await walk('src/content/posts')){
  if(!file.endsWith('.md'))continue;
  const text=await fs.readFile(file,'utf8');
  const data=yaml.load(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
  posts.push({data});
}
const tree=buildCategoryTree(posts),nodes=flattenCategories(tree);
const checked=[];
for(const node of nodes){
  const html=await fs.readFile(path.join('dist','categories',...node.path,'index.html'),'utf8');
  const actual=[...html.matchAll(/<div class="archive-row"[^>]*>[\s\S]*?<a href="([^"]+)"/g)].map(match=>decodeURIComponent(match[1]));
  const expected=posts.filter(post=>node.path.every((name,index)=>post.data.categories[index]===name)).map(post=>post.data.legacyUrl);
  assert.deepEqual(actual.sort(),expected.sort(),`${node.key}: category page should contain exactly this branch's articles`);
  assert.equal(node.count,expected.length);
  for(const child of node.children)assert.ok(html.includes(`href="${child.url}"`),`Missing child link: ${child.key}`);
  assert.ok(html.includes('aria-label="分类路径"'));
  checked.push({path:node.key,articles:actual.length,url:node.url});
}
const legacy=JSON.parse(await fs.readFile('src/data/legacy-pages.json','utf8')).filter(route=>route.startsWith('categories/'));
for(const route of legacy){
  const parts=route.replace(/^categories\//,'').replace(/\/page\/\d+$/,'').split('/');
  const expected=posts.filter(post=>parts.every((name,index)=>post.data.categories[index]?.replaceAll('_','-')===name)).map(post=>post.data.legacyUrl);
  const html=await fs.readFile(path.join('dist',route,'index.html'),'utf8');
  const actual=[...html.matchAll(/<div class="archive-row"[^>]*>[\s\S]*?<a href="([^"]+)"/g)].map(match=>decodeURIComponent(match[1]));
  assert.deepEqual(actual.sort(),expected.sort(),`Legacy category lost content: ${route}`);
}
for(const [key,count] of Object.entries({'REVERSE':26,'PWN':9,'PWN/PWN_ATTACK/stack_overflow':3,'REVERSE/逆向中的密码学/对称加密基础':5}))assert.equal(nodes.find(node=>node.key===key)?.count,count);
// Repeated leaf names under different roots must never merge or leak articles.
const repeated=buildCategoryTree([{data:{categories:['REVERSE','基础']}},{data:{categories:['PWN','基础']}},{data:{categories:['PWN','基础','第一章']}}]);
assert.equal(flattenCategories(repeated).find(node=>node.key==='REVERSE/基础').count,1);
assert.equal(flattenCategories(repeated).find(node=>node.key==='PWN/基础').count,2);
assert.equal(matchesCategory(['REVERSE','基础'],['PWN','基础']),false);
assert.equal(matchesCategory(['PWN','基础','第一章'],['PWN','基础']),true);
const home=await fs.readFile('dist/index.html','utf8');
for(const image of ['demo-banner.webp','github-avatar.jpg','demo-cover.webp'])assert.ok(home.includes(`/theme/${image}`),`Missing site image: ${image}`);
assert.ok(home.includes('--hue:250'));
assert.ok(!home.includes('class="card-base home-intro"'));
const result={status:'passed',articles:posts.length,topLevel:tree.length,categoryNodes:nodes.length,legacyCategoryPages:legacy.length,duplicateNamesIsolated:true,demoAssets:2,githubAvatar:true,checked};
await fs.mkdir('docs/verification',{recursive:true});await fs.writeFile('docs/verification/category-report.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,checked:undefined},null,2));
