const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildHealthResponse } = require("../lib/pipeline-health");
const now = Date.parse("2026-10-11T01:00:00Z");
const event = { step: "Messages", last_at: "2026-10-11T00:10:00Z", age_mins: 1, status: "OK", warn_mins: 30, dead_mins: 180 };
const fresh = [{ name: "pipeline_health", refreshed_at: "2026-10-11T00:55:00Z" }, { name: "model_scorecard", refreshed_at: "2026-10-10T20:00:00Z" }];

test("old snapshots cannot report a healthy pipeline", () => {
    const r = buildHealthResponse([event], [], [], [{ name: "pipeline_health", refreshed_at: "2026-09-23T00:00:00Z" }], now);
    assert.equal(r.steps[0].status, "UNKNOWN");
    assert.equal(r.unknown, 1);
    assert.equal(r.freshness.health.stale, true);
});
test("event ages advance even between snapshot refreshes", () => {
    const r = buildHealthResponse([event], [{ model: 'test' }], [], fresh, now);
    assert.equal(r.steps[0].age_mins, 50);
    assert.equal(r.steps[0].status, "STALE");
    assert.equal(r.freshness.scorecard.stale, false);
});
test("backlog thresholds stay independent of event age", () => {
    const r = buildHealthResponse([{ ...event, status: "DEAD", warn_mins: 999999, dead_mins: 999999, volume: 907 }], [], [], fresh, now);
    assert.equal(r.steps[0].status, "DEAD");
});
test("missing or unavailable data is never all clear", () => {
    const r = buildHealthResponse([], [], [], [], now);
    assert.equal(r.freshness.health.stale, true);
    assert.equal(r.freshness.scorecard.stale, true);
});
