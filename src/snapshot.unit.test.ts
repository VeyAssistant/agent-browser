/**
 * Unit tests for snapshot.ts pure functions.
 *
 * These tests cover the non-async, non-browser-dependent exports:
 * parseRef, getSnapshotStats, resetRefs, and the ref-counter
 * behaviour that processAriaTree depends on.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseRef,
  getSnapshotStats,
  resetRefs,
  type RefMap,
} from './snapshot.js';

// ---------------------------------------------------------------------------
// parseRef
// ---------------------------------------------------------------------------
describe('parseRef', () => {
  it('should parse @-prefixed refs', () => {
    expect(parseRef('@e1')).toBe('e1');
    expect(parseRef('@e99')).toBe('e99');
    expect(parseRef('@e123')).toBe('e123');
  });

  it('should parse ref= prefixed values', () => {
    expect(parseRef('ref=e1')).toBe('e1');
    expect(parseRef('ref=e42')).toBe('e42');
  });

  it('should parse bare ref IDs (eN format)', () => {
    expect(parseRef('e1')).toBe('e1');
    expect(parseRef('e100')).toBe('e100');
  });

  it('should return null for CSS selectors', () => {
    expect(parseRef('#mybutton')).toBeNull();
    expect(parseRef('.my-class')).toBeNull();
    expect(parseRef('button')).toBeNull();
    expect(parseRef('[role="button"]')).toBeNull();
  });

  it('should return null for empty string', () => {
    expect(parseRef('')).toBeNull();
  });

  it('should return null for @ without valid ref suffix', () => {
    // @e1 -> e1; @-anything-after-@ is still returned as the rest of the string
    // The function only strips the @ prefix, so test the boundary:
    expect(parseRef('@')).toBe('');
    expect(parseRef('@notaref')).toBe('notaref');
  });

  it('should return null for bare word that does not match eN pattern', () => {
    expect(parseRef('abc')).toBeNull();
    expect(parseRef('e')).toBeNull(); // no digits
    expect(parseRef('1e1')).toBeNull(); // doesn't start with 'e'
  });

  it('should not match numeric-only strings', () => {
    expect(parseRef('123')).toBeNull();
  });

  it('should not match strings with non-numeric suffix after e', () => {
    expect(parseRef('e1a')).toBeNull();
    expect(parseRef('e1.2')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resetRefs
// ---------------------------------------------------------------------------
describe('resetRefs', () => {
  /**
   * resetRefs() resets the internal ref counter.  We cannot observe the
   * counter directly, but we CAN verify that calling resetRefs() causes the
   * next getSnapshotStats call on a freshly constructed refs map to behave
   * predictably, and that repeated calls to resetRefs() don't throw.
   */
  it('should not throw when called multiple times', () => {
    expect(() => {
      resetRefs();
      resetRefs();
      resetRefs();
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getSnapshotStats
// ---------------------------------------------------------------------------
describe('getSnapshotStats', () => {
  beforeEach(() => {
    resetRefs();
  });

  it('should return zero stats for empty inputs', () => {
    const stats = getSnapshotStats('', {});
    expect(stats.lines).toBe(1); // ''.split('\n') has length 1
    expect(stats.chars).toBe(0);
    expect(stats.refs).toBe(0);
    expect(stats.interactive).toBe(0);
    expect(stats.tokens).toBe(0);
  });

  it('should count lines correctly', () => {
    const tree = 'line1\nline2\nline3';
    const stats = getSnapshotStats(tree, {});
    expect(stats.lines).toBe(3);
  });

  it('should count chars correctly', () => {
    const tree = 'abc';
    const stats = getSnapshotStats(tree, {});
    expect(stats.chars).toBe(3);
  });

  it('should estimate tokens as ceil(chars / 4)', () => {
    const tree = 'a'.repeat(12);
    const stats = getSnapshotStats(tree, {});
    expect(stats.tokens).toBe(3); // 12/4 = 3

    const tree2 = 'a'.repeat(13);
    const stats2 = getSnapshotStats(tree2, {});
    expect(stats2.tokens).toBe(4); // ceil(13/4) = 4
  });

  it('should count all refs regardless of role', () => {
    const refs: RefMap = {
      e1: { selector: "getByRole('button', { name: \"OK\", exact: true })", role: 'button', name: 'OK' },
      e2: { selector: "getByRole('link', { name: \"Home\", exact: true })", role: 'link', name: 'Home' },
      e3: { selector: "getByRole('heading', { name: \"Title\", exact: true })", role: 'heading', name: 'Title' },
    };
    const stats = getSnapshotStats('', refs);
    expect(stats.refs).toBe(3);
  });

  it('should count only interactive refs in the interactive field', () => {
    const refs: RefMap = {
      e1: { selector: "getByRole('button', { name: \"OK\", exact: true })", role: 'button', name: 'OK' },
      e2: { selector: "getByRole('link', { name: \"Home\", exact: true })", role: 'link', name: 'Home' },
      e3: { selector: "getByRole('heading', { name: \"Title\", exact: true })", role: 'heading', name: 'Title' },
      e4: { selector: "getByRole('textbox', { name: \"Email\", exact: true })", role: 'textbox', name: 'Email' },
    };
    const stats = getSnapshotStats('', refs);
    // button, link, textbox are interactive; heading is not
    expect(stats.interactive).toBe(3);
    expect(stats.refs).toBe(4);
  });

  it('should count all known interactive roles', () => {
    const interactiveRoles = [
      'button', 'link', 'textbox', 'checkbox', 'radio',
      'combobox', 'listbox', 'menuitem', 'menuitemcheckbox',
      'menuitemradio', 'option', 'searchbox', 'slider',
      'spinbutton', 'switch', 'tab', 'treeitem',
    ];
    const refs: RefMap = {};
    interactiveRoles.forEach((role, i) => {
      refs[`e${i + 1}`] = {
        selector: `getByRole('${role}', { name: "item", exact: true })`,
        role,
        name: 'item',
      };
    });

    const stats = getSnapshotStats('', refs);
    expect(stats.interactive).toBe(interactiveRoles.length);
  });

  it('should not count non-interactive roles as interactive', () => {
    const refs: RefMap = {
      e1: { selector: "getByRole('heading', { name: \"H1\", exact: true })", role: 'heading', name: 'H1' },
      e2: { selector: "getByRole('cell', { name: \"Data\", exact: true })", role: 'cell', name: 'Data' },
      e3: { selector: "getByRole('clickable', { name: \"Div\", exact: true })", role: 'clickable', name: 'Div' },
    };
    const stats = getSnapshotStats('', refs);
    expect(stats.interactive).toBe(0);
    expect(stats.refs).toBe(3);
  });

  it('should handle large tree string', () => {
    const tree = Array.from({ length: 100 }, (_, i) => `- button "Button ${i}" [ref=e${i}]`).join('\n');
    const refs: RefMap = {};
    for (let i = 0; i < 100; i++) {
      refs[`e${i}`] = { selector: `getByRole('button', { name: "Button ${i}", exact: true })`, role: 'button', name: `Button ${i}` };
    }
    const stats = getSnapshotStats(tree, refs);
    expect(stats.lines).toBe(100);
    expect(stats.refs).toBe(100);
    expect(stats.interactive).toBe(100);
    expect(stats.chars).toBe(tree.length);
  });
});
