import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { streamAssistant } from '../lib/api';
import { useI18n } from '../lib/language';

const createMessage = (role, text, extra = {}) => ({
  id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  role,
  text,
  ...extra,
});

const inlinePattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

const renderInlineMarkdown = (text) => {
  const parts = String(text || '').split(inlinePattern).filter(Boolean);

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${index}-${part}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={`${index}-${part}`}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={`${index}-${part}`}>{part.slice(1, -1)}</code>;
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a key={`${index}-${part}`} href={linkMatch[2]} target="_blank" rel="noreferrer">
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
};

const renderMarkdownContent = (value) => {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return null;

  const lines = text.split('\n');
  const nodes = [];
  let currentParagraph = [];
  let currentList = null;
  let codeLines = [];
  let inCodeBlock = false;

  const flushParagraph = () => {
    if (!currentParagraph.length) return;
    nodes.push(
      <p key={`p-${nodes.length}`} className="ai-markdown__paragraph">
        {currentParagraph.map((line, index) => (
          <React.Fragment key={`${index}-${line}`}>
            {index > 0 ? <br /> : null}
            {renderInlineMarkdown(line)}
          </React.Fragment>
        ))}
      </p>,
    );
    currentParagraph = [];
  };

  const flushList = () => {
    if (!currentList) return;
    const { ordered, items } = currentList;
    nodes.push(
      ordered ? (
        <ol key={`ol-${nodes.length}`} className="ai-markdown__list">
          {items.map((item, index) => (
            <li key={`${index}-${item}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>
      ) : (
        <ul key={`ul-${nodes.length}`} className="ai-markdown__list">
          {items.map((item, index) => (
            <li key={`${index}-${item}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>
      ),
    );
    currentList = null;
  };

  const flushCode = () => {
    if (!codeLines.length) return;
    nodes.push(
      <pre key={`pre-${nodes.length}`} className="ai-markdown__code">
        <code>{codeLines.join('\n')}</code>
      </pre>,
    );
    codeLines = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        flushCode();
        inCodeBlock = false;
      } else {
        flushParagraph();
        flushList();
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      return;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      return;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      const HeadingTag = `h${level}`;
      nodes.push(
        <HeadingTag key={`h-${nodes.length}`} className={`ai-markdown__heading ai-markdown__heading--${level}`}>
          {renderInlineMarkdown(headingMatch[2])}
        </HeadingTag>,
      );
      return;
    }

    const blockquoteMatch = line.match(/^>\s?(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      nodes.push(
        <blockquote key={`bq-${nodes.length}`} className="ai-markdown__quote">
          {renderInlineMarkdown(blockquoteMatch[1])}
        </blockquote>,
      );
      return;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    const unorderedMatch = line.match(/^[-*]\s+(.*)$/);

    if (orderedMatch || unorderedMatch) {
      flushParagraph();
      const ordered = Boolean(orderedMatch);
      const item = (orderedMatch || unorderedMatch)[1];
      if (!currentList || currentList.ordered !== ordered) {
        flushList();
        currentList = { ordered, items: [] };
      }
      currentList.items.push(item);
      return;
    }

    flushList();
    currentParagraph.push(line);
  });

  flushParagraph();
  flushList();
  if (inCodeBlock) flushCode();

  return nodes.length ? nodes : <p className="ai-markdown__paragraph">{renderInlineMarkdown(text)}</p>;
};

const AiChatBubble = () => {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: t('ai.greeting'),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showCallout, setShowCallout] = useState(true);
  const [typedCalloutText, setTypedCalloutText] = useState('');
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    const timer = window.setTimeout(() => setShowCallout(false), 9000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setMessages((current) => {
      if (current.length !== 1 || current[0]?.id !== 'welcome') return current;
      if (current[0]?.text === t('ai.greeting')) return current;
      return [{ ...current[0], text: t('ai.greeting') }];
    });
  }, [t]);

  useEffect(() => {
    if (!showCallout || open) {
      setTypedCalloutText('');
      return undefined;
    }

    setTypedCalloutText('');
    let index = 0;
    const calloutText = t('ai.greeting');
    const interval = window.setInterval(() => {
      index += 1;
      setTypedCalloutText(calloutText.slice(0, index));
      if (index >= calloutText.length) {
        window.clearInterval(interval);
      }
    }, 28);

    return () => window.clearInterval(interval);
  }, [open, showCallout, t]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    const onPointerDown = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        const target = event.target;
        if (!target.closest?.('[data-ai-launcher="true"]')) {
          setOpen(false);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  const quickPrompts = useMemo(() => t('ai.quickPrompts'), [t]);

  const appendAssistantMessage = (text, extra = {}) => {
    setMessages((prev) => [...prev, createMessage('assistant', text, extra)]);
  };

  const submitPrompt = async (prompt) => {
    const text = String(prompt || '').trim();
    if (!text || loading) return;

    setOpen(true);
    setMessages((prev) => [...prev, createMessage('user', text)]);
    setInput('');
    setLoading(true);
    setStreaming(false);

    const assistantMessageId = `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let receivedText = false;
    try {
      await streamAssistant(text, {
        onDelta: (delta) => {
          receivedText = true;
          setStreaming(true);
          setMessages((current) => {
            const existingIndex = current.findIndex((message) => message.id === assistantMessageId);
            if (existingIndex === -1) {
              return [...current, { id: assistantMessageId, role: 'assistant', text: delta }];
            }
            return current.map((message) => (
              message.id === assistantMessageId
                ? { ...message, text: `${message.text}${delta}` }
                : message
            ));
          });
        },
      });
      if (!receivedText) appendAssistantMessage(t('ai.fallbackAnswer'));
    } catch (error) {
      if (!receivedText) appendAssistantMessage(error.message || t('ai.fallbackError'));
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await submitPrompt(input);
  };

  if (!mounted) return null;

  return createPortal(
    <div className={`ai-chat-bubble${open ? ' ai-chat-bubble--open' : ''}`}>
      {showCallout && !open ? (
        <div className="ai-chat-callout" role="status" aria-live="polite">
          <span className="ai-chat-callout__text">
            {typedCalloutText}
            {typedCalloutText.length < t('ai.greeting').length ? <span className="ai-chat-callout__cursor">|</span> : null}
          </span>
          <button
            type="button"
            className="ai-chat-callout__close"
            aria-label={t('ai.closeHint')}
            onClick={() => setShowCallout(false)}
          >
            ×
          </button>
          <span className="ai-chat-callout__tail" aria-hidden="true" />
        </div>
      ) : null}

      {open ? (
        <section ref={panelRef} className="ai-chat-panel" aria-label={t('ai.assistant')}>
          <header className="ai-chat-panel__header">
            <div className="ai-chat-panel__brand">
              <div>
                <strong>{t('ai.assistant')}</strong>
                <span>{t('ai.status')}</span>
              </div>
            </div>
            <button
              type="button"
              className="ai-chat-panel__close"
              aria-label={t('ai.closeLabel')}
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>

          <div ref={listRef} className="ai-chat-panel__messages" aria-live="polite">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`ai-chat-message ai-chat-message--${message.role}`}
              >
                {message.role === 'assistant' ? (
                  <div className="ai-markdown">
                    {renderMarkdownContent(message.text)}
                  </div>
                ) : (
                  <p className="ai-chat-message__plain">{message.text}</p>
                )}
              </div>
            ))}
            {loading && !streaming ? (
              <div className="ai-chat-message ai-chat-message--assistant ai-chat-message--loading">
                <div className="ai-chat-loading" aria-label={t('ai.loading')} role="status">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            ) : null}
          </div>

          <div className="ai-chat-panel__chips ai-chat-panel__chips--composer" aria-label={t('ai.assistant')}>
            {quickPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="ai-chat-chip"
                onClick={() => submitPrompt(prompt)}
                disabled={loading}
              >
                {prompt}
              </button>
            ))}
          </div>

          <form className="ai-chat-panel__composer" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t('ai.placeholder')}
              aria-label={t('ai.inputLabel')}
            />
            <button
              type="submit"
              className="button button--primary ai-chat-panel__send"
              disabled={loading || !input.trim()}
              aria-label={t('ai.send')}
            >
              <svg viewBox="0 0 24 24" className="ai-chat-panel__send-icon" aria-hidden="true" focusable="false">
                <path
                  d="M5 12.5 19 5l-3.5 14-3.4-5-7.1-1.5Z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeLinejoin="round"
                  strokeWidth="1.2"
                />
              </svg>
            </button>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        className="ai-chat-launcher"
        data-ai-launcher="true"
        aria-label={t('ai.openLabel')}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setShowCallout(false);
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="ai-chat-launcher__shape"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M6.2 6.3h11.6A2.8 2.8 0 0 1 20.6 9v4.4a2.8 2.8 0 0 1-2.8 2.8H11.8L9 18.8c-.4.3-.9-.1-.8-.6l.6-1.9H6.2A2.8 2.8 0 0 1 3.4 13V9a2.8 2.8 0 0 1 2.8-2.7Z"
            fill="currentColor"
          />
          <circle cx="8.4" cy="11" r="0.95" fill="#ffffff" />
          <circle cx="12" cy="11" r="0.95" fill="#ffffff" opacity="0.92" />
          <circle cx="15.6" cy="11" r="0.95" fill="#ffffff" opacity="0.84" />
        </svg>
      </button>
    </div>,
    document.body,
  );
};

export default AiChatBubble;
