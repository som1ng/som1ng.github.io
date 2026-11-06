// Pure category helpers shared by static pages and regression checks.
export type CategorizedPost = {data:{categories:string[];category?:string|null}};
export type CategoryNode = {name:string;path:string[];key:string;url:string;count:number;children:CategoryNode[]};

export function categoryPath(post:CategorizedPost):string[] {
  return post.data.categories.length ? post.data.categories : post.data.category ? [post.data.category] : [];
}
export function categoryUrl(path:string[]):string {
  return `/categories/${path.map(encodeURIComponent).join('/')}${path.length?'/':''}`;
}
export function matchesCategory(path:string[], selected:string[]):boolean {
  return selected.every((part,index)=>path[index]===part);
}
export function buildCategoryTree(posts:CategorizedPost[]):CategoryNode[] {
  const roots:CategoryNode[]=[];
  for(const post of posts){
    const path=categoryPath(post);let siblings=roots;
    path.forEach((name,index)=>{
      let node=siblings.find(child=>child.name===name);
      if(!node){const branch=path.slice(0,index+1);node={name,path:branch,key:branch.join('/'),url:categoryUrl(branch),count:0,children:[]};siblings.push(node);}
      node.count++;siblings=node.children;
    });
  }
  const sort=(nodes:CategoryNode[])=>{nodes.sort((a,b)=>a.name.localeCompare(b.name,'zh-CN',{numeric:true}));nodes.forEach(node=>sort(node.children));};
  sort(roots);return roots;
}
export function flattenCategories(nodes:CategoryNode[]):CategoryNode[] {
  return nodes.flatMap(node=>[node,...flattenCategories(node.children)]);
}
export function resolveCategoryPath(path:string[],tree:CategoryNode[]):string[] {
  const key=path.join('/'),nodes=flattenCategories(tree);
  // Hexo slugified underscores, e.g. PWN_ATTACK → PWN-ATTACK.
  return (nodes.find(node=>node.key===key)||nodes.find(node=>node.key.replaceAll('_','-')===key))?.path||path;
}
