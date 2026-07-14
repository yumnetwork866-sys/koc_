import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createRole, createUser, deleteRole, deleteUser, fetchRoles, fetchUsers, updateRole, updateUser,
} from '../lib/api';

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
          setError(err.message || 'Failed to load users');
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
      setRoleError(err.message || 'Không lưu được role');
    } finally {
      setRoleSaving(false);
    }
  };

  const handleDeleteRole = async (role) => {
    if (!window.confirm(`Xóa role "${role.label}"?`)) return;
    try {
      setRoleError('');
      await deleteRole(role.key);
      setRoles(await fetchRoles());
      if (roleFilter === role.key) setRoleFilter('all');
      resetRoleForm();
    } catch (err) {
      setRoleError(err.message || 'Không xóa được role');
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
      setError(err.message || (editingUser ? 'Không cập nhật được user' : 'Không tạo được user'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user) => {
    const confirmed = window.confirm(`Xóa user "${user.name}" <${user.email}>?`);
    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(user.id);
      setError('');
      await deleteUser(user.id);
      await loadData();
    } catch (err) {
      setError(err.message || 'Không xóa được user');
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
      setError(err.message || 'Không cập nhật được role');
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
      <section className="page__hero employee-table__hero">
        <div className="employee-table__hero-copy">
          <div className="employee-table__eyebrow">Quản trị hệ thống</div>
          <h1 className="page__title">{heroTitle}</h1>
          {heroSubtitle ? <p className="page__subtitle">{heroSubtitle}</p> : null}
        </div>

        <div className="employee-table__hero-actions">
          <button className="button button--ghost" type="button" onClick={openRoleManager}>
            Quản lý vai trò
          </button>
          <button className="button" type="button" onClick={openCreateModal}>
            Tạo user
          </button>
        </div>
      </section>

      <section className="employee-table__summary" aria-label="Thống kê người dùng">
        {[{ key: 'all', label: 'Tất cả' }, ...roles].map((role) => (
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
            <h2 className="section-card__title">Danh sách người dùng</h2>
            <p className="section-card__meta">
              Đang hiển thị {filteredRows.length} trên {rows.length} tài khoản
            </p>
          </div>
        </div>

        <div className="employee-table__toolbar">
          <div className="employee-table__search">
            <label className="sr-only" htmlFor="user-search">Tìm kiếm người dùng</label>
            <input
              id="user-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên hoặc email"
            />
          </div>
          <div className="employee-table__role-filter employee-table__select-wrap">
            <label className="sr-only" htmlFor="user-role-filter">Lọc theo vai trò</label>
            <select
              id="user-role-filter"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              <option value="all">Tất cả vai trò</option>
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
              Xóa lọc
            </button>
          ) : null}
        </div>

        <div className="table-wrap">
          <table className="data-table employee-table__data-table">
            <thead>
              <tr>
                <th>Tài khoản</th>
                <th>Vai trò</th>
                <th className="cell-actions">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="table-state-row">
                  <td className="table-state-cell" colSpan={3}>
                    <div className="empty-state table-empty-state">
                      <div className="loading-dot" />
                      <div>Đang tải user</div>
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
                        aria-label={`Đổi vai trò cho ${user.name}`}
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
                          aria-label={`Mở thao tác cho ${user.name}`}
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
                            Sửa
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
                            {deletingId === user.id ? 'Đang xóa' : 'Xóa'}
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
                      <div>Không có user khớp bộ lọc hiện tại.</div>
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
                <span className="employee-table__modal-eyebrow">Tài khoản</span>
                <h2 id="user-editor-title" className="section-card__title">
                  {editingUser ? 'Chỉnh sửa người dùng' : 'Tạo người dùng mới'}
                </h2>
                <p className="section-card__meta">
                  {editingUser
                    ? `Cập nhật hồ sơ và role cho ${editingUser.name}.`
                    : 'Tạo tài khoản mới cho hệ thống.'}
                </p>
              </div>
              <button
                className="employee-table__modal-close"
                type="button"
                onClick={closeEditor}
                aria-label="Đóng"
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
                <label htmlFor="name">Họ và tên</label>
                <input id="name" name="name" value={form.name} onChange={handleChange} required placeholder="Nguyễn Văn A" />
              </div>
              {!editingUser ? (
                <>
                  <div className="field">
                    <label htmlFor="email">Email</label>
                    <input id="email" name="email" type="email" value={form.email} onChange={handleChange} required placeholder="name@company.com" />
                  </div>
                  <div className="field">
                    <label htmlFor="password">Mật khẩu</label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      value={form.password}
                      onChange={handleChange}
                      autoComplete="new-password"
                      minLength="8"
                      required
                      placeholder="Tối thiểu 8 ký tự"
                    />
                    <p className="employee-table__field-hint">
                      Dùng tối thiểu 8 ký tự.
                    </p>
                  </div>
                </>
              ) : null}
              <div className="field">
                <label htmlFor="role">Vai trò</label>
                <select id="role" name="role" value={form.role} onChange={handleChange}>
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>{getRoleLabel(role)}</option>
                  ))}
                </select>
              </div>
              <div className="actions employee-table__modal-actions">
                <button className="button button--ghost" type="button" onClick={closeEditor} disabled={saving}>
                  Hủy
                </button>
                <button className="button" type="submit" disabled={saving}>
                  {saving ? (editingUser ? 'Đang lưu' : 'Đang tạo') : (editingUser ? 'Lưu thay đổi' : 'Tạo user')}
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
                <h2 id="role-manager-title" className="section-card__title">Quản lý vai trò</h2>
              </div>
              <button className="employee-table__modal-close" type="button" onClick={() => setIsRoleManagerOpen(false)} aria-label="Đóng">×</button>
            </div>

            {roleError ? <div className="employee-table__modal-error empty-state empty-state--compact">{roleError}</div> : null}

            <div className="employee-table__role-manager">
              <section className="employee-table__role-list-panel">
                <div className="employee-table__role-panel-heading">
                  <div><strong>Danh sách vai trò</strong><span>{roles.length} vai trò</span></div>
                  <button className="button button--ghost button--small" type="button" onClick={resetRoleForm}>+ Thêm mới</button>
                </div>
                <div className="employee-table__role-list">
                  {roles.map((role) => (
                  <div className={`employee-table__role-item${editingRoleKey === role.key ? ' is-active' : ''}`} key={role.key}>
                    <button type="button" className="employee-table__role-edit" onClick={() => editRole(role)}>
                      <span>
                        <span className="employee-table__role-name">
                          <strong>{role.label}</strong>
                          {!role.is_system ? <em>Tùy chỉnh</em> : null}
                        </span>
                      </span>
                      <span>{role.user_count || 0} người</span>
                    </button>
                    {!role.is_system ? (
                      <button className="button button--ghost button--small button--danger" type="button" onClick={() => handleDeleteRole(role)}>Xóa</button>
                    ) : null}
                  </div>
                  ))}
                </div>
              </section>

              <form className="employee-table__role-form" onSubmit={handleRoleSubmit}>
                <div className="field">
                  <input
                    id="role-label"
                    aria-label="Tên vai trò"
                    value={roleForm.label}
                    required
                    onChange={(event) => setRoleForm((current) => ({
                      ...current,
                      label: event.target.value,
                      key: editingRoleKey ? current.key : createRoleKey(event.target.value),
                    }))}
                    placeholder="Ví dụ: Biên tập viên"
                  />
                </div>
                <div className="actions">
                  {editingRoleKey ? <button className="button button--ghost" type="button" onClick={resetRoleForm}>Hủy sửa</button> : null}
                  <button className="button" type="submit" disabled={roleSaving}>{roleSaving ? 'Đang lưu' : (editingRoleKey ? 'Lưu thay đổi' : 'Tạo vai trò')}</button>
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
