import 'photoswipe/style.css';
import type PhotoSwipe from 'photoswipe';
import {matchesCategory} from '../utils/categories';
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
let observer:IntersectionObserver|undefined;
let lightbox:PhotoSwipe|undefined;
let lightboxRequest=0;
const copyTimers=new Set<ReturnType<typeof setTimeout>>();
function closeMenu(){const panel=document.getElementById('nav-menu-panel');panel?.classList.remove('is-open');if(panel)panel.inert=true;document.getElementById('nav-menu-switch')?.setAttribute('aria-expanded','false');}
function filters(){
  if(!document.querySelector('[data-filterable="true"]'))return;
  const params=new URLSearchParams(location.search),category=params.get('category')||'',tag=params.get('tag')||'';let count=0;
  document.querySelectorAll<HTMLElement>('[data-archive-row]').forEach(row=>{const categories=JSON.parse(row.dataset.categories||'[]') as string[];const tags=JSON.parse(row.dataset.tags||'[]') as string[];const selected=category.split('/').filter(Boolean);const visible=(!category||(selected.length===1?categories.includes(category):matchesCategory(categories,selected)))&&(!tag||tags.includes(tag));row.hidden=!visible;if(visible)count++;});
  document.querySelectorAll('[data-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.getAttribute('data-filter')===category)));
  const countEl=document.getElementById('archive-count');if(countEl)countEl.textContent=`${count} 篇文章${tag?' · #'+tag:''}`;
  const empty=document.getElementById('archive-empty');if(empty)empty.hidden=count>0;
}
function syncCategories(){
  let active=document.querySelector<HTMLElement>('[data-current-category]')?.dataset.currentCategory||new URLSearchParams(location.search).get('category')||'';
  if(!active&&location.pathname.startsWith('/categories/')){try{active=decodeURIComponent(location.pathname).replace(/^\/categories\/?/,'').replace(/\/page\/\d+\/?$/,'').replace(/\/$/,'');}catch{}}
  document.querySelectorAll<HTMLElement>('[data-category-path]').forEach(link=>{if(link.dataset.categoryPath===active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  document.querySelectorAll<HTMLDetailsElement>('[data-category-branch]').forEach(branch=>{const key=branch.dataset.categoryBranch||'';if(active===key||active.startsWith(key+'/'))branch.open=true;});
}
function setHue(hue:number,persist=false){
  if(!Number.isFinite(hue))return;hue=Math.max(0,Math.min(360,hue));
  document.documentElement.style.setProperty('--hue',String(hue));
  const input=document.querySelector<HTMLInputElement>('#theme-hue');if(input)input.value=String(hue);
  const output=document.getElementById('theme-hue-value');if(output)output.textContent=String(hue);
  if(persist)try{localStorage.setItem('theme-hue',String(hue));}catch{}
}
function init(){
  observer?.disconnect();filters();syncCategories();document.body.classList.toggle('is-home',location.pathname==='/');
  setHue(Number(document.documentElement.style.getPropertyValue('--hue')));
  document.getElementById('scheme-switch')?.setAttribute('aria-pressed',String(document.documentElement.classList.contains('dark')));
  document.querySelectorAll('.desktop-links a,.mobile-menu a').forEach(link=>{const href=new URL((link as HTMLAnchorElement).href).pathname;if(href===location.pathname||(href==='/categories/'&&location.pathname.startsWith(href)))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  const links=Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]'));
  observer=new IntersectionObserver(entries=>{const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);if(!visible.length)return;links.forEach(link=>link.setAttribute('aria-current',String(decodeURIComponent(link.hash.slice(1))===visible[0].target.id)));},{rootMargin:'-100px 0px -65% 0px',threshold:0});
  for(const link of links){const heading=document.getElementById(decodeURIComponent(link.hash.slice(1)));if(heading)observer.observe(heading);}
  const announcer=document.getElementById('site-announcer');if(announcer)announcer.textContent=document.title;
}
document.addEventListener('click',async event=>{
  if(!(event.target instanceof Element))return;const target=event.target;
  if(!target.closest('.appearance-settings'))document.querySelector<HTMLDetailsElement>('.appearance-settings')?.removeAttribute('open');
  if(target.closest('#reset-theme-hue'))setHue(Number(document.getElementById('config-carrier')?.dataset.hue||250),true);
  if(target.closest('#scheme-switch')){const dark=!document.documentElement.classList.contains('dark');document.documentElement.classList.toggle('dark',dark);try{localStorage.setItem('theme',dark?'dark':'light');}catch{}document.getElementById('scheme-switch')?.setAttribute('aria-pressed',String(dark));}
  if(target.closest('#nav-menu-switch')){const panel=document.getElementById('nav-menu-panel');const open=!panel?.classList.contains('is-open');panel?.classList.toggle('is-open',open);if(panel)panel.inert=!open;document.getElementById('nav-menu-switch')?.setAttribute('aria-expanded',String(open));}else if(!target.closest('#nav-menu-panel'))closeMenu();
  if(target.closest('#back-to-top'))window.scrollTo({top:0,behavior:reduced()?'instant':'smooth'});
  const filter=target.closest<HTMLElement>('[data-filter]');
  if(filter){event.preventDefault();const next=new URL(location.href);if(filter.dataset.filter)next.searchParams.set('category',filter.dataset.filter);else{next.searchParams.delete('category');next.searchParams.delete('tag');}history.pushState({},'',next);filters();syncCategories();}
  const copy=target.closest<HTMLElement>('.copy-btn');
  if(copy){const lines=Array.from(copy.closest('pre')?.querySelectorAll('.code:not(summary *)')||[]);const text=lines.length?lines.map(line=>line.textContent==='\n'?'':line.textContent).join('\n'):copy.closest('pre')?.querySelector('code')?.textContent||'';try{await navigator.clipboard.writeText(text);copy.classList.add('success');copy.setAttribute('aria-label','已复制');const timer=setTimeout(()=>{copy.classList.remove('success');copy.setAttribute('aria-label','复制代码');copyTimers.delete(timer);},1400);copyTimers.add(timer);}catch{copy.setAttribute('aria-label','复制失败，请手动选择代码');}}
  const image=target.closest<HTMLImageElement>('.custom-md img');
  if(image&&image.complete&&image.naturalWidth){event.preventDefault();const current=++lightboxRequest;const {default:PhotoSwipe}=await import('photoswipe');if(current!==lightboxRequest||!image.isConnected)return;lightbox?.destroy();const images=Array.from(document.querySelectorAll<HTMLImageElement>('.custom-md img')).filter(img=>img.naturalWidth>0);lightbox=new PhotoSwipe({dataSource:images.map(img=>({src:img.currentSrc||img.src,width:img.naturalWidth,height:img.naturalHeight,alt:img.alt})),index:images.indexOf(image),showHideAnimationType:reduced()?'none':'fade',wheelToZoom:true});lightbox.init();}
});
document.addEventListener('input',event=>{if(event.target instanceof HTMLInputElement&&event.target.id==='theme-hue')setHue(Number(event.target.value),true);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenu();document.querySelector<HTMLDetailsElement>('.appearance-settings')?.removeAttribute('open');}});
window.addEventListener('popstate',()=>{filters();syncCategories();});let scrollFrame=0;
window.addEventListener('scroll',()=>{if(scrollFrame)return;scrollFrame=requestAnimationFrame(()=>{const button=document.getElementById('back-to-top');if(button)button.hidden=scrollY<500;scrollFrame=0;});},{passive:true});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',event=>{try{if(!localStorage.getItem('theme')||localStorage.getItem('theme')==='auto')document.documentElement.classList.toggle('dark',event.matches);}catch{}});
let initialized=false;
function setup(){if(initialized||!window.swup?.hooks)return;initialized=true;window.swup.hooks.on('visit:start',()=>{document.dispatchEvent(new Event('site:navigate'));closeMenu();lightboxRequest++;lightbox?.destroy();copyTimers.forEach(clearTimeout);copyTimers.clear();});window.swup.hooks.on('content:replace',()=>observer?.disconnect(),{before:true});window.swup.hooks.on('page:view',init);}
init();setup();document.addEventListener('swup:enable',setup,{once:true});
