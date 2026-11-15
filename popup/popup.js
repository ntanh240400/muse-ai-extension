/**
 * MuseVault - 1Password-Inspired Popup Controller (Vanilla ES6)
 * Sub-25ms cold start with reactive state rendering and optimistic UI.
 */

// Application State
const state = {
  accounts: {},
  activeAccountId: null,
  settings: {},
  liveCookieCount: 0,
  currentTab: null,
  searchQuery: '',
  selectedKebabAccountId: null,
  activeSwatchColor: '#0A85EA'
};

// DOM Element References
const elements = {
  heroContainer: document.getElementById('hero-active-account'),
  vaultSection: document.getElementById('vault-section'),
  accountList: document.getElementById('account-list'),
  accountCountBadge: document.getElementById('account-count-badge'),
  emptyState: document.getElementById('empty-state'),
  searchContainer: document.getElementById('search-container'),
  inputSearch: document.getElementById('input-search'),
  btnClearSearch: document.getElementById('btn-clear-search'),
  btnToggleSearch: document.getElementById('btn-toggle-search'),
  btnOpenAdd: document.getElementById('btn-open-add'),
  btnToggleTheme: document.getElementById('btn-toggle-theme'),
  footerTabStatus: document.getElementById('tab-status-message'),
  btnOpenMuse: document.getElementById('btn-open-muse'),
  // Add Drawer
  drawerAdd: document.getElementById('drawer-add-account'),
  btnCloseAdd: document.getElementById('btn-close-add'),
  btnCancelAdd: document.getElementById('btn-cancel-add'),
  formCapture: document.getElementById('form-capture'),
  bannerDetectText: document.getElementById('banner-detect-text'),
  addColorSwatches: document.getElementById('add-color-swatches'),
  formImport: document.getElementById('form-import'),
  btnCancelImport: document.getElementById('btn-cancel-import'),
  // Edit Drawer
  drawerEdit: document.getElementById('drawer-edit-account'),
  btnCloseEdit: document.getElementById('btn-close-edit'),
  btnCancelEdit: document.getElementById('btn-cancel-edit'),
  formEdit: document.getElementById('form-edit'),
  editAccountId: document.getElementById('edit-account-id'),
  editName: document.getElementById('edit-name'),
  editEmail: document.getElementById('edit-email'),
  editNotes: document.getElementById('edit-notes'),
  editCookieCount: document.getElementById('edit-cookie-count'),
  editLastActive: document.getElementById('edit-last-active'),
  editColorSwatches: document.getElementById('edit-color-swatches'),
  btnDeleteAccount: document.getElementById('btn-delete-account'),
  // Kebab Popover
  kebabPopover: document.getElementById('kebab-popover'),
  // Empty State CTAs
  btnEmptyCapture: document.getElementById('btn-empty-capture'),
  btnEmptyImport: document.getElementById('btn-empty-import'),
  // Toast
  toastContainer: document.getElementById('toast-container')
};

// Helper to send messages to background service worker
function sendWorkerMessage(message) {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      resolve({ success: false, error: 'Chrome runtime not available' });
      return;
    }
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
      } else {
        resolve(response || { success: false });
      }
    });
  });
}

/**
 * Toast Notification System
 */
function showToast(message, type = 'info', duration = 2400) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 200ms forwards';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 200);
  }, duration);
}

/**
 * Derives uppercase initials from name or email
 */
function getInitials(name, email) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
  }
  if (email && email.trim()) {
    return email.substring(0, 2).toUpperCase();
  }
  return 'MV';
}

/**
 * Human-readable relative time formatter
 */
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Never';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Initialize application state and UI
 */
async function init() {
  bindEvents();
  await loadState();
}

/**
 * Loads vault state from service worker
 */
async function loadState() {
  try {
    const resp = await sendWorkerMessage({ action: 'VAULT_GET_STATE' });
    if (resp && resp.success && resp.data) {
      const data = resp.data;
      state.accounts = data.accounts || {};
      state.activeAccountId = data.activeAccountId || null;
      state.settings = data.settings || {};
      state.liveCookieCount = data.liveCookieCount || 0;
      state.currentTab = data.currentTab || null;

      applyTheme(state.settings.theme || 'dark');
      render();
    } else {
      console.warn('[MuseVault] Could not fetch vault state:', resp?.error);
    }
  } catch (err) {
    console.error('[MuseVault] Failed to load state:', err);
  }
}

/**
 * Renders the entire popup interface based on state
 */
