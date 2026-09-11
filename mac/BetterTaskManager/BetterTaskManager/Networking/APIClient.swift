import Foundation

struct APIError: Error, LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

struct NativeSessionHandoff: Decodable {
    let cookieName: String
    let cookieValue: String
    let needsSiteSelection: Bool
}

struct MeResponse: Decodable {
    let user: AtlassianUser
    let cloudId: String?
}

struct SitesResponse: Decodable {
    let sites: [AtlassianSite]
}

struct IssuePermissions: Decodable {
    let transitions: [JiraTransition]
    let editableFields: [String]
    let canDelete: Bool
}

final class APIClient {
    static let shared = APIClient()

    private let session = URLSession(configuration: .ephemeral)

    private init() {}

    private func makeRequest(
        path: String,
        method: String = "GET",
        queryItems: [URLQueryItem]? = nil,
        body: Data? = nil
    ) -> URLRequest {
        var components = URLComponents(url: Config.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        components.queryItems = queryItems

        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        if let cookie = KeychainStore.load() {
            request.setValue("btm_session=\(cookie)", forHTTPHeaderField: "Cookie")
        }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return request
    }

    @discardableResult
    private func send(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError(message: "Invalid response")
        }
        captureRotatedCookie(from: http)
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
                ?? "Request failed (\(http.statusCode))"
            throw APIError(message: message)
        }
        return data
    }

    /// The server rotates Atlassian's refresh token on every access-token refresh and
    /// re-seals btm_session with it. There's no shared browser cookie jar here, so any
    /// Set-Cookie on a response has to be captured by hand — otherwise the stored
    /// session goes stale the moment Atlassian invalidates the previous refresh token.
    private func captureRotatedCookie(from response: HTTPURLResponse) {
        guard let setCookie = response.value(forHTTPHeaderField: "Set-Cookie"),
              let range = setCookie.range(of: "btm_session=") else { return }
        let value = setCookie[range.upperBound...].prefix { $0 != ";" }
        KeychainStore.save(String(value))
    }

    func exchangeNativeSession(token: String) async throws -> NativeSessionHandoff {
        let request = makeRequest(path: "/api/auth/native-session", queryItems: [URLQueryItem(name: "t", value: token)])
        let data = try await send(request)
        return try JSONDecoder().decode(NativeSessionHandoff.self, from: data)
    }

    func fetchMe() async throws -> MeResponse {
        let data = try await send(makeRequest(path: "/api/auth/me"))
        return try JSONDecoder().decode(MeResponse.self, from: data)
    }

    func fetchSites() async throws -> [AtlassianSite] {
        let data = try await send(makeRequest(path: "/api/auth/sites"))
        return try JSONDecoder().decode(SitesResponse.self, from: data).sites
    }

    func selectSite(cloudId: String) async throws {
        let body = try JSONEncoder().encode(["cloudId": cloudId])
        try await send(makeRequest(path: "/api/auth/select-site", method: "POST", body: body))
    }

    func logout() async throws {
        try await send(makeRequest(path: "/api/auth/logout"))
    }

    func fetchProjects() async throws -> [JiraProject] {
        let data = try await send(makeRequest(path: "/api/jira/projects"))
        return try JSONDecoder().decode([JiraProject].self, from: data)
    }

    func fetchBoardIssues(project: String) async throws -> [JiraIssue] {
        let request = makeRequest(path: "/api/jira/issues/board", queryItems: [URLQueryItem(name: "project", value: project)])
        let data = try await send(request)
        return try JSONDecoder().decode([JiraIssue].self, from: data)
    }

    func fetchPermissions(issueKey: String) async throws -> IssuePermissions {
        let data = try await send(makeRequest(path: "/api/jira/issue/\(issueKey)/permissions"))
        return try JSONDecoder().decode(IssuePermissions.self, from: data)
    }

    /// Resolves the transition for the target status at call time rather than prefetching
    /// one per card, so rendering a board doesn't fan out a permissions request per issue.
    func moveIssue(issueKey: String, toStatusId statusId: String) async throws {
        let permissions = try await fetchPermissions(issueKey: issueKey)
        guard let transition = permissions.transitions.first(where: { $0.to.id == statusId && $0.isAvailable != false }) else {
            throw APIError(message: "You don't have permission to move this issue there.")
        }
        let body = try JSONEncoder().encode(["transitionId": transition.id])
        try await send(makeRequest(path: "/api/jira/issue/\(issueKey)/transition", method: "POST", body: body))
    }
}
