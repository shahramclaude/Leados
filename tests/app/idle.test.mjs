/**
 * Unit tests: app/core/idle.js — inactivity guard.
 *
 * All time is injected, so idle, warning and lock transitions are
 * deterministic. No real timers are used: the caller drives tick().
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createIdleMonitor } from '../../app/core/idle.js';

let current;
let now;
let advance;

function setup() {
  current = new Date('2026-10-24T10:00:00.000Z');
  now = () => new Date(current);
  advance = (ms) => {
    current = new Date(current.getTime() + ms);
  };
}

test('idle: does not warn or lock before the threshold', () => {
  setup();
  const events = [];
  const m = createIdleMonitor({
    now,
    thresholdMs: 30 * 60 * 1000,
    warnGraceMs: 60 * 1000,
    onWarn: () => events.push('warn'),
    onLock: () => events.push('lock'),
  });
  m.start();
  m.recordActivity();
  advance(29 * 60 * 1000);
  m.tick();
  assert.deepEqual(events, []);
  assert.equal(m.warned(), false);
  m.stop();
});

test('idle: warns exactly when the threshold is reached', () => {
  setup();
  const events = [];
  const m = createIdleMonitor({
    now,
    thresholdMs: 30 * 60 * 1000,
    warnGraceMs: 60 * 1000,
    onWarn: () => events.push('warn'),
    onLock: () => events.push('lock'),
  });
  m.recordActivity();
  advance(29 * 60 * 1000);
  m.tick();
  assert.deepEqual(events, []);
  advance(60 * 1000); // 30 minutes idle exactly
  m.tick();
  assert.deepEqual(events, ['warn']);
  assert.equal(m.warned(), true);
  m.stop();
});

test('idle: warns once, does not lock within the grace period', () => {
  setup();
  const events = [];
  const m = createIdleMonitor({
    now,
    thresholdMs: 30 * 60 * 1000,
    warnGraceMs: 60 * 1000,
    onWarn: () => events.push('warn'),
    onLock: () => events.push('lock'),
  });
  m.recordActivity();
  advance(31 * 60 * 1000);
  m.tick();
  assert.deepEqual(events, ['warn']);
  m.tick(); // still warned, no new event
  assert.deepEqual(events, ['warn']);
  advance(59 * 1000); // within grace
  m.tick();
  assert.deepEqual(events, ['warn']);
  assert.equal(m.warned(), true);
  m.stop();
});

test('idle: locks after the grace period elapses without a response', () => {
  setup();
  const events = [];
  const m = createIdleMonitor({
    now,
    thresholdMs: 30 * 60 * 1000,
    warnGraceMs: 60 * 1000,
    onWarn: () => events.push('warn'),
    onLock: () => events.push('lock'),
  });
  m.recordActivity();
  advance(31 * 60 * 1000);
  m.tick();
  advance(70 * 1000); // past the one-minute grace
  m.tick();
  assert.deepEqual(events, ['warn', 'lock']);
  assert.equal(m.warned(), false);
  m.stop();
});

test('idle: any activity after a warning cancels the pending lock', () => {
  setup();
  const events = [];
  const m = createIdleMonitor({
    now,
    thresholdMs: 30 * 60 * 1000,
    warnGraceMs: 60 * 1000,
    onWarn: () => events.push('warn'),
    onLock: () => events.push('lock'),
  });
  m.recordActivity();
  advance(31 * 60 * 1000);
  m.tick();
  assert.deepEqual(events, ['warn']);
  // The user types / moves the mouse: the pending lock is cancelled.
  m.recordActivity();
  advance(2 * 60 * 1000);
  m.tick();
  assert.deepEqual(events, ['warn']); // no lock
  assert.equal(m.warned(), false);
  m.stop();
});

test('idle: typing-like activity resets the clock so the threshold restarts', () => {
  setup();
  const events = [];
  const m = createIdleMonitor({
    now,
    thresholdMs: 5 * 60 * 1000,
    warnGraceMs: 60 * 1000,
    onWarn: () => events.push('warn'),
    onLock: () => events.push('lock'),
  });
  m.recordActivity();
  advance(4 * 60 * 1000);
  m.tick();
  assert.deepEqual(events, []);
  m.recordActivity(); // a keystroke mid-thought
  advance(4 * 60 * 1000);
  m.tick();
  assert.deepEqual(events, []);
  advance(2 * 60 * 1000); // 6 minutes total since the last activity
  m.tick();
  assert.deepEqual(events, ['warn']);
  m.stop();
});

test('idle: tab restored from a long background absence warns immediately', () => {
  setup();
  const events = [];
  const m = createIdleMonitor({
    now,
    thresholdMs: 30 * 60 * 1000,
    warnGraceMs: 60 * 1000,
    onWarn: () => events.push('warn'),
    onLock: () => events.push('lock'),
  });
  m.recordActivity();
  // The tab is hidden for 45 minutes; no tick runs while hidden.
  advance(45 * 60 * 1000);
  // Restoring visibility checks the clock right away.
  m.tick();
  assert.deepEqual(events, ['warn']);
  assert.equal(m.warned(), true);
  m.stop();
});

test('idle: tab restored from a short background absence does not warn', () => {
  setup();
  const events = [];
  const m = createIdleMonitor({
    now,
    thresholdMs: 30 * 60 * 1000,
    warnGraceMs: 60 * 1000,
    onWarn: () => events.push('warn'),
    onLock: () => events.push('lock'),
  });
  m.recordActivity();
  advance(10 * 60 * 1000);
  m.tick();
  assert.deepEqual(events, []);
  m.stop();
});

test('idle: elapsed reports milliseconds since the last activity', () => {
  setup();
  const m = createIdleMonitor({ now });
  m.recordActivity();
  assert.equal(m.elapsed(), 0);
  advance(123 * 1000);
  assert.equal(m.elapsed(), 123 * 1000);
  m.stop();
});

test('idle: stop removes the ability to fire transitions', () => {
  setup();
  const events = [];
  const m = createIdleMonitor({
    now,
    thresholdMs: 30 * 60 * 1000,
    warnGraceMs: 60 * 1000,
    onWarn: () => events.push('warn'),
    onLock: () => events.push('lock'),
  });
  m.recordActivity();
  advance(40 * 60 * 1000);
  m.stop();
  m.tick();
  assert.deepEqual(events, []);
});
