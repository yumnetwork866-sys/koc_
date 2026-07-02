import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  fetchChatbotStats,
  fetchFacebookManagedPages,
  getFacebookOauthUrl,
  logoutChatbotFacebook,
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
  const [facebookMe, setFacebookMe] = useState({ configured: false, loggedIn: false, name: null });
  const [managedPages, setManagedPages] = useState([]);
  const [chatSettings, setChatSettings] = useState({ provider: 'gemini', model: '', ollamaHost: '', models: [] });
  const [ollamaModels, setOllamaModels] = useState([]);
  const [settingsForm, setSettingsForm] = useState({ modelKey: '' });
  const [stats, setStats] = useState({});
  const [conversations, setConversations] = useState([]);
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

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.senderId === selectedSenderId),
    [conversations, selectedSenderId],
  );

  const managedPageMap = useMemo(
    () => new Map(managedPages.map((page) => [page.id, page])),
    [managedPages],
  );

  const loadOverview = useCallback(async (signal) => {
    setFacebookMeLoaded(false);
    const [me, nextStats, nextConversations, nextOrders, nextDocs, nextSettings, nextOllamaModels] = await Promise.all([
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
    setSelectedSenderId((current) => current || nextConversations[0]?.senderId || '');

    if (me.loggedIn) {
      try {
        setManagedPages(await fetchFacebookManagedPages(signal));
      } catch (err) {
        if (err.status !== 401) throw err;
        setManagedPages([]);
      }
    } else {
      setManagedPages([]);
    }
  }, []);

  const loadMessages = useCallback(async (senderId) => {
    if (!senderId) {
      setMessages([]);
      return;
    }
    setMessages(await fetchChatbotMessages(senderId));
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
    if (selectedSenderId) await loadMessages(selectedSenderId);
  }, [loadMessages, loadOverview, selectedSenderId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('oauth_status');
    if (!status) return;
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const fbToken = hash.get('fb_token');

    const syncAfterOauth = async () => {
      setToast({
        status,
        message: params.get('oauth_message') || (status === 'success' ? 'Đã kết nối tài khoản Facebook' : 'Kết nối tài khoản Facebook thất bại'),
      });

      if (status === 'success') {
        if (fbToken) saveStoredFacebookChatbotToken(fbToken);
        try {
          await refresh();
        } catch (err) {
          if (err.name !== 'AbortError') setError(err.message || 'Không đồng bộ được trạng thái Facebook');
        }
      } else {
        clearStoredFacebookChatbotToken();
      }

      navigate({ pathname: location.pathname, search: '', hash: '' }, { replace: true });
    };

    syncAfterOauth();
  }, [location.hash, location.pathname, location.search, navigate, refresh]);

  useEffect(() => {
    loadMessages(selectedSenderId).catch((err) => setError(err.message || 'Không tải được hội thoại'));
  }, [loadMessages, selectedSenderId]);

  const startFacebookLogin = async () => {
    try {
      setError('');
      window.location.assign(await getFacebookOauthUrl());
    } catch (err) {
      setError(err.message || 'Không bắt đầu được kết nối tài khoản Facebook');
    }
  };

  const handleLogoutFacebook = async () => {
    await logoutChatbotFacebook();
    clearStoredFacebookChatbotToken();
    await refresh();
  };

  const handleConnectPage = async (pageId) => {
    await connectFacebookPage(pageId);
    await refresh();
  };

  const handleDisconnectPage = async (page) => {
    if (!window.confirm(`Ngắt kết nối Page "${page.name}"? Bot sẽ không gửi trả lời qua Page này nữa.`)) return;
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
    await Promise.all([loadMessages(selectedSenderId), loadOverview()]);
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

  const renderSection = () => {
    const facebookStatusLabel = !facebookMeLoaded
      ? 'Đang kiểm tra kết nối Facebook...'
      : facebookMe.loggedIn
        ? `Đã kết nối tài khoản Facebook: ${facebookMe.name}`
        : 'Chưa kết nối tài khoản Facebook';

    if (activeSection === 'chat') {
      return (
        <>
          <section className="section-card chatbot-chat-card" id="chat">
            <div className="section-card__header chatbot-chat-card__header">
              <div>
                <h2 className="section-card__title">Chat</h2>
              </div>
              <div className="chatbot-hero__chips" aria-label="Chatbot summary">
                <span className="chip chip--blue">Messages {stats.totalMessages || 0}</span>
                <span className="chip chip--positive">Conversations {stats.uniqueUsers || 0}</span>
                <span className="chip chip--amber">New orders {stats.newOrders || 0}</span>
              </div>
            </div>
            <div className="chatbot-inbox__layout">
              <div className="chatbot-inbox__list">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.senderId}
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
              </div>
              <div className="chatbot-inbox__thread">
                <div className="message-list">
                  {messages.map((message) => (
                    <article key={message.id} className={`message-bubble message-bubble--${message.direction}`}>
                      <p>{message.text}</p>
                      <span>{message.via} · {formatTime(message.ts)}</span>
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
          <div className="section-card__header">
              <div>
            <h2 className="section-card__title">Kết nối Page</h2>
            <p className="section-card__subtitle">{facebookStatusLabel}</p>
          </div>
          <div className="actions">
            {!facebookMeLoaded ? (
              <button className="button" type="button" disabled>
                Đang kiểm tra
              </button>
            ) : facebookMe.loggedIn ? (
              <button className="button button--secondary" type="button" onClick={handleLogoutFacebook}>Ngắt kết nối Facebook</button>
            ) : (
              <button className="button" type="button" disabled={!facebookMe.configured} onClick={startFacebookLogin}>Kết nối tài khoản Facebook</button>
            )}
          </div>
        </div>

          <div className="chatbot-page-grid">
            {facebookMe.loggedIn ? managedPages.map((page) => (
              <article className="mini-card" key={page.id}>
                <span className="mini-card__avatar" aria-hidden="true">
                  {getPageAvatarUrl(page) ? (
                    <img src={getPageAvatarUrl(page)} alt="" />
                  ) : (
                    getPageAvatarText(page.name)
                  )}
                </span>
                <div className="mini-card__content">
                  <h3>{page.name}</h3>
                  <p>
                    {page.connected
                      ? 'Đã kết nối webhook'
                      : page.canManage
                        ? 'Có thể kết nối'
                        : 'Thiếu quyền quản lý'}
                  </p>
                </div>
                <div className="mini-card__action">
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
            )) : null}
            {facebookMe.loggedIn && managedPages.length === 0 ? (
              <div className="section-card__meta">Tài khoản Facebook đã kết nối nhưng chưa có Page nào hiện ra. Hãy kiểm tra lại quyền Page hoặc đảm bảo tài khoản này đang quản lý ít nhất một Page.</div>
            ) : null}
          </div>
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
          <h1 className="page__title">{heroTitle}</h1>
          {heroSubtitle ? <p className="page__subtitle">{heroSubtitle}</p> : null}
        </section>
      ) : null}
      {renderSection()}
    </div>
  );
};

export default ChatbotManagement;
