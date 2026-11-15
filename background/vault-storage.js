/**
 * VaultStorage - Persistent storage abstraction for MuseVault using chrome.storage.local.
 */

const DEFAULT_SETTINGS = {
  autoReloadTabsOnSwitch: true,
  autoSyncSessionBeforeSwitch: true,
  openTabIfNotOpen: false,
  theme: 'dark'
};

export class VaultStorage {
  /**
   * @param {object} [storageArea] - chrome.storage.local or mock storage
   */
  constructor(storageArea = (typeof chrome !== 'undefined' && chrome.storage ? chrome.storage.local : null)) {
    this.storage = storageArea;
  }

  /**
   * Reads raw data from storage for specified keys
   * @param {string|string[]} keys
   * @returns {Promise<object>}
   */
  async get(keys) {
    if (!this.storage) {
      throw new Error('Chrome storage is not available in current environment.');
    }
    return new Promise((resolve, reject) => {
      this.storage.get(keys, (items) => {
        const err = typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.lastError : null;
        if (err) {
          reject(new Error(err.message));
        } else {
          resolve(items || {});
        }
      });
    });
  }

  /**
   * Persists items to storage
   * @param {object} items
   * @returns {Promise<void>}
   */
  async set(items) {
    if (!this.storage) {
      throw new Error('Chrome storage is not available in current environment.');
    }
    return new Promise((resolve, reject) => {
      this.storage.set(items, () => {
        const err = typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.lastError : null;
        if (err) {
          reject(new Error(err.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Retrieves the full vault state (accounts dictionary, active ID, and settings)
   * @returns {Promise<{ accounts: Record<string, any>, activeAccountId: string|null, settings: object }>}
   */
  async getVaultState() {
    const data = await this.get(['accounts', 'activeAccountId', 'settings']);
    return {
      accounts: data.accounts || {},
      activeAccountId: data.activeAccountId || null,
      settings: Object.assign({}, DEFAULT_SETTINGS, data.settings || {})
    };
  }

  /**
   * Retrieves a single account profile by ID
   * @param {string} accountId
   * @returns {Promise<object|null>}
   */
  async getAccount(accountId) {
    const { accounts } = await this.getVaultState();
    return accounts[accountId] || null;
  }

  /**
   * Saves or creates an account in the vault
   * @param {object} account
   * @returns {Promise<object>}
   */
  async saveAccount(account) {
    if (!account || !account.id) {
      throw new Error('Account must have a valid id');
    }
    const state = await this.getVaultState();
    const now = Date.now();
    const existing = state.accounts[account.id] || {};

    const updatedAccount = {
      id: account.id,
      name: account.name || existing.name || 'Untitled Account',
      email: account.email || existing.email || '',
      notes: account.notes !== undefined ? account.notes : (existing.notes || ''),
      avatarColor: account.avatarColor || existing.avatarColor || '#0A85EA',
      cookies: account.cookies || existing.cookies || [],
      cookieCount: (account.cookies || existing.cookies || []).length,
      createdAt: existing.createdAt || account.createdAt || now,
      updatedAt: now,
      lastActiveAt: account.lastActiveAt || existing.lastActiveAt || now
    };

    state.accounts[account.id] = updatedAccount;

    // If this is the only account, designate as active
    let newActiveId = state.activeAccountId;
    if (!newActiveId && Object.keys(state.accounts).length === 1) {
      newActiveId = account.id;
    }

    await this.set({
      accounts: state.accounts,
      activeAccountId: newActiveId
    });

    return updatedAccount;
  }

  /**
   * Updates metadata (name, email, notes, avatarColor) of an existing account
   * @param {string} accountId
   * @param {object} metadata
   * @returns {Promise<object>}
   */
  async updateAccountMetadata(accountId, metadata) {
    const state = await this.getVaultState();
    const existing = state.accounts[accountId];
    if (!existing) {
      throw new Error(`Account '${accountId}' not found in vault.`);
    }

    if (metadata.name !== undefined) existing.name = metadata.name.trim();
    if (metadata.email !== undefined) existing.email = metadata.email.trim();
    if (metadata.notes !== undefined) existing.notes = metadata.notes;
    if (metadata.avatarColor !== undefined) existing.avatarColor = metadata.avatarColor;
    existing.updatedAt = Date.now();

    await this.set({ accounts: state.accounts });
    return existing;
  }

  /**
   * Deletes an account profile from the vault
   * @param {string} accountId
   * @returns {Promise<boolean>}
   */
  async deleteAccount(accountId) {
    const state = await this.getVaultState();
    if (!state.accounts[accountId]) {
      return false;
    }

    delete state.accounts[accountId];

    // If deleted account was the active account, reset activeAccountId to null or next available
    let nextActiveId = state.activeAccountId;
    if (state.activeAccountId === accountId) {
      const remainingIds = Object.keys(state.accounts);
      nextActiveId = remainingIds.length > 0 ? remainingIds[0] : null;
    }

    await this.set({
      accounts: state.accounts,
      activeAccountId: nextActiveId
    });

    return true;
  }

  /**
   * Sets the active account pointer
   * @param {string|null} accountId
   */
  async setActiveAccountId(accountId) {
    await this.set({ activeAccountId: accountId });
  }

  /**
   * Updates settings
   * @param {object} newSettings
   */
  async updateSettings(newSettings) {
    const state = await this.getVaultState();
    const updated = Object.assign({}, state.settings, newSettings);
    await this.set({ settings: updated });
    return updated;
  }

  /**
   * Exports full vault payload as JSON string
   * @returns {Promise<string>}
   */
  async exportVaultJson() {
    const state = await this.getVaultState();
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      vault: state
    }, null, 2);
  }

  /**
   * Imports vault data from JSON string
   * @param {string} jsonString
   * @returns {Promise<{ importedCount: number }>}
   */
  async importVaultJson(jsonString) {
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err) {
      throw new Error('Invalid JSON format: ' + err.message);
    }

    const state = await this.getVaultState();
    let count = 0;

    // Support raw cookie array or object with cookies array
    if (Array.isArray(parsed) || (parsed && typeof parsed === 'object' && Array.isArray(parsed.cookies))) {
      const cookieList = Array.isArray(parsed) ? parsed : parsed.cookies;
      if (cookieList.length > 0) {
        const newId = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        state.accounts[newId] = {
          id: newId,
          name: `Imported Account ${new Date().toLocaleDateString()}`,
          email: '',
          notes: 'Imported from cookie JSON',
          avatarColor: '#0A85EA',
          cookies: cookieList,
          cookieCount: cookieList.length,
          createdAt: Date.now(),
          lastActiveAt: Date.now()
        };
        count = 1;
      }
    } else {
      const importedVault = (parsed && typeof parsed === 'object' && parsed.vault) ? parsed.vault : parsed;
      const importedAccounts = (importedVault && typeof importedVault === 'object' && importedVault.accounts) ? importedVault.accounts : {};

      for (const [id, acc] of Object.entries(importedAccounts)) {
        if (acc && typeof acc === 'object') {
          state.accounts[id] = {
            ...acc,
            id: id,
            updatedAt: Date.now()
          };
          count++;
        }
      }

      if (importedVault && importedVault.activeAccountId && state.accounts[importedVault.activeAccountId]) {
        state.activeAccountId = importedVault.activeAccountId;
      }
    }

    if (!state.activeAccountId && count > 0) {
      state.activeAccountId = Object.keys(state.accounts)[0];
    }

    await this.set({
      accounts: state.accounts,
      activeAccountId: state.activeAccountId
    });

    return { importedCount: count };
  }
}
