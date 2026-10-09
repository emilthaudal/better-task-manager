import Foundation

nonisolated enum Config {
    static let defaultBaseURL = URL(string: "http://localhost:3000")!
    static let defaultDeliveryProjectKey = "LAD"

    enum DefaultsKey {
        static let baseURL = "serverBaseURL"
        static let deliveryProjectKey = "deliveryProjectKey"
    }

    /// Resolved per request rather than once at launch so a change in Settings takes
    /// effect on the next poll. `BTM_BASE_URL` wins over the stored setting so a
    /// scheme/launch can point at a second dev server (e.g. :3100) without touching
    /// the setting a regular run relies on.
    static var baseURL: URL {
        url(from: ProcessInfo.processInfo.environment["BTM_BASE_URL"])
            ?? url(from: UserDefaults.standard.string(forKey: DefaultsKey.baseURL))
            ?? defaultBaseURL
    }

    /// The Jira space whose releases are the delivery program's milestones.
    static var deliveryProjectKey: String {
        let candidates = [
            ProcessInfo.processInfo.environment["BTM_DELIVERY_PROJECT"],
            UserDefaults.standard.string(forKey: DefaultsKey.deliveryProjectKey),
        ]
        let key = candidates.lazy
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() }
            .first { !$0.isEmpty }
        return key ?? defaultDeliveryProjectKey
    }

    static func url(from string: String?) -> URL? {
        guard let trimmed = string?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty,
              let url = URL(string: trimmed), let scheme = url.scheme, ["http", "https"].contains(scheme),
              url.host() != nil else { return nil }
        return url
    }

    /// Mirrors the web app's JIRA_BYPASS=true local dev mode (see .env.local) — the
    /// server authenticates every Jira call with a static API token in that mode, so
    /// there's no OAuth flow or session cookie to obtain. Flip this back to false once
    /// pointing baseURL at a deployment that has real Atlassian OAuth configured.
    static let skipAuth = true
}