function render() {
  const accountEntries = Object.entries(state.accounts);
  const totalAccounts = accountEntries.length;
  elements.accountCountBadge.textContent = totalAccounts;

  // Render Footer tab status
  const isMuseTab = state.currentTab?.isMuse;
  elements.footerTabStatus.textContent = isMuseTab
    ? `On muse.ai (${state.liveCookieCount} cookies)`
    : 'Not on muse.ai';
  const statusDot = elements.footerTabStatus.previousElementSibling;
  if (statusDot) {
    statusDot.className = isMuseTab ? 'status-dot online' : 'status-dot';
  }

  // Handle Empty State
  if (totalAccounts === 0) {
    elements.heroContainer.innerHTML = '';
    elements.vaultSection.classList.add('hidden');
    elements.emptyState.classList.remove('hidden');
    return;
  }

  elements.emptyState.classList.add('hidden');
  elements.vaultSection.classList.remove('hidden');

  // Render Active Hero Card
  const activeAccount = state.activeAccountId ? state.accounts[state.activeAccountId] : null;
  renderHeroCard(activeAccount);

  // Render Accounts Vault List
  renderAccountList(accountEntries);
}

/**
 * Renders the Active Account Hero Card
 */
function renderHeroCard(account) {
  if (!account) {
    elements.heroContainer.innerHTML = `
      <div class="hero-card">
        <div class="hero-top-row">
          <span class="hero-tag">SESSION STATUS</span>
          <span class="status-badge-active" style="background: rgba(148, 163, 184, 0.15); color: var(--text-muted);">
            No Active Vault Account
          </span>
        </div>
        <div class="hero-profile">
          <div class="squircle-avatar" style="background: #334155;">?</div>
          <div class="hero-info">
            <div class="hero-name">Unmanaged Session</div>
            <div class="hero-email">${state.liveCookieCount} muse.ai cookies detected</div>
          </div>
        </div>
        <div class="hero-actions">
          <button id="btn-hero-capture-active" class="btn-card-action">
            ⚡ Save as Account
          </button>
        </div>
      </div>
    `;
    const btnCap = document.getElementById('btn-hero-capture-active');
    if (btnCap) {
      btnCap.onclick = () => openAddDrawer('tab-capture');
    }
    return;
  }

  const initials = getInitials(account.name, account.email);
  const cookieCount = account.cookies ? account.cookies.length : 0;
  const lastActiveText = formatTimeAgo(account.lastActiveAt);

  elements.heroContainer.innerHTML = `
    <div class="hero-card">
      <div class="hero-top-row">
        <span class="hero-tag">CURRENT ACTIVE SESSION</span>
        <span class="status-badge-active">
          <span class="radar-pulse"></span>
          Active Now
        </span>
      </div>
      <div class="hero-profile">
        <div class="squircle-avatar" style="background: ${sanitizeColor(account.avatarColor)};">
          ${escapeHtml(initials)}
        </div>
        <div class="hero-info">
          <div class="hero-name" title="${escapeHtml(account.name)}">${escapeHtml(account.name)}</div>
          <div class="hero-email" title="${escapeHtml(account.email || '')}">${escapeHtml(account.email || 'No email specified')}</div>
          <div class="hero-meta">${cookieCount} cookies stored • Synced ${lastActiveText}</div>
        </div>
      </div>
      <div class="hero-actions">
        <button id="btn-hero-open-muse" class="btn-card-action" title="Open or switch to muse.ai tab">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open muse.ai
        </button>
        <button id="btn-hero-sync-session" class="btn-card-action" title="Capture updated tokens from live session">
          <svg id="sync-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          Sync Session
        </button>
      </div>
    </div>
  `;

  document.getElementById('btn-hero-open-muse').onclick = async () => {
    await sendWorkerMessage({ action: 'VAULT_OPEN_MUSE' });
  };

  document.getElementById('btn-hero-sync-session').onclick = async (e) => {
    const icon = document.getElementById('sync-icon');
    if (icon) icon.style.animation = 'pulse-ring 0.8s infinite';
    try {
      const resp = await sendWorkerMessage({ action: 'VAULT_SYNC_CURRENT_ACCOUNT' });
      if (resp && resp.success) {
        showToast(`Synced ${resp.data?.cookieCount || 0} cookies!`, 'success');
        await loadState();
      } else {
        showToast(resp?.error || 'Sync failed', 'error');
      }
    } finally {
      if (icon) icon.style.animation = '';
    }
  };
}

