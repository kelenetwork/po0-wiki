import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@rspress/core';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const siteUrl = 'https://wiki.kele.my';

const sitemapEntries = new Map<string, { filepath: string; routePath: string }>();

type PublicDoc = {
  title: string;
  routePath: string;
  sourcePath: string;
  content: string;
};

function escapeXML(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function stripFrontmatter(content: string) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
}

function stripMdxOnlyLines(content: string) {
  return content
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (/^import\s/.test(trimmed) || /^export\s/.test(trimmed)) return false;
      if (/^<\/?[A-Z][\w.:-]*(\s|>|\/)/.test(trimmed)) return false;
      if (/^\{\s*\/\*/.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTitle(content: string, sourcePath: string) {
  const frontmatterTitle = content.match(/^---\r?\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m)?.[1];
  if (frontmatterTitle) return frontmatterTitle.trim();

  const headingTitle = stripFrontmatter(content).match(/^#\s+(.+)$/m)?.[1];
  if (headingTitle) return headingTitle.trim();

  const basename = path.basename(sourcePath, path.extname(sourcePath));
  return basename === 'index' ? 'Po0 Wiki' : basename.replaceAll('-', ' ');
}

function routePathFromDoc(sourcePath: string) {
  const relativePath = path.relative(path.join(projectRoot, 'docs'), sourcePath);
  const parsed = path.parse(relativePath);
  const routeParts = path.join(parsed.dir, parsed.name).split(path.sep).filter(Boolean);
  if (routeParts.at(-1) === 'index') routeParts.pop();
  const routePath = `/${routeParts.join('/')}`;
  return routePath === '/' ? '/' : routePath.replace(/\/$/, '');
}

function fallbackDocContent(title: string, routePath: string) {
  const summaries: Record<string, string> = {
    '/': 'Po0 Wiki 首页。Po0 Wiki 是 Po0 的中文用户指南入口，面向用户提供选购参考、接入教程、Looking Glass、实时线路状态、常见问题与排障反馈信息。',
    '/looking-glass': 'Looking Glass 页面。用于选择发起点与目标，快速查看不同区域到 Po0 服务的连通表现与路径结果。',
    '/status': '服务状态页面。用于查看 Po0 Wiki 当前可用性、响应趋势与区域表现，快速判断访问体验是否稳定。',
  };

  return summaries[routePath] ?? `${title}。此页面主要由交互式组件渲染，请结合页面 URL 与站点上下文理解。`;
}

function shouldUseFallbackContent(content: string) {
  if (!content) return true;
  if (/^#\s+/m.test(content)) return false;

  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.some((line) => /^<\/?[A-Z][\w.:-]*/.test(line));
}

async function collectPublicDocs(dir = path.join(projectRoot, 'docs')): Promise<PublicDoc[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const docs = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(projectRoot, fullPath);

    if (relativePath.startsWith(`docs${path.sep}public${path.sep}`)) return [];
    if (entry.isDirectory()) return collectPublicDocs(fullPath);
    if (!entry.isFile() || !/\.mdx?$/.test(entry.name)) return [];

    const rawContent = await readFile(fullPath, 'utf8');
    const title = extractTitle(rawContent, fullPath);
    const routePath = routePathFromDoc(fullPath);
    const content = stripMdxOnlyLines(stripFrontmatter(rawContent));
    return [{
      title,
      routePath,
      sourcePath: relativePath.split(path.sep).join('/'),
      content: shouldUseFallbackContent(content) ? fallbackDocContent(title, routePath) : content,
    }];
  }));

  return docs.flat().sort((a, b) => a.routePath.localeCompare(b.routePath, 'zh-CN'));
}

function renderLlmsTxt(docs: PublicDoc[]) {
  const primaryLinks = [
    ['首页', '/'],
    ['选购指南', '/guide/buying'],
    ['使用教程', '/guide/tutorials'],
    ['常见问题', '/guide/faq'],
    ['实时线路状态', '/status'],
    ['Looking Glass', '/looking-glass'],
    ['完整 Agent 文档包', '/llms-full.txt'],
  ];

  const docLinks = docs
    .filter((doc) => doc.routePath !== '/')
    .map((doc) => `- [${doc.title}](${siteUrl}${doc.routePath}) — ${doc.sourcePath}`)
    .join('\n');

  return `# Po0 Wiki

> Po0 Wiki 是 Po0 的中文用户指南，覆盖服务选购、接入教程、Looking Glass、实时线路状态、常见问题与排障反馈。

Agent/LLM 阅读建议：
- 优先读取本文件理解站点结构。
- 需要完整公开文档上下文时读取 ${siteUrl}/llms-full.txt。
- 本索引只覆盖公开 docs 内容，不包含 admin 私有页面、构建产物或运行时接口数据。
- 回答用户时请保留 Po0 Wiki 的语境：Po0 用户指南、选购、接入教程、Looking Glass、实时线路状态。

## 关键入口

${primaryLinks.map(([title, href]) => `- [${title}](${siteUrl}${href})`).join('\n')}

## 公开文档索引

${docLinks}
`;
}

function renderLlmsFullTxt(docs: PublicDoc[]) {
  const renderedDocs = docs.map((doc) => `---\n标题：${doc.title}\nURL：${siteUrl}${doc.routePath}\nSource：${doc.sourcePath}\n---\n\n${doc.content || '(此文档暂无正文。)'}`).join('\n\n');

  return `# Po0 Wiki Agent 全量公开文档

站点：${siteUrl}
说明：Po0 Wiki 是 Po0 的中文用户指南，覆盖选购参考、接入教程、Looking Glass、实时线路状态、常见问题和排障反馈。
范围：仅包含 docs/**/*.md 与 docs/**/*.mdx，已排除 docs/public/**、admin 私有页面、构建产物和敏感运行时信息。
格式：每篇文档包含标题、URL、source path 与清理后的 Markdown/MDX 正文；MDX 组件不会被完整渲染。

${renderedDocs}
`;
}

function renderRobotsTxt() {
  return `User-agent: *
Allow: /
Allow: /llms.txt
Allow: /llms-full.txt
Disallow: /admin

Sitemap: ${siteUrl}/sitemap.xml
LLMs: ${siteUrl}/llms.txt
LLMs-Full: ${siteUrl}/llms-full.txt
`;
}

function publicSitemapPlugin() {
  return {
    name: 'public-sitemap-without-admin',
    extendPageData(pageData: { routePath: string; _filepath: string }, isProd: boolean) {
      if (isProd && !pageData.routePath.startsWith('/admin')) {
        sitemapEntries.set(pageData.routePath, { filepath: pageData._filepath, routePath: pageData.routePath });
      }
    },
    async afterBuild(config: { outDir?: string }, isProd: boolean) {
      if (!isProd) return;
      const urls = await Promise.all([...sitemapEntries.values()].map(async (entry) => {
        const lastmod = (await stat(entry.filepath)).mtime.toISOString();
        const loc = `${siteUrl}${entry.routePath}`;
        const priority = entry.routePath === '/' ? '1.0' : '0.5';
        return `<url><loc>${escapeXML(loc)}</loc><lastmod>${lastmod}</lastmod><priority>${priority}</priority><changefreq>monthly</changefreq></url>`;
      }));
      const outputPath = path.join(projectRoot, config.outDir ?? 'doc_build', 'sitemap.xml');
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
    },
  };
}

function agentDocsPlugin() {
  return {
    name: 'agent-friendly-docs',
    async afterBuild(config: { outDir?: string }, isProd: boolean) {
      if (!isProd) return;

      const docs = await collectPublicDocs();
      const outDir = path.join(projectRoot, config.outDir ?? 'doc_build');
      await mkdir(outDir, { recursive: true });

      await Promise.all([
        writeFile(path.join(outDir, 'llms.txt'), renderLlmsTxt(docs)),
        writeFile(path.join(outDir, 'llms-full.txt'), renderLlmsFullTxt(docs)),
        writeFile(path.join(outDir, 'robots.txt'), renderRobotsTxt()),
      ]);
    },
  };
}


export default defineConfig({
  root: 'docs',
  title: 'Po0 Wiki',
  description: 'Po0 用户指南、选购参考、接入教程、Looking Glass 与实时线路状态。',
  icon: '/favicon.ico',
  logo: {
    light: '/logo.svg',
    dark: '/logo.svg',
  },
  head: [
    ['meta', { name: 'description', content: 'Po0 用户指南、选购参考、接入教程、Looking Glass 与实时线路状态。' }],
    ['meta', { property: 'og:title', content: 'Po0 Wiki' }],
    ['meta', { property: 'og:description', content: 'Po0 用户指南、选购参考、接入教程、Looking Glass 与实时线路状态。' }],
    ['meta', { property: 'og:site_name', content: 'Po0 Wiki' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:url', content: 'https://wiki.kele.my/' }],
    ['meta', { property: 'og:image', content: 'https://wiki.kele.my/logo.png' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'twitter:title', content: 'Po0 Wiki' }],
    ['meta', { name: 'twitter:description', content: 'Po0 用户指南、选购参考、接入教程、Looking Glass 与实时线路状态。' }],
    ['meta', { name: 'twitter:image', content: 'https://wiki.kele.my/logo.png' }],
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
  ],
  lang: 'zh-CN',
  base: '/',
  outDir: 'doc_build',
  i18nSource: (source) => {
    for (const key of Object.keys(source)) {
      source[key]['zh-CN'] = source[key].zh ?? source[key].en;
    }
    return source;
  },
  globalStyles: path.join(projectRoot, 'src/styles/global.css'),
  themeConfig: {
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/',
      },
    ],
    nav: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/guide/getting-started' },
      { text: '服务状态', link: '/status' },
      { text: 'Looking Glass', link: '/looking-glass' },
    ],
    sidebar: {
      '/status': [
        {
          text: '网络工具',
          items: [
            { text: '服务状态', link: '/status' },
            { text: 'Looking Glass', link: '/looking-glass' },
          ],
        },
      ],
      '/looking-glass': [
        {
          text: '网络工具',
          items: [
            { text: '服务状态', link: '/status' },
            { text: 'Looking Glass', link: '/looking-glass' },
          ],
        },
      ],
      '/guide/': [
        {
          text: '选购指南',
          items: [
            { text: 'Po0 适合谁', link: '/guide/buying/who-is-po0-for' },
            { text: '入口地区怎么选', link: '/guide/buying/choose-entry-region' },
            { text: '出口与落地怎么选', link: '/guide/buying/choose-exit-location' },
            { text: '成本、流量与稳定性', link: '/guide/buying/cost-vs-stability' },
            { text: '用状态页与 Looking Glass 判断效果', link: '/guide/buying/status-and-looking-glass' },
          ],
        },
        {
          text: '使用教程',
          items: [
            { text: '从购买到连通', link: '/guide/tutorials/quick-start' },
            { text: '接入前准备清单', link: '/guide/tutorials/before-onboarding' },
            { text: '购买后的基础配置', link: '/guide/tutorials/post-purchase-setup' },
            { text: '系统重装 Debian 12', link: '/guide/tutorials/reinstall-debian' },
            { text: '安装哪吒监控', link: '/guide/tutorials/nezha-monitoring' },
            { text: '挂载 Nyanpass 面板', link: '/guide/tutorials/nyanpass-panel' },
            { text: 'nftables 转发脚本配置', link: '/guide/tutorials/nftables-script' },
            { text: 'nftables 手动转发配置', link: '/guide/tutorials/nftables-port-forwarding' },
          ],
        },
        {
          text: '注意事项',
          items: [
            { text: '常见问题 FAQ', link: '/guide/faq' },
            { text: '常见误区', link: '/guide/notes/common-misunderstandings' },
            { text: '怎么看延迟、丢包和路由波动', link: '/guide/notes/latency-packet-loss-routing' },
            { text: '使用前需要确认的限制', link: '/guide/notes/pre-use-limitations' },
            { text: '故障反馈应该提供哪些信息', link: '/guide/notes/troubleshooting-feedback' },
          ],
        },
      ],
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: `Copyright © ${new Date().getFullYear()} Kele`,
    },
  },
  plugins: [
    {
      name: 'admin-private-routes',
      addPages() {
        return [
          { routePath: '/admin', filepath: path.join(projectRoot, 'src/pages/admin/index.tsx') },
          { routePath: '/admin/sources', filepath: path.join(projectRoot, 'src/pages/admin/sources.tsx') },
          { routePath: '/admin/targets', filepath: path.join(projectRoot, 'src/pages/admin/targets.tsx') },
          { routePath: '/admin/checks', filepath: path.join(projectRoot, 'src/pages/admin/checks.tsx') },
          { routePath: '/admin/agents', filepath: path.join(projectRoot, 'src/pages/admin/agents.tsx') },
        ];
      },
    },
    publicSitemapPlugin(),
    agentDocsPlugin(),
  ],
});
