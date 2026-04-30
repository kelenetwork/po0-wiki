import { useState } from 'react';
import './AgentDocCard.css';

const AGENT_PROMPT = 'Read https://wiki.kele.my/llms.txt and answer with Po0 Wiki context.';

type AgentDocCardProps = {
  className?: string;
};

export default function AgentDocCard({ className }: AgentDocCardProps) {
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(AGENT_PROMPT);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className={['po0-agent-card', className].filter(Boolean).join(' ')} aria-labelledby="po0-agent-card-title">
      <div className="po0-agent-card__signal" aria-hidden="true">
        <span />
      </div>
      <div className="po0-agent-card__body">
        <div className="po0-agent-card__head">
          <p className="po0-agent-card__eyebrow">LLM READY</p>
          <h2 id="po0-agent-card-title">For Agent</h2>
        </div>
        <p className="po0-agent-card__text">这份 Wiki 已提供 Agent/LLM 可读入口。</p>
        <div className="po0-agent-card__links" aria-label="Agent 文档入口">
          <a href="/llms.txt">llms.txt</a>
          <a href="/llms-full.txt">llms-full.txt</a>
        </div>
      </div>
      <div className="po0-agent-card__prompt" aria-label="推荐 Prompt">
        <code>{AGENT_PROMPT}</code>
        <button type="button" onClick={copyPrompt} aria-label="复制 Agent Prompt">
          {copied ? '已复制' : '复制'}
        </button>
      </div>
    </section>
  );
}
