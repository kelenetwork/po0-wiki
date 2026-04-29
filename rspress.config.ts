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
  title: '可乐 Wiki',
  description: 'wiki.kele.my 的知识库、运维手册与服务状态入口。',
  icon: '/favicon.svg',
  logo: {
    light: '/logo.svg',
    dark: '/logo.svg',
  },
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
          text: '指南',
          items: [
            { text: '开始使用', link: '/guide/getting-started' },
            { text: '内容规范', link: '/guide/content-guide' },
            { text: '部署说明', link: '/guide/deployment' },
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
