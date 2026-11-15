/**
 * TabManager - Dispatches tab queries, cache-bypassing reloads, and tab activations for muse.ai.
 */

export class TabManager {
  /**
   * @param {object} [tabsApi] - chrome.tabs or mock
   */
  constructor(tabsApi = (typeof chrome !== 'undefined' && chrome.tabs ? chrome.tabs : null)) {
    this.tabs = tabsApi;
  }

  /**
   * Queries all open tabs matching muse.ai patterns
   * @returns {Promise<chrome.tabs.Tab[]>}
   */
  async queryMuseTabs() {
    if (!this.tabs) return [];
    return new Promise((resolve) => {
      this.tabs.query({ url: ['*://*.muse.ai/*', '*://muse.ai/*'] }, (tabs) => {
        resolve(tabs || []);
      });
    });
  }

  /**
   * Gets the currently active tab in the focused window
   * @returns {Promise<chrome.tabs.Tab|null>}
   */
  async getActiveTab() {
    if (!this.tabs) return null;
    return new Promise((resolve) => {
      this.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        resolve(tabs && tabs.length > 0 ? tabs[0] : null);
      });
    });
  }

  /**
   * Reloads all open muse.ai tabs with cache bypassed
   * @param {boolean} [bypassCache=true]
   * @returns {Promise<number>} Number of reloaded tabs
   */
  async reloadMuseTabs(bypassCache = true) {
    const tabs = await this.queryMuseTabs();
    if (!tabs || tabs.length === 0) {
      return 0;
    }

    const reloadPromises = tabs.map((tab) => {
      return new Promise((resolve) => {
        if (!tab || typeof tab.id !== 'number') {
          resolve(false);
          return;
        }
        this.tabs.reload(tab.id, { bypassCache }, () => {
          resolve(true);
        });
      });
    });

    await Promise.allSettled(reloadPromises);
    return tabs.length;
  }

  /**
   * Opens or focuses muse.ai in the browser
   * @param {string} [targetUrl='https://muse.ai/']
   * @returns {Promise<object>}
   */
  async openOrFocusMuse(targetUrl = 'https://muse.ai/') {
    if (!this.tabs) return null;
    const existingTabs = await this.queryMuseTabs();

    if (existingTabs.length > 0) {
      const targetTab = existingTabs[0];
      return new Promise((resolve) => {
        this.tabs.update(targetTab.id, { active: true }, (updated) => {
          resolve(updated || targetTab);
        });
      });
    }

    return new Promise((resolve) => {
      this.tabs.create({ url: targetUrl }, (tab) => {
        resolve(tab);
      });
    });
  }

  /**
   * Checks whether the user's active tab is currently navigated to muse.ai
   * @returns {Promise<{ isMuse: boolean, tabId?: number, url?: string }>}
   */
  async checkCurrentTabStatus() {
    const tab = await this.getActiveTab();
    if (!tab || !tab.url) {
      return { isMuse: false };
    }

    try {
      const parsed = new URL(tab.url);
      const isMuse = parsed.hostname === 'muse.ai' || parsed.hostname.endsWith('.muse.ai');
      return {
        isMuse,
        tabId: tab.id,
        url: tab.url,
        title: tab.title
      };
    } catch {
      return { isMuse: false };
    }
  }
}
