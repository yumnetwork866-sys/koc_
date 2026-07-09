const { User, Booking } = require('../models');

const ALLOWED_STATUSES = new Set(['draft', 'booked', 'waiting_video', 'video_posted', 'done', 'cancelled']);

const compactPayload = (payload) => Object.fromEntries(
  Object.entries(payload).filter(([, value]) => value !== undefined),
);

const normalizeBookingVideoUrl = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (Array.isArray(value)) {
    if (!value.length) return null;
    return JSON.stringify(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const bookingInclude = [
  { model: User, as: 'staff' },
  { model: User, as: 'creator' },
];

const getBookings = async (req, res) => {
  try {
    const bookings = await Booking.findAll({
      include: bookingInclude,
      order: [['deadline', 'ASC'], ['id', 'DESC']],
    });
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.id, { include: bookingInclude });
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createBooking = async (req, res) => {
  try {
    const payload = compactPayload({
      staff_id: req.body.staff_id,
      creator_id: req.body.creator_id,
      booking_cost: req.body.booking_cost,
      status: req.body.status || 'booked',
      deadline: req.body.deadline,
      note: req.body.note || null,
      video_platform_id: req.body.video_platform_id || null,
      video_url: normalizeBookingVideoUrl(req.body.video_url),
      posted_at: req.body.posted_at || null,
    });

    if (!ALLOWED_STATUSES.has(payload.status)) {
      return res.status(400).json({ message: 'Invalid booking status' });
    }

    const booking = await Booking.create(payload);
    const createdBooking = await Booking.findByPk(booking.id, { include: bookingInclude });
    res.status(201).json(createdBooking);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateBooking = async (req, res) => {
  try {
    if (req.body.status && !ALLOWED_STATUSES.has(req.body.status)) {
      return res.status(400).json({ message: 'Invalid booking status' });
    }

    const payload = compactPayload({
      staff_id: req.body.staff_id,
      creator_id: req.body.creator_id,
      booking_cost: req.body.booking_cost,
      status: req.body.status,
      deadline: req.body.deadline,
      note: req.body.note,
      video_platform_id: req.body.video_platform_id,
      video_url: normalizeBookingVideoUrl(req.body.video_url),
      posted_at: req.body.posted_at,
    });

    const [updated] = await Booking.update(payload, {
      where: { id: req.params.id },
      individualHooks: true,
      validate: true,
    });

    if (!updated) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const booking = await Booking.findByPk(req.params.id, { include: bookingInclude });
    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteBooking = async (req, res) => {
  try {
    const deleted = await Booking.destroy({
      where: { id: req.params.id },
    });
    if (!deleted) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.json({ message: 'Booking deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getBookings,
  getBookingById,
  createBooking,
  updateBooking,
  deleteBooking,
};
