/**
 * MockChromeApi - High-fidelity in-memory mock of Chrome Extension MV3 APIs:
 * chrome.storage.local, chrome.cookies, chrome.tabs, and chrome.runtime.
 */

export class MockChromeStorageLocal {
  constructor() {
    this.store = new Map();
  }

  get(keys, callback) {
    let result = {};
    if (keys === null || keys === undefined) {
      for (const [k, v] of this.store.entries()) {
        result[k] = structuredClone(v);
      }
    } else if (typeof keys === 'string') {
      if (this.store.has(keys)) {
        result[keys] = structuredClone(this.store.get(keys));
      }
    } else if (Array.isArray(keys)) {
      for (const k of keys) {
        if (this.store.has(k)) {
          result[k] = structuredClone(this.store.get(k));
        }
      }
    } else if (typeof keys === 'object') {
      result = structuredClone(keys);
      for (const k of Object.keys(keys)) {
        if (this.store.has(k)) {
          result[k] = structuredClone(this.store.get(k));
        }
      }
    }

    if (typeof callback === 'function') {
      queueMicrotask(() => callback(result));
    }
    return Promise.resolve(result);
  }

  set(items, callback) {
    if (items && typeof items === 'object') {
      for (const [k, v] of Object.entries(items)) {
        this.store.set(k, structuredClone(v));
      }
    }
    if (typeof callback === 'function') {
      queueMicrotask(() => callback());
    }
    return Promise.resolve();
  }

  remove(keys, callback) {
    const list = Array.isArray(keys) ? keys : [keys];
    for (const k of list) {
      this.store.delete(k);
    }
    if (typeof callback === 'function') {
      queueMicrotask(() => callback());
    }
    return Promise.resolve();
  }

  clear(callback) {
    this.store.clear();
    if (typeof callback === 'function') {
      queueMicrotask(() => callback());
    }
    return Promise.resolve();
  }
}

export class MockChromeCookies {
  constructor() {
    // Map key: `${storeId}:${domain}:${path}:${name}`
    this.cookieJar = new Map();
  }

  /**
   * Helper to determine if a cookie domain matches the query domain
   */
  _domainMatches(cookieDomain, queryDomain) {
    const cd = cookieDomain.startsWith('.') ? cookieDomain.substring(1) : cookieDomain;
    const qd = queryDomain.startsWith('.') ? queryDomain.substring(1) : queryDomain;
    return cd === qd || cd.endsWith('.' + qd) || qd.endsWith('.' + cd);
  }

  getAll(details = {}, callback) {
    const results = [];
    const queryDomain = details.domain;
    const queryName = details.name;
    const queryStoreId = details.storeId || '0';

    for (const cookie of this.cookieJar.values()) {
      if (details.storeId && cookie.storeId !== queryStoreId) {
        continue;
      }
      if (queryName && cookie.name !== queryName) {
        continue;
      }
      if (queryDomain && !this._domainMatches(cookie.domain, queryDomain)) {
        continue;
      }
      if (details.url) {
        try {
          const parsed = new URL(details.url);
          if (!this._domainMatches(cookie.domain, parsed.hostname)) {
            continue;
          }
        } catch {
          // ignore malformed url in query
        }
      }
      results.push(structuredClone(cookie));
    }

    if (typeof callback === 'function') {
      queueMicrotask(() => callback(results));
    }
    return Promise.resolve(results);
  }

  set(details, callback) {
    if (!details || !details.url || !details.name) {
      const err = new Error('details.url and details.name are mandatory for chrome.cookies.set()');
      if (typeof callback === 'function') {
        queueMicrotask(() => callback(null));
      }
      return Promise.reject(err);
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(details.url);
    } catch {
      const err = new Error('Invalid details.url passed to chrome.cookies.set()');
      if (typeof callback === 'function') {
        queueMicrotask(() => callback(null));
      }
      return Promise.reject(err);
    }

    // Determine domain and hostOnly flag
    let domain = details.domain;
    let hostOnly = false;
    if (!domain) {
      domain = parsedUrl.hostname;
      hostOnly = true;
    }

    // RFC compliance: SameSite=None requires Secure=true
    if (details.sameSite === 'no_restriction' && !details.secure) {
      const err = new Error('chrome.cookies: SameSite=None (no_restriction) requires Secure=true');
      if (typeof callback === 'function') {
        queueMicrotask(() => callback(null));
      }
      return Promise.reject(err);
    }

    const storeId = details.storeId || '0';
    const path = details.path || '/';

    const cookieObj = {
      name: details.name,
      value: details.value || '',
      domain,
      hostOnly,
      path,
      secure: Boolean(details.secure),
      httpOnly: Boolean(details.httpOnly),
      sameSite: details.sameSite || 'unspecified',
      session: details.expirationDate === undefined,
      expirationDate: details.expirationDate,
      storeId
    };

    const key = `${storeId}:${domain}:${path}:${details.name}`;
    this.cookieJar.set(key, cookieObj);

    if (typeof callback === 'function') {
      queueMicrotask(() => callback(structuredClone(cookieObj)));
    }
    return Promise.resolve(structuredClone(cookieObj));
  }

