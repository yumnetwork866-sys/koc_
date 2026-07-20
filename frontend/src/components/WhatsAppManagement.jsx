import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  fetchWhatsAppConversations,
  fetchWhatsAppMessages,
  fetchWhatsAppOrders,
  fetchWhatsAppOverview,
  sendWhatsAppMessage,
  updateWhatsAppOrder,
} from '../lib/api';
import { useI18n } from '../lib/language';

const formatTime = (value, locale) => value
  ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : '-';

const WhatsAppManagement = () => {
  const { t, language } = useI18n();
  const locale = language === 'vi' ? 'vi-VN' : 'en-US';
  const location = useLocation();
  const navigate = useNavigate();
  const section = location.pathname.split('/').filter(Boolean)[1] || 'dashboard';
  const [overview, setOverview] = useState({ configured: false, account: {}, stats: {} });
  const [conversations, setConversations] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedSenderId, setSelectedSenderId] = useState('');
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const selectedConversation = useMemo(
    () => conversations.find((item) => item.senderId === selectedSenderId) || null,
    [conversations, selectedSenderId],
  );

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchWhatsAppOverview(controller.signal),
      fetchWhatsAppConversations(controller.signal),
      fetchWhatsAppOrders(controller.signal),
    ]).then(([nextOverview, nextConversations, nextOrders]) => {
      setOverview(nextOverview);
      setConversations(nextConversations);
      setOrders(nextOrders);
      setSelectedSenderId((current) => current || nextConversations[0]?.senderId || '');
    }).catch((err) => {
      if (err.name !== 'AbortError') setError(err.message || t('whatsapp.loadError'));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [t]);

  useEffect(() => {
    if (!selectedSenderId) {
      setMessages([]);
      return undefined;
    }
    const controller = new AbortController();
    fetchWhatsAppMessages(selectedSenderId, controller.signal)
      .then(setMessages)
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message || t('whatsapp.loadError'));
      });
    return () => controller.abort();
  }, [selectedSenderId, t]);

  const handleSend = async (event) => {
    event.preventDefault();
    const text = reply.trim();
    if (!selectedSenderId || !text) return;
    try {
      setSending(true);
      setError('');
      await sendWhatsAppMessage({ to: selectedSenderId, text });
      setReply('');
      const [nextMessages, nextConversations, nextOverview] = await Promise.all([
        fetchWhatsAppMessages(selectedSenderId),
        fetchWhatsAppConversations(),
        fetchWhatsAppOverview(),
      ]);
      setMessages(nextMessages);
      setConversations(nextConversations);
      setOverview(nextOverview);
    } catch (err) {
      setError(err.message || t('whatsapp.sendError'));
    } finally {
      setSending(false);
    }
  };

  const handleOrderStatus = async (orderId, status) => {
    try {
      await updateWhatsAppOrder(orderId, { status });
      setOrders(await fetchWhatsAppOrders());
      setOverview(await fetchWhatsAppOverview());
    } catch (err) {
      setError(err.message || t('whatsapp.updateOrderError'));
    }
  };

  if (loading) return <div className="page"><section className="section-card empty-state">{t('whatsapp.loading')}</section></div>;

  if (section === 'chat') {
    return (
      <div className="page whatsapp-page">
        <section className="page__hero"><h1 className="page__title">{t('whatsapp.inbox')}</h1></section>
        {error ? <div className="section-card empty-state empty-state--compact" role="alert">{error}</div> : null}
        <section className="section-card whatsapp-inbox">
          <div className="whatsapp-inbox__conversations">
            <div className="whatsapp-inbox__heading"><strong>{t('whatsapp.conversations')}</strong><span>{conversations.length}</span></div>
            {conversations.map((conversation) => (
              <button
                className={`whatsapp-conversation${selectedSenderId === conversation.senderId ? ' is-active' : ''}`}
                type="button"
                key={conversation.senderId}
                onClick={() => setSelectedSenderId(conversation.senderId)}
              >
                <span className="whatsapp-conversation__avatar" aria-hidden="true">{String(conversation.displayName || conversation.senderId).slice(0, 2).toUpperCase()}</span>
                <span><strong>{conversation.displayName || conversation.senderId}</strong><small>{conversation.lastText}</small></span>
              </button>
            ))}
            {!conversations.length ? <div className="empty-state empty-state--compact">{t('whatsapp.noConversations')}</div> : null}
          </div>
          <div className="whatsapp-inbox__thread">
            <header><strong>{selectedConversation?.displayName || t('whatsapp.selectConversation')}</strong><small>{selectedConversation?.senderId || ''}</small></header>
            <div className="whatsapp-message-list">
              {messages.map((message) => (
                <article className={`whatsapp-message whatsapp-message--${message.direction}`} key={message.id}>
                  <p>{message.text}</p><time>{formatTime(message.ts, locale)}</time>
                </article>
              ))}
              {selectedConversation && !messages.length ? <div className="empty-state">{t('whatsapp.noMessages')}</div> : null}
            </div>
            <form className="whatsapp-reply" onSubmit={handleSend}>
              <textarea rows={1} value={reply} onChange={(event) => setReply(event.target.value)} placeholder={t('whatsapp.replyPlaceholder')} disabled={!selectedSenderId || sending} />
              <button className="button" type="submit" disabled={!selectedSenderId || !reply.trim() || sending}>{sending ? t('whatsapp.sending') : t('whatsapp.send')}</button>
            </form>
          </div>
        </section>
      </div>
    );
  }

  if (section === 'orders') {
    return (
      <div className="page whatsapp-page">
        <section className="page__hero"><h1 className="page__title">{t('whatsapp.orders')}</h1></section>
        {error ? <div className="section-card empty-state empty-state--compact" role="alert">{error}</div> : null}
        <section className="section-card">
          <div className="table-wrap"><table className="data-table"><thead><tr><th>{t('whatsapp.customer')}</th><th>{t('whatsapp.content')}</th><th>{t('whatsapp.phone')}</th><th>{t('whatsapp.status')}</th><th>{t('whatsapp.time')}</th></tr></thead><tbody>
            {orders.map((order) => <tr key={order.id}><td>{order.name || order.senderId}</td><td>{order.raw}</td><td>{order.phone || order.senderId}</td><td><select value={order.status} onChange={(event) => handleOrderStatus(order.id, event.target.value)}>{['new', 'confirmed', 'done', 'cancelled'].map((status) => <option key={status} value={status}>{status}</option>)}</select></td><td>{formatTime(order.ts, locale)}</td></tr>)}
            {!orders.length ? <tr><td colSpan={5}><div className="empty-state">{t('whatsapp.noOrders')}</div></td></tr> : null}
          </tbody></table></div>
        </section>
      </div>
    );
  }

  const stats = overview.stats || {};
  return (
    <div className="page whatsapp-page">
      <section className="whatsapp-hero">
        <div><span className="whatsapp-hero__eyebrow">WhatsApp Business</span><h1 className="page__title">{t('whatsapp.dashboardTitle')}</h1><p className="page__subtitle">{t('whatsapp.dashboardMeta')}</p><div className="whatsapp-hero__actions"><button className="button" type="button" onClick={() => navigate('/whatsapp/chat')}>{t('whatsapp.openInbox')}</button><button className="button button--ghost" type="button" onClick={() => navigate('/whatsapp/orders')}>{t('whatsapp.viewOrders')}</button></div></div>
        <div className="whatsapp-status"><span className={overview.configured ? 'is-connected' : ''} aria-hidden="true" /><div><small>{t('whatsapp.connection')}</small><strong>{overview.configured ? t('whatsapp.connected') : t('whatsapp.notConfigured')}</strong><p>{overview.account?.phoneNumberId || t('whatsapp.configureHint')}</p></div></div>
      </section>
      {error ? <div className="section-card empty-state empty-state--compact" role="alert">{error}</div> : null}
      <section className="page__stats page__stats--four">
        <article className="stat-card"><p className="stat-card__label">{t('whatsapp.conversations')}</p><p className="stat-card__value">{stats.conversations || 0}</p></article>
        <article className="stat-card"><p className="stat-card__label">{t('whatsapp.messages')}</p><p className="stat-card__value">{stats.totalMessages || 0}</p></article>
        <article className="stat-card"><p className="stat-card__label">{t('whatsapp.today')}</p><p className="stat-card__value">{stats.today || 0}</p></article>
        <article className="stat-card"><p className="stat-card__label">{t('whatsapp.newOrders')}</p><p className="stat-card__value">{stats.newOrders || 0}</p></article>
      </section>
    </div>
  );
};

export default WhatsAppManagement;
