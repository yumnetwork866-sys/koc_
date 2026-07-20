import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createRole, createUser, deleteRole, deleteUser, fetchRoles, fetchUsers, updateRole, updateUser,
} from '../lib/api';
import { useI18n } from '../lib/language';

const initialForm = {
  name: '',
  email: '',
  password: '',
  role: 'member',
};

const fallbackRoles = [
  { key: 'member', label: 'Member' },
  { key: 'leader', label: 'Leader' },
  { key: 'koc', label: 'KOC' },
  { key: 'admin', label: 'Admin' },
];

const createInitialForm = () => ({ ...initialForm });

const createRoleKey = (label) => String(label || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 64);

const EmployeeTable = ({ heroTitle, heroSubtitle }) => {
  const { t } = useI18n();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState(fallbackRoles);
  const [form, setForm] = useState(initialForm);
  const [editingUser, setEditingUser] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isRoleManagerOpen, setIsRoleManagerOpen] = useState(false);
  const [roleForm, setRoleForm] = useState({ key: '', label: '', description: '' });
  const [editingRoleKey, setEditingRoleKey] = useState(null);
  const [roleSaving, setRoleSaving] = useState(false);
  const [roleError, setRoleError] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingRoleId, setUpdatingRoleId] = useState(null);
  const [openActions, setOpenActions] = useState({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
  const [error, setError] = useState('');

  const loadData = async (signal) => {
    const [loadedUsers, loadedRoles] = await Promise.all([fetchUsers(signal), fetchRoles(signal)]);
    setUsers(loadedUsers);
    setRoles(loadedRoles);
  };

  const roleOptions = roles.map((role) => role.key);
  const getRoleLabel = (key) => roles.find((role) => role.key === key)?.label || key;

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        await loadData(controller.signal);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || t('users.loadError'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => controller.abort();
  }, [t]);

  useEffect(() => {
    if (!isEditorOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsEditorOpen(false);
        setEditingUser(null);
        setForm(initialForm);
        setError('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditorOpen]);

  useEffect(() => {
    const closeActions = (event) => {
      if (!event.target.closest('.employee-table__action-menu')) {
        setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
      }
    };

    document.addEventListener('click', closeActions);
    return () => document.removeEventListener('click', closeActions);
  }, []);

  const rows = useMemo(() => users, [users]);

  const stats = useMemo(() => rows.reduce((accumulator, user) => {
    accumulator.total += 1;
    accumulator.byRole[user.role] = (accumulator.byRole[user.role] || 0) + 1;
    return accumulator;
  }, {
    total: 0,
    byRole: {},
  }), [rows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((user) => {
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;
      const matchesQuery = !normalizedQuery
        || [user.name, user.email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));

      return matchesRole && matchesQuery;
    });
  }, [query, roleFilter, rows]);

  const activeFilters = Number(Boolean(query.trim())) + Number(roleFilter !== 'all');

  const toggleActionsMenu = (userId, triggerElement) => {
    setOpenActions((current) => {
      if (current.id === userId) {
        return { id: null, direction: 'down', top: 0, bottom: 0, right: 0 };
      }

      const rect = triggerElement.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const direction = spaceBelow < 130 && spaceAbove > spaceBelow ? 'up' : 'down';

      return {
        id: userId,
        direction,
        top: Math.min(window.innerHeight - 12, rect.bottom + 8),
        bottom: Math.max(12, window.innerHeight - rect.top + 8),
        right: Math.max(12, window.innerWidth - rect.right),
      };
    });
  };

  const openCreateModal = () => {
    setError('');
    setEditingUser(null);
    setForm(createInitialForm());
    setIsEditorOpen(true);
  };

  const resetRoleForm = () => {
    setEditingRoleKey(null);
    setRoleForm({ key: '', label: '', description: '' });
    setRoleError('');
  };

  const openRoleManager = () => {
    resetRoleForm();
    setIsRoleManagerOpen(true);
  };

  const editRole = (role) => {
    setEditingRoleKey(role.key);
    setRoleForm({ key: role.key, label: role.label, description: role.description || '' });
    setRoleError('');
  };

  const handleRoleSubmit = async (event) => {
    event.preventDefault();
    try {
      setRoleSaving(true);
      setRoleError('');
      const payload = { label: roleForm.label.trim(), description: roleForm.description.trim() };
      if (editingRoleKey) await updateRole(editingRoleKey, payload);
      else await createRole({ ...payload, key: roleForm.key.trim().toLowerCase() });
      setRoles(await fetchRoles());
      resetRoleForm();
    } catch (err) {
      setRoleError(err.message || t('users.roleSaveError'));
    } finally {
      setRoleSaving(false);
    }
  };

  const handleDeleteRole = async (role) => {
    if (!window.confirm(t('users.roleDeleteConfirm', { name: role.label }))) return;
    try {
      setRoleError('');
      await deleteRole(role.key);
      setRoles(await fetchRoles());
      if (roleFilter === role.key) setRoleFilter('all');
      resetRoleForm();
    } catch (err) {
      setRoleError(err.message || t('users.roleDeleteError'));
    }
  };

  const openEditModal = (user) => {
    setError('');
    setEditingUser(user);
    setForm({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role || 'member',
    });
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingUser(null);
    setForm(createInitialForm());
    setError('');
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      setSaving(true);
      setError('');

      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
      };

      if (form.password.trim()) {
        payload.password = form.password;
      }

      if (editingUser) {
        await updateUser(editingUser.id, payload);
      } else {
        await createUser({
          ...payload,
          password: form.password,
        });
      }

      closeEditor();
      await loadData();
    } catch (err) {
      setError(err.message || t(editingUser ? 'users.updateError' : 'users.createError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    const confirmed = window.confirm(t('users.deleteConfirm', { name: user.name, email: user.email }));
    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(user.id);
      setError('');
      await deleteUser(user.id);
      await loadData();
    } catch (err) {
      setError(err.message || t('users.deleteError'));
    } finally {
      setDeletingId(null);
    }
  };

  const handleRoleChange = async (user, role) => {
    try {
      setUpdatingRoleId(user.id);
      setError('');
      const updatedUser = await updateUser(user.id, { role });
      setUsers((current) =>
        current.map((item) => (item.id === user.id ? { ...item, role: updatedUser.role } : item))
      );
    } catch (err) {
      setError(err.message || t('users.roleUpdateError'));
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const handleBackdropClick = (event) => {
    if (event.target !== event.currentTarget) return;
    closeEditor();
  };

  return (
    <div className="page employee-table-page">
      <section className="page__hero admin-page__hero employee-table__hero">
        <div className="employee-table__hero-copy">
          <h1 className="page__title">{t('users.heroTitle') || heroTitle}</h1>
          {heroSubtitle ? <p className="page__subtitle">{heroSubtitle}</p> : null}
        </div>

        <div className="employee-table__hero-actions">
          <button className="button button--ghost" type="button" onClick={openRoleManager}>
            {t('users.manageRoles')}
          </button>
          <button className="button" type="button" onClick={openCreateModal}>
            {t('users.create')}
          </button>
        </div>
      </section>

      <section className="employee-table__summary" aria-label={t('users.summaryLabel')}>
        {[{ key: 'all', label: t('users.all') }, ...roles].map((role) => (
          <button
            key={role.key}
            className={`employee-table__summary-item${roleFilter === role.key ? ' is-active' : ''}`}
            type="button"
            onClick={() => setRoleFilter(role.key)}
            aria-pressed={roleFilter === role.key}
          >
            <span>{role.label}</span>
            <strong>{role.key === 'all' ? stats.total : (stats.byRole[role.key] || 0)}</strong>
          </button>
        ))}
      </section>

      {error && !isEditorOpen ? (
        <section className="section-card empty-state empty-state--compact">
          <div>{error}</div>
        </section>
      ) : null}

      <section className="section-card employee-table__table-card">
        <div className="section-card__header section-card__header--compact">
          <div>
            <h2 className="section-card__title">{t('users.list')}</h2>
            <p className="section-card__meta">
              {t('users.showing', { visible: filteredRows.length, total: rows.length })}
            </p>
          </div>
        </div>

        <div className="employee-table__toolbar">
          <div className="employee-table__search">
            <label className="sr-only" htmlFor="user-search">{t('users.search')}</label>
            <input
              id="user-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('users.searchPlaceholder')}
            />
          </div>
          <div className="employee-table__role-filter employee-table__select-wrap">
            <label className="sr-only" htmlFor="user-role-filter">{t('users.filterRole')}</label>
            <select
              id="user-role-filter"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              <option value="all">{t('users.allRoles')}</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>{getRoleLabel(role)}</option>
              ))}
            </select>
          </div>
          {activeFilters ? (
            <button
              className="button button--ghost button--small"
              type="button"
              onClick={() => {
                setQuery('');
                setRoleFilter('all');
              }}
              disabled={!activeFilters}
            >
              {t('users.clearFilter')}
            </button>
          ) : null}
        </div>

        <div className="table-wrap">
          <table className="data-table employee-table__data-table">
            <thead>
              <tr>
                <th>{t('users.account')}</th>
                <th>{t('users.role')}</th>
                <th className="cell-actions">{t('users.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={3}>
                    <div className="empty-state table-empty-state">
                      <div className="loading-dot" />
                      <div>{t('users.loading')}</div>
                    </div>
                  </td>
                </tr>
              ) : filteredRows.length ? (
                filteredRows.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="employee-table__account-cell">
                        <span className="employee-table__avatar" aria-hidden="true">
                          {(user.name || user.email || '?').trim().charAt(0).toUpperCase()}
                        </span>
                        <div className="employee-table__account">
                          <span className="row-title">{user.name}</span>
                          <span className="row-subtitle">{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        className="table-select employee-table__role-select"
                        value={user.role}
                        onChange={(event) => handleRoleChange(user, event.target.value)}
                        disabled={updatingRoleId === user.id}
                        aria-label={t('users.changeRole', { name: user.name })}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>{getRoleLabel(role)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="cell-actions">
                      <div className="action-menu employee-table__action-menu">
                        <button
                          type="button"
                          className="action-menu__trigger"
                          aria-haspopup="menu"
                          aria-expanded={openActions.id === user.id}
                          aria-label={t('users.openActions', { name: user.name })}
                          onClick={(event) => toggleActionsMenu(user.id, event.currentTarget)}
                        >
                          ...
                        </button>
                        {openActions.id === user.id ? (
                        <div
                          className="action-menu__panel"
                          role="menu"
                          style={{
                            position: 'fixed',
                            right: `${openActions.right}px`,
                            top: openActions.direction === 'down' ? `${openActions.top}px` : 'auto',
                            bottom: openActions.direction === 'up' ? `${openActions.bottom}px` : 'auto',
                          }}
                        >
                          <button
                            type="button"
                            className="action-menu__item"
                            role="menuitem"
                            onClick={() => {
                              setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
                              openEditModal(user);
                            }}
                          >
                            {t('users.edit')}
                          </button>
                          <button
                            type="button"
                            className="action-menu__item action-menu__item--danger"
                            role="menuitem"
                            onClick={() => {
                              setOpenActions({ id: null, direction: 'down', top: 0, bottom: 0, right: 0 });
                              handleDelete(user);
                            }}
                            disabled={deletingId === user.id}
                          >
                            {deletingId === user.id ? t('users.deleting') : t('users.delete')}
                          </button>
                        </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={3}>
                    <div className="empty-state empty-state--compact table-empty-state">
                      <div>{t('users.noMatch')}</div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isEditorOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={handleBackdropClick}>
          <div
            className="modal-card employee-table__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="user-editor-title"
          >
            <div className="employee-table__modal-header">
              <div>
                <span className="employee-table__modal-eyebrow">{t('users.account')}</span>
                <h2 id="user-editor-title" className="section-card__title">
                  {editingUser ? t('users.editorEdit') : t('users.editorCreate')}
                </h2>
                <p className="section-card__meta">
                  {editingUser
                    ? t('users.editMeta', { name: editingUser.name })
                    : t('users.createMeta')}
                </p>
              </div>
              <button
                className="employee-table__modal-close"
                type="button"
                onClick={closeEditor}
                aria-label={t('users.close')}
              >
                ×
              </button>
            </div>

            {error ? (
              <section className="empty-state empty-state--compact employee-table__modal-error" role="alert">
                <div>{error}</div>
              </section>
            ) : null}

            <form className="employee-table__modal-form" onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="name">{t('users.fullName')}</label>
                <input id="name" name="name" value={form.name} onChange={handleChange} required placeholder="Nguyễn Văn A" />
              </div>
              {!editingUser ? (
                <>
                  <div className="field">
                    <label htmlFor="email">Email</label>
                    <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required placeholder="name@company.com" />
                  </div>
                  <div className="field">
                    <label htmlFor="password">{t('users.password')}</label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      value={form.password}
                      onChange={handleChange}
                      autoComplete="new-password"
                      minLength="8"
                      required
                      placeholder={t('users.passwordPlaceholder')}
                    />
                    <p className="employee-table__field-hint">
                      {t('users.passwordHint')}
                    </p>
                  </div>
                </>
              ) : null}
              <div className="field">
                <label htmlFor="role">{t('users.role')}</label>
                <select id="role" name="role" value={form.role} onChange={handleChange}>
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>{getRoleLabel(role)}</option>
                  ))}
                </select>
              </div>
              <div className="actions employee-table__modal-actions">
                <button className="button button--ghost" type="button" onClick={closeEditor} disabled={saving}>
                  {t('users.cancel')}
                </button>
                <button className="button" type="submit" disabled={saving}>
                  {saving ? (editingUser ? t('users.saving') : t('users.creating')) : (editingUser ? t('users.save') : t('users.create'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isRoleManagerOpen ? createPortal((
        <div className="modal-backdrop employee-table__role-backdrop" role="presentation" onClick={(event) => {
          if (event.target === event.currentTarget) setIsRoleManagerOpen(false);
        }}>
          <div className="modal-card employee-table__role-modal" role="dialog" aria-modal="true" aria-labelledby="role-manager-title">
            <div className="employee-table__modal-header employee-table__modal-header--roles">
              <div>
                <h2 id="role-manager-title" className="section-card__title">{t('users.manageRoles')}</h2>
              </div>
              <button className="employee-table__modal-close" type="button" onClick={() => setIsRoleManagerOpen(false)} aria-label={t('users.close')}>×</button>
            </div>

            {roleError ? <div className="employee-table__modal-error empty-state empty-state--compact">{roleError}</div> : null}

            <div className="employee-table__role-manager">
              <section className="employee-table__role-list-panel">
                <div className="employee-table__role-panel-heading">
                  <div><strong>{t('users.roleList')}</strong><span>{t('users.roleCount', { count: roles.length })}</span></div>
                  <button className="button button--ghost button--small" type="button" onClick={resetRoleForm}>{t('users.addRole')}</button>
                </div>
                <div className="employee-table__role-list">
                  {roles.map((role) => (
                  <div className={`employee-table__role-item${editingRoleKey === role.key ? ' is-active' : ''}`} key={role.key}>
                    <button type="button" className="employee-table__role-edit" onClick={() => editRole(role)}>
                      <span>
                        <span className="employee-table__role-name">
                          <strong>{role.label}</strong>
                          {!role.is_system ? <em>{t('users.customRole')}</em> : null}
                        </span>
                      </span>
                      <span>{t('users.userCount', { count: role.user_count || 0 })}</span>
                    </button>
                    {!role.is_system ? (
                      <button className="button button--ghost button--small button--danger" type="button" onClick={() => handleDeleteRole(role)}>{t('users.delete')}</button>
                    ) : null}
                  </div>
                  ))}
                </div>
              </section>

              <form className="employee-table__role-form" onSubmit={handleRoleSubmit}>
                <div className="field">
                  <input
                    id="role-label"
                    aria-label={t('users.roleName')}
                    value={roleForm.label}
                    required
                    onChange={(event) => setRoleForm((current) => ({
                      ...current,
                      label: event.target.value,
                      key: editingRoleKey ? current.key : createRoleKey(event.target.value),
                    }))}
                    placeholder={t('users.rolePlaceholder')}
                  />
                </div>
                <div className="actions">
                  {editingRoleKey ? <button className="button button--ghost" type="button" onClick={resetRoleForm}>{t('users.cancelEdit')}</button> : null}
                  <button className="button" type="submit" disabled={roleSaving}>{roleSaving ? t('users.saving') : (editingRoleKey ? t('users.save') : t('users.createRole'))}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ), document.body) : null}
    </div>
  );
};

export default EmployeeTable;
