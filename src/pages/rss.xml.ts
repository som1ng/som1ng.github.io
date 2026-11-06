import rss from "@astrojs/rss";
import { getSortedPosts } from "@utils/content-utils";
import { getPostUrlBySlug } from "@utils/url-utils";
import type { APIContext } from "astro";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { siteConfig } from "@/config";

const parser = new MarkdownIt();
const escapeXml = (value:string) => value.replace(/[<>&"']/g, character => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[character]!));

function stripInvalidXmlChars(str: string): string {
	return str.replace(
		// biome-ignore lint/suspicious/noControlCharactersInRegex: https://www.w3.org/TR/xml/#charsets
		/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F\uFDD0-\uFDEF\uFFFE\uFFFF]/g,
		"",
	);
}

export async function GET(context: APIContext) {
	const blog = await getSortedPosts();
	const feedUrl = new URL('/rss.xml', context.site ?? 'https://s0m1ng.dpdns.org/').href;

	return rss({
		title: siteConfig.title,
		description: siteConfig.subtitle || "No description",
		site: context.site ?? "https://s0m1ng.dpdns.org/",
		// CSS styles the XML directly, without relying on browser XSLT support.
		stylesheet: '/rss.css',
		xmlns: {html:'http://www.w3.org/1999/xhtml'},
		items: blog.map((post) => {
			const content =
				typeof post.body === "string" ? post.body : String(post.body || "");
			const cleanedContent = stripInvalidXmlChars(content);
			return {
				title: post.data.title,
				pubDate: post.data.published,
				description: post.data.description || "",
				link: getPostUrlBySlug(post.slug),
				customData: `<html:a class="feed-read" href="${escapeXml(getPostUrlBySlug(post.slug))}">阅读全文 →</html:a>`,
				content: sanitizeHtml(parser.render(cleanedContent), {
					allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
				}),
			};
		}),
		customData: `<language>${siteConfig.lang.replace('_','-')}</language>
		<html:header class="feed-intro">
			<html:a class="feed-back" href="/">← 返回博客</html:a>
			<html:h1>${escapeXml(siteConfig.title)} · RSS 订阅</html:h1>
			<html:p>在 RSS 阅读器中添加下面的订阅地址，即可收到新文章。</html:p>
			<html:code class="feed-address">${escapeXml(feedUrl)}</html:code>
			<html:p class="feed-count">共 ${blog.length} 篇文章 · 点击下方链接阅读全文</html:p>
		</html:header>`,
	});
}
