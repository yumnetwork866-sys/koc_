import React, { useEffect, useMemo, useState } from 'react';
import {
  createBooking,
  deleteBooking,
  fetchBookings,
  fetchUsers,
} from '../lib/api';

  const initialForm = {
    staff_id: '',
    creator_id: '',
    booking_cost: '',
    deadline: '',
    video_url: '',
  };

const formatMoney = (value) => Number(value || 0).toLocaleString('vi-VN');

const BookingManagement = ({ heroTitle, heroSubtitle }) => {
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
        return acc;
      },
      { total: 0, totalCost: 0 },
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
        deadline: form.deadline,
        video_url: form.video_url || null,
      });
      resetForm();
      await loadData();
    } catch (err) {
      setError(err.message || 'Không tạo được booking');
    } finally {
      setSaving(false);
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
            <p className="stat-card__label">KOC</p>
            <p className="stat-card__value">{kocUsers.length}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Staff</p>
            <p className="stat-card__value">{staffUsers.length}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Total cost</p>
            <p className="stat-card__value">{formatMoney(stats.totalCost)}</p>
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
            <label htmlFor="video_url">Video link</label>
            <input
              id="video_url"
              name="video_url"
              value={form.video_url}
              onChange={handleChange}
              placeholder="https://www.tiktok.com/..."
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
                    <td>
                      <div className="row-subtitle">
                        {booking.video_url ? booking.video_url : 'Chưa có video link'}
                      </div>
                    </td>
                    <td>
                      <div className="actions actions--inline">
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
