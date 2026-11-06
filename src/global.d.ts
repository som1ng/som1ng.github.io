import type Swup from 'swup';
declare global {interface Window {swup:Swup;}}
export interface SearchResult {url:string;meta:{title:string};excerpt:string;}
