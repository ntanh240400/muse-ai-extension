/**
 * Standalone Automated Verification Harness for MuseVault
 * Runs natively on Node.js using node:test and node:assert/strict.
 * Covers all 8 test suites: CRUD, 3+ persistence, session capture,
 * A->B switch, B->A switch, tab management, edge cases, and remediation verifications.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { setupMockChromeEnvironment } from './mock-chrome-api.js';
import { VaultStorage } from '../background/vault-storage.js';
import { TabManager } from '../background/tab-manager.js';
import { CookieManager, cookieToSetDetails } from '../background/cookie-manager.js';

// Global test suite harness
test('MuseVault Complete Verification Suite', async (t) => {
  console.log('\n======================================================');
  console.log('🚀 Starting MuseVault Manifest V3 Verification Engine');
  console.log('======================================================\n');

  // --------------------------------------------------------------------------
  // TS-01: Account Vault CRUD Operations
  // --------------------------------------------------------------------------
  await t.test('TS-01: Account Vault CRUD Operations', async () => {
    const { chrome } = setupMockChromeEnvironment();
    const storage = new VaultStorage(chrome.storage.local);

    // 1. Create Account
    const initialAccount = {
      id: 'acc_01_work',
      name: 'Work Pro',
      email: 'work@agency.com',
      notes: 'Production video editing',
      avatarColor: '#0A85EA',
      cookies: [{ name: 'test_token', value: 'xyz123', domain: 'muse.ai', path: '/' }]
    };

    const saved = await storage.saveAccount(initialAccount);
    assert.equal(saved.id, 'acc_01_work');
    assert.equal(saved.name, 'Work Pro');
    assert.equal(saved.cookieCount, 1);

    // 2. Read Account
    const retrieved = await storage.getAccount('acc_01_work');
    assert.ok(retrieved, 'Account should be retrieved from storage');
    assert.equal(retrieved.email, 'work@agency.com');

    // 3. Update Metadata
    const updated = await storage.updateAccountMetadata('acc_01_work', {
      name: 'Work Pro VIP',
      notes: 'Updated client workspace',
      avatarColor: '#8B5CF6'
    });
    assert.equal(updated.name, 'Work Pro VIP');
    assert.equal(updated.notes, 'Updated client workspace');
    assert.equal(updated.avatarColor, '#8B5CF6');

    // 4. Verify in State
    const state = await storage.getVaultState();
    assert.equal(state.accounts['acc_01_work'].name, 'Work Pro VIP');

    // 5. Delete Account
    const deleted = await storage.deleteAccount('acc_01_work');
    assert.equal(deleted, true);
    const postDelete = await storage.getAccount('acc_01_work');
    assert.equal(postDelete, null);

    console.log('  ✔ TS-01: Account Vault CRUD Operations passed.');
  });

  // --------------------------------------------------------------------------
  // TS-02: Storage Persistence (3+ Accounts)
  // --------------------------------------------------------------------------
  await t.test('TS-02: Storage Persistence across restarts with 3+ Accounts', async () => {
    const { chrome, mockStorageLocal } = setupMockChromeEnvironment();
    const storageInstance1 = new VaultStorage(chrome.storage.local);

    const acc1 = { id: 'acc_free', name: 'Personal Free', email: 'free@muse.ai', cookies: [{ name: 'sess', value: '111' }] };
    const acc2 = { id: 'acc_pro', name: 'Creator Pro', email: 'pro@muse.ai', cookies: [{ name: 'sess', value: '222' }] };
    const acc3 = { id: 'acc_team', name: 'Enterprise Team', email: 'team@muse.ai', cookies: [{ name: 'sess', value: '333' }] };

    await storageInstance1.saveAccount(acc1);
    await storageInstance1.saveAccount(acc2);
    await storageInstance1.saveAccount(acc3);
    await storageInstance1.setActiveAccountId('acc_pro');

    // Verify initial write
    const state1 = await storageInstance1.getVaultState();
    assert.equal(Object.keys(state1.accounts).length, 3);
    assert.equal(state1.activeAccountId, 'acc_pro');

    // Simulate browser restart / worker recreation by pointing a brand new VaultStorage instance to the persisted store
    const storageInstance2 = new VaultStorage(mockStorageLocal);
    const state2 = await storageInstance2.getVaultState();

    assert.equal(Object.keys(state2.accounts).length, 3, 'All 3 accounts must persist');
    assert.ok(state2.accounts['acc_free']);
    assert.ok(state2.accounts['acc_pro']);
    assert.ok(state2.accounts['acc_team']);
    assert.equal(state2.activeAccountId, 'acc_pro', 'Active pointer must persist across restarts');
    assert.equal(state2.accounts['acc_team'].email, 'team@muse.ai');

    console.log('  ✔ TS-02: Storage Persistence (3+ Accounts) passed.');
  });

  // --------------------------------------------------------------------------
  // TS-03: Live Session Capture & Snapshot
  // --------------------------------------------------------------------------
  await t.test('TS-03: Live Session Capture & Snapshot from muse.ai', async () => {
    const { chrome, mockCookies } = setupMockChromeEnvironment();
    const storage = new VaultStorage(chrome.storage.local);
    const cookieManager = new CookieManager({ storage, cookiesApi: chrome.cookies });

    // Seed live cookies
    await mockCookies.set({
      url: 'https://muse.ai/dashboard',
      name: 'muse_session_id',
      value: 'live_sess_abc789',
      domain: '.muse.ai',
      path: '/',
      secure: true,
      httpOnly: true
    });

    await mockCookies.set({
      url: 'https://muse.ai/',
      name: '__Host-auth-token',
      value: 'secret_host_only_token_456',
      path: '/',
      secure: true,
      httpOnly: true
    });

    // Capture session
    const captured = await cookieManager.captureCurrentSession({
      name: 'My Captured Account',
      email: 'studio@domain.com',
      notes: 'Captured via extension test'
    });

    assert.ok(captured.id);
    assert.equal(captured.name, 'My Captured Account');
    assert.equal(captured.email, 'studio@domain.com');
    assert.equal(captured.cookieCount, 2);

    const sessionCookie = captured.cookies.find(c => c.name === 'muse_session_id');
    const hostCookie = captured.cookies.find(c => c.name === '__Host-auth-token');

    assert.ok(sessionCookie);
    assert.equal(sessionCookie.value, 'live_sess_abc789');
    assert.equal(sessionCookie.secure, true);

    assert.ok(hostCookie);
    assert.equal(hostCookie.value, 'secret_host_only_token_456');
    assert.equal(hostCookie.hostOnly, true, 'Host-only cookie flag must be detected and preserved');

    console.log('  ✔ TS-03: Live Session Capture & Snapshot passed.');
  });

  // --------------------------------------------------------------------------
  // TS-04: 1-Click Switch: Account A -> Account B
  // --------------------------------------------------------------------------
  await t.test('TS-04: 1-Click Switch: Account A -> Account B', async () => {
    const { chrome, mockCookies, mockTabs } = setupMockChromeEnvironment();
    const storage = new VaultStorage(chrome.storage.local);
    const tabManager = new TabManager(chrome.tabs);
    const cookieManager = new CookieManager({ storage, cookiesApi: chrome.cookies, tabManager });

    // Open a mock muse.ai tab
    const museTab = mockTabs.addTab({ url: 'https://muse.ai/workspace', active: true });

    // Setup Account A & Account B
    const accA = {
      id: 'acc_a',
      name: 'Account Alice',
      email: 'alice@muse.ai',
      cookies: [{
        name: 'muse_session',
        value: 'token_alice_123',
        domain: '.muse.ai',
        path: '/',
        secure: true,
        httpOnly: true
      }]
    };

    const accB = {
      id: 'acc_b',
      name: 'Account Bob',
      email: 'bob@muse.ai',
      cookies: [{
        name: 'muse_session',
        value: 'token_bob_456',
        domain: '.muse.ai',
        path: '/',
        secure: true,
        httpOnly: true
      }]
    };

    await storage.saveAccount(accA);
    await storage.saveAccount(accB);
    await storage.setActiveAccountId('acc_a');

    // Inject Alice's cookies initially
    await mockCookies.set({
      url: 'https://muse.ai/',
      name: 'muse_session',
      value: 'token_alice_123',
      domain: '.muse.ai',
      path: '/',
      secure: true
    });

    // Execute Switch to Bob
    const result = await cookieManager.switchAccount('acc_b');
    assert.equal(result.success, true);
    assert.equal(result.reloadedTabs, 1);

    // Verify Storage state
    const state = await storage.getVaultState();
    assert.equal(state.activeAccountId, 'acc_b', 'Active account must point to Bob');

    // Verify Live Cookie Jar has Bob's cookie and NOT Alice's
    const liveCookies = await mockCookies.getAll({ domain: 'muse.ai' });
    assert.equal(liveCookies.length, 1);
    assert.equal(liveCookies[0].value, 'token_bob_456', 'Live cookie jar must contain Bob token');

    // Verify Tab was reloaded with bypassCache
    assert.equal(mockTabs.reloadHistory.length, 1);
    assert.equal(mockTabs.reloadHistory[0].tabId, museTab.id);
    assert.equal(mockTabs.reloadHistory[0].reloadProperties.bypassCache, true);

    console.log('  ✔ TS-04: 1-Click Switch: Account A -> Account B passed.');
  });

  // --------------------------------------------------------------------------
  // TS-05: Bidirectional Switch: Account B -> Account A
  // --------------------------------------------------------------------------
  await t.test('TS-05: Bidirectional Switch: Account B -> Account A with Session Update', async () => {
    const { chrome, mockCookies, mockTabs } = setupMockChromeEnvironment();
    const storage = new VaultStorage(chrome.storage.local);
    const tabManager = new TabManager(chrome.tabs);
    const cookieManager = new CookieManager({ storage, cookiesApi: chrome.cookies, tabManager });

    mockTabs.addTab({ url: 'https://muse.ai/dashboard', active: true });

    const accA = {
      id: 'acc_a',
      name: 'Alice Account',
      cookies: [{ name: 'auth_key', value: 'key_alice', domain: '.muse.ai', path: '/', secure: true }]
    };
    const accB = {
      id: 'acc_b',
      name: 'Bob Account',
      cookies: [{ name: 'auth_key', value: 'key_bob', domain: '.muse.ai', path: '/', secure: true }]
    };

    await storage.saveAccount(accA);
    await storage.saveAccount(accB);

    // Initial switch to B
    await cookieManager.switchAccount('acc_b');

    // Simulate Bob receiving a refreshed token on muse.ai
    await mockCookies.set({
      url: 'https://muse.ai/',
      name: 'auth_key',
      value: 'key_bob_REFRESHED_999',
      domain: '.muse.ai',
      path: '/',
      secure: true
    });

    // Now switch back from B to A
    await cookieManager.switchAccount('acc_a');

    // 1. Verify Bob's updated cookie was snapshotted into storage
    const state = await storage.getVaultState();
    assert.equal(state.activeAccountId, 'acc_a');
    const savedBob = state.accounts['acc_b'];
    assert.equal(savedBob.cookies[0].value, 'key_bob_REFRESHED_999', 'Bob refreshed token must be saved before leaving');

    // 2. Verify Live Cookie Jar now has Alice's cookie
    const liveCookies = await mockCookies.getAll({ domain: 'muse.ai' });
    assert.equal(liveCookies.length, 1);
    assert.equal(liveCookies[0].value, 'key_alice');

    console.log('  ✔ TS-05: Bidirectional Switch: Account B -> Account A passed.');
  });

  // --------------------------------------------------------------------------
  // TS-06: Tab Management (Multiple Tabs & No Tabs)
  // --------------------------------------------------------------------------
  await t.test('TS-06: Tab Management (Multiple Tabs and No Tabs)', async () => {
    // Case A: Multiple open tabs
    {
      const { chrome, mockTabs } = setupMockChromeEnvironment();
      const storage = new VaultStorage(chrome.storage.local);
      const tabManager = new TabManager(chrome.tabs);
      const cookieManager = new CookieManager({ storage, cookiesApi: chrome.cookies, tabManager });

      const tab1 = mockTabs.addTab({ url: 'https://muse.ai/dashboard' });
      const tab2 = mockTabs.addTab({ url: 'https://muse.ai/settings' });
      const otherTab = mockTabs.addTab({ url: 'https://google.com' });

      await storage.saveAccount({ id: 'acc_1', name: 'Account 1', cookies: [] });
      await storage.saveAccount({ id: 'acc_2', name: 'Account 2', cookies: [] });
      await storage.setActiveAccountId('acc_1');

      const result = await cookieManager.switchAccount('acc_2');
      assert.equal(result.reloadedTabs, 2, 'Must reload exactly the 2 muse.ai tabs');

      const reloadedIds = mockTabs.reloadHistory.map(h => h.tabId);
      assert.ok(reloadedIds.includes(tab1.id));
      assert.ok(reloadedIds.includes(tab2.id));
      assert.ok(!reloadedIds.includes(otherTab.id), 'Non-muse tabs must not be reloaded');
    }

    // Case B: Zero open tabs with openIfNotOpen: true
    {
      const { chrome, mockTabs } = setupMockChromeEnvironment();
      const storage = new VaultStorage(chrome.storage.local);
      const tabManager = new TabManager(chrome.tabs);
      const cookieManager = new CookieManager({ storage, cookiesApi: chrome.cookies, tabManager });

      await storage.saveAccount({ id: 'acc_1', name: 'Account 1', cookies: [] });
      await storage.saveAccount({ id: 'acc_2', name: 'Account 2', cookies: [] });

      assert.equal(mockTabs.tabs.length, 0);

      await cookieManager.switchAccount('acc_2', { openIfNotOpen: true });
      assert.equal(mockTabs.tabs.length, 1, 'Should spawn a new muse.ai tab when none open');
      assert.equal(mockTabs.tabs[0].url, 'https://muse.ai');
    }

    console.log('  ✔ TS-06: Tab Management passed.');
  });

  // --------------------------------------------------------------------------
  // TS-07: Edge Cases & Fault Tolerance
  // --------------------------------------------------------------------------
  await t.test('TS-07: Edge Cases & Fault Tolerance', async () => {
    // 1. Host-only Cookie vs Domain Cookie Transformation
    {
      const hostOnlyCookie = {
        name: 'secret_host_key',
        value: 'val_host',
        domain: 'muse.ai',
        hostOnly: true,
        path: '/api',
        secure: true
      };
      const hostSetDetails = cookieToSetDetails(hostOnlyCookie);
      assert.equal(hostSetDetails.domain, undefined, 'Domain must be omitted for hostOnly cookies');
      assert.equal(hostSetDetails.url, 'https://muse.ai/api');

      const domainCookie = {
        name: 'shared_key',
        value: 'val_domain',
        domain: '.muse.ai',
        hostOnly: false,
        path: '/',
        secure: true
      };
      const domainSetDetails = cookieToSetDetails(domainCookie);
      assert.equal(domainSetDetails.domain, '.muse.ai', 'Domain must be set for domain cookies');
    }

    // 2. SameSite: "no_restriction" requires Secure: true
    {
      const samesiteCookie = {
        name: 'cross_site_key',
        value: 'cs_val',
        domain: 'muse.ai',
        sameSite: 'no_restriction',
        secure: false // Initially false
      };
      const details = cookieToSetDetails(samesiteCookie);
      assert.equal(details.sameSite, 'no_restriction');
      assert.equal(details.secure, true, 'SameSite=None must force secure=true');
    }

    // 3. Expired Cookie Protection
    {
      const pastSec = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const expiredCookie = {
        name: 'old_cookie',
        value: 'old_val',
        domain: 'muse.ai',
        session: false,
        expirationDate: pastSec
      };
      const details = cookieToSetDetails(expiredCookie);
      assert.equal(details.expirationDate, undefined, 'Past expiration date must be omitted to avoid rejection');
    }

    // 4. Empty Jar Protection
    {
      const { chrome, mockCookies } = setupMockChromeEnvironment();
      const storage = new VaultStorage(chrome.storage.local);
      const cookieManager = new CookieManager({ storage, cookiesApi: chrome.cookies });

      // Account X has 3 valid stored cookies
      const accX = {
        id: 'acc_x',
        name: 'Account X',
        cookies: [
          { name: 'c1', value: 'v1' },
          { name: 'c2', value: 'v2' },
          { name: 'c3', value: 'v3' }
        ]
      };
      const accY = {
        id: 'acc_y',
        name: 'Account Y',
        cookies: [{ name: 'cy', value: 'vy' }]
      };

      await storage.saveAccount(accX);
      await storage.saveAccount(accY);
      await storage.setActiveAccountId('acc_x');

      // Live cookies in browser are currently empty (e.g. user was logged out)
      const live = await mockCookies.getAll({ domain: 'muse.ai' });
      assert.equal(live.length, 0);

      // Now switch to Account Y
      await cookieManager.switchAccount('acc_y');

      // Verify that Account X's stored cookies were NOT wiped out by the empty live jar
      const state = await storage.getVaultState();
      assert.equal(state.accounts['acc_x'].cookies.length, 3, 'Empty live jar must not wipe saved session cookies');
    }

    // 5. Concurrency Mutex Lock
    {
      const { chrome } = setupMockChromeEnvironment();
      const storage = new VaultStorage(chrome.storage.local);
      const cookieManager = new CookieManager({ storage, cookiesApi: chrome.cookies });

      await storage.saveAccount({ id: 'acc_1', name: 'Acc 1', cookies: [] });
      await storage.saveAccount({ id: 'acc_2', name: 'Acc 2', cookies: [] });

      // Artificial lock
      cookieManager.isSwitching = true;

      await assert.rejects(
        async () => {
          await cookieManager.switchAccount('acc_2');
        },
        /Another account switch is currently in progress/
      );

      cookieManager.isSwitching = false;
    }

    console.log('  ✔ TS-07: Edge Cases & Fault Tolerance passed.');
  });

  // --------------------------------------------------------------------------
  // TS-08: Remediation Verifications (Active Deletion Sync & Raw Cookie Array Import)
  // --------------------------------------------------------------------------
  await t.test('TS-08: Remediation Verifications (Active Deletion Sync & Cookie Import)', async () => {
    // 1. Active Account Deletion Triggering Clean Switch to Next Account (F-01)
    {
      const { chrome, mockCookies, mockTabs } = setupMockChromeEnvironment();
      const storage = new VaultStorage(chrome.storage.local);
      const tabManager = new TabManager(chrome.tabs);
      const cookieManager = new CookieManager({ storage, cookiesApi: chrome.cookies, tabManager });

      mockTabs.addTab({ url: 'https://muse.ai/workspace', active: true });

      const accA = {
        id: 'acc_del_a',
        name: 'Account To Delete',
        cookies: [{ name: 'muse_token_a', value: 'secret_a_111', domain: '.muse.ai', path: '/', secure: true }]
      };
      const accB = {
        id: 'acc_stay_b',
        name: 'Remaining Account',
        cookies: [{ name: 'muse_token_b', value: 'secret_b_222', domain: '.muse.ai', path: '/', secure: true }]
      };

      await storage.saveAccount(accA);
      await storage.saveAccount(accB);

      // Switch to Account A initially
      await cookieManager.switchAccount('acc_del_a');

      // Verify initial active state and live cookies
      let state = await storage.getVaultState();
      assert.equal(state.activeAccountId, 'acc_del_a');
      let liveCookies = await mockCookies.getAll({ domain: 'muse.ai' });
      assert.equal(liveCookies.length, 1);
      assert.equal(liveCookies[0].value, 'secret_a_111');

      // Now delete the currently active Account A
      const deleteResult = await cookieManager.deleteAccountAndSync('acc_del_a');
      assert.equal(deleteResult, true);

      // Verify Account A is removed and Account B is designated as active
      state = await storage.getVaultState();
      assert.equal(state.accounts['acc_del_a'], undefined, 'Deleted account must not exist in storage');
      assert.equal(state.activeAccountId, 'acc_stay_b', 'Active pointer must transition to next available account');

      // Verify live cookies are synchronized to Account B's cookies (NOT contaminated with Account A's)
      liveCookies = await mockCookies.getAll({ domain: 'muse.ai' });
      assert.equal(liveCookies.length, 1);
      assert.equal(liveCookies[0].name, 'muse_token_b');
      assert.equal(liveCookies[0].value, 'secret_b_222');

      // Verify muse tabs were reloaded
      assert.ok(mockTabs.reloadHistory.length > 0);

      // Now simulate session sync and verify Account B is not corrupted
      const syncResult = await cookieManager.syncActiveAccountSession();
      assert.equal(syncResult.success, true);
      state = await storage.getVaultState();
      assert.equal(state.accounts['acc_stay_b'].cookies[0].value, 'secret_b_222', 'Session sync must preserve Account B tokens without contamination');
    }

    // 2. Active Account Deletion When No Accounts Remain (Purges Live Cookies) (F-01)
    {
      const { chrome, mockCookies } = setupMockChromeEnvironment();
      const storage = new VaultStorage(chrome.storage.local);
      const tabManager = new TabManager(chrome.tabs);
      const cookieManager = new CookieManager({ storage, cookiesApi: chrome.cookies, tabManager });

      const loneAccount = {
        id: 'acc_lone',
        name: 'Sole Account',
        cookies: [{ name: 'lone_token', value: 'token_lone_999', domain: '.muse.ai', path: '/', secure: true }]
      };

      await storage.saveAccount(loneAccount);
      await cookieManager.switchAccount('acc_lone');

      let live = await mockCookies.getAll({ domain: 'muse.ai' });
      assert.equal(live.length, 1);

      // Delete the only remaining account
      const delSuccess = await cookieManager.deleteAccountAndSync('acc_lone');
      assert.equal(delSuccess, true);

      const state = await storage.getVaultState();
      assert.equal(Object.keys(state.accounts).length, 0);
      assert.equal(state.activeAccountId, null, 'Active pointer must be null when all accounts deleted');

      // Verify live cookies are purged
      live = await mockCookies.getAll({ domain: 'muse.ai' });
      assert.equal(live.length, 0, 'Live cookies must be purged when no accounts remain');
    }

    // 3. Raw Cookie Array Import Support (F-02)
    {
      const { chrome } = setupMockChromeEnvironment();
      const storage = new VaultStorage(chrome.storage.local);

      // Raw array of cookies as exported or formatted
      const rawCookieArrayJson = JSON.stringify([
        { name: 'muse_session_id', value: 'xyz', domain: '.muse.ai', path: '/' },
        { name: 'auth_signature', value: 'sig_abc', domain: '.muse.ai', path: '/' }
      ]);

      const importResult = await storage.importVaultJson(rawCookieArrayJson);
      assert.equal(importResult.importedCount, 1, 'Importing cookie array must produce 1 account record');

      const state = await storage.getVaultState();
      const accountIds = Object.keys(state.accounts);
      assert.equal(accountIds.length, 1);

      const importedAccount = state.accounts[accountIds[0]];
      assert.ok(importedAccount.name.startsWith('Imported Account'));
      assert.equal(importedAccount.cookieCount, 2);
      assert.equal(importedAccount.cookies[0].name, 'muse_session_id');
      assert.equal(importedAccount.cookies[0].value, 'xyz');
      assert.equal(state.activeAccountId, importedAccount.id, 'Imported account should be set active if none existed');
    }

    // 4. Object with cookies Array Import & Empty Array Protection (F-02)
    {
      const { chrome } = setupMockChromeEnvironment();
      const storage = new VaultStorage(chrome.storage.local);

      // Object with cookies array
      const objWithCookiesJson = JSON.stringify({
        cookies: [{ name: 'muse_jwt', value: 'jwt_payload', domain: '.muse.ai', path: '/' }]
      });

      const importResult1 = await storage.importVaultJson(objWithCookiesJson);
      assert.equal(importResult1.importedCount, 1);

      // Empty array should import 0 accounts
      const importResultEmpty = await storage.importVaultJson('[]');
      assert.equal(importResultEmpty.importedCount, 0, 'Empty cookie array must report 0 imported');

      // Empty accounts object should import 0 accounts
      const importResultEmptyObj = await storage.importVaultJson('{"accounts": {}}');
      assert.equal(importResultEmptyObj.importedCount, 0, 'Empty accounts object must report 0 imported');
    }

    console.log('  ✔ TS-08: Remediation Verifications (Active Deletion Sync & Cookie Import) passed.');
  });

  console.log('\n======================================================');
  console.log('🎉 ALL 8 TEST SUITES PASSED WITH 0 FAILURES!');
  console.log('======================================================\n');
});
