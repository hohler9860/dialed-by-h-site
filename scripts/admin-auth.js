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

    async function adminFetch(action, body = {}) {
        const token = getToken();
        if (!token) throw new Error("Not authenticated");
        const r = await fetch("/api/journal-admin", {
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

    async function tryLogin(password) {
        // Probe with list-all; succeeds if password is right.
        setToken(password);
        try {
            await adminFetch("list-all");
            return true;
        } catch (e) {
            clearToken();
            return false;
        }
    }

    window.dialedAdmin = {
        getToken,
        setToken,
        clearToken,
        adminFetch,
        tryLogin,
        isAuthed: () => !!getToken(),
    };
})();
