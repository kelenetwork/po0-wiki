import { ReactNode } from 'react';
import './Po0Theme.css';

type NavItem = { label: string; href: string; current?: boolean };

const NAV: NavItem[] = [
  { label: '指南', href: '/guide/getting-started' },
  { label: '服务状态', href: '/status' },
  { label: 'Looking Glass', href: '/looking-glass' },
];

type Po0ShellProps = {
  current: 'guide' | 'status' | 'looking-glass' | 'admin';
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  children: ReactNode;
};

function withCurrent(items: NavItem[], current: Po0ShellProps['current']): NavItem[] {
  return items.map((item) => ({
    ...item,
    current:
      (current === 'status' && item.href === '/status') ||
      (current === 'looking-glass' && item.href === '/looking-glass') ||
      (current === 'guide' && item.href.startsWith('/guide')),
  }));
}

export default function Po0Shell({ current, eyebrow, title, lead, children }: Po0ShellProps) {
  const items = withCurrent(NAV, current);
  return (
    <div className="po0-shell">
      <header className="po0-shell__nav">
        <a className="po0-shell__brand" href="/">
          <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="1.4" />
            <circle cx="16" cy="16" r="3" fill="currentColor" />
            <path d="M16 2v28M2 16h28" stroke="currentColor" strokeWidth="0.6" opacity="0.4" />
            <ellipse cx="16" cy="16" rx="8" ry="14" stroke="currentColor" strokeWidth="0.8" opacity="0.6" />
          </svg>
          <span>Po0</span>
          <i />
          <span>Wiki</span>
        </a>
        <nav>
          {items.map((item) => (
            <a key={item.href} href={item.href} aria-current={item.current ? 'page' : undefined}>{item.label}</a>
          ))}
        </nav>
        <a className="po0-shell__cta" href="/admin/sources" aria-label="打开控制台">
          <span />
        </a>
      </header>
      <main className="po0-shell__main">
        <section className="po0-shell__hero">
          <p className="po0-shell__eyebrow">{eyebrow}</p>
          <h1 className="po0-shell__title">{title}</h1>
          {lead ? <p className="po0-shell__lead">{lead}</p> : null}
        </section>
        {children}
      </main>
    </div>
  );
}
