import React, { useEffect, useState } from 'react';
import { fetchUsers } from '../lib/api';

const KOCManagement = ({ heroTitle, heroSubtitle }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const loadedUsers = await fetchUsers(controller.signal);
        setUsers(loadedUsers.filter((user) => user.role === 'koc'));
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Không tải được danh sách KOC');
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

  return (
    <div className="page">
      <section className="page__hero">
        <span className="page__eyebrow">KOC</span>
        <h1 className="page__title">{heroTitle}</h1>
        <p className="page__subtitle">{heroSubtitle}</p>
        <div className="page__stats">
          <article className="stat-card">
            <p className="stat-card__label">KOC</p>
            <p className="stat-card__value">{users.length}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Role</p>
            <p className="stat-card__value">koc</p>
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
            <h2 className="section-card__title">Danh sách KOC</h2>
            <p className="section-card__meta">Chỉ hiển thị user có role `koc` để dùng cho booking và dashboard sau này.</p>
          </div>
          <div className="chip-row">
            <span className="chip chip--blue">KOC: {users.length}</span>
            <span className="chip chip--positive">Role: koc</span>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-dot" />
            <div>Đang tải KOC</div>
          </div>
        ) : users.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tên</th>
                  <th>Email</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td><span className="row-title">{user.name}</span></td>
                    <td>{user.email}</td>
                    <td>{user.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state empty-state--compact">Chưa có user nào có role KOC.</div>
        )}
      </section>
    </div>
  );
};

export default KOCManagement;