/**
 * Renders the Vault List of accounts
 */
function renderAccountList(accountEntries) {
  elements.accountList.innerHTML = '';
  const filter = state.searchQuery.trim().toLowerCase();

  const filtered = accountEntries.filter(([id, acc]) => {
    if (!filter) return true;
    return (
      (acc.name && acc.name.toLowerCase().includes(filter)) ||
      (acc.email && acc.email.toLowerCase().includes(filter)) ||
      (acc.notes && acc.notes.toLowerCase().includes(filter))
    );
  });

  if (filtered.length === 0) {
    elements.accountList.innerHTML = `
      <div style="text-align: center; padding: 20px 0; color: var(--text-muted); font-size: 12px;">
        No accounts match "${escapeHtml(state.searchQuery)}"
      </div>
    `;
    return;
  }

  // Sort: Active account first, then recently active
  filtered.sort(([idA, a], [idB, b]) => {
    if (idA === state.activeAccountId) return -1;
    if (idB === state.activeAccountId) return 1;
    return (b.lastActiveAt || 0) - (a.lastActiveAt || 0);
  });

  for (const [id, account] of filtered) {
    const isActive = id === state.activeAccountId;
    const initials = getInitials(account.name, account.email);
    const item = document.createElement('div');
    item.className = `account-card ${isActive ? 'active-item' : ''}`;
    item.dataset.id = id;

    item.innerHTML = `
      <div class="account-main">
        <div class="squircle-avatar sm" style="background: ${sanitizeColor(account.avatarColor)};">
          ${escapeHtml(initials)}
        </div>
        <div class="account-details">
          <span class="account-name" title="${escapeHtml(account.name)}">${escapeHtml(account.name)}</span>
          <span class="account-sub" title="${escapeHtml(account.email || account.notes || '')}">
            ${escapeHtml(account.email || account.notes || (account.cookies?.length + ' cookies stored'))}
          </span>
        </div>
      </div>
      <div class="account-ops">
        ${isActive
          ? '<span class="badge-item-active">Active</span>'
          : `<button class="btn-switch" data-action="switch" data-id="${escapeHtml(id)}">Switch</button>`
        }
        <button class="btn-kebab" data-action="kebab" data-id="${escapeHtml(id)}" title="Account options">⋮</button>
      </div>
    `;

    elements.accountList.appendChild(item);
  }
}

/**
 * Event Listeners & Delegation
 */