  remove(details, callback) {
    if (!details || !details.url || !details.name) {
      if (typeof callback === 'function') {
        queueMicrotask(() => callback(null));
      }
      return Promise.resolve(null);
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(details.url);
    } catch {
      if (typeof callback === 'function') {
        queueMicrotask(() => callback(null));
      }
      return Promise.resolve(null);
    }

    const hostname = parsedUrl.hostname;
    const storeId = details.storeId || '0';
    let removed = null;

    for (const [key, cookie] of this.cookieJar.entries()) {
      if (cookie.name === details.name && cookie.storeId === storeId) {
        if (this._domainMatches(cookie.domain, hostname)) {
          removed = { url: details.url, name: cookie.name, storeId: cookie.storeId };
          this.cookieJar.delete(key);
          break;
        }
      }
    }

    if (typeof callback === 'function') {
      queueMicrotask(() => callback(removed));
    }
    return Promise.resolve(removed);
  }
}

export class MockChromeTabs {
  constructor() {
    this.tabs = [];
    this.nextTabId = 101;
    this.reloadHistory = [];
  }

  addTab({ url, active = false, title = '' }) {
    const tab = {
      id: this.nextTabId++,
      url,
      active,
      title,
      status: 'complete'
    };
    this.tabs.push(tab);
    return tab;
  }

  _matchPattern(pattern, url) {
    if (pattern === '<all_urls>') return true;
    try {
      const match = pattern.match(/^(\*|https?|file|ftp):\/\/(\*|\*\.[^/]+|[^/]+)\/(.*)$/);
      if (!match) {
        const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
        return regex.test(url);
      }
      const [, scheme, host, pathPart] = match;
      const parsedUrl = new URL(url);

      if (scheme !== '*' && scheme !== parsedUrl.protocol.replace(':', '')) {
        return false;
      }

      if (host !== '*') {
        if (host.startsWith('*.')) {
          const rootDomain = host.substring(2);
          if (parsedUrl.hostname !== rootDomain && !parsedUrl.hostname.endsWith('.' + rootDomain)) {
            return false;
          }
        } else if (host !== parsedUrl.hostname) {
          return false;
        }
      }

      const pathRegex = new RegExp('^/' + pathPart.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      return pathRegex.test(parsedUrl.pathname);
    } catch {
      return false;
    }
  }

  query(queryInfo = {}, callback) {
    let matched = this.tabs.slice();

    if (queryInfo.url) {
      const patterns = Array.isArray(queryInfo.url) ? queryInfo.url : [queryInfo.url];
      matched = matched.filter((tab) => patterns.some(pattern => this._matchPattern(pattern, tab.url)));
    }

    if (queryInfo.active !== undefined) {
      matched = matched.filter((tab) => tab.active === queryInfo.active);
    }

    if (typeof callback === 'function') {
      queueMicrotask(() => callback(structuredClone(matched)));
    }
    return Promise.resolve(structuredClone(matched));
  }

  reload(tabId, reloadProperties = {}, callback) {
    const tab = this.tabs.find((t) => t.id === tabId);
    this.reloadHistory.push({ tabId, reloadProperties, timestamp: Date.now() });

    if (typeof callback === 'function') {
      queueMicrotask(() => callback());
    }
    return Promise.resolve();
  }

  create(createProperties = {}, callback) {
    const newTab = {
      id: this.nextTabId++,
      url: createProperties.url || 'about:blank',
      active: createProperties.active !== undefined ? createProperties.active : true,
      status: 'complete'
    };
    this.tabs.push(newTab);

    if (typeof callback === 'function') {
      queueMicrotask(() => callback(structuredClone(newTab)));
    }
    return Promise.resolve(structuredClone(newTab));
  }

  update(tabId, updateProperties = {}, callback) {
    const tab = this.tabs.find((t) => t.id === tabId);
    if (tab) {
      Object.assign(tab, updateProperties);
    }

    if (typeof callback === 'function') {
      queueMicrotask(() => callback(tab ? structuredClone(tab) : null));
    }
    return Promise.resolve(tab ? structuredClone(tab) : null);
  }
}

/**
 * Creates a fully wired mock Chrome environment
 */
export function setupMockChromeEnvironment() {
  const mockStorageLocal = new MockChromeStorageLocal();
  const mockCookies = new MockChromeCookies();
  const mockTabs = new MockChromeTabs();

  const mockChrome = {
    storage: {
      local: mockStorageLocal
    },
    cookies: mockCookies,
    tabs: mockTabs,
    runtime: {
      lastError: null
    }
  };

  return {
    chrome: mockChrome,
    mockStorageLocal,
    mockCookies,
    mockTabs
  };
}
