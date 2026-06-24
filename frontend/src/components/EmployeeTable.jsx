import React, { useEffect, useMemo, useState } from 'react';
import { fetchTeams, fetchUsers } from '../lib/api';

const EmployeeTable = ({ heroTitle, heroSubtitle }) => {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [loadedUsers, loadedTeams] = await Promise.all([
          fetchUsers(controller.signal),
          fetchTeams(controller.signal),
        ]);

        setUsers(loadedUsers);
        setTeams(loadedTeams);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load employees');
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

  const teamNames = useMemo(() => {
    return new Map(teams.map((team) => [team.id, team.name]));
  }, [teams]);

  const rows = useMemo(() => {
    return users.map((user) => ({
      ...user,
      teamName: teamNames.get(user.team_id) || 'Unassigned',
    }));
  }, [users, teamNames]);

  return (
    <div className="page">
      <section className="page__hero">
        <span className="page__eyebrow">Directory</span>
        <h1 className="page__title">{heroTitle}</h1>
        <p className="page__subtitle">{heroSubtitle}</p>
      </section>

      {error ? (
        <section className="section-card empty-state">
          <div>Không tải được danh sách nhân viên.</div>
          <div className="section-card__meta">{error}</div>
        </section>
      ) : null}

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Employee management</h2>
            <p className="section-card__meta">Dữ liệu được lấy từ `/api/users` và `/api/teams`.</p>
          </div>
          <div className="chip-row">
            <span className="chip chip--blue">Total: {rows.length}</span>
            <span className="chip chip--positive">Teams: {teams.length}</span>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-dot" />
            <div>Đang tải danh sách nhân viên</div>
          </div>
        ) : rows.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Team</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <span className="row-title">{user.name}</span>
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <span className="chip">{user.role}</span>
                    </td>
                    <td>{user.teamName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div>Chưa có nhân viên nào trong hệ thống.</div>
            <div className="section-card__meta">Tạo user trong backend để thấy dữ liệu ở đây.</div>
          </div>
        )}
      </section>
    </div>
  );
};

export default EmployeeTable;
