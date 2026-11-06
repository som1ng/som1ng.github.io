import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

const root = process.cwd();
const walk = async (dir) => {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(file));
    else result.push(file);
  }
  return result;
};
const normalize = value => value.replaceAll('\\', '/');
const source = path.join(root, 'source/_posts');
const target = path.join(root, 'src/content/posts');
const dataDir = path.join(root, 'src/data');
await fs.mkdir(target, { recursive: true });
await fs.mkdir(dataDir, { recursive: true });
const baselinePath=path.join(dataDir,'hexo-baseline.json');
let baseline;
try{baseline=JSON.parse(await fs.readFile(baselinePath,'utf8'));}catch{
  const database=JSON.parse(await fs.readFile(path.join(root,'db.json'),'utf8'));
  baseline=database.models.Post.map(p=>({source:p.source,slug:p.slug,date:p.date,title:p.title,headings:[...(p.content||'').matchAll(/<h[1-6]\b[^>]*\bid="([^"]+)"/g)].map(match=>match[1])}));
  await fs.writeFile(baselinePath,JSON.stringify(baseline,null,2));
}
const legacy = new Map(baseline.map(p => [p.source.replace(/^_posts\//, ''), p]));
const files = (await walk(source)).filter(file => file.endsWith('.md'));
const records = [];
const issues = [];
const seriesFor = file => {
  if (file.includes('/RAG/')) return 'RAG 底层原理';
  if (file.includes('/Linux本地提权/')) return 'Linux 本地提权';
  if (file.includes('/Win本地提权/')) return 'Windows 本地提权';
  if (file.includes('/内网渗透与横向移动/')) return '内网渗透与横向移动';
  if (file.includes('/逆向中的密码学/')) return '逆向中的密码学';
  if (file.includes('/pe逆向/')) return 'Windows PE 逆向';
  if (file.includes('/stack_overflow/')) return '栈溢出';
  return '';
};
for (const file of files) {
  const relative = normalize(path.relative(source, file));
  const text = await fs.readFile(file, 'utf8');
  const match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
  const old = legacy.get(relative);
  if (!match) issues.push({file:relative,type:'missing-frontmatter',detail:text.trim() ? 'Use original Hexo metadata' : 'Empty source article retained'});
  const front = match ? yaml.load(match[1]) || {} : {title:old?.title || path.basename(file,'.md'), date:old?.date || (await fs.stat(file)).birthtime};
  const date = front.date instanceof Date ? front.date : new Date(String(front.date || old?.date).replaceAll('/', '-'));
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid date: ${relative}`);
  const day = typeof front.date === 'string' ? front.date.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/) : null;
  const dateParts = day ? [day[1],day[2].padStart(2,'0'),day[3].padStart(2,'0')] : date.toISOString().slice(0,10).split('-');
  const oldSlug = old?.slug || relative.replace(/\.md$/, '');
  const route = [...dateParts, oldSlug].join('/');
  const categories = (Array.isArray(front.categories) ? front.categories.flat(Infinity) : [front.categories]).filter(Boolean).map(String);
  if(!categories.length)categories.push(relative.split('/')[0]);
  const tags = (Array.isArray(front.tags) ? front.tags : [front.tags]).filter(Boolean).map(String);
  const series = String(front.series || seriesFor('/' + relative));
  const order = String(front.title).match(/(?:原理|提权|横向)(\d+)/)?.[1];
  records.push({relative, file, body:match ? text.slice(match[0].length) : text, front, old, date, route, categories, tags, series, order:Number(front.series_order ?? (order === undefined ? 1000 : order))});
}
const routes = Object.fromEntries(records.map(r => [r.relative.replace(/\.md$/, ''), '/' + r.route + '/']));
for (const record of records) {
  let body = record.body.replace(/\{%\s*post_link\s+(\S+)(?:\s+["']([^"']*)["'])?\s*%\}/g, (_, slug, label) => {
    const found = routes[slug] || Object.entries(routes).find(([key]) => key.endsWith('/' + slug))?.[1];
    if(!found) {issues.push({file:record.relative,type:'unresolved-post-link',target:slug});return label || slug;}
    return `[${label || slug.split('/').at(-1)}](${found})`;
  });
  body = body.replace(/!?\[[^\]\n]*\]\([^\n]*\)/g, token => token.replace(/[A-Za-z]:[\\/](?:[^)\n]*?)[\\/]source[\\/]images[\\/]/g, '/images/').replaceAll('\\','/'));
  body = body.replace(/^(`{3,})(\w+)\s*$/gm,(_,fence,language)=>fence+({asmatmel:'asm',armasm:'asm',asm6502:'asm',dotnetcli:'shell',textile:'text',context:'text',C:'c',Csharp:'csharp'}[language]||language));
  const description = String(record.front.description || record.front.excerpt || body.replace(/```[\s\S]*?```/g,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/[#>*_`|~]/g,'').replace(/\s+/g,' ').trim()).slice(0,140);
  const metadata = {
    title:String(record.front.title || record.old?.title || path.basename(record.file,'.md')),
    slug:record.route,
    published:record.date,
    ...(record.front.updated ? {updated:new Date(record.front.updated)} : {}),
    description, tags:record.tags,
    category:record.categories[0] || record.relative.split('/')[0],
    categories:record.categories,
    series:record.series, seriesOrder:record.order,
    sourcePath:record.relative,
    legacyUrl:'/' + record.route + '/',
    legacyHeadings:record.old?.headings || [],
    draft:false,
  };
  const output = path.join(target,record.relative);
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.writeFile(output,'---\n# Generated from source/_posts; edit the original Markdown instead.\n'+yaml.dump(metadata,{lineWidth:-1,noRefs:true})+'---\n\n'+body);
}
const expected=new Set(records.map(record=>path.join(target,record.relative)));
for(const file of await walk(target)){
  if(!file.endsWith('.md')||expected.has(file)||!file.startsWith(target+path.sep))continue;
  if((await fs.readFile(file,'utf8')).includes('# Generated from source/_posts; edit the original Markdown instead.'))await fs.unlink(file);
}
await fs.writeFile(path.join(dataDir,'post-routes.json'),JSON.stringify(routes,null,2));
// The old generated output remains the compatibility baseline, never a new asset source.
const baselineFile = path.join(dataDir,'legacy-pages.json');
try { await fs.access(baselineFile); } catch {
  const pages = (await walk(path.join(root,'public'))).filter(file => file.endsWith('index.html')).map(file => normalize(path.relative(path.join(root,'public'),path.dirname(file)))).filter(Boolean);
  const articleRoutes = new Set(records.map(r=>r.route));
  await fs.writeFile(baselineFile,JSON.stringify(pages.filter(route=>!articleRoutes.has(route)),null,2));
}
await fs.cp(path.join(root,'source/images'),path.join(root,'static/images'),{recursive:true});
await fs.copyFile(path.join(root,'source/CNAME'),path.join(root,'static/CNAME'));
await fs.writeFile(path.join(root,'static/.nojekyll'),'');
const report = {articles:records.length,categories:Object.fromEntries([...new Set(records.map(r=>r.categories[0]))].map(c=>[c,records.filter(r=>r.categories[0]===c).length])),series:[...new Set(records.map(r=>r.series).filter(Boolean))],issues};
await fs.writeFile(path.join(dataDir,'migration-report.json'),JSON.stringify(report,null,2));
console.log(`Migrated ${records.length} articles; ${report.series.length} series; ${issues.length} source issues recorded.`);
