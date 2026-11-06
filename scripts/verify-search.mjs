import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
process.env.ASTRO_TELEMETRY_DISABLED='1';
const {preview}=await import('astro');
const server=await preview({server:{host:'127.0.0.1',port:4326}});
const base='http://127.0.0.1:4326';
try{
  const pagefind=await import('../dist/pagefind/pagefind.js');
  await pagefind.options({basePath:base+'/pagefind/'});
  const results=[];
  for(const query of ['RAG','逆向','AES','Linux']){
    const start=performance.now();const response=await pagefind.search(query);
    assert.ok(response.results.length>0,query+' must find real articles');
    const first=await response.results[0].data();
    const request=await fetch(first.url);assert.equal(request.status,200);
    results.push({query,count:response.results.length,title:first.meta.title,indexAndResultMs:Math.round(performance.now()-start)});
  }
  const routes=Object.values(JSON.parse(await fs.readFile('src/data/post-routes.json','utf8')));
  for(let start=0;start<routes.length;start+=10)await Promise.all(routes.slice(start,start+10).map(async route=>assert.equal((await fetch(base+encodeURI(route))).status,200,route)));
  await fs.mkdir('docs/verification',{recursive:true});
  await fs.writeFile('docs/verification/search-report.json',JSON.stringify({status:'passed',engine:'Pagefind production index, Node HTTP probe',queries:results,articleHttpChecks:routes.length},null,2));
  console.log(JSON.stringify({queries:results,articleHttpChecks:routes.length},null,2));
}finally{await server.stop();}
