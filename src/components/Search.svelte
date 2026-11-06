<script lang="ts">
import {onMount,tick} from 'svelte';
type Result={url:string;meta:{title:string};excerpt:string};
let dialog:HTMLDialogElement;let input:HTMLInputElement;let query='';let results:Result[]=[];let status='输入关键词，搜索全部文章';let selected=-1;let version=0;let timer:ReturnType<typeof setTimeout>;let engine:Promise<any>|undefined;let opener:HTMLElement|null=null;
function getEngine(){const script='/pagefind/pagefind.js';return engine ||= import(/* @vite-ignore */ script).catch(error=>{engine=undefined;throw error;});}
async function open(){opener=document.activeElement as HTMLElement;dialog.showModal();document.body.classList.add('dialog-open');await tick();input.focus();}
function close(){dialog.close();}
function closed(){document.body.classList.remove('dialog-open');version++;opener?.focus();}
async function search(){
const current=++version;selected=-1;
if(!query.trim()){results=[];status='输入关键词，搜索全部文章';return;}
status='正在搜索…';
try{const pagefind=await getEngine();const response=await pagefind.search(query.trim());const next=await Promise.all(response.results.slice(0,15).map((item:any)=>item.data()));if(current!==version)return;results=next;status=results.length ? `找到 ${response.results.length} 篇文章`:'没有找到相关文章，试试其他关键词';}
catch{if(current===version){results=[];status=import.meta.env.DEV?'开发预览尚未生成搜索索引，请使用 npm run build 和 npm run preview。':'搜索加载失败，请重试。';}}
}
function changed(){version++;clearTimeout(timer);timer=setTimeout(search,100);}
function keys(event:KeyboardEvent){if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();selected=Math.max(0,Math.min(results.length-1,selected+(event.key==='ArrowDown'?1:-1)));dialog.querySelectorAll('a')[selected]?.scrollIntoView({block:'nearest'});}if(event.key==='Enter'&&selected>=0){event.preventDefault();dialog.querySelectorAll('a')[selected]?.click();}}
onMount(()=>{const shortcut=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='k'){event.preventDefault();dialog.open?close():open();}};const dismiss=()=>{if(dialog.open)close();};document.addEventListener('keydown',shortcut);document.addEventListener('site:navigate',dismiss);return()=>{clearTimeout(timer);document.removeEventListener('keydown',shortcut);document.removeEventListener('site:navigate',dismiss);};});
</script>
<button id="search-switch" class="search-trigger icon-button" onclick={open} aria-label="搜索文章" aria-haspopup="dialog"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><span>搜索</span><kbd>⌘ K</kbd></button>
<dialog bind:this={dialog} class="search-dialog" onclose={closed} onkeydown={keys} aria-label="搜索文章" onclick={(event)=>{if(event.target===dialog)close();}}>
<div class="search-heading"><label for="site-search" class="sr-only">搜索文章关键词</label><input bind:this={input} bind:value={query} oninput={changed} id="site-search" placeholder="搜索逆向、PWN、RAG…" autocomplete="off" /><button class="icon-button" onclick={close} aria-label="关闭搜索">✕</button></div>
<p class="search-status" role="status">{status}</p>
<div class="search-results">{#each results as result,index}<a href={result.url} class:selected={index===selected} onclick={close}><strong>{result.meta.title}</strong><p>{@html result.excerpt}</p></a>{/each}</div>
<div class="search-footer"><span>↑ ↓ 选择 · Enter 打开</span><span>Esc 关闭</span></div>
</dialog>
