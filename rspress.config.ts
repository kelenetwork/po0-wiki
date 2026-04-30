import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@rspress/core';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const sitemapEntries = new Map<string, { filepath: string; routePath: string }>();

function escapeXML(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
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
        const loc = `https://wiki.kele.my${entry.routePath}`;
        const priority = entry.routePath === '/' ? '1.0' : '0.5';
        return `<url><loc>${escapeXML(loc)}</loc><lastmod>${lastmod}</lastmod><priority>${priority}</priority><changefreq>monthly</changefreq></url>`;
      }));
      const outputPath = path.join(projectRoot, config.outDir ?? 'doc_build', 'sitemap.xml');
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
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
  ],
});
