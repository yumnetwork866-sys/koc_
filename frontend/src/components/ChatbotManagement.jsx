import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  connectFacebookPage,
  createChatbotKnowledgeDoc,
  deleteChatbotKnowledgeDoc,
  disconnectFacebookPage,
  fetchChatbotConversations,
  fetchChatbotFacebookMe,
  fetchChatbotKnowledgeDocs,
  fetchChatbotMessages,
  fetchChatbotOrders,
  fetchChatbotOllamaModels,
  fetchChatbotPages,
  fetchChatbotStats,
  fetchFacebookManagedPages,
  revokeChatbotFacebookAccountByUser,
  sendChatbotMessage,
  fetchChatbotSettings,
  updateChatbotSettings,
  updateChatbotOrder,
} from '../lib/api';
import {
  clearStoredFacebookChatbotToken,
  saveStoredFacebookChatbotToken,
} from '../lib/session';
import { useI18n } from '../lib/language';

const formatTime = (value, locale) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
};

const formatConversationTime = (value, locale) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat(locale, isToday
    ? { hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: '2-digit' }).format(date);
};

const orderStatuses = ['new', 'confirmed', 'done', 'cancelled'];

const getConversationKey = (conversation) => `${conversation?.pageId !== undefined && conversation?.pageId !== null ? String(conversation.pageId) : 'unknown'}:${conversation?.senderId || ''}`;

