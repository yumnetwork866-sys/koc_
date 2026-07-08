import React, { useEffect, useMemo, useState } from 'react';
import {
  createBooking,
  deleteBooking,
  fetchBookings,
  fetchUsers,
  updateBooking,
} from '../lib/api';

const bookingStatuses = [
  'draft',
  'booked',
  'waiting_video',
  'video_posted',
  'done',
  'cancelled',
];

const initialForm = {
  staff_id: '',
  creator_id: '',
  booking_cost: '',
  status: 'booked',
  deadline: '',
  note: '',
  video_platform_id: '',
  video_url: '',
  posted_at: '',
};

const formatMoney = (value) => Number(value || 0).toLocaleString('vi-VN');

const BookingManagement = ({ heroTitle, heroSubtitle }) => {
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');

  const loadData = async (signal) => {
    const [loadedBookings, loadedUsers] = await Promise.all([
      fetchBookings(signal),
      fetchUsers(signal),
    ]);

    setBookings(loadedBookings);
    setUsers(loadedUsers);
  };

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        await loadData(controller.signal);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Không tải được danh sách booking');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, []);

  const kocUsers = useMemo(() => users.filter((user) => user.role === 'koc'), [users]);
  const staffUsers = useMemo(() => users.filter((user) => user.role !== 'koc'), [users]);

  const userNameById = useMemo(() => {
    return new Map(users.map((user) => [String(user.id), user.name]));
  }, [users]);

  const stats = useMemo(() => {
    return bookings.reduce(
      (acc, booking) => {
        acc.total += 1;
        acc.totalCost += Number(booking.booking_cost || 0);
        acc.statusCounts[booking.status] = (acc.statusCounts[booking.status] || 0) + 1;
        if (booking.status === 'video_posted' || booking.status === 'done') {
          acc.posted += 1;
        }
        return acc;
      },
      { total: 0, totalCost: 0, posted: 0, statusCounts: {} },
    );
  }, [bookings]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const resetForm = () => {
    setForm(initialForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError('');
      await createBooking({
        staff_id: Number(form.staff_id),
        creator_id: Number(form.creator_id),
        booking_cost: Number(form.booking_cost),
        status: form.status,
        deadline: form.deadline,
        note: form.note || null,
        video_platform_id: form.video_platform_id || null,
        video_url: form.video_url || null,
        posted_at: form.posted_at || null,
      });
      resetForm();
      await loadData();
    } catch (err) {
      setError(err.message || 'Không tạo được booking');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (booking, status) => {
    try {
      setUpdatingId(booking.id);
      setError('');
      const updated = await updateBooking(booking.id, { status });
      setBookings((current) => current.map((item) => (item.id === booking.id ? updated : item)));
    } catch (err) {
      setError(err.message || 'Không cập nhật được booking');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (booking) => {
    const confirmed = window.confirm(`Xóa booking #${booking.id}?`);
    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(booking.id);
      setError('');
      await deleteBooking(booking.id);
      await loadData();
    } catch (err) {
      setError(err.message || 'Không xóa được booking');
    } finally {
      setDeletingId(null);
    }
  };

  const statusLabel = (status) => {
    const labels = {
      draft: 'Draft',
      booked: 'Booked',
      waiting_video: 'Chờ video',
      video_posted: 'Đã air video',
      done: 'Done',
      cancelled: 'Cancelled',
    };

    return labels[status] || status;
  };

  return (
    <div className="page">
      <section className="page__hero">
        <h1 className="page__title">{heroTitle}</h1>
        <p className="page__subtitle">{heroSubtitle}</p>
        <div className="page__stats page__stats--four">
          <article className="stat-card">
            <p className="stat-card__label">Bookings</p>
            <p className="stat-card__value">{stats.total}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">KOC posted</p>
            <p className="stat-card__value">{stats.posted}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Total cost</p>
            <p className="stat-card__value">{formatMoney(stats.totalCost)}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Waiting video</p>
            <p className="stat-card__value">{stats.statusCounts.waiting_video || 0}</p>
          </article>
        </div>
      </section>

      {error ? (
        <section className="section-card empty-state empty-state--compact">
          <div>{error}</div>
        </section>
      ) : null}

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Tạo booking</h2>
            <p className="section-card__meta">Chọn staff, KOC, chi phí book, deadline và thông tin video nếu đã có.</p>
          </div>
        </div>

        <form className="filter-panel" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="staff_id">Nhân sự booking</label>
            <select id="staff_id" name="staff_id" value={form.staff_id} onChange={handleChange} required>
              <option value="">Chọn nhân sự</option>
              {staffUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="creator_id">KOC</label>
            <select id="creator_id" name="creator_id" value={form.creator_id} onChange={handleChange} required>
              <option value="">Chọn KOC</option>
              {kocUsers.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="booking_cost">Chi phí book</label>
            <input
              id="booking_cost"
              name="booking_cost"
              type="number"
              min="0"
              step="1000"
              value={form.booking_cost}
              onChange={handleChange}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="deadline">Deadline</label>
            <input id="deadline" name="deadline" type="date" value={form.deadline} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="status">Trạng thái</label>
            <select id="status" name="status" value={form.status} onChange={handleChange}>
              {bookingStatuses.map((status) => (
                <option key={status} value={status}>{statusLabel(status)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="video_platform_id">Video ID</label>
            <input
              id="video_platform_id"
              name="video_platform_id"
              value={form.video_platform_id}
              onChange={handleChange}
              placeholder="TikTok video id"
            />
          </div>
          <div className="field">
            <label htmlFor="video_url">Video link</label>
            <input
              id="video_url"
              name="video_url"
              value={form.video_url}
              onChange={handleChange}
              placeholder="https://www.tiktok.com/..."
            />
          </div>
          <div className="field">
            <label htmlFor="posted_at">Posted at</label>
            <input id="posted_at" name="posted_at" type="datetime-local" value={form.posted_at} onChange={handleChange} />
          </div>
          <div className="field field--full">
            <label htmlFor="note">Ghi chú</label>
            <textarea
              id="note"
              name="note"
              rows="3"
              value={form.note}
              onChange={handleChange}
              placeholder="Deadline video, hook, yêu cầu nội dung..."
            />
          </div>
          <div className="actions">
            <button className="button" type="submit" disabled={saving}>
              {saving ? 'Đang tạo' : 'Tạo booking'}
            </button>
          </div>
        </form>
      </section>

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Danh sách booking</h2>
            <p className="section-card__meta">Theo dõi booking từ lúc tạo tới lúc KOC gửi video.</p>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-dot" />
            <div>Đang tải booking</div>
          </div>
        ) : bookings.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Staff</th>
                  <th>KOC</th>
                  <th>Cost</th>
                  <th>Deadline</th>
                  <th>Status</th>
                  <th>Video</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id}>
                    <td><span className="row-title">#{booking.id}</span></td>
                    <td>{booking.staff?.name || userNameById.get(String(booking.staff_id)) || booking.staff_id}</td>
                    <td>{booking.creator?.name || userNameById.get(String(booking.creator_id)) || booking.creator_id}</td>
                    <td>{formatMoney(booking.booking_cost)}</td>
                    <td>{booking.deadline || '-'}</td>
                    <td><span className="chip">{statusLabel(booking.status)}</span></td>
                    <td>
                      <div className="row-subtitle">
                        {booking.video_platform_id ? `ID: ${booking.video_platform_id}` : 'Chưa có video ID'}
                      </div>
                      <div className="row-subtitle">
                        {booking.video_url ? booking.video_url : 'Chưa có video link'}
                      </div>
                    </td>
                    <td>
                      <div className="actions actions--inline">
                        <button
                          type="button"
                          className="button button--ghost"
                          onClick={() => handleUpdateStatus(booking, 'waiting_video')}
                          disabled={updatingId === booking.id}
                        >
                          Chờ video
                        </button>
                        <button
                          type="button"
                          className="button button--ghost"
                          onClick={() => handleUpdateStatus(booking, 'video_posted')}
                          disabled={updatingId === booking.id}
                        >
                          Đã air
                        </button>
                        <button
                          type="button"
                          className="button button--ghost"
                          onClick={() => handleUpdateStatus(booking, 'done')}
                          disabled={updatingId === booking.id}
                        >
                          Done
                        </button>
                        <button
                          type="button"
                          className="button button--ghost"
                          onClick={() => handleDelete(booking)}
                          disabled={deletingId === booking.id}
                        >
                          {deletingId === booking.id ? 'Đang xóa' : 'Xóa'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state empty-state--compact">Chưa có booking nào.</div>
        )}
      </section>
    </div>
  );
};

export default BookingManagement;
