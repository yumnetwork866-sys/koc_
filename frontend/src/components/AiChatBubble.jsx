import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, MessageCircle, Minus, RotateCcw, Send, WifiOff, X } from 'lucide-react';
import { streamAssistant } from '../lib/api';
import { useI18n } from '../lib/language';

const createMessage = (role, text, extra = {}) => ({
  id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  role,
  text,
  createdAt: Date.now(),
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
  const { language, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => [
    {
      id: 'welcome',
      role: 'assistant',
      text: t('ai.greeting'),
      createdAt: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showCallout, setShowCallout] = useState(true);
  const [typedCalloutText, setTypedCalloutText] = useState('');
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const launcherRef = useRef(null);
  const openRef = useRef(open);
  const shouldAutoScrollRef = useRef(true);

  openRef.current = open;

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
    const updateOnlineStatus = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    if (!showCallout || open) {
      setTypedCalloutText('');
      return undefined;
    }

    const greeting = t('ai.greeting');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTypedCalloutText(greeting);
      return undefined;
    }

    setTypedCalloutText('');
    let index = 0;
    const interval = window.setInterval(() => {
      index += 1;
      setTypedCalloutText(greeting.slice(0, index));
      if (index >= greeting.length) window.clearInterval(interval);
    }, 28);

    return () => window.clearInterval(interval);
  }, [open, showCallout, t]);

  useEffect(() => {
    if (!open) return undefined;
    setUnreadCount(0);
    shouldAutoScrollRef.current = true;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 180);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeChat();
        return;
      }

      if (event.key === 'Tab' && window.matchMedia('(max-width: 640px)').matches) {
        const focusable = Array.from(panelRef.current?.querySelectorAll(
          'button:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        ) || []);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    const onPointerDown = (event) => {
      if (window.matchMedia('(max-width: 640px)').matches) return;
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        const target = event.target;
        if (!target.closest?.('[data-ai-launcher="true"]')) {
          closeChat();
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

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || !open || !shouldAutoScrollRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [input]);

  const quickPrompts = useMemo(() => t('ai.quickPrompts'), [t]);
  const isWelcome = messages.length === 1 && messages[0]?.id === 'welcome' && !loading;
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
  }), [language]);

  const closeChat = () => {
    setOpen(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  };

  const openChat = () => {
    setOpen(true);
    setShowCallout(false);
    setUnreadCount(0);
  };

  const appendAssistantMessage = (text, extra = {}) => {
    setMessages((prev) => [...prev, createMessage('assistant', text, extra)]);
    if (!openRef.current) setUnreadCount((count) => count + 1);
  };

  const submitPrompt = async (prompt) => {
    const text = String(prompt || '').trim();
    if (!text || loading || !online) return;

    openChat();
    shouldAutoScrollRef.current = true;
    setMessages((prev) => [...prev, createMessage('user', text)]);
    setInput('');
    setLoading(true);
    setStreaming(false);

    const assistantMessageId = `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let receivedText = false;
    let unreadRaised = false;
    try {
      await streamAssistant(text, {
        onDelta: (delta) => {
          receivedText = true;
          setStreaming(true);
          if (!openRef.current && !unreadRaised) {
            unreadRaised = true;
            setUnreadCount((count) => count + 1);
          }
          setMessages((current) => {
            const existingIndex = current.findIndex((message) => message.id === assistantMessageId);
            if (existingIndex === -1) {
              return [...current, {
                id: assistantMessageId,
                role: 'assistant',
                text: delta,
                createdAt: Date.now(),
              }];
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
      if (!receivedText) {
        appendAssistantMessage(error.message || t('ai.fallbackError'), {
          error: true,
          retryPrompt: text,
        });
      }
    } finally {
      setLoading(false);
      setStreaming(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await submitPrompt(input);
  };

  const handleInputKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const handleMessageScroll = () => {
    const el = listRef.current;
    if (!el) return;
    shouldAutoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 56;
  };

  if (!mounted) return null;

  return createPortal(
    <div className={`ai-chat-bubble${open ? ' ai-chat-bubble--open' : ''}`}>
      {showCallout && !open ? (
        <div className="ai-chat-callout" role="status" aria-label={t('ai.greeting')}>
          <span className="ai-chat-callout__text" aria-hidden="true">
            {typedCalloutText}
            {typedCalloutText.length < t('ai.greeting').length ? (
              <span className="ai-chat-callout__cursor">|</span>
            ) : null}
          </span>
          <button
            type="button"
            className="ai-chat-callout__close"
            aria-label={t('ai.closeHint')}
            onClick={() => setShowCallout(false)}
          >
            <X size={15} aria-hidden="true" />
          </button>
          <span className="ai-chat-callout__tail" aria-hidden="true" />
        </div>
      ) : null}

      <section
        ref={panelRef}
        className={`ai-chat-panel${open ? ' ai-chat-panel--open' : ''}`}
        role="dialog"
        aria-modal={open && typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches ? 'true' : undefined}
        aria-label={t('ai.assistant')}
        aria-hidden={!open}
        inert={!open}
      >
          <header className="ai-chat-panel__header">
            <div className="ai-chat-panel__brand">
              <span className="ai-chat-panel__avatar" aria-hidden="true">
                <Bot size={19} strokeWidth={2.1} />
                <i className={`ai-chat-status-dot${online ? '' : ' ai-chat-status-dot--offline'}`} />
              </span>
              <div>
                <strong>{t('ai.assistant')}</strong>
                <span>{online ? t('ai.status') : t('ai.offlineStatus')}</span>
              </div>
            </div>
            <div className="ai-chat-panel__actions">
              <button
                type="button"
                className="ai-chat-panel__control"
                aria-label={t('ai.minimizeLabel')}
                onClick={closeChat}
              >
                <Minus size={18} />
              </button>
              <button
                type="button"
                className="ai-chat-panel__control"
                aria-label={t('ai.closeLabel')}
                onClick={closeChat}
              >
                <X size={18} />
              </button>
            </div>
          </header>

          <div
            ref={listRef}
            className={`ai-chat-panel__messages${isWelcome ? ' ai-chat-panel__messages--welcome' : ''}`}
            aria-live="polite"
            aria-busy={loading}
            onScroll={handleMessageScroll}
          >
            {isWelcome ? (
              <div className="ai-chat-welcome">
                <div>
                  <strong>{t('ai.greeting')}</strong>
                  <p>{t('ai.welcomeDescription')}</p>
                </div>
              </div>
            ) : messages.map((message) => (
              <article
                key={message.id}
                className={`ai-chat-message-group ai-chat-message-group--${message.role}`}
              >
                <div className={`ai-chat-message ai-chat-message--${message.role}${message.error ? ' ai-chat-message--error' : ''}`}>
                  {message.role === 'assistant' ? (
                    <div className="ai-markdown">
                      {renderMarkdownContent(message.text)}
                    </div>
                  ) : (
                    <p className="ai-chat-message__plain">{message.text}</p>
                  )}
                  {message.error && message.retryPrompt ? (
                    <button
                      type="button"
                      className="ai-chat-message__retry"
                      onClick={() => submitPrompt(message.retryPrompt)}
                      disabled={loading || !online}
                    >
                      <RotateCcw size={14} />
                      {t('ai.retry')}
                    </button>
                  ) : null}
                </div>
                <time dateTime={new Date(message.createdAt).toISOString()}>
                  {timeFormatter.format(new Date(message.createdAt))}
                </time>
              </article>
            ))}
            {loading && !streaming ? (
              <div className="ai-chat-message-group ai-chat-message-group--assistant">
                <div className="ai-chat-message ai-chat-message--assistant ai-chat-message--loading">
                  <div className="ai-chat-loading" aria-label={t('ai.loading')} role="status">
                    <span />
                    <span />
                    <span />
                    <small>{t('ai.typing')}</small>
                  </div>
                </div>
              </div>
            ) : null}
            {!online ? (
              <div className="ai-chat-unavailable" role="status">
                <WifiOff size={17} aria-hidden="true" />
                <span>{t('ai.offlineMessage')}</span>
              </div>
            ) : null}
          </div>

          <div className="ai-chat-panel__quick-actions" aria-label={t('ai.suggestionsLabel')}>
            {quickPrompts.slice(0, 2).map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="ai-chat-chip ai-chat-chip--persistent"
                onClick={() => submitPrompt(prompt)}
                disabled={loading || !online}
              >
                {prompt}
              </button>
            ))}
          </div>

          <form className="ai-chat-panel__composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="ai-chat-input">{t('ai.inputLabel')}</label>
            <textarea
              id="ai-chat-input"
              ref={inputRef}
              rows="1"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={online ? t('ai.placeholder') : t('ai.offlinePlaceholder')}
              aria-label={t('ai.inputLabel')}
              disabled={!online}
            />
            <button
              type="submit"
              className="ai-chat-panel__send"
              disabled={loading || !online || !input.trim()}
              aria-label={t('ai.send')}
            >
              <Send size={18} aria-hidden="true" />
            </button>
          </form>
        </section>

      <button
        ref={launcherRef}
        type="button"
        className="ai-chat-launcher"
        data-ai-launcher="true"
        aria-label={t('ai.openLabel')}
        aria-expanded={open}
        onClick={() => (open ? closeChat() : openChat())}
      >
        <MessageCircle className="ai-chat-launcher__shape" size={25} strokeWidth={2.2} aria-hidden="true" />
        <span className={`ai-chat-launcher__status${online ? '' : ' ai-chat-launcher__status--offline'}`} aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="ai-chat-launcher__unread" aria-label={t('ai.unreadCount', { count: unreadCount })}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>
    </div>,
    document.body,
  );
};

export default AiChatBubble;
