import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginAdmin } from '../lib/api';

const Login = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    identifier: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
          setLoading(true);
          setError('');
          const session = await loginAdmin(form);
      localStorage.setItem('content_report_session', JSON.stringify(session));
      navigate('/');
    } catch (err) {
      setError(err.message || 'Không đăng nhập được');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page login-page">
      <section className="page__hero">
        <span className="page__eyebrow">Login admin</span>
        <h1 className="page__title">Performance Report</h1>
        <p className="page__subtitle">Đăng nhập để quản lý team, user, kênh, video và báo cáo tuần.</p>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}

      <section className="section-card login-card">
        <form className="filter-panel filter-panel--compact" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="identifier">Username or Email</label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              value={form.identifier}
              onChange={handleChange}
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" value={form.password} onChange={handleChange} required />
          </div>
          <div className="actions">
            <button className="button" type="submit" disabled={loading}>
              {loading ? 'Đang đăng nhập' : 'Đăng nhập'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default Login;
