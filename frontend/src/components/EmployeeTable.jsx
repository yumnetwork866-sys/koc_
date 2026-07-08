import React, { useEffect, useMemo, useState } from 'react';
import { createUser, deleteUser, fetchUsers, updateUser } from '../lib/api';

const initialForm = {
  name: '',
  email: '',
  password: '',
  role: 'member',
};

const roleOptions = ['member', 'leader', 'koc', 'admin'];

const EmployeeTable = ({ heroTitle, heroSubtitle }) => {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingRoleId, setUpdatingRoleId] = useState(null);
  const [error, setError] = useState('');

  const loadData = async (signal) => {
    const loadedUsers = await fetchUsers(signal);
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
          setError(err.message || 'Failed to load users');
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

  const rows = useMemo(() => {
    return users;
  }, [users]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError('');
      await createUser({
        ...form,
      });
      setForm(initialForm);
      await loadData();
    } catch (err) {
      setError(err.message || 'Không tạo được user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    const confirmed = window.confirm(`Xóa user "${user.name}"?`);
    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(user.id);
      setError('');
      await deleteUser(user.id);
      await loadData();
    } catch (err) {
      setError(err.message || 'Không xóa được user');
    } finally {
      setDeletingId(null);
    }
  };

  const handleRoleChange = async (user, role) => {
    try {
      setUpdatingRoleId(user.id);
      setError('');
      const updatedUser = await updateUser(user.id, { role });
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, role: updatedUser.role } : item))
      );
    } catch (err) {
      setError(err.message || 'Không cập nhật được role');
    } finally {
      setUpdatingRoleId(null);
    }
  };

  return (
    <div className="page">
      <section className="page__hero">
        <h1 className="page__title">{heroTitle}</h1>
        <p className="page__subtitle">{heroSubtitle}</p>
      </section>

      {error ? (
        <section className="section-card empty-state empty-state--compact">
          <div>{error}</div>
        </section>
      ) : null}

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Tạo user</h2>
            <p className="section-card__meta">Role: admin, leader, member, koc.</p>
          </div>
        </div>

        <form className="filter-panel" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Tên</label>
            <input id="name" name="name" value={form.name} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required />
          </div>
          <div className="field">
            <label htmlFor="password">Mật khẩu</label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              autoComplete="new-password"
              minLength="8"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="role">Role</label>
            <select id="role" name="role" value={form.role} onChange={handleChange}>
              {roleOptions.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
          <div className="actions">
            <button className="button" type="submit" disabled={saving}>
              {saving ? 'Đang tạo' : 'Tạo user'}
            </button>
          </div>
        </form>
      </section>

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Danh sách user</h2>
            <p className="section-card__meta">Leader sẽ dùng danh sách này để gắn video cho nhân sự, KOC là creator bên ngoài.</p>
          </div>
          <div className="chip-row">
            <span className="chip chip--blue">Users: {rows.length}</span>
            <span className="chip chip--positive">KOC: {rows.filter((user) => user.role === 'koc').length}</span>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Email</th>
                <th>Role</th>
                <th className="cell-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={4}>
                    <div className="empty-state table-empty-state">
                      <div className="loading-dot" />
                      <div>Đang tải user</div>
                    </div>
                  </td>
                </tr>
              ) : rows.length ? (
                rows.map((user) => (
                  <tr key={user.id}>
                    <td><span className="row-title">{user.name}</span></td>
                    <td>{user.email}</td>
                    <td>
                      <select
                        className="table-select"
                        value={user.role}
                        onChange={(event) => handleRoleChange(user, event.target.value)}
                        disabled={updatingRoleId === user.id}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                    </td>
                    <td className="cell-actions">
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        onClick={() => handleDelete(user)}
                        disabled={deletingId === user.id}
                      >
                        {deletingId === user.id ? 'Đang xóa' : 'Xóa'}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={4}>
                    <div className="empty-state empty-state--compact table-empty-state">Chưa có user nào.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default EmployeeTable;
