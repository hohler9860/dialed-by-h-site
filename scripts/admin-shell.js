// Shared admin chrome: one nav across every admin section.
//
// The admin password already lives in sessionStorage under a single key, so
// logging in once has always covered every /admin/ page — what was missing was
// a way to move between them. This script normalizes the nav on each page so
// Pieces / Journal / Leads are always one click apart, and highlights whichever
// section you are currently in.
//
// Include AFTER scripts/admin-auth.js and after the nav markup:
//     <script src="/scripts/admin-shell.js"></script>
//
// It rewrites the link group inside `#dashboard nav`, preserving the existing
// #logout-btn so each page keeps its own sign-out wiring.

(function () {
    var SECTIONS = [
        { label: 'Pieces', href: '/admin/pieces/' },
        { label: 'Journal', href: '/admin/journal/' },
        { label: 'Leads', href: '/admin/leads/' },
    ];

    function currentSection() {
        var path = window.location.pathname;
        for (var i = 0; i < SECTIONS.length; i++) {
            // /admin/journal/edit.html should still light up "Journal"
            if (path.indexOf(SECTIONS[i].href) === 0) return SECTIONS[i].href;
        }
        return null;
    }

    function build() {
        var nav = document.querySelector('#dashboard nav');
        if (!nav) return;

        // The link group is the last flex child of the nav; the logo anchor is first.
        var group = nav.querySelector('div:last-child');
        if (!group) return;

        var logout = group.querySelector('#logout-btn');
        var active = currentSection();

        group.innerHTML = '';

        SECTIONS.forEach(function (s) {
            var a = document.createElement('a');
            a.href = s.href;
            a.textContent = s.label;
            a.className = s.href === active
                ? 'text-ivory border-b border-ivory/40 pb-0.5'
                : 'text-muted hover:text-ivory transition-colors';
            group.appendChild(a);
        });

        var site = document.createElement('a');
        site.href = '/';
        site.textContent = 'View Site';
        site.className = 'text-muted hover:text-ivory transition-colors hidden sm:inline';
        group.appendChild(site);

        // Reuse the page's own logout button so its click handler survives.
        if (logout) {
            group.appendChild(logout);
        } else {
            var b = document.createElement('button');
            b.id = 'logout-btn';
            b.textContent = 'Sign Out';
            b.className = 'text-muted hover:text-ivory transition-colors';
            b.addEventListener('click', function () {
                if (window.dialedAdmin) window.dialedAdmin.clearToken();
                window.location.reload();
            });
            group.appendChild(b);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', build);
    } else {
        build();
    }
})();
