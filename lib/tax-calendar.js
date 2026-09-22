// Tax and compliance deadlines for Dialed by H LLC (Delaware LLC, operating
// from Massachusetts, single owner). One list, used by the admin Books tab
// and by the daily reminder email, so the two can never disagree.
//
// Each rule produces concrete dates. `when` is either a fixed month/day that
// recurs yearly, or a list of month/day pairs (the quarterly estimates).
// Dates that fall on a weekend or federal holiday roll to the next business
// day in real life; we keep the nominal date and say so in the note, which
// errs on the side of early.
//
// Sources checked 2026-09-02:
//   IRS estimated tax dates: irs.gov/faqs/estimated-tax
//   Delaware LLC annual tax:  delawareinc.com/blog/june-1-important-deadline-delaware-llcs
//   MA sales tax + annual report: mass.gov DOR; sec.state.ma.us corporations

// 2026-09-22: Henry has an accountant now, so the tax and compliance
// deadlines were removed from this list (and from the reminder email). The
// only entry left is the monthly bookkeeping chore. If the tax entries are
// ever wanted back, they are in git history before this date.
const RULES = [
    {
        key: "books-import",
        title: "Import the Chase statement into Books",
        who: "you",
        when: [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 5]],
        note: "Keeps the register penny-true for the accountant.",
        remind: [0],
        chore: true,
    },
];

function iso(d) { return d.toISOString().slice(0, 10); }

// Every dated occurrence between two dates (inclusive), sorted.
function occurrences(from, to) {
    const out = [];
    const y0 = from.getUTCFullYear(), y1 = to.getUTCFullYear();
    for (const r of RULES) {
        for (let y = y0; y <= y1 + 1; y++) {
            r.when.forEach(([m, d], i) => {
                const date = new Date(Date.UTC(y, m - 1, d));
                if (date < from || date > to) return;
                out.push({
                    key: r.key,
                    date: iso(date),
                    title: r.title,
                    label: r.labels ? r.labels[i] : null,
                    who: r.who,
                    note: r.note,
                    remind: r.remind,
                    placeholder: !!r.placeholder,
                    chore: !!r.chore,
                });
            });
        }
    }
    return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

// What the admin shows: the next 12 months, with days-until from today.
function upcoming(today) {
    const t = today ? new Date(today + "T00:00:00Z") : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    const to = new Date(t.getTime() + 366 * 864e5);
    return occurrences(t, to).map(o => ({
        ...o,
        days: Math.round((new Date(o.date + "T00:00:00Z") - t) / 864e5),
    }));
}

// What the daily cron emails: items whose days-until matches one of the
// rule's reminder offsets exactly, so each deadline nags on a fixed schedule
// and never twice on the same day.
function dueToday(today) {
    return upcoming(today).filter(o => o.remind.includes(o.days));
}

module.exports = { RULES, upcoming, dueToday };
