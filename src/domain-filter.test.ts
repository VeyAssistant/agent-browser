import { describe, it, expect } from 'vitest';
import { isDomainAllowed, parseDomainList, buildWebSocketFilterScript } from './domain-filter.js';

describe('domain-filter', () => {
  describe('isDomainAllowed', () => {
    it('should match exact domains', () => {
      expect(isDomainAllowed('example.com', ['example.com'])).toBe(true);
      expect(isDomainAllowed('github.com', ['github.com'])).toBe(true);
    });

    it('should reject non-matching domains', () => {
      expect(isDomainAllowed('evil.com', ['example.com'])).toBe(false);
      expect(isDomainAllowed('notexample.com', ['example.com'])).toBe(false);
    });

    it('should match wildcard patterns', () => {
      expect(isDomainAllowed('sub.example.com', ['*.example.com'])).toBe(true);
      expect(isDomainAllowed('deep.sub.example.com', ['*.example.com'])).toBe(true);
    });

    it('should match bare domain against wildcard pattern', () => {
      expect(isDomainAllowed('example.com', ['*.example.com'])).toBe(true);
    });

    it('should reject non-matching wildcard patterns', () => {
      expect(isDomainAllowed('example.org', ['*.example.com'])).toBe(false);
      expect(isDomainAllowed('evil.com', ['*.example.com'])).toBe(false);
    });

    it('should return false for empty allowlist', () => {
      expect(isDomainAllowed('example.com', [])).toBe(false);
    });

    it('should match against multiple patterns', () => {
      const patterns = ['example.com', '*.github.com', 'vercel.app'];
      expect(isDomainAllowed('example.com', patterns)).toBe(true);
      expect(isDomainAllowed('api.github.com', patterns)).toBe(true);
      expect(isDomainAllowed('vercel.app', patterns)).toBe(true);
      expect(isDomainAllowed('evil.com', patterns)).toBe(false);
    });

    it('should not partially match domain suffixes without wildcard', () => {
      expect(isDomainAllowed('sub.example.com', ['example.com'])).toBe(false);
    });
  });

  describe('parseDomainList', () => {
    it('should split comma-separated domains', () => {
      expect(parseDomainList('a.com,b.com')).toEqual(['a.com', 'b.com']);
    });

    it('should trim whitespace', () => {
      expect(parseDomainList(' a.com , b.com ')).toEqual(['a.com', 'b.com']);
    });

    it('should lowercase domains', () => {
      expect(parseDomainList('Example.COM,GitHub.Com')).toEqual(['example.com', 'github.com']);
    });

    it('should filter empty entries', () => {
      expect(parseDomainList('a.com,,b.com,')).toEqual(['a.com', 'b.com']);
    });

    it('should handle empty string', () => {
      expect(parseDomainList('')).toEqual([]);
    });

    it('should preserve wildcard prefixes', () => {
      expect(parseDomainList('*.example.com')).toEqual(['*.example.com']);
    });
  });

  describe('buildWebSocketFilterScript', () => {
    it('should produce a valid JavaScript IIFE', () => {
      const script = buildWebSocketFilterScript(['example.com', '*.github.com']);
      expect(script).toContain('_allowedDomains');
      expect(script).toContain('"example.com"');
      expect(script).toContain('"*.github.com"');
    });

    it('should embed the domain list as JSON', () => {
      const script = buildWebSocketFilterScript(['a.com']);
      expect(script).toContain('["a.com"]');
    });

    it('should include WebSocket, EventSource, and sendBeacon patches', () => {
      const script = buildWebSocketFilterScript(['a.com']);
      expect(script).toContain('WebSocket');
      expect(script).toContain('EventSource');
      expect(script).toContain('SecurityError');
      expect(script).toContain('sendBeacon');
    });

    it('should handle empty allowlist', () => {
      const script = buildWebSocketFilterScript([]);
      expect(script).toContain('[]');
    });

    it('should include domain matching logic consistent with isDomainAllowed', () => {
      const script = buildWebSocketFilterScript(['*.example.com']);
      expect(script).toContain('_isDomainAllowed');
      expect(script).toContain('slice(1)');
      expect(script).toContain('slice(2)');
    });
  });
});

  describe('isDomainAllowed – case sensitivity', () => {
    it('should match uppercase hostname against lowercase pattern', () => {
      // isDomainAllowed normalises the hostname to lowercase before comparing,
      // mirroring the in-browser WebSocket filter script behaviour.
      expect(isDomainAllowed('EXAMPLE.COM', ['example.com'])).toBe(true);
      expect(isDomainAllowed('Example.Com', ['example.com'])).toBe(true);
    });

    it('should match when both sides are consistently cased', () => {
      expect(isDomainAllowed('example.com', ['example.com'])).toBe(true);
      expect(isDomainAllowed('EXAMPLE.COM', ['example.com'])).toBe(true);
    });

    it('should not partial-suffix-match with wildcard', () => {
      // "evilexample.com" must not match "*.example.com"
      expect(isDomainAllowed('evilexample.com', ['*.example.com'])).toBe(false);
    });

    it('should not match when wildcard suffix appears mid-string', () => {
      // "a.example.com.evil.com" should not match "*.example.com"
      expect(isDomainAllowed('a.example.com.evil.com', ['*.example.com'])).toBe(false);
    });
  });

  describe('parseDomainList – edge cases', () => {
    it('should handle single domain without comma', () => {
      expect(parseDomainList('example.com')).toEqual(['example.com']);
    });

    it('should handle whitespace-only string', () => {
      expect(parseDomainList('   ')).toEqual([]);
    });

    it('should handle mixed tabs and spaces', () => {
      expect(parseDomainList('a.com\t,\tb.com')).toEqual(['a.com', 'b.com']);
    });

    it('should preserve wildcard casing only in prefix position', () => {
      // wildcard prefix lowercased along with the rest
      expect(parseDomainList('*.EXAMPLE.COM')).toEqual(['*.example.com']);
    });

    it('should handle trailing comma', () => {
      expect(parseDomainList('a.com,')).toEqual(['a.com']);
    });

    it('should handle leading comma', () => {
      expect(parseDomainList(',a.com')).toEqual(['a.com']);
    });
  });

  describe('buildWebSocketFilterScript – correctness properties', () => {
    it('should start with IIFE wrapper', () => {
      const script = buildWebSocketFilterScript(['a.com']);
      expect(script.trimStart()).toMatch(/^\(function\(\)/);
    });

    it('should end with IIFE invocation', () => {
      const script = buildWebSocketFilterScript(['a.com']);
      expect(script.trimEnd()).toMatch(/\}\)\(\);$/);
    });

    it('should patch navigator.sendBeacon', () => {
      const script = buildWebSocketFilterScript(['a.com']);
      expect(script).toContain('navigator.sendBeacon');
    });

    it('should preserve WebSocket static constants', () => {
      const script = buildWebSocketFilterScript(['a.com']);
      expect(script).toContain('WebSocket.CONNECTING');
      expect(script).toContain('WebSocket.OPEN');
      expect(script).toContain('WebSocket.CLOSING');
      expect(script).toContain('WebSocket.CLOSED');
    });

    it('should preserve EventSource static constants', () => {
      const script = buildWebSocketFilterScript(['a.com']);
      expect(script).toContain('EventSource.CONNECTING');
      expect(script).toContain('EventSource.OPEN');
      expect(script).toContain('EventSource.CLOSED');
    });

    it('should use DOMException with SecurityError for WebSocket block', () => {
      const script = buildWebSocketFilterScript(['a.com']);
      // The script throws a DOMException to match the spec-defined error
      // that browsers emit when a WebSocket connection is refused.
      expect(script).toContain('DOMException');
      expect(script).toContain('SecurityError');
    });

    it('should return false (not throw) for blocked sendBeacon', () => {
      const script = buildWebSocketFilterScript(['a.com']);
      // sendBeacon should return false, not throw, to match spec behaviour
      expect(script).toContain('return false');
    });

    it('should properly JSON-encode domains with special characters', () => {
      // Domains should be safely embedded as JSON strings
      const domains = ['xn--nxasmq6b.com', 'münchen.de'];
      const script = buildWebSocketFilterScript(domains);
      const embedded = JSON.stringify(domains);
      expect(script).toContain(embedded);
    });
  });
