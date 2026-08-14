// Unit tests for pure formatting helpers. Run: node --test tests-js/format.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatBytes, formatNumber, formatMs, formatSeconds, formatElapsed,
  shortId, timeAgo, formatClock, formatDateTime, shortNode,
} from "../frontend/js/format.js";

test("formatBytes", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1048576), "1.0 MB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
  assert.equal(formatBytes(null), "—");
  assert.equal(formatBytes(Number.NaN), "—");
});

test("formatNumber", () => {
  assert.equal(formatNumber(1234567), "1,234,567");
  assert.equal(formatNumber(1234.5), "1,235");
  assert.equal(formatNumber(1234.5, 1), "1,234.5");
  assert.equal(formatNumber(null), "—");
});

test("formatMs", () => {
  assert.equal(formatMs(0), "0 ms");
  assert.equal(formatMs(950), "950 ms");
  assert.equal(formatMs(1500), "1.50 s");
  assert.equal(formatMs(65_000), "1m 5.0s");
  assert.equal(formatMs(null), "—");
});

test("formatSeconds", () => {
  assert.equal(formatSeconds(0.25), "250 ms");
  assert.equal(formatSeconds(2.5), "2.50 s");
});

test("formatElapsed", () => {
  const start = new Date(Date.now() - 12_000).toISOString();
  assert.match(formatElapsed(start), /^12s$/);
  const start2 = new Date(Date.now() - 3 * 60_000).toISOString();
  assert.match(formatElapsed(start2), /^3m 00s$/);
  assert.equal(formatElapsed(null), "—");
});

test("shortId", () => {
  assert.equal(shortId("abcdefgh1234"), "abcdefgh");
  assert.equal(shortId(null), "—");
});

test("timeAgo", () => {
  assert.equal(timeAgo(new Date().toISOString()), "just now");
  assert.match(timeAgo(new Date(Date.now() - 90_000).toISOString()), /^1m ago$/);
  assert.equal(timeAgo(null), "—");
});

test("formatClock / formatDateTime", () => {
  // Local-time construction to stay timezone-independent.
  const d = new Date(2026, 7, 15, 9, 5, 7);
  assert.equal(formatClock(d.getTime()), "09:05:07");
  assert.equal(formatDateTime(d.toISOString()), "2026-08-15 09:05");
  assert.equal(formatClock(null), "—");
});

test("shortNode", () => {
  assert.equal(shortNode("node:abc123"), "abc123");
  assert.equal(shortNode("node:abcdefghijklmnop"), "abcdefghij");
  assert.equal(shortNode(null), "worker-?");
});