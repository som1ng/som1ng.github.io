import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),dist=path.join(root,'dist');
const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const routes=Object.values(await readJson('src/data/post-routes.json'));
const legacy=await readJson('src/data/legacy-pages.json');
const baseline=await readJson('src/data/hexo-baseline.json');
const report=await readJson('src/data/migration-report.json');
const walk=async dir=>(await Promise.all((await fs.readdir(dir,{withFileTypes:true})).map(async e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]))).flat();
const files=await walk(dist),fileSet=new Set(files.map(file=>path.relative(dist,file).replaceAll('\\','/')));
const failures=[],missingImages=[],brokenAnchors=[],brokenLinks=[];
const decode=value=>{try{return decodeURIComponent(value);}catch{return value;}};
const exists=relative=>fileSet.has(relative)||fileSet.has(relative.replace(/\/$/,'')+'/index.html')||fileSet.has(relative+'index.html');
for(const route of [...routes,...legacy.map(route=>'/'+route+'/')])if(!exists(route.slice(1)))failures.push('Missing legacy route: '+route);
const htmlFiles=files.filter(file=>file.endsWith('.html'));
const pages=new Map(await Promise.all(htmlFiles.map(async file=>[file,await fs.readFile(file,'utf8')])));
let articles=0,anchors=0,reservedImages=0;
for(const [file,html] of pages){
  const relative=path.relative(dist,file).replaceAll('\\','/');
  if(!html.includes('<html'))continue;
  const isArticle=html.includes('class="card-base article-card"');if(isArticle)articles++;
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  for(const match of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/g)){
    if(!match[1].startsWith('/'))continue;
    const src=decode(match[1].split(/[?#]/)[0]);
    if(!exists(src.slice(1)))missingImages.push({page:relative,src});
    else if(/\bwidth="\d+"/.test(match[0])&&/\bheight="\d+"/.test(match[0]))reservedImages++;
  }
  for(const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)){
    const href=match[1].replaceAll('&amp;','&');
    if(href.startsWith('#')){const id=decode(href.slice(1));if(id&&!ids.has(id))brokenAnchors.push({page:relative,href});anchors++;continue;}
    if(!href.startsWith('/')||href.startsWith('//'))continue;
    const target=decode(href.split(/[?#]/)[0]).slice(1);
    if(!exists(target))brokenLinks.push({page:relative,href});
  }
  if(isArticle){
    const canonical=html.match(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"/);
    if(!canonical||!canonical[1].startsWith('https://s0m1ng.dpdns.org/'))failures.push('Invalid canonical: '+relative);
    if(/\{%\s*post_link/.test(html))failures.push('Unconverted Hexo post_link: '+relative);
  }
}
assert.equal(articles,report.articles,'Every source article must have one canonical article page');
assert.equal(routes.length,baseline.length,'The migration must preserve every baseline article');
for(const filename of ['CNAME','.nojekyll','rss.xml','rss.css','atom.xml','sitemap-index.xml','404.html','pagefind/pagefind.js'])if(!fileSet.has(filename))failures.push('Missing production asset: '+filename);
if(brokenLinks.length)failures.push(`${brokenLinks.length} broken internal links`);
if(missingImages.length)failures.push(`${missingImages.length} missing images`);
if(brokenAnchors.length)failures.push(`${brokenAnchors.length} broken same-page anchors`);
const result={articles,series:report.series.length,htmlPages:htmlFiles.length,legacyRoutes:legacy.length+routes.length,checkedAnchors:anchors,imagesWithDimensions:reservedImages,missingImages,brokenLinks,brokenAnchors,failures};
await fs.mkdir('docs/verification',{recursive:true});await fs.writeFile('docs/verification/build-report.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({articles,series:result.series,htmlPages:result.htmlPages,legacyRoutes:result.legacyRoutes,missingImages:missingImages.length,brokenLinks:brokenLinks.length,brokenAnchors:brokenAnchors.length,failures},null,2));
if(failures.length)process.exitCode=1;
