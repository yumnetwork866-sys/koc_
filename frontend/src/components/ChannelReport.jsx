import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchChannelReport } from '../lib/api';
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

const ChannelReport = () => {
  const { language } = useI18n();
  const [report, setReport] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthValue);
  const [selectedTeamId, setSelectedTeamId] = useState('all');
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
        const payload = await fetchChannelReport({
          month: selectedMonth,
          teamId: selectedTeamId,
          page: 1,
          pageSize: 20,
          signal: controller.signal,
        });
        setReport(payload);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') setError(loadError.message || 'Không tải được báo cáo.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [selectedMonth, selectedTeamId]);

  useEffect(() => {
    if (selectedTeamId !== 'all'
      && report
      && !report.filters?.teams?.some((team) => String(team.id) === selectedTeamId)) {
      setSelectedTeamId('all');
    }
  }, [report, selectedTeamId]);

  const monthOptions = useMemo(() => {
    const selectedIndex = monthIndex(selectedMonth);
    const currentIndex = monthIndex(currentMonthValue());
    const firstIndex = Math.min(selectedIndex, currentIndex) - 11;
    const lastIndex = Math.max(selectedIndex, currentIndex);

    return Array.from({ length: lastIndex - firstIndex + 1 }, (_, offset) => {
      const value = lastIndex - offset;
      const year = Math.floor(value / 12);
      const month = value % 12 + 1;
      const normalizedValue = `${year}-${String(month).padStart(2, '0')}`;
      return { value: normalizedValue, label: formatMonth(normalizedValue) };
    });
  }, [selectedMonth]);

  const teams = report?.filters?.teams || [];
  const groups = report?.revenue?.teams || [];
  const visibleGroups = (
    selectedTeamId === 'all'
      ? groups
      : groups.filter((group) => group.key === selectedTeamId)
  );
  const selectedTeam = teams.find((team) => String(team.id) === selectedTeamId);
  const topGroup = [...visibleGroups].sort((a, b) => b.views - a.views)[0];
  const kpis = report?.kpis || {};

  return (
    <div className="page channel-report-page">
      <section className="page__hero">
        <div>
          <h1 className="page__title">Báo cáo</h1>

        </div>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}

      <section className="section-card content-performance">
        <div className="section-card__header">
          <div>
            <h2 className="section-card__title">Hiệu suất theo team</h2>
            <p className="section-card__meta">
              {selectedTeam
                ? `${formatNumber(topGroup?.videos || 0)} video đã nhận diện của ${selectedTeam.name} trong ${formatMonth(selectedMonth)}.`
                : `${formatNumber(kpis.videos)} video trong ${formatMonth(selectedMonth)} từ ${formatNumber(kpis.channels)} kênh.`}
            </p>
          </div>
          <div className="channel-report-filters">
            <div className="field channel-report-team">
              <label htmlFor="channel-report-team">Team</label>
              <select
                id="channel-report-team"
                value={selectedTeamId}
                onChange={(event) => setSelectedTeamId(event.target.value)}
              >
                <option value="all">Tất cả team</option>
                {teams.map((team) => (
                  <option value={String(team.id)} key={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
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
            <div className={`content-performance__groups${selectedTeamId !== 'all' ? ' content-performance__groups--filtered' : ''}`}>
              {visibleGroups.map((group) => (
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
          </>
        )}
      </section>

    </div>
  );
};

export default ChannelReport;
