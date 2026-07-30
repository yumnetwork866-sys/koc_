import React, { useEffect, useState } from 'react';
import {
  createAssignment,
  fetchAssignments,
  fetchUsers,
  fetchVideoOptions,
} from '../lib/api';

const initialForm = {
  video_id: '',
  user_id: '',
  assignment_role: 'script',
};

const roles = ['script', 'editor', 'uploader', 'actor', 'ai_creator'];

const AssignmentManagement = ({ heroTitle, heroSubtitle }) => {
  const [assignments, setAssignments] = useState([]);
  const [videos, setVideos] = useState([]);
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadData = async (signal) => {
    const [loadedAssignments, loadedVideos, loadedUsers] = await Promise.all([
      fetchAssignments(signal),
      fetchVideoOptions(signal),
      fetchUsers(signal),
    ]);
    setAssignments(loadedAssignments);
    setVideos(loadedVideos);
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
          setError(err.message || 'Failed to load assignments');
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

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError('');
      await createAssignment({
        video_id: Number(form.video_id),
        user_id: Number(form.user_id),
        assignment_role: form.assignment_role,
      });
      setForm(initialForm);
      await loadData();
    } catch (err) {
      setError(err.message || 'Không gắn được video');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <section className="page__hero">
        <h1 className="page__title">{heroTitle}</h1>
        <p className="page__subtitle">{heroSubtitle}</p>
        <div className="page__stats">
          <article className="stat-card">
            <p className="stat-card__label">Assignments</p>
            <p className="stat-card__value">{assignments.length}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Videos</p>
            <p className="stat-card__value">{videos.length}</p>
          </article>
          <article className="stat-card">
            <p className="stat-card__label">Users</p>
            <p className="stat-card__value">{users.length}</p>
          </article>
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Gắn video cho nhân sự</h2>
            <p className="section-card__meta">Một video có thể có nhiều vai trò: script, editor, uploader, actor, ai_creator.</p>
          </div>
        </div>

        <form className="filter-panel" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="video_id">Video</label>
            <select id="video_id" name="video_id" value={form.video_id} onChange={handleChange} required>
              <option value="">Chọn video</option>
              {videos.map((video) => (
                <option key={video.id} value={video.id}>{video.title}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="user_id">User</label>
            <select id="user_id" name="user_id" value={form.user_id} onChange={handleChange} required>
              <option value="">Chọn user</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="assignment_role">Role</label>
            <select id="assignment_role" name="assignment_role" value={form.assignment_role} onChange={handleChange}>
              {roles.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
          <div className="actions">
            <button className="button" type="submit" disabled={saving}>
              {saving ? 'Đang gắn' : 'Gắn video'}
            </button>
          </div>
        </form>
      </section>

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Assignments hiện có</h2>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Video</th>
                <th>User</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={3}>
                    <div className="empty-state table-empty-state">
                      <div className="loading-dot" />
                      <div>Đang tải assignments</div>
                    </div>
                  </td>
                </tr>
              ) : assignments.length ? (
                assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td><span className="row-title">{assignment.video?.title || assignment.video_id}</span></td>
                    <td>{assignment.user?.name || assignment.user_id}</td>
                    <td><span className="chip">{assignment.assignment_role}</span></td>
                  </tr>
                ))
              ) : (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={3}>
                    <div className="empty-state empty-state--compact table-empty-state">Chưa có assignment nào.</div>
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

export default AssignmentManagement;
