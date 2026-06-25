import React from 'react';
import { Link } from 'react-router-dom';

const highlights = [
  {
    title: 'Dashboard',
    description: 'Xem KPI tổng, top user, theo team và theo sản phẩm.',
  },
  {
    title: 'Channels',
    description: 'Kết nối kênh qua OAuth, import hoặc crawler.',
  },
  {
    title: 'Reports',
    description: 'Tạo weekly report từ dữ liệu video theo khoảng ngày.',
  },
];

const HomePage = () => {
  return (
    <div className="page home-page">
      <section className="page__hero home-page__hero">
        <span className="page__eyebrow">Home</span>
        <h1 className="page__title">Content operations workspace</h1>

        <div className="home-page__actions">
          <Link className="button" to="/dashboard">
            Open dashboard
          </Link>
          <Link className="button button--ghost" to="/manage/channels">
            Manage channels
          </Link>
        </div>
      </section>

      <section className="grid-two">
        {highlights.map((item) => (
          <article className="section-card home-page__card" key={item.title}>
            <h2 className="section-card__title">{item.title}</h2>
            <p className="section-card__meta">{item.description}</p>
          </article>
        ))}
      </section>

      <section className="home-page__legal-links" aria-label="Legal links">
        <Link to="/terms">Terms of Service</Link>
        <Link to="/privacy">Privacy Policy</Link>
      </section>
    </div>
  );
};

export default HomePage;
