import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginAdmin } from '../lib/api';
import { saveStoredSession } from '../lib/session';
import { useI18n } from '../lib/language';

const Login = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
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
      saveStoredSession(session);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || t('login.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page login-page">
      <section className="page__hero">
        <h1 className="page__title">{t('login.title')}</h1>
        <p className="page__subtitle">{t('login.subtitle')}</p>
      </section>

      {error ? <section className="section-card empty-state empty-state--compact">{error}</section> : null}

      <section className="section-card login-card">
        <form className="filter-panel filter-panel--compact" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="identifier">{t('login.identifier')}</label>
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
            <label htmlFor="password">{t('login.password')}</label>
            <input id="password" name="password" type="password" value={form.password} onChange={handleChange} required />
          </div>
          <div className="actions">
            <button className="button" type="submit" disabled={loading}>
              {loading ? t('login.submitting') : t('login.submit')}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};

export default Login;
