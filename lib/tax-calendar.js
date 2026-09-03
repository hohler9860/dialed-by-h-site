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

const RULES = [
    {
        key: "fed-est",
        title: "Federal estimated tax payment",
        who: "IRS, Form 1040-ES",
        when: [[4, 15], [6, 15], [9, 15], [1, 15]],
        labels: ["Q1", "Q2", "Q3", "Q4 (for the prior year)"],
        note: "Owed if you expect to owe $1,000+ for the year. Pay at irs.gov/payments. Missing it costs interest, not a fine, but it adds up.",
        remind: [30, 14, 7, 1],
    },
    {
        key: "ma-est",
        title: "Massachusetts estimated tax payment",
        who: "Mass DOR, Form 1-ES",
        when: [[4, 15], [6, 15], [9, 15], [1, 15]],
        labels: ["Q1", "Q2", "Q3", "Q4 (for the prior year)"],
        note: "Same dates as federal. Pay through MassTaxConnect. Owed if you expect to owe $400+ to MA for the year.",
        remind: [14, 7, 1],
    },
    {
        key: "fed-1040",
        title: "Federal income tax return (1040 + Schedule C)",
        who: "IRS",
        when: [[4, 15]],
        note: "Single-member LLC files on your personal return. Extension to Oct 15 is automatic with Form 4868, but tax owed is still due Apr 15. If the LLC ever has a second member, this becomes Form 1065 due Mar 15.",
        remind: [45, 30, 14, 7, 1],
    },
    {
        key: "ma-1",
        title: "Massachusetts income tax return (Form 1)",
        who: "Mass DOR",
        when: [[4, 15]],
        note: "Same day as federal. File through MassTaxConnect or with your preparer.",
        remind: [30, 14, 7, 1],
    },
    {
        key: "de-llc",
        title: "Delaware LLC annual tax, $300",
        who: "Delaware Division of Corporations",
        when: [[6, 1]],
        note: "Flat $300, no return to file. Pay at corp.delaware.gov. Miss it and Delaware adds a $200 penalty plus 1.5% a month, and the LLC loses good standing.",
        remind: [30, 14, 7, 1],
    },
    {
        key: "1099",
        title: "Send 1099-NEC forms to contractors",
        who: "IRS",
        when: [[1, 31]],
        note: "Anyone you paid $600+ in the year for services who is not a corporation (editors, photographers, runners). Copy to them and to the IRS by Jan 31. Skip if nobody qualifies.",
        remind: [21, 7, 1],
    },
    {
        key: "ma-sales-q",
        title: "Massachusetts sales tax return",
        who: "Mass DOR, MassTaxConnect",
        when: [[1, 20], [4, 20], [7, 20], [10, 20]],
        labels: ["Q4 (Oct–Dec)", "Q1 (Jan–Mar)", "Q2 (Apr–Jun)", "Q3 (Jul–Sep)"],
        note: "6.25% on watches sold to Massachusetts buyers who are not dealers. Dealer sales need a resale certificate on file (Form ST-4). DOR sets your filing frequency; quarterly is assumed here until you register and are told otherwise. If you are not yet registered for sales tax in MA, that is the first thing to sort out.",
        remind: [14, 7, 1],
    },
    {
        key: "ma-annual",
        title: "Massachusetts foreign LLC annual report, $520",
        who: "MA Secretary of the Commonwealth",
        when: [[3, 31]],
        note: "A Delaware LLC doing business from Massachusetts is meant to register as a foreign LLC and then file an annual report by the end of its registration anniversary month. The date here is a placeholder until you confirm the registration month. If you never registered in MA, talk to your accountant before this comes up.",
        remind: [30, 7],
        placeholder: true,
    },
    {
        key: "books-import",
        title: "Import the Chase statement into Books",
        who: "you",
        when: [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 5]],
        note: "Keeps the register penny-true so every deadline above is filed from real numbers, not guesses.",
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
