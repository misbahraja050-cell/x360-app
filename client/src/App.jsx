import React, { useState, useEffect } from 'react';
import {
  Users, ShieldAlert, Settings, LogOut, Plus, Edit2, Trash2, Check, X,
  ChevronDown, Building, Store, Filter, RefreshCw, AlertTriangle, Eye, EyeOff
} from 'lucide-react';

const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState('');
  const [loginEmail, setLoginEmail] = useState('admin@x360.com');
  const [loginError, setLoginError] = useState('');
  const [activeTab, setActiveTab] = useState('users');

  // Selector State
  const [businesses, setBusinesses] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState('all');
  const [selectedStoreIds, setSelectedStoreIds] = useState([]);
  const [storeSelectorOpen, setStoreSelectorOpen] = useState(false);
  const [busSelectorOpen, setStoreBusOpen] = useState(false);

  // Users & Permissions State
  const [usersList, setUsersList] = useState([]);
  const [editingUser, setEditUser] = useState(null);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userForm, setUserForm] = useState({
    email: '',
    auth_user_id: '',
    full_name: '',
    role: 'bookkeeper',
    status: 'active',
    access: { businesses: [], stores: [] },
    permissions: []
  });

  // Custom Field Options State
  const [customOptions, setCustomOptions] = useState([]);
  const [activeFieldKey, setActiveFieldKey] = useState('dispute_status');
  const [optForm, setOptForm] = useState({
    option_label: '',
    excludes_from_calculations: false,
    sort_order: 0
  });
  const [editingOptionId, setEditingOptionId] = useState(null);

  // Load user session on startup
  useEffect(() => {
    const savedUser = localStorage.getItem('x360_user');
    const savedToken = localStorage.getItem('x360_token');
    if (savedUser && savedToken) {
      try {
        setUser(JSON.parse(savedUser));
        setToken(savedToken);
      } catch (e) {
        localStorage.removeItem('x360_user');
        localStorage.removeItem('x360_token');
      }
    }
  }, []);

  // Fetch businesses, stores, and options once logged in
  useEffect(() => {
    if (user && token) {
      fetchSelectorData();
      fetchCustomOptions();
      if (user.role === 'admin') {
        fetchUsers();
      } else if (user.role === 'client') {
        setActiveTab('reporting_placeholder');
      } else {
        setActiveTab('other_placeholder');
      }
    }
  }, [user, token]);

  // Authorization Header Helper
  const getAuthHeaders = () => {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const fetchSelectorData = async () => {
    try {
      const bRes = await fetch(`${API_BASE}/businesses`, { headers: getAuthHeaders() });
      const bData = await bRes.json();
      setBusinesses(bData || []);

      const sRes = await fetch(`${API_BASE}/stores`, { headers: getAuthHeaders() });
      const sData = await sRes.json();
      setStores(sData || []);
    } catch (err) {
      console.error('Error fetching selector data:', err);
    }
  };

  const fetchCustomOptions = async () => {
    try {
      const res = await fetch(`${API_BASE}/custom-field-options`, { headers: getAuthHeaders() });
      const data = await res.json();
      setCustomOptions(data || []);
    } catch (err) {
      console.error('Error fetching options:', err);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/users`, { headers: getAuthHeaders() });
      const data = await res.json();
      setUsersList(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('x360_user', JSON.stringify(data.user));
        localStorage.setItem('x360_token', data.token);
        setUser(data.user);
        setToken(data.token);
      } else {
        setLoginError(data.error || 'Login failed');
      }
    } catch (err) {
      setLoginError('Error connecting to backend server');
    }
  };

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('x360_user');
    localStorage.removeItem('x360_token');
    setUser(null);
    setToken('');
    setSelectedBusinessId('all');
    setSelectedStoreIds([]);
  };

  // Cascading selector handler
  const handleBusinessChange = (busId) => {
    setSelectedBusinessId(busId);
    setSelectedStoreIds([]); // reset store selections
  };

  // Filter stores depending on selected business
  const getFilteredStores = () => {
    if (selectedBusinessId === 'all') {
      return stores;
    }
    return stores.filter(s => s.business_id === selectedBusinessId);
  };

  const handleStoreToggle = (storeId) => {
    setSelectedStoreIds(prev => {
      if (prev.includes(storeId)) {
        return prev.filter(id => id !== storeId);
      } else {
        return [...prev, storeId];
      }
    });
  };

  const handleSelectAllStores = () => {
    const filtered = getFilteredStores();
    if (selectedStoreIds.length === filtered.length) {
      setSelectedStoreIds([]);
    } else {
      setSelectedStoreIds(filtered.map(s => s.id));
    }
  };

  // User form modal helpers
  const openAddUserModal = () => {
    setEditUser(null);
    setUserForm({
      email: '',
      auth_user_id: '',
      full_name: '',
      role: 'bookkeeper',
      status: 'active',
      access: { businesses: [], stores: [] },
      permissions: [
        { module_name: 'market_orders', can_view: true, can_edit: true },
        { module_name: 'supplier_orders', can_view: true, can_edit: true },
        { module_name: 'order_matching', can_view: true, can_edit: true },
        { module_name: 'transactions', can_view: true, can_edit: true },
        { module_name: 'expense', can_view: true, can_edit: true },
        { module_name: 'income', can_view: true, can_edit: true },
        { module_name: 'import_center', can_view: true, can_edit: true },
        { module_name: 'reporting', can_view: true, can_edit: false },
        { module_name: 'settings', can_view: false, can_edit: false }
      ]
    });
    setUserModalOpen(true);
  };

  const openEditUserModal = (u) => {
    setEditUser(u);
    const prefilledPerms = [
      'market_orders', 'supplier_orders', 'order_matching', 'transactions',
      'expense', 'income', 'import_center', 'reporting', 'settings'
    ].map(m => {
      const match = u.permissions?.find(p => p.module_name === m);
      return {
        module_name: m,
        can_view: match ? !!match.can_view : false,
        can_edit: match ? !!match.can_edit : false
      };
    });

    setUserForm({
      email: u.email,
      auth_user_id: u.auth_user_id,
      full_name: u.full_name,
      role: u.role,
      status: u.status,
      access: {
        businesses: u.access?.businesses || [],
        stores: u.access?.stores || []
      },
      permissions: prefilledPerms
    });
    setUserModalOpen(true);
  };

  const handleUserFormSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editingUser
        ? `${API_BASE}/admin/users/${editingUser.id}`
        : `${API_BASE}/admin/users`;
      const method = editingUser ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(userForm)
      });

      if (res.ok) {
        setUserModalOpen(false);
        fetchUsers();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to save user');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving user');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      const res = await fetch(`${API_BASE}/admin/users/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete user');
      }
    } catch (err) {
      alert('Error deleting user');
    }
  };

  // Custom Field Option handlers
  const handleOptionSubmit = async (e) => {
    e.preventDefault();
    try {
      const url = editingOptionId
        ? `${API_BASE}/custom-field-options/${editingOptionId}`
        : `${API_BASE}/custom-field-options`;
      const method = editingOptionId ? 'PUT' : 'POST';

      const body = {
        field_key: activeFieldKey,
        option_label: optForm.option_label,
        excludes_from_calculations: optForm.excludes_from_calculations,
        is_active: true,
        sort_order: parseInt(optForm.sort_order) || 0
      };

      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      });

      if (res.ok) {
        setOptForm({ option_label: '', excludes_from_calculations: false, sort_order: 0 });
        setEditingOptionId(null);
        fetchCustomOptions();
      } else {
        const data = await res.json();
        alert(data.error || 'Error saving option');
      }
    } catch (err) {
      alert('Error saving option');
    }
  };

  const handleDeactivateOption = async (opt, activate = false) => {
    try {
      const res = await fetch(`${API_BASE}/custom-field-options/${opt.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          option_label: opt.option_label,
          excludes_from_calculations: opt.excludes_from_calculations,
          is_active: activate,
          sort_order: opt.sort_order
        })
      });
      if (res.ok) {
        fetchCustomOptions();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteOption = async (id) => {
    if (!confirm('Are you sure you want to delete this option permanently?')) return;
    try {
      const res = await fetch(`${API_BASE}/custom-field-options/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (res.ok) {
        fetchCustomOptions();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Login Screen Render
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full border border-gray-200">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight">x360 Ecom Finance App</h1>
            <p className="text-gray-500 mt-2">Sign in to your account</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700">Email Address</label>
              <input
                type="email"
                required
                placeholder="e.g. admin@x360.com"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>

            {loginError && (
              <div className="text-red-500 text-sm bg-red-50 p-2.5 rounded border border-red-200 flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md transition duration-150"
            >
              Sign In
            </button>
          </form>

          <div className="mt-6 border-t border-gray-100 pt-4 text-center">
            <p className="text-xs text-gray-400">Managed Authentication Powered Environment</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">

      {/* TOP NAVIGATION BAR */}
      <nav className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <div className="flex-shrink-0 flex items-center">
              <span className="text-xl font-extrabold text-blue-600 tracking-tight">x360 Ecom Finance App</span>
            </div>

            {/* SHARED BUSINESS -> STORE SELECTOR (Cascading) */}
            <div className="hidden md:flex items-center gap-4">
              {/* Business Select */}
              <div className="relative">
                <button
                  onClick={() => { setStoreBusOpen(!busSelectorOpen); setStoreSelectorOpen(false); }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded border border-gray-300 text-sm font-medium"
                >
                  <Building size={16} />
                  <span>
                    {selectedBusinessId === 'all'
                      ? 'All Businesses'
                      : (businesses.find(b => b.id === selectedBusinessId)?.name || 'Select Business')}
                  </span>
                  <ChevronDown size={14} />
                </button>

                {busSelectorOpen && (
                  <div className="absolute left-0 mt-1 w-64 bg-white border border-gray-200 rounded shadow-lg z-50 max-h-60 overflow-y-auto">
                    <button
                      onClick={() => { handleBusinessChange('all'); setStoreBusOpen(false); }}
                      className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm text-gray-700 border-b border-gray-100 font-semibold"
                    >
                      All Businesses
                    </button>
                    {businesses.map(b => (
                      <button
                        key={b.id}
                        onClick={() => { handleBusinessChange(b.id); setStoreBusOpen(false); }}
                        className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm text-gray-700 block"
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Store Multi-Select */}
              <div className="relative">
                <button
                  onClick={() => { setStoreSelectorOpen(!storeSelectorOpen); setStoreBusOpen(false); }}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded border border-gray-300 text-sm font-medium"
                >
                  <Store size={16} />
                  <span>
                    {selectedStoreIds.length === 0
                      ? 'No Stores Selected'
                      : (selectedStoreIds.length === 1
                          ? (stores.find(s => s.id === selectedStoreIds[0])?.name || '1 Store')
                          : `${selectedStoreIds.length} Stores`)}
                  </span>
                  <ChevronDown size={14} />
                </button>

                {storeSelectorOpen && (
                  <div className="absolute left-0 mt-1 w-72 bg-white border border-gray-200 rounded shadow-lg z-50 p-2">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
                      <span className="text-xs text-gray-400 font-semibold uppercase">Filter Stores</span>
                      <button
                        onClick={handleSelectAllStores}
                        className="text-xs text-blue-600 hover:text-blue-800 font-bold"
                      >
                        {selectedStoreIds.length === getFilteredStores().length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {getFilteredStores().length === 0 && (
                        <div className="text-sm text-gray-400 p-2 text-center">No stores available under this selection.</div>
                      )}
                      {getFilteredStores().map(s => {
                        const isChecked = selectedStoreIds.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer text-sm text-gray-700"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleStoreToggle(s.id)}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span>{s.name} <span className="text-xs text-gray-400">({s.platform})</span></span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Profile & Logout */}
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-bold text-gray-800">{user.full_name}</div>
                <div className="text-xs text-blue-600 font-semibold uppercase tracking-wider">{user.role}</div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition"
                title="Log Out"
              >
                <LogOut size={20} />
              </button>
            </div>

          </div>
        </div>
      </nav>

      {/* BODY CONTENT CONTAINER */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex gap-8">

        {/* SIDEBAR NAVIGATION */}
        <aside className="w-64 flex-shrink-0 hidden lg:block">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 space-y-1">
            <div className="px-3 pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Navigation
            </div>

            {user.role === 'admin' && (
              <>
                <button
                  onClick={() => setActiveTab('users')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition ${activeTab === 'users' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                >
                  <Users size={18} />
                  <span>Users & Permissions</span>
                </button>

                <button
                  onClick={() => setActiveTab('access_review')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition ${activeTab === 'access_review' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                >
                  <ShieldAlert size={18} />
                  <span>Access Review</span>
                </button>

                <button
                  onClick={() => setActiveTab('custom_fields')}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition ${activeTab === 'custom_fields' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                >
                  <Settings size={18} />
                  <span>Custom Field Options</span>
                </button>
              </>
            )}

            {user.role !== 'admin' && (
              <div className="p-3 text-sm text-gray-500 bg-gray-50 rounded border border-gray-100 flex items-center gap-2">
                <AlertTriangle size={16} className="text-yellow-500" />
                <span>Non-admin views are currently unbuilt in Module 1.</span>
              </div>
            )}
          </div>
        </aside>

        {/* MAIN PANEL */}
        <main className="flex-1 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden p-6">

          {/* TAB 1: USERS & PERMISSIONS */}
          {activeTab === 'users' && user.role === 'admin' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Users & Permissions</h2>
                  <p className="text-sm text-gray-500 mt-1">Manage platform operators, roles, and business/store-scoped configurations</p>
                </div>
                <button
                  onClick={openAddUserModal}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm rounded shadow transition"
                >
                  <Plus size={16} />
                  <span>Create User</span>
                </button>
              </div>

              {/* Users Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200 text-xs font-semibold text-gray-400 uppercase tracking-wider bg-gray-50">
                      <th className="p-3">Full Name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Auth ID</th>
                      <th className="p-3">Role</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm">
                    {usersList.map(u => (
                      <tr key={u.id} className="hover:bg-gray-50 text-sm">
                        <td className="p-3 font-semibold text-gray-800">{u.full_name}</td>
                        <td className="p-3 text-gray-600">{u.email}</td>
                        <td className="p-3 font-mono text-xs text-gray-400">{u.auth_user_id}</td>
                        <td className="p-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold capitalize ${
                            u.role === 'admin' ? 'bg-red-50 text-red-700 border border-red-100' :
                            u.role === 'bookkeeper' ? 'bg-green-50 text-green-700 border border-green-100' :
                            'bg-gray-50 text-gray-700 border border-gray-200'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold capitalize ${
                            u.status === 'active' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400'
                          }`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-2">
                          <button
                            onClick={() => openEditUserModal(u)}
                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                            title="Edit"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: ACCESS REVIEW */}
          {activeTab === 'access_review' && user.role === 'admin' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-gray-100">
                <h2 className="text-2xl font-bold text-gray-900">Access Review</h2>
                <p className="text-sm text-gray-500 mt-1">Audit read-only lists of users, their effective scopes and module matrices</p>
              </div>

              <div className="space-y-6">
                {usersList.map(u => (
                  <div key={u.id} className="border border-gray-200 rounded-lg p-5 bg-white shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                      <div>
                        <h3 className="text-lg font-bold text-gray-800">{u.full_name} <span className="text-sm font-normal text-gray-400">({u.email})</span></h3>
                        <div className="text-xs font-mono text-gray-400 mt-0.5">Auth Identity ID: {u.auth_user_id}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-bold uppercase">{u.role}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${u.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{u.status}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Scopes */}
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Effective Access Scopes</h4>
                        <div className="space-y-2">
                          <div>
                            <span className="text-xs font-bold text-gray-500 block mb-1">Businesses Allowed:</span>
                            {u.role === 'admin' ? (
                              <span className="text-sm text-blue-700 font-medium">Full Access (All Businesses)</span>
                            ) : u.access?.businesses?.length === 0 ? (
                              <span className="text-sm text-gray-400">No explicit business access mapped</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {u.access?.businesses?.map(b => (
                                  <span key={b.business_id} className="inline-flex px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded border border-gray-200">
                                    {businesses.find(x => x.id === b.business_id)?.name || b.business_id} ({b.access_level})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="pt-2">
                            <span className="text-xs font-bold text-gray-500 block mb-1">Stores Allowed:</span>
                            {u.role === 'admin' ? (
                              <span className="text-sm text-blue-700 font-medium">Full Access (All Stores)</span>
                            ) : u.access?.stores?.length === 0 && u.access?.businesses?.length === 0 ? (
                              <span className="text-sm text-gray-400">No stores mapped</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {u.access?.stores?.map(s => (
                                  <span key={s.store_id} className="inline-flex px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded border border-gray-200">
                                    {stores.find(x => x.id === s.store_id)?.name || s.store_id} ({s.access_level})
                                  </span>
                                ))}
                                {u.access?.businesses?.map(b => {
                                  const storesInBus = stores.filter(st => st.business_id === b.business_id);
                                  return storesInBus.map(st => (
                                    <span key={st.id} className="inline-flex px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded border border-blue-100">
                                      {st.name} (via Business Access)
                                    </span>
                                  ));
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Module Permissions Matrix */}
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Module Permissions Matrix</h4>
                        {u.role === 'admin' ? (
                          <div className="text-sm text-blue-700 font-medium">Bypasses checks: full administrative reads/writes to all modules</div>
                        ) : (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {u.permissions?.map(p => (
                              <div key={p.module_name} className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                                <span className="font-semibold text-gray-600 capitalize">{p.module_name.replace('_', ' ')}</span>
                                <div className="flex gap-2">
                                  <span className={p.can_view ? 'text-green-600' : 'text-gray-300'}>View</span>
                                  <span className={p.can_edit ? 'text-blue-600 font-bold' : 'text-gray-300'}>Edit</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: CUSTOM FIELDS */}
          {activeTab === 'custom_fields' && user.role === 'admin' && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-gray-100">
                <h2 className="text-2xl font-bold text-gray-900">Custom Field Options</h2>
                <p className="text-sm text-gray-500 mt-1">Configure drop-down option lists used by team members on Orders</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

                {/* Field Category Sidebar */}
                <div className="space-y-1">
                  {[
                    { key: 'dispute_status', label: 'Dispute Statuses' },
                    { key: 'order_tracker', label: 'Order Trackers' },
                    { key: 'va_team', label: 'VA Teams' },
                    { key: 'review_status', label: 'Review Statuses' },
                    { key: 'dispute_reason', label: 'Dispute Reasons' }
                  ].map(cat => (
                    <button
                      key={cat.key}
                      onClick={() => { setActiveFieldKey(cat.key); setEditingOptionId(null); }}
                      className={`w-full text-left px-3 py-2 rounded text-sm font-medium transition ${activeFieldKey === cat.key ? 'bg-blue-600 text-white font-bold' : 'text-gray-700 hover:bg-gray-100'}`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Main options manager */}
                <div className="md:col-span-3 space-y-6">

                  {/* Form to add option */}
                  <form onSubmit={handleOptionSubmit} className="bg-gray-50 border border-gray-200 rounded p-4 flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs font-bold text-gray-500 uppercase">Option Label</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. In Progress"
                        value={optForm.option_label}
                        onChange={e => setOptForm({...optForm, option_label: e.target.value})}
                        className="w-full px-3 py-1.5 mt-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      />
                    </div>

                    <div className="w-24">
                      <label className="block text-xs font-bold text-gray-500 uppercase">Sort Order</label>
                      <input
                        type="number"
                        required
                        value={optForm.sort_order}
                        onChange={e => setOptForm({...optForm, sort_order: e.target.value})}
                        className="w-full px-3 py-1.5 mt-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                      />
                    </div>

                    {activeFieldKey === 'dispute_status' && (
                      <label className="flex items-center gap-2 mb-2 select-none cursor-pointer">
                        <input
                          type="checkbox"
                          checked={optForm.excludes_from_calculations}
                          onChange={e => setOptForm({...optForm, excludes_from_calculations: e.target.checked})}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs font-semibold text-gray-600">Exclude from P&L</span>
                      </label>
                    )}

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded shadow"
                      >
                        {editingOptionId ? 'Save' : 'Add'}
                      </button>
                      {editingOptionId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingOptionId(null);
                            setOptForm({ option_label: '', excludes_from_calculations: false, sort_order: 0 });
                          }}
                          className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>

                  {/* List of active/inactive options */}
                  <div className="overflow-hidden border border-gray-200 rounded">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-100 text-xs font-semibold text-gray-500 uppercase border-b border-gray-200">
                          <th className="p-3">Label</th>
                          <th className="p-3">Sort Order</th>
                          {activeFieldKey === 'dispute_status' && <th className="p-3">P&L Status</th>}
                          <th className="p-3">Status</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-sm">
                        {customOptions
                          .filter(o => o.field_key === activeFieldKey)
                          .map(o => (
                            <tr key={o.id} className={`${o.is_active ? '' : 'bg-gray-50 text-gray-400'}`}>
                              <td className="p-3 font-medium">{o.option_label}</td>
                              <td className="p-3 font-mono text-xs">{o.sort_order}</td>
                              {activeFieldKey === 'dispute_status' && (
                                <td className="p-3">
                                  {o.excludes_from_calculations ? (
                                    <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">Excludes</span>
                                  ) : (
                                    <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-100">Includes</span>
                                  )}
                                </td>
                              )}
                              <td className="p-3">
                                {o.is_active ? (
                                  <span className="text-xs text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded">Active</span>
                                ) : (
                                  <span className="text-xs text-gray-400 font-semibold bg-gray-100 px-2 py-0.5 rounded">Inactive</span>
                                )}
                              </td>
                              <td className="p-3 text-right space-x-1">
                                <button
                                  onClick={() => {
                                    setEditingOptionId(o.id);
                                    setOptForm({
                                      option_label: o.option_label,
                                      excludes_from_calculations: !!o.excludes_from_calculations,
                                      sort_order: o.sort_order
                                    });
                                  }}
                                  className="p-1 hover:text-blue-600 rounded text-gray-400"
                                  title="Edit"
                                >
                                  <Edit2 size={14} />
                                </button>

                                {o.is_active ? (
                                  <button
                                    onClick={() => handleDeactivateOption(o, false)}
                                    className="p-1 text-gray-400 hover:text-orange-600 rounded"
                                    title="Deactivate"
                                  >
                                    <EyeOff size={14} />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleDeactivateOption(o, true)}
                                    className="p-1 text-gray-400 hover:text-blue-600 rounded"
                                    title="Activate"
                                  >
                                    <Eye size={14} />
                                  </button>
                                )}

                                <button
                                  onClick={() => handleDeleteOption(o.id)}
                                  className="p-1 text-gray-400 hover:text-red-600 rounded"
                                  title="Delete permanently"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                </div>
              </div>
            </div>
          )}

          {/* Fallback placeholders for other tabs */}
          {activeTab === 'other_placeholder' && (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <AlertTriangle size={48} className="text-yellow-500" />
              <h3 className="text-xl font-bold text-gray-800">Module Unbuilt</h3>
              <p className="text-sm text-gray-400 max-w-sm">This module is currently out of scope for Module 1 (Foundation & Access Control) and will be implemented in a subsequent module prompt.</p>
            </div>
          )}

          {activeTab === 'reporting_placeholder' && (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <Building size={48} className="text-blue-500" />
              <h3 className="text-xl font-bold text-gray-800">Reporting Dashboard</h3>
              <p className="text-sm text-gray-400 max-w-sm">Welcome! Under your client read-only permission level, you can view the upcoming Financial Reports and Monthly Store Statements here.</p>
            </div>
          )}

        </main>
      </div>

      {/* FOOTER */}
      <footer className="bg-white border-t border-gray-200 py-4 text-center text-xs text-gray-400">
        &copy; 2026 x360 Ecom Finance App — All Rights Reserved.
      </footer>

      {/* USER DIALOG MODAL (Add / Edit User) */}
      {userModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-gray-200 shadow-2xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">{editingUser ? 'Edit User Details' : 'Create New User Account'}</h3>
              <button onClick={() => setUserModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUserFormSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase">Full Name</label>
                  <input
                    type="text"
                    required
                    value={userForm.full_name}
                    onChange={e => setUserForm({...userForm, full_name: e.target.value})}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase">Email Address</label>
                  <input
                    type="email"
                    required
                    disabled={!!editingUser}
                    value={userForm.email}
                    onChange={e => setUserForm({...userForm, email: e.target.value})}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase">Auth User Identity ID</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingUser}
                    placeholder="e.g. auth-uid-123"
                    value={userForm.auth_user_id}
                    onChange={e => setUserForm({...userForm, auth_user_id: e.target.value})}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white disabled:bg-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase">User Role</label>
                  <select
                    value={userForm.role}
                    onChange={e => setUserForm({...userForm, role: e.target.value})}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="admin">Admin</option>
                    <option value="bookkeeper">Bookkeeper</option>
                    <option value="client">Client</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase">Account Status</label>
                  <select
                    value={userForm.status}
                    onChange={e => setUserForm({...userForm, status: e.target.value})}
                    className="w-full px-3 py-2 mt-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
              </div>

              {userForm.role !== 'admin' && (
                <div className="border border-gray-200 rounded p-4 space-y-3 bg-gray-50">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Access Scope Mapping</h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs font-bold text-gray-500 block mb-1">Business Access</span>
                      <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-white">
                        {businesses.map(b => {
                          const existing = userForm.access.businesses.find(x => x.business_id === b.id);
                          return (
                            <div key={b.id} className="flex items-center justify-between text-xs py-1">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!!existing}
                                  onChange={e => {
                                    const updated = e.target.checked
                                      ? [...userForm.access.businesses, { business_id: b.id, access_level: 'read' }]
                                      : userForm.access.businesses.filter(x => x.business_id !== b.id);
                                    setUserForm({...userForm, access: { ...userForm.access, businesses: updated }});
                                  }}
                                  className="rounded text-blue-600 focus:ring-blue-500"
                                />
                                <span>{b.name}</span>
                              </label>
                              {existing && (
                                <select
                                  value={existing.access_level}
                                  onChange={e => {
                                    const updated = userForm.access.businesses.map(x => x.business_id === b.id ? { ...x, access_level: e.target.value } : x);
                                    setUserForm({...userForm, access: { ...userForm.access, businesses: updated }});
                                  }}
                                  className="border border-gray-200 rounded px-1 py-0.5 bg-white text-xs"
                                >
                                  <option value="read">Read Only</option>
                                  <option value="write">Read / Write</option>
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-bold text-gray-500 block mb-1">Store Access</span>
                      <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded p-2 bg-white">
                        {stores.map(s => {
                          const existing = userForm.access.stores.find(x => x.store_id === s.id);
                          return (
                            <div key={s.id} className="flex items-center justify-between text-xs py-1">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!!existing}
                                  onChange={e => {
                                    const updated = e.target.checked
                                      ? [...userForm.access.stores, { store_id: s.id, access_level: 'read' }]
                                      : userForm.access.stores.filter(x => x.store_id !== s.id);
                                    setUserForm({...userForm, access: { ...userForm.access, stores: updated }});
                                  }}
                                  className="rounded text-blue-600 focus:ring-blue-500"
                                />
                                <span>{s.name}</span>
                              </label>
                              {existing && (
                                <select
                                  value={existing.access_level}
                                  onChange={e => {
                                    const updated = userForm.access.stores.map(x => x.store_id === s.id ? { ...x, access_level: e.target.value } : x);
                                    setUserForm({...userForm, access: { ...userForm.access, stores: updated }});
                                  }}
                                  className="border border-gray-200 rounded px-1 py-0.5 bg-white text-xs"
                                >
                                  <option value="read">Read Only</option>
                                  <option value="write">Read / Write</option>
                                </select>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {userForm.role !== 'admin' && (
                <div className="border border-gray-200 rounded p-4 space-y-3 bg-gray-50">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Module Permissions Matrix</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {userForm.permissions.map((p, index) => (
                      <div key={p.module_name} className="flex items-center justify-between p-2.5 bg-white border border-gray-200 rounded text-sm">
                        <span className="font-semibold text-gray-700 capitalize">{p.module_name.replace('_', ' ')}</span>
                        <div className="flex gap-4">
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={p.can_view}
                              onChange={e => {
                                const copy = [...userForm.permissions];
                                copy[index].can_view = e.target.checked;
                                if (!e.target.checked) copy[index].can_edit = false;
                                setUserForm({...userForm, permissions: copy});
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500"
                            />
                            <span>View</span>
                          </label>

                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={p.can_edit}
                              disabled={!p.can_view}
                              onChange={e => {
                                const copy = [...userForm.permissions];
                                copy[index].can_edit = e.target.checked;
                                setUserForm({...userForm, permissions: copy});
                              }}
                              className="rounded text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                            />
                            <span>Edit</span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-sm shadow"
                >
                  {editingUser ? 'Save Changes' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
