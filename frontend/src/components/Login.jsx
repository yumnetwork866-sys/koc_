import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginAdmin } from '../lib/api';
import { saveStoredSession } from '../lib/session';
import { useI18n } from '../lib/language';
import AppLogo from './AppLogo';

const Login = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [form, setForm] = useState({
    identifier: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (error) setError('');
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
    <main className="login-page">
      <section className="login-page__intro" aria-labelledby="login-title">
        <div className="login-page__brand-mark" aria-hidden="true">
          <AppLogo size="lg" alt="" />
        </div>
        <p className="login-page__eyebrow">{t('login.workspace')}</p>
        <h1 id="login-title" className="login-page__title">{t('login.title')}</h1>
        <p className="login-page__subtitle">{t('login.subtitle')}</p>
        <div className="login-page__features" aria-label={t('login.featuresLabel')}>
          <span>{t('login.featureReports')}</span>
          <span>{t('login.featureChannels')}</span>
          <span>{t('login.featureTeam')}</span>
        </div>
      </section>

      <section className="login-card" aria-labelledby="login-form-title">
        <div className="login-card__header">
          <h2 id="login-form-title">{t('login.formTitle')}</h2>
          <p>{t('login.formSubtitle')}</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error ? (
            <div className="login-form__error" role="alert">
              <span className="login-form__error-icon" aria-hidden="true">!</span>
              <span>{error}</span>
            </div>
          ) : null}

          <div className="field login-form__field">
            <label htmlFor="identifier">{t('login.identifier')}</label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              value={form.identifier}
              onChange={handleChange}
              placeholder={t('login.identifierPlaceholder')}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div className="field login-form__field">
            <label htmlFor="password">{t('login.password')}</label>
            <div className="login-form__password">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={handleChange}
                placeholder={t('login.passwordPlaceholder')}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="login-form__password-toggle"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
              >
                {showPassword ? t('login.hide') : t('login.show')}
              </button>
            </div>
          </div>

          <button className="button login-form__submit" type="submit" disabled={loading}>
            {loading ? <span className="login-form__spinner" aria-hidden="true" /> : null}
            {loading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <p className="login-card__support">{t('login.support')}</p>
      </section>
    </main>
  );
};

export default Login;
