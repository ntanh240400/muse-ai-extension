/**
 * CookieManager - High-fidelity session extraction, cookie clearing, and 5-step account swapping engine.
 */

/**
 * Transforms a stored cookie record into a valid parameter object for chrome.cookies.set().
 * Handles hostOnly, sameSite, secure, session expiration, and storeId.
 *
 * @param {object} cookie
 * @returns {object}
 */
export function cookieToSetDetails(cookie) {
  if (!cookie || !cookie.name) {
    throw new Error('Invalid cookie object: missing name');
  }

  const rawDomain = cookie.domain || 'muse.ai';
  const cleanDomain = rawDomain.startsWith('.') ? rawDomain.substring(1) : rawDomain;
  const isSecure = Boolean(cookie.secure);
  const scheme = isSecure ? 'https://' : 'http://';
  const rawPath = cookie.path || '/';
  const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const url = `${scheme}${cleanDomain}${cleanPath}`;

  const setDetails = {
    url,
    name: cookie.name,
    value: cookie.value || '',
    path: cleanPath,
    httpOnly: Boolean(cookie.httpOnly),
    secure: isSecure,
    storeId: cookie.storeId || '0'
  };

  // Crucial: Chrome determines hostOnly strictly by the omission of the domain parameter.
  // If hostOnly is true, domain MUST be omitted.
  // If hostOnly is false, domain MUST be explicitly provided.
  if (!cookie.hostOnly) {
    setDetails.domain = rawDomain;
  }

  // Handle session vs persistent expiration
  if (!cookie.session && typeof cookie.expirationDate === 'number') {
    const nowSec = Date.now() / 1000;
    if (cookie.expirationDate > nowSec) {
      setDetails.expirationDate = cookie.expirationDate;
    }
  }

  // Handle SameSite attributes
  if (cookie.sameSite && cookie.sameSite !== 'unspecified') {
    setDetails.sameSite = cookie.sameSite;
    // Chromium RFC compliance: SameSite=None (no_restriction) requires Secure=true
    if (cookie.sameSite === 'no_restriction') {
      setDetails.secure = true;
      // Ensure URL also uses https
      setDetails.url = `https://${cleanDomain}${cleanPath}`;
    }
  }

  // CHIPS Partition Key preservation if supported
  if (cookie.partitionKey) {
    setDetails.partitionKey = cookie.partitionKey;
  }

  return setDetails;
}

export class CookieManager {
  /**
   * @param {object} options
   * @param {object} options.storage - VaultStorage instance
   * @param {object} [options.cookiesApi] - chrome.cookies or mock
   * @param {object} [options.tabManager] - TabManager instance
   */
  constructor({ storage, cookiesApi = (typeof chrome !== 'undefined' && chrome.cookies ? chrome.cookies : null), tabManager = null }) {
    this.storage = storage;
    this.cookies = cookiesApi;
    this.tabManager = tabManager;
    this.isSwitching = false; // Mutex concurrency lock
  }

  /**
   * Retrieves all live cookies for muse.ai
   * @param {string} [domain='muse.ai']
   * @returns {Promise<object[]>}
   */
  async getLiveMuseCookies(domain = 'muse.ai') {
    if (!this.cookies) return [];
    return new Promise((resolve, reject) => {
      this.cookies.getAll({ domain }, (cookies) => {
        const err = typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.lastError : null;
        if (err) {
          reject(new Error(err.message));
        } else {
          resolve(cookies || []);
        }
      });
    });
  }

  /**
   * Purges all cookies matching muse.ai domain
   * @param {string} [domain='muse.ai']
   * @returns {Promise<number>} Number of cleared cookies
   */
  async clearMuseCookies(domain = 'muse.ai') {
    const cookies = await this.getLiveMuseCookies(domain);
    if (!cookies || cookies.length === 0) {
      return 0;
    }

    const removePromises = cookies.map((cookie) => {
      return new Promise((resolve) => {
        const rawDomain = cookie.domain || domain;
        const cleanDomain = rawDomain.startsWith('.') ? rawDomain.substring(1) : rawDomain;
        const scheme = cookie.secure ? 'https://' : 'http://';
        const rawPath = cookie.path || '/';
        const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
        const url = `${scheme}${cleanDomain}${cleanPath}`;

        const removeDetails = {
          url,
          name: cookie.name,
          storeId: cookie.storeId || '0'
        };
        if (cookie.partitionKey) {
          removeDetails.partitionKey = cookie.partitionKey;
        }

        this.cookies.remove(removeDetails, () => {
          resolve(true);
        });
      });
    });

    await Promise.allSettled(removePromises);
    return cookies.length;
  }

  /**
   * Injects an array of cookies into the browser
   * @param {object[]} cookieList
   * @returns {Promise<{ injected: number, failed: number }>}
   */
  async injectCookies(cookieList) {
    if (!cookieList || cookieList.length === 0) {
      return { injected: 0, failed: 0 };
    }

    let injected = 0;
    let failed = 0;

    for (const cookie of cookieList) {
      try {
        const setDetails = cookieToSetDetails(cookie);
        await new Promise((resolve, reject) => {
          this.cookies.set(setDetails, (result) => {
            const err = typeof chrome !== 'undefined' && chrome.runtime ? chrome.runtime.lastError : null;
            if (err || !result) {
              reject(new Error(err ? err.message : 'Failed to set cookie'));
            } else {
              resolve(result);
            }
          });
        });
        injected++;
      } catch (err) {
        failed++;
        console.warn(`[MuseVault] Cookie injection warning for ${cookie.name}:`, err.message);
      }
    }

    return { injected, failed };
  }

