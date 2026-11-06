import path from 'node:path';
import sharp from 'sharp';
const metadata=new Map();
export function rehypeCompatibility(){
  return async (tree,file)=>{
    const oldHeadings=file.data.astro?.frontmatter?.legacyHeadings || [];
    const headings=[];const images=[];const ids=new Set();
    function walk(node){
      if(node.type==='element'){
        if(node.properties?.id)ids.add(node.properties.id);
        if(/^h[1-6]$/.test(node.tagName))headings.push(node);
        if(node.tagName==='img')images.push(node);
      }
      for(const child of node.children || [])walk(child);
    }
    walk(tree);
    headings.forEach((heading,index)=>{
      const id=oldHeadings[index];
      if(id&&!ids.has(id)){heading.children.unshift({type:'element',tagName:'span',properties:{id,className:['legacy-anchor'],'aria-hidden':'true'},children:[]});ids.add(id);}
    });
    await Promise.all(images.map(async image=>{
      const src=image.properties.src;
      image.properties.loading='lazy';image.properties.decoding='async';
      if(typeof src!=='string'||!src.startsWith('/images/'))return;
      try{
        const publicRoot=path.resolve('static');const filename=path.resolve(publicRoot,'.'+decodeURIComponent(src));
        if(!filename.startsWith(publicRoot+path.sep))return;
        if(!metadata.has(filename))metadata.set(filename,sharp(filename).metadata().catch(()=>null));
        const size=await metadata.get(filename);
        if(size?.width&&size?.height){image.properties.width=size.width;image.properties.height=size.height;}
      }catch{}
    }));
  };
}