const getConversationAvatarText = (conversation) => {
  const source = String(conversation?.displayName || conversation?.senderId || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2
    ? `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`
    : source.slice(0, 2);
  return initials.toUpperCase();
};

const getPageAvatarText = (name) => {
  const source = String(name || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2
    ? `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`
    : source.slice(0, 2);
  return initials.toUpperCase();
};

const getOwnerAvatarText = (name) => getPageAvatarText(name);

const getMessageDisplayName = (message) => {
  if (message?.displayName) return String(message.displayName).trim();
  if (message?.direction === 'out') {
    return message?.via === 'manual' ? 'Bạn' : 'Bot';
  }
  return String(message?.senderId || 'Khách').trim();
};

const getMessageAvatarText = (message) => getPageAvatarText(getMessageDisplayName(message));

const mergeModelOptions = (baseModels, ollamaModels, currentSetting) => {
  const map = new Map();
  [...(baseModels || []), ...(ollamaModels || [])].forEach((item) => {
    if (!item?.provider || !item?.model) return;
    map.set(`${item.provider}:${item.model}`, item);
  });

  if (currentSetting?.provider && currentSetting?.model) {
    const key = `${currentSetting.provider}:${currentSetting.model}`;
    if (!map.has(key)) {
      map.set(key, {
        provider: currentSetting.provider,
        model: currentSetting.model,
        label: `${currentSetting.provider === 'ollama' ? 'Ollama' : 'Gemini'}: ${currentSetting.model}`,
      });
    }
  }

  return [...map.values()];
};

const ChatbotManagement = ({ heroTitle, heroSubtitle }) => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const location = useLocation();
  const navigate = useNavigate();
  const activeSection = location.pathname.split('/').filter(Boolean)[1] || 'dashboard';
  const [facebookMe, setFacebookMe] = useState({
    configured: false,
    loggedIn: false,
    name: null,
    userId: null,
    avatarUrl: null,
  });
  const [managedPages, setManagedPages] = useState([]);
  const [chatSettings, setChatSettings] = useState({ provider: 'gemini', model: '', ollamaHost: '', models: [] });
  const [ollamaModels, setOllamaModels] = useState([]);
  const [settingsForm, setSettingsForm] = useState({ modelKey: '' });
  const [stats, setStats] = useState({});
  const [conversations, setConversations] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState(null);
  const [selectedSenderId, setSelectedSenderId] = useState('');
  const [selectedConversationPageId, setSelectedConversationPageId] = useState('');
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [conversationQuery, setConversationQuery] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [orders, setOrders] = useState([]);
  const [docs, setDocs] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [docForm, setDocForm] = useState({ title: '', content: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const pagePickerTriggerRef = useRef(null);
  const pagePickerMenuRef = useRef(null);
  const messagesRequestRef = useRef(0);
  const messageListRef = useRef(null);
  const [pagePickerMenuStyle, setPagePickerMenuStyle] = useState(null);

  const managedPageMap = useMemo(
    () => new Map(managedPages.map((page) => [page.id, page])),
    [managedPages],
  );

  const chatPageOptions = useMemo(() => {
    // Only show pages that are still connected so the chat view stays aligned with the dashboard.
    return managedPages
      .filter((page) => page?.connected)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [managedPages]);

  const filteredConversations = useMemo(() => {
    if (!selectedPageId) return conversations;
    const selPageIdStr = String(selectedPageId);
    return conversations.filter((conversation) => String(conversation.pageId) === selPageIdStr);
  }, [conversations, selectedPageId]);

  const visibleConversations = useMemo(() => {
    const query = conversationQuery.trim().toLocaleLowerCase('vi');
    if (!query) return filteredConversations;
    return filteredConversations.filter((conversation) => (
      [conversation.displayName, conversation.senderId, conversation.lastText]
        .some((value) => String(value || '').toLocaleLowerCase('vi').includes(query))
    ));
  }, [conversationQuery, filteredConversations]);

  const selectedConversation = useMemo(() => {
    if (!selectedSenderId) return null;
    return filteredConversations.find((conversation) => (
      conversation.senderId === selectedSenderId
      && (!selectedConversationPageId || String(conversation.pageId) === String(selectedConversationPageId))
    ))
      || conversations.find((conversation) => (
        conversation.senderId === selectedSenderId
        && (!selectedConversationPageId || String(conversation.pageId) === String(selectedConversationPageId))
      ))
      || null;
  }, [conversations, filteredConversations, selectedConversationPageId, selectedSenderId]);

  const selectedConversationKey = useMemo(
    () => (selectedConversation ? getConversationKey(selectedConversation) : ''),
    [selectedConversation],
  );

  const selectedMessagePageId = selectedConversation?.pageId || selectedPageId || '';

  const selectedChatPage = useMemo(
    () => chatPageOptions.find((page) => String(page.id) === String(selectedPageId)) || null,
    [chatPageOptions, selectedPageId],
  );

  const facebookUserGroups = useMemo(() => {
    const groups = new Map();

    managedPages.forEach((page) => {
      const ownerId = String(page.ownerId || page.owner_id || page.userId || facebookMe.userId || '').trim();
      const ownerName = String(page.ownerName || page.owner_name || page.userName || facebookMe.name || 'Facebook user').trim();
      const key = ownerId || ownerName;
      const current = groups.get(key) || {
        id: key,
        ownerId,
        ownerName,
        avatarUrl: facebookMe.avatarUrl || null,
        pages: [],
      };

      current.pages.push(page);
      groups.set(key, current);
    });

    return [...groups.values()].map((group) => ({
      ...group,
      pages: group.pages.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    })).sort((a, b) => a.ownerName.localeCompare(b.ownerName));
  }, [facebookMe.avatarUrl, facebookMe.name, facebookMe.userId, managedPages]);

  const connectedPagesCount = useMemo(
    () => managedPages.filter((page) => page.connected).length,
    [managedPages],
  );

  const loadOverview = useCallback(async (signal) => {
    const [
      me,
      nextStats,
      nextConversations,
      nextOrders,
      nextDocs,
      nextSettings,
      nextOllamaModels,
      nextLocalPages,
    ] = await Promise.all([
      fetchChatbotFacebookMe(signal),
      fetchChatbotStats(signal),
      fetchChatbotConversations(signal),
      fetchChatbotOrders(signal),
      fetchChatbotKnowledgeDocs(signal),
      fetchChatbotSettings(signal),
      fetchChatbotOllamaModels(signal).catch((err) => {
        if (err.status === 502) return { models: [] };
        throw err;
      }),
      fetchChatbotPages(signal).catch(() => []),
    ]);

    setFacebookMe(me);
    if (!me.loggedIn) {
      clearStoredFacebookChatbotToken();
    }
    setStats(nextStats);
    setConversations(nextConversations);
    setOrders(nextOrders);
    setDocs(nextDocs);
    setChatSettings(nextSettings);
    setOllamaModels(nextOllamaModels.models || []);
    setSettingsForm({
      modelKey: `${nextSettings.provider}:${nextSettings.model}`,
    });

    let graphPages = [];
    if (me.loggedIn) {
      try {
        graphPages = await fetchFacebookManagedPages(signal);
      } catch (err) {
        if (err.status !== 428) throw err;
      }
    }

    const ownedGraphPages = graphPages.map((page) => ({
      ...page,
      ownerId: page.ownerId || me.userId || '',
      ownerName: page.ownerName || me.name || '',
    }));

    const combinedPages = new Map();
    [...ownedGraphPages, ...(nextLocalPages || []).map((page) => ({
      ...page,
      connected: true,
      canManage: true,
      source: 'local',
    }))].forEach((page) => {
      if (!page?.id) return;
      const existing = combinedPages.get(page.id) || {};
      const next = {
        ...existing,
        ...page,
        connected: Boolean(existing.connected || page.connected || page.source === 'local'),
        canManage: Boolean(existing.canManage || page.canManage || page.source === 'local'),
      };
      combinedPages.set(page.id, next);
    });
    setManagedPages([...combinedPages.values()]);
  }, []);

  useEffect(() => {
    if (!chatPageOptions.length) {
      setSelectedPageId(null);
      return;
    }

    setSelectedPageId((current) => {
      if (current === '') return current;
      const currentStr = current ? String(current) : '';
      if (currentStr && chatPageOptions.some((page) => String(page.id) === currentStr)) {
        return current;
      }
      const foundConv = conversations.find((conversation) => (
        conversation.pageId && chatPageOptions.some((page) => String(page.id) === String(conversation.pageId))
      ));
      return foundConv?.pageId || '';
    });
  }, [chatPageOptions, conversations]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list || messagesLoading) return;
    list.scrollTop = list.scrollHeight;
  }, [messages, messagesLoading, selectedConversationKey]);

  useEffect(() => {
    const currentConversation = filteredConversations.find((conversation) => (
      conversation.senderId === selectedSenderId
      && String(conversation.pageId || '') === String(selectedConversationPageId || '')
    ));
    const nextConversation = currentConversation || filteredConversations[0] || null;
    setSelectedSenderId(nextConversation?.senderId || '');
    setSelectedConversationPageId(nextConversation?.pageId || '');
  }, [filteredConversations, selectedConversationPageId, selectedSenderId]);

  useEffect(() => {
    if (!pagePickerOpen) {
      setPagePickerMenuStyle(null);
      return undefined;
    }

    const updateMenuPosition = () => {
      const trigger = pagePickerTriggerRef.current;
      if (!trigger || typeof window === 'undefined') return;

      const rect = trigger.getBoundingClientRect();
      const menuWidth = Math.min(280, Math.max(window.innerWidth - 24, 180));
      const viewportPadding = 12;
      const openAbove = rect.bottom + 292 > window.innerHeight && rect.top > 292;
      const left = Math.min(
        Math.max(viewportPadding, rect.right - menuWidth),
        Math.max(viewportPadding, window.innerWidth - menuWidth - viewportPadding),
      );
      const top = openAbove
        ? Math.max(viewportPadding, rect.top - 8 - 280)
        : rect.bottom + 8;

      setPagePickerMenuStyle({
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${menuWidth}px`,
        right: 'auto',
        bottom: 'auto',
        zIndex: 2000,
        maxHeight: '280px',
      });
    };

    const handlePointerDown = (event) => {
      const trigger = pagePickerTriggerRef.current;
      const menu = pagePickerMenuRef.current;
      if (trigger?.contains(event.target) || menu?.contains(event.target)) return;
      setPagePickerOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') setPagePickerOpen(false);
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [pagePickerOpen]);

  useEffect(() => {
    if (activeSection !== 'chat') setPagePickerOpen(false);
  }, [activeSection]);

  const loadMessages = useCallback(async (senderId, pageId, signal) => {
    const requestId = messagesRequestRef.current + 1;
    messagesRequestRef.current = requestId;

    if (!senderId || !pageId) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }

    setMessages([]);
    setMessagesLoading(true);
    try {
      const nextMessages = await fetchChatbotMessages(senderId, pageId, signal);
      if (messagesRequestRef.current === requestId) {
        setMessages(nextMessages);
      }
    } finally {
      if (messagesRequestRef.current === requestId) {
        setMessagesLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        await loadOverview(controller.signal);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message || t('chatbot.loadError'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [loadOverview, t]);

  const refresh = useCallback(async () => {
    await loadOverview();
    if (selectedMessagePageId && selectedSenderId) await loadMessages(selectedSenderId, selectedMessagePageId);
  }, [loadMessages, loadOverview, selectedMessagePageId, selectedSenderId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('oauth_status');
    if (!status) return;
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const fbToken = hash.get('fb_token');

    const syncAfterOauth = async () => {
    setToast({
      status,
      message: params.get('oauth_message') || (status === 'success' ? 'Facebook account connected' : 'Facebook connection failed'),
      });

      if (status === 'success') {
        if (fbToken) saveStoredFacebookChatbotToken(fbToken);
        try {
          await refresh();
        } catch (err) {
          if (err.name !== 'AbortError') setError(err.message || t('chatbot.syncError'));
        }
      } else {
        clearStoredFacebookChatbotToken();
      }

      navigate({ pathname: location.pathname, search: '', hash: '' }, { replace: true });
    };

    syncAfterOauth();
  }, [location.hash, location.pathname, location.search, navigate, refresh, t]);

  useEffect(() => {
    const controller = new AbortController();

    loadMessages(selectedSenderId, selectedMessagePageId, controller.signal).catch((err) => {
      if (err.name !== 'AbortError') setError(err.message || t('chatbot.conversationError'));
    });

    return () => controller.abort();
  }, [loadMessages, selectedMessagePageId, selectedSenderId, t]);

  useEffect(() => {
    if (!toast) return undefined;

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const handleRevokeFacebookAccount = async (group) => {
    if (!window.confirm(t('chatbot.revokeConfirm', { name: group.ownerName }))) return;
    await revokeChatbotFacebookAccountByUser(group.ownerId);
    if (facebookMe.userId === group.ownerId) {
      clearStoredFacebookChatbotToken();
    }
    await refresh();
  };

  const handleConnectPage = async (pageId) => {
    await connectFacebookPage(pageId);
    await refresh();
  };

  const handleDisconnectPage = async (page) => {
    if (!window.confirm(t('chatbot.disconnectConfirm', { name: page.name }))) return;
    await disconnectFacebookPage(page.id);
    await refresh();
  };

  const getPageAvatarUrl = (page) => managedPageMap.get(page.id)?.avatarUrl || page.avatarUrl || null;

  const handleSendReply = async (event) => {
    event.preventDefault();
    const text = replyText.trim();
    if (!selectedMessagePageId || !selectedSenderId || !text) return;
    try {
      setSendingReply(true);
      await sendChatbotMessage({
        senderId: selectedSenderId,
        pageId: selectedMessagePageId,
        text,
      });
      setReplyText('');
      await Promise.all([loadMessages(selectedSenderId, selectedMessagePageId), loadOverview()]);
    } catch (err) {
      setError(err.message || t('chatbot.sendError'));
    } finally {
      setSendingReply(false);
    }
  };

  const handleCreateDoc = async (event) => {
    event.preventDefault();
    if (!docForm.content.trim()) return;
    await createChatbotKnowledgeDoc(docForm);
    setDocForm({ title: '', content: '' });
    await refresh();
  };

  const handleDeleteDoc = async (docId) => {
    await deleteChatbotKnowledgeDoc(docId);
    await refresh();
  };

  const handleOrderStatus = async (orderId, status) => {
    await updateChatbotOrder(orderId, { status });
    await refresh();
  };

  const handleSaveSettings = async (event) => {
    event.preventDefault();
    const [provider, ...modelParts] = String(settingsForm.modelKey || '').split(':');
    const model = modelParts.join(':').trim();
    if (!provider || !model) return;
    const updated = await updateChatbotSettings({
      provider,
      model,
    });
    setChatSettings(updated);
    setSettingsForm({
      modelKey: `${updated.provider}:${updated.model}`,
    });
    setToast({ status: 'success', message: t('chatbot.settingsSaved') });
  };

  const renderSection = () => {
    if (activeSection === 'chat') {
      return (
        <section className="section-card chatbot-chat-card" id="chat">
            <div className="section-card__header chatbot-chat-card__header">
              <div className="chatbot-chat-card__heading">
                <span className="chatbot-chat-card__eyebrow">Facebook Messenger</span>
                <h1>{t('chatbot.inbox')}</h1>
              </div>
              <div className="chatbot-chat-card__tools">
                <div className="chatbot-page-picker">
                  <span className="chatbot-page-picker__label">{t('chatbot.page')}</span>
                <div className="chatbot-page-picker__menu-wrap">
                  <button
                    ref={pagePickerTriggerRef}
                    className="chatbot-page-picker__trigger"
                    type="button"
                    disabled={!chatPageOptions.length}
                    aria-haspopup="listbox"
                    aria-expanded={pagePickerOpen}
                    onClick={() => setPagePickerOpen((current) => !current)}
                  >
                    <span className="mini-card__avatar chatbot-page-picker__avatar" aria-hidden="true">
                      {selectedChatPage && getPageAvatarUrl(selectedChatPage) ? (
                        <img src={getPageAvatarUrl(selectedChatPage)} alt="" />
                      ) : (
                        getPageAvatarText(selectedChatPage?.name || 'Tất cả Page')
                      )}
                    </span>
                    <span className="chatbot-page-picker__name">{selectedChatPage?.name?.trim() || selectedChatPage?.id || 'Tất cả Page'}</span>
                    <svg className="chatbot-page-picker__chevron" aria-hidden="true" viewBox="0 0 20 20">
                      <path d="m5 7.5 5 5 5-5" />
                    </svg>
                  </button>
                  {pagePickerOpen && typeof document !== 'undefined' ? createPortal(
                    <div
                      ref={pagePickerMenuRef}
                      className="chatbot-page-picker__menu"
                      role="listbox"
                      style={pagePickerMenuStyle || undefined}
                    >
                      <button
                        className={`chatbot-page-picker__option${!selectedPageId ? ' chatbot-page-picker__option--active' : ''}`}
                        type="button"
                        role="option"
                        aria-selected={!selectedPageId}
                        onClick={() => {
                          setSelectedPageId('');
                          setPagePickerOpen(false);
                        }}
                      >
                        <span className="mini-card__avatar chatbot-page-picker__avatar" aria-hidden="true">
                          {getPageAvatarText(t('chatbot.allPages'))}
                        </span>
                        <span className="chatbot-page-picker__name">{t('chatbot.allPages')}</span>
                      </button>
                      {chatPageOptions.map((page) => (
                        <button
                          key={page.id}
                          className={`chatbot-page-picker__option${String(page.id) === String(selectedPageId) ? ' chatbot-page-picker__option--active' : ''}`}
                          type="button"
                          role="option"
                          aria-selected={String(page.id) === String(selectedPageId)}
                          onClick={() => {
                            setSelectedPageId(page.id);
                            setPagePickerOpen(false);
                          }}
                        >
                          <span className="mini-card__avatar chatbot-page-picker__avatar" aria-hidden="true">
                            {getPageAvatarUrl(page) ? (
                              <img src={getPageAvatarUrl(page)} alt="" />
                            ) : (
                              getPageAvatarText(page.name)
                            )}
                          </span>
                          <span className="chatbot-page-picker__name">{page.name || page.id}</span>
                        </button>
                      ))}
                    </div>,
                    document.body,
                  ) : null}
                </div>
                </div>
              </div>
            </div>
            <div className="chatbot-chat-card__summary" aria-label={t('chatbot.inboxSummary')}>
              <span>{t('chatbot.conversationCount', { count: filteredConversations.length || 0 })}</span>
              <span>{t('chatbot.messageCount', { count: stats.totalMessages || 0 })}</span>
              <span className="chatbot-chat-card__summary-alert">{t('chatbot.newOrderCount', { count: stats.newOrders || 0 })}</span>
            </div>
            {error ? <div className="chatbot-chat-card__error" role="alert">{error}</div> : null}
            <div className="chatbot-inbox__layout">
              <div className="chatbot-inbox__list">
                <div className="chatbot-inbox__list-head">
                  <div>
                    <strong>{t('chatbot.conversations')}</strong>
                    <span>{filteredConversations.length}</span>
                  </div>
                  <label className="chatbot-conversation-search">
                    <svg aria-hidden="true" viewBox="0 0 20 20">
                      <circle cx="8.5" cy="8.5" r="5.5" />
                      <path d="m13 13 4 4" />
                    </svg>
                    <span className="sr-only">{t('chatbot.search')}</span>
                    <input
                      type="search"
                      value={conversationQuery}
                      onChange={(event) => setConversationQuery(event.target.value)}
                      placeholder={t('chatbot.searchPlaceholder')}
                    />
                  </label>
                </div>
                <div className="chatbot-inbox__list-scroll">
                {visibleConversations.map((conversation) => (
                  <button
                    key={`${conversation.pageId || 'page'}:${conversation.senderId}`}
                    type="button"
                    className={`conversation-row${getConversationKey(conversation) === selectedConversationKey ? ' conversation-row--active' : ''}`}
                    onClick={() => {
                      setSelectedSenderId(conversation.senderId);
                      setSelectedConversationPageId(conversation.pageId || '');
                    }}
                  >
                    <span className="conversation-row__avatar" aria-hidden="true">
                      {conversation.avatarUrl ? (
                        <img src={conversation.avatarUrl} alt="" />
                      ) : (
                        getConversationAvatarText(conversation)
                      )}
                    </span>
                    <span className="conversation-row__content">
                      <span className="conversation-row__title">
                        <strong>{conversation.displayName || conversation.senderId}</strong>
                        <time dateTime={conversation.lastTs ? new Date(conversation.lastTs).toISOString() : undefined}>{formatConversationTime(conversation.lastTs, locale)}</time>
                      </span>
                      <small>{conversation.lastDirection === 'out' ? t('chatbot.youPrefix') : ''}{conversation.lastText || t('chatbot.noContent')}</small>
                    </span>
                  </button>
                ))}
                {!visibleConversations.length ? (
                  <div className="chatbot-inbox__empty chatbot-inbox__empty--centered">
                    <span className="chatbot-inbox__empty-icon" aria-hidden="true">{conversationQuery ? '⌕' : '✦'}</span>
                    <strong>{conversationQuery ? t('chatbot.noSearchResult') : t('chatbot.noConversations')}</strong>
                    <span>{conversationQuery ? t('chatbot.searchHint') : t('chatbot.emptyHint')}</span>
                  </div>
                ) : null}
                </div>
              </div>
              <div className="chatbot-inbox__thread">
                <div className="chatbot-thread__header">
                  {selectedConversation ? (
                    <>
                      <span className="conversation-row__avatar chatbot-thread__avatar" aria-hidden="true">
                        {selectedConversation.avatarUrl ? <img src={selectedConversation.avatarUrl} alt="" /> : getConversationAvatarText(selectedConversation)}
                      </span>
                      <div>
                        <strong>{selectedConversation.displayName || selectedConversation.senderId}</strong>
                      </div>
                    </>
                  ) : (
                    <div><strong>{t('chatbot.conversationDetail')}</strong><span>{t('chatbot.selectCustomer')}</span></div>
                  )}
                </div>
                <div className="message-list" ref={messageListRef}>
                  {messagesLoading ? (
                    <div className="chatbot-message-loading"><span /><span /><span /><small>{t('chatbot.loadingMessages')}</small></div>
                  ) : null}
                  {!messagesLoading && !selectedConversation ? (
                    <div className="chatbot-thread__empty">
                      <span aria-hidden="true">✦</span>
                      <strong>{t('chatbot.startConversation')}</strong>
                      <p>{t('chatbot.startHint')}</p>
                    </div>
                  ) : null}
                  {messages.map((message) => (
                    <article key={message.id} className={`message-row message-row--${message.direction}`}>
                      <time className="message-row__time">{formatTime(message.ts, locale)}</time>
                      <div className="message-row__body">
                        <span className="message-bubble__avatar" aria-hidden="true">
                          {message.avatarUrl ? (
                            <img src={message.avatarUrl} alt="" />
                          ) : (
                            getMessageAvatarText(message)
                          )}
                        </span>
                        <div className="message-bubble__content">
                          <div className="message-bubble__meta">
                            <strong>{getMessageDisplayName(message)}</strong>
                          </div>
                          <div className={`message-bubble message-bubble--${message.direction}`}>
                            <p>{message.text}</p>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <form className="reply-box" onSubmit={handleSendReply}>
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    placeholder={selectedConversation ? t('chatbot.replyTo', { name: selectedConversation.displayName || t('chatbot.customer') }) : t('chatbot.selectToReply')}
                    rows={1}
                    disabled={!selectedMessagePageId || !selectedSenderId || sendingReply}
                    aria-label={t('chatbot.messageContent')}
                  />
                  <button
                    className="button reply-box__send"
                    type="submit"
                    disabled={!selectedMessagePageId || !selectedSenderId || !replyText.trim() || sendingReply}
                    aria-label={sendingReply ? t('chatbot.sending') : t('chatbot.send')}
                    title={sendingReply ? t('chatbot.sending') : t('chatbot.send')}
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20"><path d="m3 3 14 7-14 7 2.2-6L12 10 5.2 9 3 3Z" /></svg>
                  </button>
                </form>
              </div>
            </div>
          </section>
      );
    }

    if (activeSection === 'chat-setting') {
      const modelOptions = mergeModelOptions(chatSettings.models, ollamaModels, chatSettings);
      return (
        <section className="section-card" id="chat-setting">
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title">{t('chatbot.settingsTitle')}</h2>
            </div>
          </div>
          <form className="kb-form" onSubmit={handleSaveSettings}>
            <label className="field">
              <span>{t('chatbot.model')}</span>
              <select
                value={settingsForm.modelKey}
                onChange={(event) => setSettingsForm((current) => ({ ...current, modelKey: event.target.value }))}
              >
                {modelOptions.map((option) => (
                  <option key={`${option.provider}:${option.model}`} value={`${option.provider}:${option.model}`}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="chip-row">
              <span className="chip chip--blue">{t('chatbot.current')}: {chatSettings.provider}</span>
              <span className="chip chip--positive">{t('chatbot.model')}: {chatSettings.model || '-'}</span>
            </div>
            <button className="button" type="submit">{t('chatbot.saveSettings')}</button>
          </form>
        </section>
      );
    }

    if (activeSection === 'rag') {
      return (
        <section className="section-card" id="rag">
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title">{t('chatbot.knowledge')}</h2>
              <p className="section-card__subtitle">{t('chatbot.knowledgeMeta')}</p>
            </div>
          </div>
          <form className="kb-form" onSubmit={handleCreateDoc}>
            <input
              value={docForm.title}
              onChange={(event) => setDocForm((current) => ({ ...current, title: event.target.value }))}
              placeholder={t('chatbot.titlePlaceholder')}
            />
            <textarea
              value={docForm.content}
              onChange={(event) => setDocForm((current) => ({ ...current, content: event.target.value }))}
              placeholder={t('chatbot.contentPlaceholder')}
              rows={4}
            />
            <button className="button" type="submit">{t('chatbot.addDocument')}</button>
          </form>
          <div className="chatbot-page-grid">
            {docs.map((doc) => (
              <article className="mini-card mini-card--doc" key={doc.id}>
                <div className="mini-card__content">
                  <h3>{doc.title}</h3>
                  <p>{doc.content}</p>
                </div>
                <div className="mini-card__action">
                  <button className="button button--ghost button--small" type="button" onClick={() => handleDeleteDoc(doc.id)}>
                    {t('chatbot.delete')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      );
    }

    if (activeSection === 'orders') {
      return (
        <section className="section-card" id="orders">
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title">{t('chatbot.ordersTitle')}</h2>
              <p className="section-card__subtitle">{t('chatbot.ordersMeta')}</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('chatbot.customer')}</th>
                  <th>{t('chatbot.content')}</th>
                  <th>{t('chatbot.phone')}</th>
                  <th>{t('chatbot.status')}</th>
                  <th>{t('chatbot.time')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.length ? (
                  orders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.senderId}</td>
                      <td>{order.raw}</td>
                      <td>{order.phone || '-'}</td>
                      <td>
                        <select value={order.status} onChange={(event) => handleOrderStatus(order.id, event.target.value)}>
                          {orderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </td>
                      <td>{formatTime(order.ts, locale)}</td>
                    </tr>
                  ))
                ) : (
                  <tr className="table-state-row">
                    <td className="table-state-cell" colSpan={5}>
                      <div className="empty-state empty-state--compact table-empty-state">{t('chatbot.noOrders')}</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

      return (
        <>
          {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}
          {loading ? <section className="section-card empty-state empty-state--compact">{t('chatbot.loading')}</section> : null}

          <section className="section-card">
            <div className="section-card__header section-card__header--compact">
              <div>
                <h2 className="section-card__title">{t('chatbot.usersPages')}</h2>
              </div>
            </div>

            {facebookMe.loggedIn && facebookUserGroups.length ? (
              <div className="facebook-user-groups">
                {facebookUserGroups.map((group) => (
                  <article className="facebook-user-group" key={group.id}>
                    <div className="facebook-user-group__head">
                      <div className="facebook-user-group__identity">
                        <span className="facebook-user-group__avatar" aria-hidden="true">
                          {group.avatarUrl ? (
                            <img src={group.avatarUrl} alt="" />
                          ) : (
                            getOwnerAvatarText(group.ownerName)
                          )}
                        </span>
                        <div className="facebook-user-group__meta">
                          <h3>
                            <span>{group.ownerName}</span>
                            <span className="chip chip--blue">{t('chatbot.pagesCount', { count: group.pages.length })}</span>
                          </h3>
                          <p>{group.ownerId || t('chatbot.unknownUser')}</p>
                        </div>
                      </div>
                      <div className="facebook-user-group__actions">
                        <button
                          className="button button--danger button--icon"
                          type="button"
                          disabled={!group.ownerId}
                          onClick={() => handleRevokeFacebookAccount(group)}
                          aria-label={t('chatbot.revokeAccount', { name: group.ownerName })}
                          title={t('chatbot.revokeAccount', { name: group.ownerName })}
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                            <path d="M9 3h6l1 2h4v2H4V5h4l1-2Z" />
                            <path d="M6 9h12l-.8 12H6.8L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="chatbot-page-grid chatbot-page-grid--nested">
                      {group.pages.map((page) => (
                        <article className="mini-card mini-card--nested" key={page.id}>
                          <span className="mini-card__avatar" aria-hidden="true">
                            {getPageAvatarUrl(page) ? (
                              <img src={getPageAvatarUrl(page)} alt="" />
                            ) : (
                              getPageAvatarText(page.name)
                            )}
                          </span>
                          <div className="mini-card__content">
                            <h3>{page.name}</h3>
                            <p className={`facebook-page-status${page.connected ? ' facebook-page-status--connected' : ''}`}>
                              <span aria-hidden="true" />
                              {page.connected ? t('chatbot.pageConnected') : t('chatbot.pageNotConnected')}
                            </p>
                          </div>
                          <div className="mini-card__action mini-card__action--stack">
                            {page.connected ? (
                              <button
                                className="button button--ghost button--small"
                                type="button"
                                onClick={() => handleDisconnectPage(page)}
                              >
                                {t('chatbot.disconnect')}
                              </button>
                            ) : (
                              <button
                                className="button button--small"
                                type="button"
                                disabled={!page.canManage}
                                onClick={() => handleConnectPage(page.id)}
                              >
                                {t('chatbot.connect')}
                              </button>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="section-card__meta">{t('chatbot.noPages')}</div>
            )}
          </section>
        </>
      );
  };

  const toastNode = toast && typeof document !== 'undefined'
    ? createPortal(
      <div className={`toast ${toast.status === 'success' ? 'toast--success' : 'toast--error'}`} role="status">
        {toast.message}
      </div>,
      document.body,
    )
    : null;

  return (
    <div className="page chatbot-page">
      {toastNode}

      {activeSection !== 'chat' ? (
        activeSection === 'dashboard' ? (
          <section className="facebook-dashboard-hero" id="dashboard">
            <div className="facebook-dashboard-hero__heading">
              <span className="facebook-dashboard-hero__eyebrow">Facebook Messenger</span>
              <h1 className="page__title">{t('chatbot.dashboardTitle')}</h1>
              <p className="page__subtitle">{t('chatbot.dashboardMeta')}</p>
              <div className="facebook-dashboard-hero__actions">
                <button className="button" type="button" onClick={() => navigate('/chatbot/chat')}>
                  {t('chatbot.openInbox')}
                </button>
                <button className="button button--ghost" type="button" onClick={() => navigate('/chatbot/orders')}>
                  {t('chatbot.viewOrders')}
                </button>
              </div>
            </div>
            <div className="facebook-dashboard-hero__stats" aria-label={t('chatbot.dashboardSummary')}>
              <article className="facebook-dashboard-stat facebook-dashboard-stat--status">
                <p>{t('chatbot.facebookConnection')}</p>
                <strong>{facebookMe.loggedIn ? t('chatbot.connected') : t('chatbot.notConnected')}</strong>
                <span className={facebookMe.loggedIn ? 'is-connected' : ''} aria-hidden="true" />
              </article>
              <article className="facebook-dashboard-stat">
                <p>{t('chatbot.connectedPages')}</p>
                <strong>{connectedPagesCount}</strong>
                <small>{t('chatbot.ofPages', { count: managedPages.length })}</small>
              </article>
              <article className="facebook-dashboard-stat">
                <p>{t('chatbot.conversations')}</p>
                <strong>{conversations.length}</strong>
                <small>{t('chatbot.readyToReply')}</small>
              </article>
              <article className="facebook-dashboard-stat">
                <p>{t('chatbot.newOrders')}</p>
                <strong>{stats.newOrders || 0}</strong>
                <small>{t('chatbot.needsFollowUp')}</small>
              </article>
            </div>
          </section>
        ) : (
          <section className="page__hero">
            <h1 className="page__title">{{
              'chat-setting': t('chatbot.settingsTitle'),
              orders: t('chatbot.ordersTitle'),
            }[activeSection] || heroTitle}</h1>
            {heroSubtitle ? <p className="page__subtitle">{heroSubtitle}</p> : null}
          </section>
        )
      ) : null}
      {renderSection()}
    </div>
  );
};

export default ChatbotManagement;
