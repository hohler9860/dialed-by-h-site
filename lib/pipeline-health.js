// Snapshot freshness is separate from the age of the events inside it.
const MAX_AGE_MINUTES = { pipeline_health: 20, model_scorecard: 8 * 60 };

function snapshotFreshness(records, name, now = Date.now()) {
    const row = (records || []).find((r) => r.name === name);
    const time = Date.parse(row?.refreshed_at);
    const age = Number.isFinite(time) ? (now - time) / 60000 : null;
    return {
        refreshed_at: row?.refreshed_at || null,
        age_mins: age === null ? null : Math.max(0, Math.round(age)),
        stale: age === null || age < -1 || age > MAX_AGE_MINUTES[name],
    };
}

function buildHealthResponse(rows, scorecard, errors, records, now = Date.now()) {
    const health = snapshotFreshness(records, "pipeline_health", now);
    const model = snapshotFreshness(records, "model_scorecard", now);
    const list = (Array.isArray(rows) ? rows : []).map((row) => {
        const s = { ...row };
        const time = Date.parse(s.last_at);
        s.age_mins = Number.isFinite(time) ? Math.max(0, Math.round((now - time) / 60000)) : null;
        if (health.stale) s.status = "UNKNOWN";
        // Backlog rows use volume thresholds; only event rows age over time.
        else if (s.warn_mins < 999999) {
            s.status = s.age_mins === null || s.age_mins > s.dead_mins ? "DEAD"
                : s.age_mins > s.warn_mins ? "STALE" : "OK";
        }
        return s;
    });
    return {
        steps: list,
        scorecard: Array.isArray(scorecard) ? scorecard : [],
        errors: Array.isArray(errors) ? errors : [],
        dead: list.filter((s) => s.status === "DEAD").length,
        stale: list.filter((s) => s.status === "STALE").length,
        unknown: list.filter((s) => s.status === "UNKNOWN").length,
        freshness: {
            health: { ...health, stale: health.stale || !list.length },
            scorecard: { ...model, stale: model.stale || !Array.isArray(scorecard) || !scorecard.length },
        },
        checked_at: new Date(now).toISOString(),
    };
}

module.exports = { snapshotFreshness, buildHealthResponse };
