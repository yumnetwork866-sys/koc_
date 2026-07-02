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
  getFacebookOauthUrl,
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

const formatTime = (value) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
};

const orderStatuses = ['new', 'confirmed', 'done', 'cancelled'];

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
  const [selectedPageId, setSelectedPageId] = useState('');
  const [selectedSenderId, setSelectedSenderId] = useState('');
  const [messages, setMessages] = useState([]);
  const [orders, setOrders] = useState([]);
  const [docs, setDocs] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [docForm, setDocForm] = useState({ title: '', content: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [facebookMeLoaded, setFacebookMeLoaded] = useState(false);
  const [managedPagesLoaded, setManagedPagesLoaded] = useState(false);
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const pagePickerTriggerRef = useRef(null);
  const pagePickerMenuRef = useRef(null);
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
    return conversations.filter((conversation) => conversation.pageId === selectedPageId);
  }, [conversations, selectedPageId]);

  const selectedConversation = useMemo(
    () => filteredConversations.find((conversation) => conversation.senderId === selectedSenderId),
    [filteredConversations, selectedSenderId],
  );

  const selectedChatPage = useMemo(
    () => chatPageOptions.find((page) => page.id === selectedPageId) || null,
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

  const loadOverview = useCallback(async (signal) => {
    setFacebookMeLoaded(false);
    setManagedPagesLoaded(false);
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
    setFacebookMeLoaded(true);
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
        if (err.status !== 401) throw err;
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
        connected: Boolean(existing.connected || page.connected || page.ownerId || page.source === 'local'),
        canManage: Boolean(existing.canManage || page.canManage || page.source === 'local'),
      };
      combinedPages.set(page.id, next);
    });
    setManagedPages([...combinedPages.values()]);
    setManagedPagesLoaded(true);
  }, []);

  useEffect(() => {
    if (!chatPageOptions.length) {
      setSelectedPageId('');
      return;
    }

    setSelectedPageId((current) => (
      current && chatPageOptions.some((page) => page.id === current)
        ? current
        : selectedConversation?.pageId && chatPageOptions.some((page) => page.id === selectedConversation.pageId)
          ? selectedConversation.pageId
          : chatPageOptions[0].id
    ));
  }, [chatPageOptions, selectedConversation?.pageId]);

  useEffect(() => {
    setSelectedSenderId((current) => (
      current && filteredConversations.some((conversation) => conversation.senderId === current)
        ? current
        : filteredConversations[0]?.senderId || ''
    ));
  }, [filteredConversations]);

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

  const loadMessages = useCallback(async (senderId, pageId) => {
    if (!senderId) {
      setMessages([]);
      return;
    }
    setMessages(await fetchChatbotMessages(senderId, pageId));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        await loadOverview(controller.signal);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message || 'Không tải được dữ liệu chatbot');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [loadOverview]);

  const refresh = useCallback(async () => {
    await loadOverview();
    if (selectedSenderId) await loadMessages(selectedSenderId, selectedPageId);
  }, [loadMessages, loadOverview, selectedPageId, selectedSenderId]);

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
          if (err.name !== 'AbortError') setError(err.message || 'Failed to sync Facebook status');
        }
      } else {
        clearStoredFacebookChatbotToken();
      }

      navigate({ pathname: location.pathname, search: '', hash: '' }, { replace: true });
    };

    syncAfterOauth();
  }, [location.hash, location.pathname, location.search, navigate, refresh]);

  useEffect(() => {
    loadMessages(selectedSenderId, selectedPageId).catch((err) => setError(err.message || 'Không tải được hội thoại'));
  }, [loadMessages, selectedPageId, selectedSenderId]);

  useEffect(() => {
    if (!toast) return undefined;

    const timeoutId = window.setTimeout(() => {
      setToast(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const startFacebookLogin = async () => {
    try {
      setError('');
      window.location.assign(await getFacebookOauthUrl());
    } catch (err) {
      setError(err.message || 'Failed to start Facebook connection');
    }
  };

  const handleRevokeFacebookAccount = async (group) => {
    if (!window.confirm(`Revoke Facebook account "${group.ownerName}" from the app? This will disconnect every connected Page for this user and remove the session.`)) return;
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
    if (!window.confirm(`Disconnect Page "${page.name}"? The bot will stop replying on this Page.`)) return;
    await disconnectFacebookPage(page.id);
    await refresh();
  };

  const getPageAvatarUrl = (page) => managedPageMap.get(page.id)?.avatarUrl || page.avatarUrl || null;

  const handleSendReply = async (event) => {
    event.preventDefault();
    const text = replyText.trim();
    if (!selectedSenderId || !text) return;
    await sendChatbotMessage({
      senderId: selectedSenderId,
      pageId: selectedConversation?.pageId,
      text,
    });
    setReplyText('');
    await Promise.all([loadMessages(selectedSenderId, selectedConversation?.pageId), loadOverview()]);
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
    setToast({ status: 'success', message: 'Đã lưu chat setting' });
  };

  const renderFacebookAccountActions = () => {
    if (!facebookMeLoaded) {
      return (
        <button className="button" type="button" disabled>
          Checking...
        </button>
      );
    }

    return (
      <>
        <button className="button" type="button" disabled={!facebookMe.configured} onClick={startFacebookLogin}>
          Add account
        </button>
      </>
    );
  };

  const renderSection = () => {
    if (activeSection === 'chat') {
      return (
        <>
          <section className="section-card chatbot-chat-card" id="chat">
            <div className="section-card__header chatbot-chat-card__header">
              <div className="chatbot-page-picker">
                <span>Page</span>
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
                          getPageAvatarText(selectedChatPage?.name || 'Page')
                        )}
                      </span>
                    <span className="chatbot-page-picker__name">{selectedChatPage?.name?.trim() || selectedChatPage?.id || 'Select Page'}</span>
                  </button>
                  {pagePickerOpen && typeof document !== 'undefined' ? createPortal(
                    <div
                      ref={pagePickerMenuRef}
                      className="chatbot-page-picker__menu"
                      role="listbox"
                      style={pagePickerMenuStyle || undefined}
                    >
                      {chatPageOptions.map((page) => (
                        <button
                          key={page.id}
                          className={`chatbot-page-picker__option${page.id === selectedPageId ? ' chatbot-page-picker__option--active' : ''}`}
                          type="button"
                          role="option"
                          aria-selected={page.id === selectedPageId}
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
              <div className="chatbot-chat-card__tools">
                <div className="chatbot-hero__chips" aria-label="Chatbot summary">
                  <span className="chip chip--blue">Messages {stats.totalMessages || 0}</span>
                  <span className="chip chip--positive">Conversations {filteredConversations.length || 0}</span>
                  <span className="chip chip--amber">New orders {stats.newOrders || 0}</span>
                </div>
              </div>
            </div>
            <div className="chatbot-inbox__layout">
              <div className="chatbot-inbox__list">
                {filteredConversations.map((conversation) => (
                  <button
                    key={`${conversation.pageId || 'page'}:${conversation.senderId}`}
                    type="button"
                    className={`conversation-row${conversation.senderId === selectedSenderId ? ' conversation-row--active' : ''}`}
                    onClick={() => setSelectedSenderId(conversation.senderId)}
                  >
                    <span className="conversation-row__avatar" aria-hidden="true">
                      {conversation.avatarUrl ? (
                        <img src={conversation.avatarUrl} alt="" />
                      ) : (
                        getConversationAvatarText(conversation)
                      )}
                    </span>
                    <span className="conversation-row__content">
                      <span>{conversation.displayName || conversation.senderId}</span>
                      <small>{conversation.lastText}</small>
                    </span>
                  </button>
                ))}
                {!filteredConversations.length ? (
                  <div className="chatbot-inbox__empty">No conversations for this Page.</div>
                ) : null}
              </div>
              <div className="chatbot-inbox__thread">
                <div className="message-list">
                  {messages.map((message) => (
                    <article key={message.id} className={`message-bubble message-bubble--${message.direction}`}>
                      <div className="message-bubble__head">
                        <span className="message-bubble__avatar" aria-hidden="true">
                          {message.avatarUrl ? (
                            <img src={message.avatarUrl} alt="" />
                          ) : (
                            getMessageAvatarText(message)
                          )}
                        </span>
                        <div className="message-bubble__meta">
                          <strong>{getMessageDisplayName(message)}</strong>
                          <span>{message.via} · {formatTime(message.ts)}</span>
                        </div>
                      </div>
                      <p>{message.text}</p>
                    </article>
                  ))}
                </div>
                <form className="reply-box" onSubmit={handleSendReply}>
                  <input
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    placeholder="Nhập tin nhắn..."
                    disabled={!selectedSenderId}
                  />
                  <button className="button" type="submit" disabled={!selectedSenderId || !replyText.trim()}>Gửi</button>
                </form>
              </div>
            </div>
          </section>
        </>
      );
    }

    if (activeSection === 'chat-setting') {
      const modelOptions = mergeModelOptions(chatSettings.models, ollamaModels, chatSettings);
      return (
        <section className="section-card" id="chat-setting">
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title">Chat setting</h2>
            </div>
          </div>
          <form className="kb-form" onSubmit={handleSaveSettings}>
            <label className="field">
              <span>Model</span>
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
              <span className="chip chip--blue">Current: {chatSettings.provider}</span>
              <span className="chip chip--positive">Model: {chatSettings.model || '-'}</span>
            </div>
            <button className="button" type="submit">Lưu cấu hình</button>
          </form>
        </section>
      );
    }

    if (activeSection === 'rag') {
      return (
        <section className="section-card" id="rag">
          <div className="section-card__header">
            <div>
              <h2 className="section-card__title">Kho kiến thức</h2>
              <p className="section-card__subtitle">Nội dung dùng cho RAG khi bot trả lời bằng AI.</p>
            </div>
          </div>
          <form className="kb-form" onSubmit={handleCreateDoc}>
            <input
              value={docForm.title}
              onChange={(event) => setDocForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Tiêu đề"
            />
            <textarea
              value={docForm.content}
              onChange={(event) => setDocForm((current) => ({ ...current, content: event.target.value }))}
              placeholder="Nội dung chính sách, sản phẩm, giá, vận chuyển..."
              rows={4}
            />
            <button className="button" type="submit">Thêm tài liệu</button>
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
                    Xóa
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
              <h2 className="section-card__title">Đơn hàng</h2>
              <p className="section-card__subtitle">Bot tự tạo đơn khi khách gửi số điện thoại.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Khách</th>
                  <th>Nội dung</th>
                  <th>SĐT</th>
                  <th>Trạng thái</th>
                  <th>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.senderId}</td>
                    <td>{order.raw}</td>
                    <td>{order.phone || '-'}</td>
                    <td>
                      <select value={order.status} onChange={(event) => handleOrderStatus(order.id, event.target.value)}>
                        {orderStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </td>
                    <td>{formatTime(order.ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      );
    }

      return (
        <>
          {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}
          {loading ? <section className="section-card empty-state empty-state--compact">Đang tải chatbot...</section> : null}

          <section className="section-card">
            <div className="section-card__header section-card__header--compact">
              <div>
                <h2 className="section-card__title">Users and Pages</h2>
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
                            <span className="chip chip--blue">{group.pages.length} pages</span>
                          </h3>
                          <p>{group.ownerId || 'Unknown user'}</p>
                        </div>
                      </div>
                      <div className="facebook-user-group__actions">
                        <button
                          className="button button--danger button--icon"
                          type="button"
                          disabled={!group.ownerId}
                          onClick={() => handleRevokeFacebookAccount(group)}
                          aria-label={`Revoke ${group.ownerName}`}
                          title="Revoke account"
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
                          </div>
                          <div className="mini-card__action mini-card__action--stack">
                            {page.connected ? (
                              <button
                                className="button button--ghost button--small"
                                type="button"
                                onClick={() => handleDisconnectPage(page)}
                              >
                                Disconnect
                              </button>
                            ) : (
                              <button
                                className="button button--small"
                                type="button"
                                disabled={!page.canManage}
                                onClick={() => handleConnectPage(page.id)}
                              >
                                Connect
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
              <div className="section-card__meta">No Pages are available yet.</div>
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
        <section className="page__hero" id="dashboard">
          {activeSection === 'dashboard' ? (
            <div className="page__hero-row">
              <h1 className="page__title">{heroTitle}</h1>
              <div className="page__hero-actions">
                {renderFacebookAccountActions()}
              </div>
            </div>
          ) : (
            <>
              <h1 className="page__title">{heroTitle}</h1>
              {heroSubtitle ? <p className="page__subtitle">{heroSubtitle}</p> : null}
            </>
          )}
        </section>
      ) : null}
      {renderSection()}
    </div>
  );
};

export default ChatbotManagement;
