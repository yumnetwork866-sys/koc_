import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchChannels,
  fetchContentTeams,
  fetchUsers,
  fetchVideos,
} from '../lib/api';
import { useI18n } from '../lib/language';

const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const monthIndex = (value) => {
  const [year, month] = String(value || '').split('-').map(Number);
  return year && month ? year * 12 + month - 1 : null;
};

const formatMonth = (value) => {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${month}/${year}` : '';
};

const videoRevenue = (video) => {
  const raw = video?.gmv?.amount ?? video?.gross_gmv ?? video?.sales ?? video?.revenue;
  const value = Number(raw);
  return raw === null || raw === undefined || !Number.isFinite(value) ? null : value;
};

const matchingEmployeeRule = (video, rules) => {
  const hashtags = new Set(
    (String(video?.title || '').match(/#[\p{L}\p{N}_]+/gu) || [])
      .map((tag) => tag.toLocaleLowerCase('en')),
  );
  return rules.find((rule) => (
    rule.hashtags.some((tag) => hashtags.has(tag.toLocaleLowerCase('en')))
  )) || null;
};

const ChannelReport = () => {
  const { language } = useI18n();
  const [videos, setVideos] = useState([]);
  const [channels, setChannels] = useState([]);
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const formatNumber = (value) => Number(value || 0).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US');
  const formatRevenue = (value, currency = 'MYR') => {
    const normalizedCurrency = /^[A-Z]{3}$/.test(String(currency || '')) ? currency : 'MYR';
    return new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
      style: 'currency',
      currency: normalizedCurrency,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  };

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [loadedVideos, loadedChannels, loadedUsers, loadedTeams] = await Promise.all([
          fetchVideos(controller.signal),
          fetchChannels(controller.signal),
          fetchUsers(controller.signal),
          fetchContentTeams(controller.signal),
        ]);
        setVideos(loadedVideos);
        setChannels(loadedChannels);
        setUsers(loadedUsers);
        setTeams(loadedTeams);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Không tải được báo cáo.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, []);

  const monthlyVideos = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    if (!year || !month) return [];
    const monthStart = new Date(year, month - 1, 1);
    const nextMonthStart = new Date(year, month, 1);
    return videos.filter((video) => {
      if (!video.published_at) return false;
      const publishedAt = new Date(video.published_at);
      return Number.isFinite(publishedAt.getTime())
        && publishedAt >= monthStart
        && publishedAt < nextMonthStart;
    });
  }, [selectedMonth, videos]);

  const monthOptions = useMemo(() => {
    const indexes = videos
      .map((video) => {
        if (!video.published_at) return null;
        const publishedAt = new Date(video.published_at);
        return Number.isFinite(publishedAt.getTime())
          ? publishedAt.getFullYear() * 12 + publishedAt.getMonth()
          : null;
      })
      .filter((value) => value !== null);
    const selectedIndex = monthIndex(selectedMonth);
    const currentIndex = monthIndex(currentMonthValue());
    const firstIndex = Math.min(selectedIndex, currentIndex, ...indexes);
    const lastIndex = Math.max(selectedIndex, currentIndex, ...indexes);

    return Array.from({ length: lastIndex - firstIndex + 1 }, (_, offset) => {
      const value = lastIndex - offset;
      const year = Math.floor(value / 12);
      const month = value % 12 + 1;
      const normalizedValue = `${year}-${String(month).padStart(2, '0')}`;
      return { value: normalizedValue, label: formatMonth(normalizedValue) };
    });
  }, [selectedMonth, videos]);

  const employeeRules = useMemo(() => users
    .filter((user) => user.content_attribution?.team_id)
    .map((user) => ({
      user_id: user.id,
      member: user.name || user.email,
      team_id: String(user.content_attribution.team_id),
      hashtags: Array.isArray(user.content_attribution.hashtags)
        ? user.content_attribution.hashtags
        : [],
    })), [users]);

  const report = useMemo(() => {
    const groups = new Map(teams.map((team) => [String(team.id), {
      key: String(team.id),
      label: team.name,
      videos: 0,
      views: 0,
      revenue: 0,
      revenueAvailable: false,
      currency: null,
      members: new Map(),
    }]));

    employeeRules.forEach((rule) => {
      const group = groups.get(rule.team_id);
      if (!group) return;
      group.members.set(String(rule.user_id), {
        key: String(rule.user_id),
        name: rule.member,
        videos: 0,
        views: 0,
        revenue: 0,
        revenueAvailable: false,
        currency: null,
      });
    });

    let unclassified = 0;
    monthlyVideos.forEach((video) => {
      const rule = matchingEmployeeRule(video, employeeRules);
      const group = rule ? groups.get(rule.team_id) : null;
      if (!rule || !group) {
        unclassified += 1;
        return;
      }

      const revenue = videoRevenue(video);
      group.videos += 1;
      group.views += Number(video.views || 0);
      if (revenue !== null) {
        group.revenue += revenue;
        group.revenueAvailable = true;
        group.currency ||= video.sales_currency || 'MYR';
      }

      const member = group.members.get(String(rule.user_id));
      member.videos += 1;
      member.views += Number(video.views || 0);
      if (revenue !== null) {
        member.revenue += revenue;
        member.revenueAvailable = true;
        member.currency ||= video.sales_currency || 'MYR';
      }
    });

    return {
      groups: [...groups.values()].map((group) => ({
        ...group,
        members: [...group.members.values()].sort((a, b) => b.views - a.views),
      })),
      unclassified,
    };
  }, [employeeRules, monthlyVideos, teams]);

  const topGroup = [...report.groups].sort((a, b) => b.views - a.views)[0];

  return (
    <div className="page channel-report-page">
      <section className="page__hero">
        <div>
          <h1 className="page__title">Báo cáo</h1>
          <p className="page__subtitle">Theo dõi hiệu suất nội dung của từng team và nhân viên theo tháng.</p>
        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}

      <section className="section-card content-performance">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Hiệu suất theo team</h2>
            <p className="section-card__meta">
              {formatNumber(monthlyVideos.length)} video trong {formatMonth(selectedMonth)} từ {formatNumber(channels.length)} kênh.
            </p>
            {report.unclassified ? (
              <span className="content-performance__unclassified">
                {formatNumber(report.unclassified)} video chưa khớp hashtag nhân viên
              </span>
            ) : null}
          </div>
          <div className="channel-report-filters">
            <div className="field channel-report-month">
              <label htmlFor="channel-report-month">Tháng đánh giá</label>
              <select
                id="channel-report-month"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              >
                {monthOptions.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <Link className="button button--ghost" to="/manage/users">Quản lý nhân viên</Link>
          </div>
        </div>

        {loading ? <div className="empty-state"><div className="loading-dot" />Đang tải báo cáo</div> : !teams.length ? (
          <div className="empty-state empty-state--compact">
            <strong>Chưa có team.</strong>
            <span>Hãy tạo team và gắn hashtag cho nhân viên trong trang Quản lý User.</span>
          </div>
        ) : (
          <>
            <div className="content-performance__groups">
              {report.groups.map((group) => (
                <article className="content-performance__group" key={group.key}>
                  <div className="content-performance__group-header">
                    <h3>{group.label}</h3>
                    <span>{formatNumber(group.members.length)} thành viên</span>
                  </div>
                  <div className="content-performance__metrics">
                    <span><small>Video</small><strong>{formatNumber(group.videos)}</strong></span>
                    <span><small>Lượt xem</small><strong>{formatNumber(group.views)}</strong></span>
                    <span><small>Doanh số</small><strong>{group.revenueAvailable ? formatRevenue(group.revenue, group.currency) : '—'}</strong></span>
                  </div>
                  {group.members.length ? (
                    <div className="table-wrap">
                      <table className="data-table data-table--compact">
                        <thead>
                          <tr>
                            <th>Thành viên</th>
                            <th className="cell-number">Video</th>
                            <th className="cell-number">Lượt xem</th>
                            <th className="cell-number">TB lượt xem/video</th>
                            <th className="cell-number">Doanh số</th>
                            <th className="cell-number">TB doanh số/video</th>
                          </tr>
                        </thead>
                        <tbody>{group.members.map((member) => (
                          <tr key={member.key}>
                            <td>{member.name}</td>
                            <td className="cell-number">{formatNumber(member.videos)}</td>
                            <td className="cell-number">{formatNumber(member.views)}</td>
                            <td className="cell-number">{formatNumber(Math.round(member.views / Math.max(member.videos, 1)))}</td>
                            <td className="cell-number">{member.revenueAvailable ? formatRevenue(member.revenue, member.currency) : '—'}</td>
                            <td className="cell-number">{member.revenueAvailable ? formatRevenue(member.revenue / member.videos, member.currency) : '—'}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="content-performance__group-empty">
                      <strong>Team chưa có nhân viên</strong>
                      <span>Gắn nhân viên vào team để bắt đầu thống kê.</span>
                      <Link to="/manage/users">Quản lý nhân viên →</Link>
                    </div>
                  )}
                </article>
              ))}
            </div>

            {topGroup?.views ? (
              <div className="content-performance__ai-summary">
                <strong>AI tổng hợp</strong>
                <p>
                  Trong {formatMonth(selectedMonth)}, {topGroup.label} đang có lượt xem cao nhất với {formatNumber(topGroup.views)} lượt xem từ {formatNumber(topGroup.videos)} video.
                </p>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
};

export default ChannelReport;
