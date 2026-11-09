import test from 'node:test'; import assert from 'node:assert/strict';
import { calcRefund, instalmentStatus, reminderOffset, riskScore, ageBucket, reminderText } from '../src/rules.js';
test('refund pro-rata, admin fee capped, 10-day payout', () => {
  const r = calcRefund({ totalFee: 120000, paid: 60000, joinDate: '2026-07-10', leaveDate: '2026-10-08' });
  assert.equal(r.daysUsed, 90); assert.equal(r.consumed, 29589); assert.equal(r.admin, 5000);
  assert.equal(r.refund, 25411); assert.equal(r.payBy.toISOString().slice(0, 10), '2026-10-18');
});
test('refund never negative; shows amount still owed', () => {
  const r = calcRefund({ totalFee: 120000, paid: 10000, joinDate: '2026-07-10', leaveDate: '2026-12-01' });
  assert.equal(r.refund, 0); assert.ok(r.stillOwed > 0);
});
test('refund rejects leave before join', () => assert.throws(() => calcRefund({ totalFee: 1, paid: 1, joinDate: '2026-07-10', leaveDate: '2026-07-01' })));
test('status: sample data', () => {
  assert.equal(instalmentStatus({ dueDate: '2026-10-10', amount: 30000, paid: 30000 }, new Date('2026-11-09')).status, 'paid');
  assert.equal(instalmentStatus({ dueDate: '2026-10-10', amount: 30000, paid: 15000 }, new Date('2026-11-02')).daysOverdue, 23);
  assert.equal(instalmentStatus({ dueDate: '2026-11-15', amount: 40000, paid: 0 }, new Date('2026-11-02')).daysToDue, 13);
});
test('reminders fire on schedule and stop on payment', () => {
  const i = { dueDate: '2026-11-15', amount: 100, paid: 0 };
  assert.equal(reminderOffset(i, new Date('2026-11-12')), -3); assert.equal(reminderOffset(i, new Date('2026-11-15')), 0);
  assert.equal(reminderOffset(i, new Date('2026-11-13')), null);
  assert.equal(reminderOffset({ ...i, paid: 100 }, new Date('2026-11-15')), null);
});
test('Hindi and English text', () => {
  assert.match(reminderText('hi', { name: 'A', amount: 5, due: 'x', offset: 0, url: 'u' }), /आज देय/);
  assert.match(reminderText('en', { name: 'A', amount: 5, due: 'x', offset: 3, url: 'u' }), /3 days overdue/);
});
test('risk flag needs combined signals', () => {
  assert.equal(riskScore({ overdueCount: 1, attendance: [90, 88, 85], scores: [70, 70, 68, 69] }).flagged, false);
  assert.equal(riskScore({ overdueCount: 1, attendance: [90, 80, 55], scores: [75, 72, 55, 50] }).flagged, true);
});
test('ageing buckets', () => { assert.equal(ageBucket(0), 'current'); assert.equal(ageBucket(30), 'd1_30'); assert.equal(ageBucket(61), 'd60p'); });