function bindEvents() {
  // Search toggle
  elements.btnToggleSearch.onclick = () => {
    const isHidden = elements.searchContainer.classList.contains('hidden');
    elements.searchContainer.classList.toggle('hidden');
    if (isHidden) {
      elements.inputSearch.focus();
    } else {
      state.searchQuery = '';
      elements.inputSearch.value = '';
      elements.btnClearSearch.classList.add('hidden');
      render();
    }
  };

  // Search input filter
  elements.inputSearch.oninput = (e) => {
    state.searchQuery = e.target.value;
    elements.btnClearSearch.classList.toggle('hidden', !state.searchQuery);
    renderAccountList(Object.entries(state.accounts));
  };

  elements.btnClearSearch.onclick = () => {
    state.searchQuery = '';
    elements.inputSearch.value = '';
    elements.btnClearSearch.classList.add('hidden');
    renderAccountList(Object.entries(state.accounts));
  };

  // Theme toggle
  elements.btnToggleTheme.onclick = () => {
    const current = document.body.classList.contains('theme-light') ? 'light' : 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    sendWorkerMessage({ action: 'VAULT_UPDATE_SETTINGS', settings: { theme: next } });
  };

  // Open muse.ai
  elements.btnOpenMuse.onclick = async () => {
    await sendWorkerMessage({ action: 'VAULT_OPEN_MUSE' });
  };

  // Add Drawer triggers
  elements.btnOpenAdd.onclick = () => openAddDrawer('tab-capture');
  elements.btnEmptyCapture.onclick = () => openAddDrawer('tab-capture');
  elements.btnEmptyImport.onclick = () => openAddDrawer('tab-import');
  elements.btnCloseAdd.onclick = closeAddDrawer;
  elements.btnCancelAdd.onclick = closeAddDrawer;
  elements.btnCancelImport.onclick = closeAddDrawer;

  // Add Drawer Tabs
  document.querySelectorAll('.drawer-tab').forEach((tabBtn) => {
    tabBtn.onclick = () => {
      document.querySelectorAll('.drawer-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.drawer-tab-content').forEach((c) => c.classList.add('hidden'));
      tabBtn.classList.add('active');
      const targetId = tabBtn.dataset.tab;
      document.getElementById(targetId)?.classList.remove('hidden');
    };
  });

  // Color Swatch Selection (Add Drawer)
  elements.addColorSwatches.onclick = (e) => {
    const swatch = e.target.closest('.swatch');
    if (!swatch) return;
    elements.addColorSwatches.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
    swatch.classList.add('selected');
    state.activeSwatchColor = swatch.dataset.color;
  };

  // Capture Form Submit
  elements.formCapture.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('capture-name').value.trim();
    const email = document.getElementById('capture-email').value.trim();
    const notes = document.getElementById('capture-notes').value.trim();
    const avatarColor = state.activeSwatchColor || '#0A85EA';

    try {
      const resp = await sendWorkerMessage({
        action: 'VAULT_SAVE_CURRENT_SESSION',
        name,
        email,
        notes,
        avatarColor
      });
      if (resp && resp.success) {
        showToast(`Saved account "${name}"!`, 'success');
        closeAddDrawer();
        await loadState();
      } else {
        showToast(resp?.error || 'Failed to save account', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Import Form Submit
  elements.formImport.onsubmit = async (e) => {
    e.preventDefault();
    const rawJson = document.getElementById('import-json').value.trim();
    try {
      const resp = await sendWorkerMessage({
        action: 'VAULT_IMPORT_DATA',
        jsonString: rawJson
      });
      if (resp && resp.success) {
        if (resp.data && resp.data.importedCount > 0) {
          showToast(`Successfully imported accounts!`, 'success');
          closeAddDrawer();
          await loadState();
        } else {
          showToast('No accounts or cookies found in JSON.', 'warning');
        }
      } else {
        showToast(resp?.error || 'Import failed', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Edit Drawer
  elements.btnCloseEdit.onclick = closeEditDrawer;
  elements.btnCancelEdit.onclick = closeEditDrawer;

  // Color Swatch Selection (Edit Drawer)
  elements.editColorSwatches.onclick = (e) => {
    const swatch = e.target.closest('.swatch');
    if (!swatch) return;
    elements.editColorSwatches.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
    swatch.classList.add('selected');
  };

  // Edit Form Submit
  elements.formEdit.onsubmit = async (e) => {
    e.preventDefault();
    const accountId = elements.editAccountId.value;
    const name = elements.editName.value.trim();
    const email = elements.editEmail.value.trim();
    const notes = elements.editNotes.value.trim();
    const selectedSwatch = elements.editColorSwatches.querySelector('.swatch.selected');
    const avatarColor = selectedSwatch ? selectedSwatch.dataset.color : '#0A85EA';

    try {
      const resp = await sendWorkerMessage({
        action: 'VAULT_UPDATE_ACCOUNT',
        accountId,
        name,
        email,
        notes,
        avatarColor
      });
      if (resp && resp.success) {
        showToast(`Account updated!`, 'success');
        closeEditDrawer();
        await loadState();
      } else {
        showToast(resp?.error || 'Update failed', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Delete Account
  elements.btnDeleteAccount.onclick = async () => {
    const accountId = elements.editAccountId.value;
    const account = state.accounts[accountId];
    const name = account ? account.name : 'this account';
    if (!confirm(`Are you sure you want to delete "${name}" from your vault?`)) {
      return;
    }

    try {
      const resp = await sendWorkerMessage({
        action: 'VAULT_DELETE_ACCOUNT',
        accountId
      });
      if (resp && resp.success) {
        showToast(`Account deleted`, 'info');
        closeEditDrawer();
        await loadState();
      } else {
        showToast(resp?.error || 'Deletion failed', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Account List Click Delegation (Switch & Kebab)
  elements.accountList.onclick = async (e) => {
    const switchBtn = e.target.closest('button[data-action="switch"]');
    if (switchBtn) {
      const targetId = switchBtn.dataset.id;
      const targetAccount = state.accounts[targetId];
      if (!targetAccount) return;

      // Optimistic UI state
      switchBtn.classList.add('loading');
      switchBtn.textContent = 'Switching...';

      try {
        const resp = await sendWorkerMessage({
          action: 'VAULT_SWITCH_ACCOUNT',
          targetAccountId: targetId,
          bypassCache: true
        });

        if (resp && resp.success) {
          showToast(`Switched to "${targetAccount.name}"!`, 'success');
          await loadState();
        } else {
          showToast(resp?.error || 'Switch failed', 'error');
          switchBtn.classList.remove('loading');
          switchBtn.textContent = 'Switch';
        }
      } catch (err) {
        showToast(err.message, 'error');
        switchBtn.classList.remove('loading');
        switchBtn.textContent = 'Switch';
      }
      return;
    }

    const kebabBtn = e.target.closest('button[data-action="kebab"]');
    if (kebabBtn) {
      e.stopPropagation();
      const accountId = kebabBtn.dataset.id;
      openKebabPopover(accountId, kebabBtn);
      return;
    }
  };

  // Kebab Popover Click Actions
  elements.kebabPopover.onclick = async (e) => {
    const actionBtn = e.target.closest('button[data-kebab]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.kebab;
    const accountId = state.selectedKebabAccountId;
    const account = state.accounts[accountId];
    closeKebabPopover();

    if (!account) return;

    if (action === 'edit') {
      openEditDrawer(account);
    } else if (action === 'resync') {
      try {
        const resp = await sendWorkerMessage({ action: 'VAULT_SYNC_CURRENT_ACCOUNT' });
        if (resp && resp.success) {
          showToast(`Re-captured cookies for active account`, 'success');
          await loadState();
        } else {
          showToast(resp?.error || 'Sync failed', 'error');
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    } else if (action === 'copy') {
      try {
        const json = JSON.stringify(account.cookies || [], null, 2);
        await navigator.clipboard.writeText(json);
        showToast('Cookies JSON copied to clipboard!', 'success');
      } catch {
        showToast('Could not copy to clipboard', 'error');
      }
    } else if (action === 'delete') {
      if (confirm(`Delete account "${account.name}" from vault?`)) {
        const resp = await sendWorkerMessage({ action: 'VAULT_DELETE_ACCOUNT', accountId });
        if (resp && resp.success) {
          showToast('Account deleted', 'info');
          await loadState();
        }
      }
    }
  };

  // Close kebab when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!elements.kebabPopover.contains(e.target)) {
      closeKebabPopover();
    }
  });
}

function openAddDrawer(initialTab = 'tab-capture') {
  // Reset fields
  elements.formCapture.reset();
  elements.formImport.reset();

  const isMuse = state.currentTab?.isMuse;
  elements.bannerDetectText.textContent = isMuse
    ? `Active muse.ai tab detected! (${state.liveCookieCount} cookies ready)`
    : 'Not on muse.ai. You can still save or open muse.ai.';

  // Activate tab
  document.querySelectorAll('.drawer-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === initialTab);
  });
  document.querySelectorAll('.drawer-tab-content').forEach((content) => {
    content.classList.toggle('hidden', content.id !== initialTab);
  });

  elements.drawerAdd.classList.remove('hidden');
}

function closeAddDrawer() {
  elements.drawerAdd.classList.add('hidden');
}

function openEditDrawer(account) {
  elements.editAccountId.value = account.id;
  elements.editName.value = account.name || '';
  elements.editEmail.value = account.email || '';
  elements.editNotes.value = account.notes || '';
  elements.editCookieCount.textContent = account.cookies ? account.cookies.length : 0;
  elements.editLastActive.textContent = formatTimeAgo(account.lastActiveAt);

  // Set selected color swatch
  const color = sanitizeColor(account.avatarColor);
  elements.editColorSwatches.querySelectorAll('.swatch').forEach((s) => {
    s.classList.toggle('selected', s.dataset.color.toLowerCase() === color.toLowerCase());
  });

  elements.drawerEdit.classList.remove('hidden');
}

function closeEditDrawer() {
  elements.drawerEdit.classList.add('hidden');
}

function openKebabPopover(accountId, triggerElem) {
  state.selectedKebabAccountId = accountId;
  const rect = triggerElem.getBoundingClientRect();
  const popover = elements.kebabPopover;

  popover.style.top = `${rect.bottom + 4}px`;
  popover.style.right = `${window.innerWidth - rect.right}px`;
  popover.classList.remove('hidden');
}

function closeKebabPopover() {
  elements.kebabPopover.classList.add('hidden');
  state.selectedKebabAccountId = null;
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light');
  } else {
    document.body.classList.remove('theme-light');
    document.body.classList.add('theme-dark');
  }
}

function sanitizeColor(color) {
  if (typeof color === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color.trim())) {
    return color.trim();
  }
  return '#0A85EA';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Bootstrap upon DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