  /**
   * Captures current active session and creates a new account in vault
   * @param {object} params
   * @param {string} params.name
   * @param {string} [params.email]
   * @param {string} [params.notes]
   * @param {string} [params.avatarColor]
   * @returns {Promise<object>} Created account
   */
  async captureCurrentSession({ name, email = '', notes = '', avatarColor = '#0A85EA' }) {
    const liveCookies = await this.getLiveMuseCookies();
    const id = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const newAccount = {
      id,
      name: name ? name.trim() : 'Account ' + new Date().toLocaleTimeString(),
      email: email ? email.trim() : '',
      notes: notes || '',
      avatarColor: avatarColor || '#0A85EA',
      cookies: liveCookies,
      cookieCount: liveCookies.length,
      createdAt: Date.now(),
      lastActiveAt: Date.now()
    };

    const saved = await this.storage.saveAccount(newAccount);
    await this.storage.setActiveAccountId(saved.id);
    return saved;
  }

  /**
   * Synchronizes the currently active account with live cookies from the browser
   * @returns {Promise<{ success: boolean, cookieCount: number, account?: object }>}
   */
  async syncActiveAccountSession() {
    const { accounts, activeAccountId } = await this.storage.getVaultState();
    if (!activeAccountId || !accounts[activeAccountId]) {
      return { success: false, cookieCount: 0, error: 'No active account to synchronize' };
    }

    const liveCookies = await this.getLiveMuseCookies();
    accounts[activeAccountId].cookies = liveCookies;
    accounts[activeAccountId].cookieCount = liveCookies.length;
    accounts[activeAccountId].lastActiveAt = Date.now();
    accounts[activeAccountId].updatedAt = Date.now();

    await this.storage.set({ accounts });
    return {
      success: true,
      cookieCount: liveCookies.length,
      account: accounts[activeAccountId]
    };
  }

  /**
   * The 5-Step Session Swapping Engine with Concurrency Mutex Lock
   * @param {string} targetAccountId
   * @param {object} [options]
   * @param {boolean} [options.bypassCache=true]
   * @param {boolean} [options.openIfNotOpen=false]
   * @returns {Promise<{ success: boolean, targetAccount: object, reloadedTabs: number }>}
   */
  async switchAccount(targetAccountId, options = {}) {
    if (this.isSwitching) {
      throw new Error('Another account switch is currently in progress. Please wait.');
    }
    this.isSwitching = true;

    try {
      const state = await this.storage.getVaultState();
      const accounts = state.accounts || {};
      const currentActiveId = state.activeAccountId;
      const targetAccount = accounts[targetAccountId];

      if (!targetAccount) {
        throw new Error(`Target account '${targetAccountId}' not found in vault.`);
      }

      // STEP 1: Snapshot active session if currentActiveId is set and valid
      if (currentActiveId && accounts[currentActiveId] && currentActiveId !== targetAccountId) {
        const liveCookies = await this.getLiveMuseCookies();
        // Defensive check: Do not wipe out stored cookies with an empty array (e.g. if temporary network error)
        if (liveCookies && liveCookies.length > 0) {
          accounts[currentActiveId].cookies = liveCookies;
          accounts[currentActiveId].cookieCount = liveCookies.length;
          accounts[currentActiveId].lastActiveAt = Date.now();
        }
      }

      // STEP 2: Clear all live muse.ai cookies
      await this.clearMuseCookies();

      // STEP 3: Inject targeted account's saved cookies
      if (targetAccount.cookies && targetAccount.cookies.length > 0) {
        await this.injectCookies(targetAccount.cookies);
      }

      // STEP 4: Update active account pointer and persist state
      targetAccount.lastActiveAt = Date.now();
      accounts[targetAccountId] = targetAccount;

      await this.storage.set({
        accounts,
        activeAccountId: targetAccountId
      });

      // STEP 5: Synchronize open muse.ai tabs
      let reloadedTabs = 0;
      if (this.tabManager) {
        const bypassCache = options.bypassCache !== undefined ? options.bypassCache : true;
        reloadedTabs = await this.tabManager.reloadMuseTabs(bypassCache);

        const shouldOpen = options.openIfNotOpen || state.settings?.openTabIfNotOpen;
        if (reloadedTabs === 0 && shouldOpen) {
          await this.tabManager.openOrFocusMuse('https://muse.ai');
        }
      }

      return {
        success: true,
        targetAccount,
        reloadedTabs
      };
    } finally {
      this.isSwitching = false;
    }
  }

  /**
   * Deletes an account profile and synchronizes live browser cookies and tab state
   * If the account being deleted is active:
   * - Switches to the next available account if one exists, injecting its cookies and reloading tabs
   * - Purges live cookies and resets activeAccountId to null if no accounts remain
   *
   * @param {string} accountId
   * @returns {Promise<boolean>}
   */
  async deleteAccountAndSync(accountId) {
    const state = await this.storage.getVaultState();
    if (!state.accounts || !state.accounts[accountId]) {
      return false;
    }

    const isActive = state.activeAccountId === accountId;
    const remainingIds = Object.keys(state.accounts).filter((id) => id !== accountId);
    const nextActiveId = remainingIds.length > 0 ? remainingIds[0] : null;

    const deleted = await this.storage.deleteAccount(accountId);

    if (isActive) {
      if (nextActiveId) {
        await this.switchAccount(nextActiveId);
      } else {
        await this.clearMuseCookies();
        await this.storage.setActiveAccountId(null);
        if (this.tabManager) {
          await this.tabManager.reloadMuseTabs(true);
        }
      }
    }

    return deleted;
  }
}
