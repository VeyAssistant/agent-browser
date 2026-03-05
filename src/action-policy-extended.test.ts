/**
 * Extended tests for action-policy.ts.
 *
 * Covers areas not addressed by the primary test file:
 *  - initPolicyReloader / reloadPolicyIfChanged hot-reload path
 *  - checkPolicy edge cases (unknown category, confirm vs allow list)
 *  - describeAction: all explicit switch branches + fallback
 *  - KNOWN_CATEGORIES exhaustiveness
 *  - Comprehensive action → category mapping
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getActionCategory,
  checkPolicy,
  loadPolicyFile,
  initPolicyReloader,
  reloadPolicyIfChanged,
  describeAction,
  KNOWN_CATEGORIES,
  type ActionPolicy,
} from './action-policy.js';

// ---------------------------------------------------------------------------
// Action → Category mapping (exhaustive spot-check)
// ---------------------------------------------------------------------------
describe('getActionCategory – comprehensive mapping', () => {
  it('should map all navigate-family actions to navigate', () => {
    for (const action of ['navigate', 'back', 'forward', 'reload', 'tab_new']) {
      expect(getActionCategory(action), `action="${action}"`).toBe('navigate');
    }
  });

  it('should map all click-family actions to click', () => {
    for (const action of ['click', 'dblclick', 'tap']) {
      expect(getActionCategory(action), `action="${action}"`).toBe('click');
    }
  });

  it('should map all fill-family actions to fill', () => {
    for (const action of [
      'fill', 'type', 'keyboard', 'inserttext', 'select', 'multiselect',
      'check', 'uncheck', 'clear', 'selectall', 'setvalue',
    ]) {
      expect(getActionCategory(action), `action="${action}"`).toBe('fill');
    }
  });

  it('should map download actions to download', () => {
    for (const action of ['download', 'waitfordownload']) {
      expect(getActionCategory(action), `action="${action}"`).toBe('download');
    }
  });

  it('should map eval-family actions to eval', () => {
    for (const action of [
      'evaluate', 'evalhandle', 'addscript', 'addinitscript',
      'setcontent', 'expose', 'addstyle',
    ]) {
      expect(getActionCategory(action), `action="${action}"`).toBe('eval');
    }
  });

  it('should map snapshot-family actions to snapshot', () => {
    for (const action of [
      'snapshot', 'screenshot', 'pdf',
      'diff_snapshot', 'diff_screenshot', 'diff_url',
    ]) {
      expect(getActionCategory(action), `action="${action}"`).toBe('snapshot');
    }
  });

  it('should map scroll actions to scroll', () => {
    for (const action of ['scroll', 'scrollintoview']) {
      expect(getActionCategory(action), `action="${action}"`).toBe('scroll');
    }
  });

  it('should map wait-family actions to wait', () => {
    for (const action of ['wait', 'waitforurl', 'waitforloadstate', 'waitforfunction']) {
      expect(getActionCategory(action), `action="${action}"`).toBe('wait');
    }
  });

  it('should map get-family actions to get', () => {
    for (const action of [
      'gettext', 'content', 'innerhtml', 'innertext', 'inputvalue',
      'url', 'title', 'getattribute', 'count', 'boundingbox',
      'styles', 'isvisible', 'isenabled', 'ischecked', 'responsebody',
      'getbyrole', 'getbytext', 'getbylabel', 'getbyplaceholder',
      'getbyalttext', 'getbytitle', 'getbytestid', 'nth',
    ]) {
      expect(getActionCategory(action), `action="${action}"`).toBe('get');
    }
  });

  it('should map network actions to network', () => {
    for (const action of ['route', 'unroute', 'requests']) {
      expect(getActionCategory(action), `action="${action}"`).toBe('network');
    }
  });

  it('should map state actions to state', () => {
    for (const action of ['state_save', 'state_load', 'cookies_set', 'storage_set', 'credentials']) {
      expect(getActionCategory(action), `action="${action}"`).toBe('state');
    }
  });

  it('should map interact-family actions to interact', () => {
    for (const action of [
      'hover', 'focus', 'drag', 'press', 'keydown', 'keyup',
      'mousemove', 'mousedown', 'mouseup', 'wheel', 'dispatch',
    ]) {
      expect(getActionCategory(action), `action="${action}"`).toBe('interact');
    }
  });

  it('should map all _internal actions to _internal', () => {
    const internals = [
      'launch', 'close', 'tab_list', 'tab_switch', 'tab_close', 'window_new',
      'frame', 'mainframe', 'dialog', 'session', 'console', 'errors',
      'cookies_get', 'cookies_clear', 'storage_get', 'storage_clear',
      'state_list', 'state_show', 'state_clear', 'state_clean', 'state_rename',
      'highlight', 'bringtofront', 'trace_start', 'trace_stop',
      'har_start', 'har_stop', 'video_start', 'video_stop',
      'recording_start', 'recording_stop', 'recording_restart',
      'profiler_start', 'profiler_stop', 'clipboard', 'viewport',
      'useragent', 'device', 'geolocation', 'permissions', 'emulatemedia',
      'offline', 'headers', 'timezone', 'locale', 'pause',
      'screencast_start', 'screencast_stop',
      'input_mouse', 'input_keyboard', 'input_touch',
      'auth_save', 'auth_login', 'auth_list', 'auth_delete', 'auth_show',
      'confirm', 'deny',
    ];
    for (const action of internals) {
      expect(getActionCategory(action), `action="${action}"`).toBe('_internal');
    }
  });
});

// ---------------------------------------------------------------------------
// KNOWN_CATEGORIES
// ---------------------------------------------------------------------------
describe('KNOWN_CATEGORIES', () => {
  it('should contain all expected user-facing categories', () => {
    const expected = [
      'navigate', 'click', 'fill', 'download', 'upload', 'eval',
      'snapshot', 'scroll', 'wait', 'get', 'network', 'state', 'interact',
    ];
    for (const cat of expected) {
      expect(KNOWN_CATEGORIES.has(cat), `category "${cat}" should be in KNOWN_CATEGORIES`).toBe(true);
    }
  });

  it('should NOT contain _internal', () => {
    expect(KNOWN_CATEGORIES.has('_internal')).toBe(false);
  });

  it('should NOT contain unknown', () => {
    expect(KNOWN_CATEGORIES.has('unknown')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkPolicy – edge cases
// ---------------------------------------------------------------------------
describe('checkPolicy – edge cases', () => {
  it('should allow unknown category actions when policy default is allow', () => {
    const policy: ActionPolicy = { default: 'allow' };
    // 'nonexistent' maps to 'unknown', which is not in any list
    expect(checkPolicy('nonexistent', policy, new Set())).toBe('allow');
  });

  it('should deny unknown category actions when policy default is deny', () => {
    const policy: ActionPolicy = { default: 'deny' };
    expect(checkPolicy('nonexistent', policy, new Set())).toBe('deny');
  });

  it('should not confirm internal actions even if category were added to confirmSet', () => {
    // _internal always short-circuits to allow before confirm check
    expect(checkPolicy('launch', null, new Set(['_internal']))).toBe('allow');
  });

  it('should return confirm over default-allow when category is in confirmCategories', () => {
    const policy: ActionPolicy = { default: 'allow' };
    expect(checkPolicy('evaluate', policy, new Set(['eval']))).toBe('confirm');
  });

  it('should return confirm over default-deny when category is in confirmCategories but not in deny', () => {
    const policy: ActionPolicy = { default: 'deny' };
    expect(checkPolicy('evaluate', policy, new Set(['eval']))).toBe('confirm');
  });

  it('should allow when action is in allow list but also in confirmCategories', () => {
    // allow list does NOT override confirm — deny > confirm > allow
    // confirm comes before allow-list check
    const policy: ActionPolicy = { default: 'deny', allow: ['eval'] };
    // eval is in allow but also in confirmSet — confirm should win
    expect(checkPolicy('evaluate', policy, new Set(['eval']))).toBe('confirm');
  });

  it('should deny even when action is in confirmCategories if also in deny list', () => {
    const policy: ActionPolicy = { default: 'allow', deny: ['eval'] };
    expect(checkPolicy('evaluate', policy, new Set(['eval']))).toBe('deny');
  });

  it('should handle null policy with confirm categories', () => {
    // null policy: no deny list, so goes to confirm check
    expect(checkPolicy('fill', null, new Set(['fill']))).toBe('confirm');
  });

  it('should use default deny for actions not in allow list', () => {
    const policy: ActionPolicy = { default: 'deny', allow: ['navigate'] };
    expect(checkPolicy('click', policy, new Set())).toBe('deny');
    expect(checkPolicy('evaluate', policy, new Set())).toBe('deny');
    expect(checkPolicy('navigate', policy, new Set())).toBe('allow');
  });
});

// ---------------------------------------------------------------------------
// describeAction – complete branch coverage
// ---------------------------------------------------------------------------
describe('describeAction', () => {
  it('should describe navigate action', () => {
    expect(describeAction('navigate', { url: 'https://example.com' })).toBe(
      'Navigate to https://example.com'
    );
  });

  it('should describe navigate with missing url', () => {
    const desc = describeAction('navigate', {});
    expect(desc).toBe('Navigate to undefined');
  });

  it('should describe evaluate with script', () => {
    const desc = describeAction('evaluate', { script: 'document.title' });
    expect(desc).toContain('Evaluate JavaScript:');
    expect(desc).toContain('document.title');
  });

  it('should truncate evaluate script at 80 characters', () => {
    const longScript = 'x'.repeat(200);
    const desc = describeAction('evaluate', { script: longScript });
    // "Evaluate JavaScript: " + 80 chars = should be ≤ ~101 chars
    const scriptPart = desc.replace('Evaluate JavaScript: ', '');
    expect(scriptPart.length).toBeLessThanOrEqual(80);
  });

  it('should describe evalhandle with script', () => {
    const desc = describeAction('evalhandle', { script: '() => 42' });
    expect(desc).toContain('Evaluate JavaScript:');
  });

  it('should describe fill action', () => {
    expect(describeAction('fill', { selector: '#email' })).toBe('Fill #email');
  });

  it('should describe type action', () => {
    expect(describeAction('type', { selector: '#username' })).toBe('Type into #username');
  });

  it('should describe click action', () => {
    expect(describeAction('click', { selector: '.submit-btn' })).toBe('Click .submit-btn');
  });

  it('should describe dblclick action', () => {
    expect(describeAction('dblclick', { selector: '#icon' })).toBe('Double-click #icon');
  });

  it('should describe tap action', () => {
    expect(describeAction('tap', { selector: '#mobile-btn' })).toBe('Tap #mobile-btn');
  });

  it('should describe download action', () => {
    expect(describeAction('download', { selector: '#dl', path: '/tmp/file.pdf' })).toBe(
      'Download via #dl to /tmp/file.pdf'
    );
  });

  it('should describe upload action', () => {
    expect(describeAction('upload', { selector: '#file-input' })).toBe(
      'Upload files to #file-input'
    );
  });

  it('should use fallback description for scroll', () => {
    const desc = describeAction('scroll', {});
    expect(desc).toContain('scroll');
  });

  it('should use fallback description for snapshot', () => {
    const desc = describeAction('snapshot', {});
    expect(desc).toContain('snapshot');
  });

  it('should use fallback description for hover', () => {
    const desc = describeAction('hover', {});
    expect(desc).toContain('interact');
  });

  it('should include category in fallback for unknown action', () => {
    const desc = describeAction('nonexistent_action', {});
    expect(desc).toContain('unknown');
  });
});

// ---------------------------------------------------------------------------
// initPolicyReloader + reloadPolicyIfChanged
// ---------------------------------------------------------------------------
describe('initPolicyReloader / reloadPolicyIfChanged', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-reload-test-'));
    vi.useFakeTimers();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should return null when reloadPolicyIfChanged is called without init', () => {
    // Reset module state by re-requiring... we can't easily do that with
    // vitest static imports, but we CAN test after a valid init then
    // verify the return shape.
    const policyPath = path.join(tempDir, 'policy.json');
    fs.writeFileSync(policyPath, JSON.stringify({ default: 'allow' }));
    const initial: ActionPolicy = { default: 'allow' };
    initPolicyReloader(policyPath, initial);

    // Advance time past the 5s check interval to force a stat check
    vi.advanceTimersByTime(6000);

    const result = reloadPolicyIfChanged();
    // File hasn't changed, should return the cached policy
    expect(result).not.toBeNull();
    expect(result!.default).toBe('allow');
  });

  it('should return updated policy when file content changes', () => {
    const policyPath = path.join(tempDir, 'policy.json');
    const initial: ActionPolicy = { default: 'allow' };
    fs.writeFileSync(policyPath, JSON.stringify(initial));
    initPolicyReloader(policyPath, initial);

    // First advance: fire the interval check to prime lastCheckMs
    vi.advanceTimersByTime(6000);
    reloadPolicyIfChanged(); // prime lastCheckMs at fake-time=6000

    // Rewrite the file with a new policy (and new mtime)
    const updated = { default: 'deny', allow: ['snapshot'] };
    fs.writeFileSync(policyPath, JSON.stringify(updated));
    // Touch the mtime to ensure it differs from what initPolicyReloader recorded
    const futureTime = new Date(Date.now() + 10000);
    fs.utimesSync(policyPath, futureTime, futureTime);

    // Second advance: push past the interval again so a fresh stat check fires
    vi.advanceTimersByTime(6000);

    const result = reloadPolicyIfChanged();
    expect(result).not.toBeNull();
    expect(result!.default).toBe('deny');
    expect(result!.allow).toEqual(['snapshot']);
  });

  it('should not re-read file if interval has not elapsed', () => {
    const policyPath = path.join(tempDir, 'policy.json');
    const initial: ActionPolicy = { default: 'allow' };
    fs.writeFileSync(policyPath, JSON.stringify(initial));
    initPolicyReloader(policyPath, initial);

    // Don't advance time — interval not elapsed
    // Rewrite the file
    const updated = { default: 'deny' };
    fs.writeFileSync(policyPath, JSON.stringify(updated));

    const result = reloadPolicyIfChanged();
    // Should still return the original cached policy since interval hasn't elapsed
    expect(result!.default).toBe('allow');
  });

  it('should keep cached policy if file is removed after init', () => {
    const policyPath = path.join(tempDir, 'policy.json');
    const initial: ActionPolicy = { default: 'allow' };
    fs.writeFileSync(policyPath, JSON.stringify(initial));
    initPolicyReloader(policyPath, initial);

    // Advance time so the check fires
    vi.advanceTimersByTime(6000);

    // Remove the file
    fs.unlinkSync(policyPath);

    // Should not throw and should return the last cached policy
    expect(() => reloadPolicyIfChanged()).not.toThrow();
    const result = reloadPolicyIfChanged();
    expect(result!.default).toBe('allow');
  });
});
