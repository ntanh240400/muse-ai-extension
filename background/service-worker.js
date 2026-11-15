/**
 * MuseVault Service Worker (Manifest V3)
 * Orchestrates messages between the popup interface and the session/cookie engine.
 */

import { VaultStorage } from './vault-storage.js';
import { TabManager } from './tab-manager.js';
import { CookieManager } from './cookie-manager.js';

// Instantiate singletons
const storage = new VaultStorage();
const tabManager = new TabManager();
const cookieManager = new CookieManager({
  storage,
  tabManager
});

/**
 * Message dispatcher
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) {
    return false;
  }

  handleMessage(message, sender)
    .then((result) => {
      sendResponse({ success: true, data: result });
    })
    .catch((error) => {
      console.error(`[MuseVault] Error handling ${message.action}:`, error);
      sendResponse({ success: false, error: error.message || 'Unknown error' });
    });

  // Return true to indicate asynchronous response
  return true;
});

async function handleMessage(message, sender) {
  switch (message.action) {
    case 'VAULT_GET_STATE': {
      const state = await storage.getVaultState();
      const liveCookies = await cookieManager.getLiveMuseCookies();
      const tabStatus = await tabManager.checkCurrentTabStatus();
      return {
        ...state,
        liveCookieCount: liveCookies.length,
        currentTab: tabStatus
      };
    }

    case 'VAULT_SWITCH_ACCOUNT': {
      if (!message.targetAccountId) {
        throw new Error('targetAccountId is required for switching');
      }
      return await cookieManager.switchAccount(message.targetAccountId, {
        bypassCache: message.bypassCache !== false,
        openIfNotOpen: Boolean(message.openIfNotOpen)
      });
    }

    case 'VAULT_SAVE_CURRENT_SESSION': {
      return await cookieManager.captureCurrentSession({
        name: message.name,
        email: message.email,
        notes: message.notes,
        avatarColor: message.avatarColor
      });
    }

    case 'VAULT_UPDATE_ACCOUNT': {
      if (!message.accountId) {
        throw new Error('accountId is required for update');
      }
      return await storage.updateAccountMetadata(message.accountId, {
        name: message.name,
        email: message.email,
        notes: message.notes,
        avatarColor: message.avatarColor
      });
    }

    case 'VAULT_DELETE_ACCOUNT': {
      if (!message.accountId) {
        throw new Error('accountId is required for deletion');
      }
      const state = await storage.getVaultState();
      const isActive = message.accountId === state.activeAccountId;
      const remainingIds = Object.keys(state.accounts || {}).filter((id) => id !== message.accountId);
      const nextActiveId = remainingIds.length > 0 ? remainingIds[0] : null;

      const deleted = await storage.deleteAccount(message.accountId);

      if (isActive) {
        if (nextActiveId) {
          await cookieManager.switchAccount(nextActiveId);
        } else {
          await cookieManager.clearMuseCookies();
          await storage.setActiveAccountId(null);
          await tabManager.reloadMuseTabs(true);
        }
      }
      return deleted;
    }

    case 'VAULT_SYNC_CURRENT_ACCOUNT': {
      return await cookieManager.syncActiveAccountSession();
    }

    case 'VAULT_EXPORT_DATA': {
      return await storage.exportVaultJson();
    }

    case 'VAULT_IMPORT_DATA': {
      if (!message.jsonString) {
        throw new Error('jsonString is required for import');
      }
      return await storage.importVaultJson(message.jsonString);
    }

    case 'VAULT_CHECK_TAB_STATUS': {
      const tabStatus = await tabManager.checkCurrentTabStatus();
      const liveCookies = await cookieManager.getLiveMuseCookies();
      return {
        ...tabStatus,
        cookieCount: liveCookies.length
      };
    }

    case 'VAULT_OPEN_MUSE': {
      const url = message.targetUrl || 'https://muse.ai';
      return await tabManager.openOrFocusMuse(url);
    }

    case 'VAULT_UPDATE_SETTINGS': {
      return await storage.updateSettings(message.settings || {});
    }

    default:
      throw new Error(`Unhandled vault message action: ${message.action}`);
  }
}

// Log startup confirmation
console.log('[MuseVault] Background service worker initialized.');
