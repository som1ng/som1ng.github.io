import type {ExpressiveCodeConfig,LicenseConfig,NavBarConfig,ProfileConfig,SiteConfig} from './types/config';
export const siteConfig:SiteConfig={title:'s0m1ng',subtitle:'二进制学习中 · 记录、拆解与理解',lang:'zh_CN',themeColor:{hue:250,fixed:false},banner:{enable:true,src:'/theme/demo-banner.webp',position:'center',credit:{enable:true,text:'空色天絵 / NEO TOKYO NOIR 01',url:'https://www.pixiv.net/artworks/111024784'}},toc:{enable:true,depth:3},favicon:[{src:'/favicon/favicon-light-32.png'}]};
export const navBarConfig:NavBarConfig={links:[{name:'首页',url:'/'},{name:'分类',url:'/categories/'},{name:'归档',url:'/archive/'},{name:'系列',url:'/series/'},{name:'关于',url:'/about/'}]};
export const profileConfig:ProfileConfig={avatar:'/theme/github-avatar.jpg',name:'s0m1ng',bio:'二进制学习中。记录、拆解与理解。',links:[{name:'GitHub',url:'https://github.com/som1ng',icon:'fa6-brands:github'}]};
export const demoCover='/theme/demo-cover.webp';
export const licenseConfig:LicenseConfig={enable:false,name:'',url:''};
export const expressiveCodeConfig:ExpressiveCodeConfig={theme:'github-dark'};
