import Foundation

enum Config {
    static let baseURL = URL(string: "http://localhost:3000")!

    /// Mirrors the web app's JIRA_BYPASS=true local dev mode (see .env.local) — the
    /// server authenticates every Jira call with a static API token in that mode, so
    /// there's no OAuth flow or session cookie to obtain. Flip this back to false once
    /// pointing baseURL at a deployment that has real Atlassian OAuth configured.
    static let skipAuth = true
}
