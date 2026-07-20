const { Op } = require('sequelize');
const crypto = require('crypto');
const { WhatsAppMessage, WhatsAppOrder } = require('../models');

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v22.0';

const config = () => ({
  accessToken: String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim(),
  phoneNumberId: String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim(),
  businessAccountId: String(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim(),
  verifyToken: String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim(),
});

const configured = () => {
  const value = config();
  return Boolean(value.accessToken && value.phoneNumberId && value.businessAccountId && value.verifyToken);
};

const publicMessage = (row) => ({
  id: row.id,
  senderId: row.sender_id,
  phoneNumberId: row.phone_number_id,
  displayName: row.display_name || row.sender_id,
  direction: row.direction,
  text: row.text,
  via: row.via,
  ts: new Date(row.created_at).getTime(),
});

const publicOrder = (row) => ({
  id: row.id,
  senderId: row.sender_id,
  phoneNumberId: row.phone_number_id,
  raw: row.raw,
  name: row.name,
  phone: row.phone,
  address: row.address,
  status: row.status,
  ts: new Date(row.created_at).getTime(),
});

async function overview(_req, res) {
  const [totalMessages, conversations, orders, newOrders, today] = await Promise.all([
    WhatsAppMessage.count(),
    WhatsAppMessage.count({ distinct: true, col: 'sender_id' }),
    WhatsAppOrder.count(),
    WhatsAppOrder.count({ where: { status: 'new' } }),
    WhatsAppMessage.count({ where: { created_at: { [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
  ]);
  const value = config();
  res.json({
    configured: configured(),
    account: {
      phoneNumberId: value.phoneNumberId || null,
      businessAccountId: value.businessAccountId || null,
    },
    stats: { totalMessages, conversations, orders, newOrders, today },
  });
}

async function listConversations(_req, res) {
  const rows = await WhatsAppMessage.findAll({ order: [['created_at', 'ASC']] });
  const map = new Map();
  rows.forEach((row) => {
    const current = map.get(row.sender_id) || {
      senderId: row.sender_id,
      displayName: row.display_name || row.sender_id,
      phoneNumberId: row.phone_number_id,
      count: 0,
      lastText: '',
      lastTs: 0,
      lastDirection: '',
    };
    current.count += 1;
    const ts = new Date(row.created_at).getTime();
    if (ts >= current.lastTs) {
      current.displayName = row.display_name || current.displayName;
      current.phoneNumberId = row.phone_number_id;
      current.lastText = row.text;
      current.lastTs = ts;
      current.lastDirection = row.direction;
    }
    map.set(row.sender_id, current);
  });
  res.json([...map.values()].sort((a, b) => b.lastTs - a.lastTs));
}

async function listMessages(req, res) {
  const senderId = String(req.query.senderId || '').trim();
  if (!senderId) return res.status(400).json({ message: 'senderId is required' });
  const rows = await WhatsAppMessage.findAll({
    where: { sender_id: senderId },
    order: [['created_at', 'DESC']],
    limit: Math.min(Number(req.query.limit) || 200, 500),
  });
  return res.json(rows.reverse().map(publicMessage));
}

async function sendMessage(req, res) {
  const to = String(req.body.to || '').trim();
  const text = String(req.body.text || '').trim();
  const value = config();
  if (!configured()) return res.status(428).json({ message: 'WhatsApp Cloud API is not configured' });
  if (!to || !text) return res.status(400).json({ message: 'to and text are required' });

  const response = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${value.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${value.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return res.status(response.status).json({ message: payload?.error?.message || 'Unable to send WhatsApp message' });

  const row = await WhatsAppMessage.create({
    sender_id: to,
    phone_number_id: value.phoneNumberId,
    direction: 'out',
    text,
    via: 'manual',
    external_message_id: payload?.messages?.[0]?.id || null,
  });
  return res.status(201).json(publicMessage(row));
}

async function listOrders(_req, res) {
  const rows = await WhatsAppOrder.findAll({ order: [['created_at', 'DESC']] });
  res.json(rows.map(publicOrder));
}

async function updateOrder(req, res) {
  const status = String(req.body.status || '').trim();
  if (!['new', 'confirmed', 'done', 'cancelled'].includes(status)) return res.status(400).json({ message: 'Invalid order status' });
  const order = await WhatsAppOrder.findByPk(req.params.id);
  if (!order) return res.status(404).json({ message: 'WhatsApp order was not found' });
  await order.update({ status });
  return res.json(publicOrder(order));
}

function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === config().verifyToken) return res.status(200).send(challenge);
  return res.sendStatus(403);
}

async function receiveWebhook(req, res) {
  const appSecret = String(process.env.WHATSAPP_APP_SECRET || '').trim();
  if (appSecret) {
    const received = String(req.get('x-hub-signature-256') || '');
    const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(req.rawBody || Buffer.from('')).digest('hex')}`;
    const valid = received.length === expected.length
      && crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
    if (!valid) return res.sendStatus(401);
  }

  const changes = (req.body?.entry || []).flatMap((entry) => entry.changes || []);
  for (const change of changes) {
    const value = change.value || {};
    const phoneNumberId = String(value.metadata?.phone_number_id || config().phoneNumberId || '').trim();
    const names = new Map((value.contacts || []).map((contact) => [contact.wa_id, contact.profile?.name]));
    for (const message of value.messages || []) {
      const senderId = String(message.from || '').trim();
      const text = message.text?.body || message.button?.text || message.interactive?.button_reply?.title || `[${message.type || 'message'}]`;
      if (!senderId || !phoneNumberId || !message.id) continue;
      const [, created] = await WhatsAppMessage.findOrCreate({
        where: { external_message_id: message.id },
        defaults: {
          sender_id: senderId,
          phone_number_id: phoneNumberId,
          display_name: names.get(senderId) || null,
          direction: 'in',
          text,
          via: 'whatsapp',
          created_at: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
        },
      });
      const phone = text.match(/(?:\+?84|0)\d{8,10}/)?.[0] || null;
      if (created && phone) {
        await WhatsAppOrder.create({
          sender_id: senderId,
          phone_number_id: phoneNumberId,
          raw: text,
          name: names.get(senderId) || null,
          phone,
        });
      }
    }
  }
  return res.sendStatus(200);
}

module.exports = { overview, listConversations, listMessages, sendMessage, listOrders, updateOrder, verifyWebhook, receiveWebhook };
