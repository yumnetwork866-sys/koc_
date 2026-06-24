import React, { useEffect, useMemo, useState } from 'react';
import { fetchTeams, fetchUsers, fetchVideos } from '../lib/api';

const VideoTable = ({ heroTitle, heroSubtitle }) => {
  const [videos, setVideos] = useState([]);
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
        const [loadedVideos, loadedUsers, loadedTeams] = await Promise.all([
          fetchVideos(controller.signal),
          fetchUsers(controller.signal),
          fetchTeams(controller.signal),
        ]);

        setVideos(loadedVideos);
        setUsers(loadedUsers);
        setTeams(loadedTeams);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to load videos');
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

  const creatorNames = useMemo(() => {
    return new Map(users.map((user) => [user.id, user.name]));
  }, [users]);

  const teamNames = useMemo(() => {
    return new Map(teams.map((team) => [team.id, team.name]));
  }, [teams]);

  const rows = useMemo(() => {
    return videos.map((video) => ({
      ...video,
      creatorName: creatorNames.get(video.creator_id) || `User ${video.creator_id}`,
      teamName: teamNames.get(video.team_id) || `Team ${video.team_id}`,
    }));
  }, [videos, creatorNames, teamNames]);

  return (
    <div className="page">
      <section className="page__hero">
        <span className="page__eyebrow">Library</span>
        <h1 className="page__title">{heroTitle}</h1>
        <p className="page__subtitle">{heroSubtitle}</p>
      </section>

      {error ? (
        <section className="section-card empty-state">
          <div>Không tải được danh sách video.</div>
          <div className="section-card__meta">{error}</div>
        </section>
      ) : null}

      <section className="section-card">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Video content management</h2>
            <p className="section-card__meta">Dữ liệu được lấy từ `/api/videos`, `/api/users`, và `/api/teams`.</p>
          </div>
          <div className="chip-row">
            <span className="chip chip--blue">Total: {rows.length}</span>
            <span className="chip chip--positive">Teams: {teams.length}</span>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <div className="loading-dot" />
            <div>Đang tải danh sách video</div>
          </div>
        ) : rows.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Creator</th>
                  <th>Team</th>
                  <th>Type</th>
                  <th>Views</th>
                  <th>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((video) => (
                  <tr key={video.id}>
                    <td>
                      <span className="row-title">{video.title}</span>
                    </td>
                    <td>{video.creatorName}</td>
                    <td>
                      <span className="chip chip--blue">{video.teamName}</span>
                    </td>
                    <td>{video.type}</td>
                    <td>{Number(video.views || 0).toLocaleString()}</td>
                    <td>{Number(video.revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div>Chưa có video nào trong hệ thống.</div>
            <div className="section-card__meta">Tạo video trong backend để thấy dữ liệu ở đây.</div>
          </div>
        )}
      </section>
    </div>
  );
};

export default VideoTable;
