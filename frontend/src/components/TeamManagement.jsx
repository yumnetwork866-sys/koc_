import React, { useEffect, useMemo, useState } from 'react';
import { createTeam, fetchTeams } from '../lib/api';

const TeamManagement = ({ heroTitle, heroSubtitle }) => {
  const [teams, setTeams] = useState([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadTeams = async (signal) => {
    const loadedTeams = await fetchTeams(signal);
    setTeams(loadedTeams);
  };

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        await loadTeams(controller.signal);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load teams');
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

  const totalMembers = useMemo(() => {
    return teams.reduce((sum, team) => sum + Number(team.users?.length || 0), 0);
  }, [teams]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError('');
      await createTeam({ name });
      setName('');
      await loadTeams();
    } catch (err) {
      setError(err.message || 'Không tạo được team');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <section className="page__hero">
        <span className="page__eyebrow">Quản lý team</span>
        <h1 className="page__title">{heroTitle}</h1>
        <p className="page__subtitle">{heroSubtitle}</p>
        <div className="page__stats">
          <article className="stat-card">
            <p className="stat-card__label">Teams</p>
            <p className="stat-card__value">{teams.length}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Members</p>
            <p className="stat-card__value">{totalMembers}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Default teams</p>
            <p className="stat-card__value">3</p>
          </article>
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Tạo team</h2>
            <p className="section-card__meta">Ví dụ: Content MKT, Content AI, Tin tức.</p>
          </div>
        </div>
        <form className="filter-panel filter-panel--compact" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="team-name">Tên team</label>
            <input id="team-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div className="actions">
            <button className="button" type="submit" disabled={saving}>
              {saving ? 'Đang tạo' : 'Tạo team'}
            </button>
          </div>
        </form>
      </section>

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Danh sách team</h2>
            <p className="section-card__meta">Mỗi team chứa leader/member để tính KPI theo assignment.</p>
          </div>
        </div>
        {loading ? (
          <div className="empty-state">
            <div className="loading-dot" />
            <div>Đang tải team</div>
          </div>
        ) : (
          <div className="metric-list">
            {teams.map((team) => (
              <div className="metric-item" key={team.id}>
                <div className="metric-item__head">
                  <span>{team.name}</span>
                  <span>{team.users?.length || 0} members</span>
                </div>
                <div className="row-subtitle">
                  {(team.users || []).map((user) => user.name).join(', ') || 'Chưa có user'}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default TeamManagement;
