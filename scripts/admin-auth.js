// Shared admin auth helper — used by /admin/journal/*.html pages.
// Stores password in sessionStorage (cleared when tab closes).
// All admin API calls go through adminFetch() which adds the Bearer header.

(function () {
    const STORAGE_KEY = "dialed_admin_token";

    function getToken() {
        try { return sessionStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
    }

    function setToken(t) {
        try { sessionStorage.setItem(STORAGE_KEY, t || ""); } catch { /* swallow */ }
    }

    function clearToken() {
        try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* swallow */ }
    }

    // Generic form: any admin endpoint sharing the Bearer <ADMIN_PASSWORD> scheme.
    async function adminFetchTo(endpoint, action, body = {}) {
        const token = getToken();
        if (!token) throw new Error("Not authenticated");
        const r = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ action, ...body }),
        });
        if (r.status === 401) {
            clearToken();
            throw new Error("Unauthorized");
        }
        const json = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
        return json;
    }

    // Journal pages call this. Kept as-is so their call sites do not change.
    async function adminFetch(action, body = {}) {
        return adminFetchTo("/api/journal-admin", action, body);
    }

    // Probe an endpoint with a harmless read to check the password.
    // Pages pass the probe that suits them, so the leads console does not need
    // the journal endpoint to be reachable in order to log in.
    async function tryLoginWith(password, endpoint, action) {
        setToken(password);
        try {
            await adminFetchTo(endpoint, action);
            return true;
        } catch (e) {
            clearToken();
            return false;
        }
    }

    async function tryLogin(password) {
        return tryLoginWith(password, "/api/journal-admin", "list-all");
    }

    window.dialedAdmin = {
        getToken,
        setToken,
        clearToken,
        adminFetch,
        adminFetchTo,
        tryLogin,
        tryLoginWith,
        isAuthed: () => !!getToken(),
    };
})();
