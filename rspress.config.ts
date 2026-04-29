import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@rspress/core';
import { pluginSitemap } from '@rspress/plugin-sitemap';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

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
    pluginSitemap({
      siteUrl: 'https://wiki.kele.my',
    }),
  ],
});
