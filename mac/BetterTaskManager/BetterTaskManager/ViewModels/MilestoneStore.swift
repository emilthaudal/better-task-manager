import Foundation
import Observation

/// One loaded milestone plus the derived lookups every view needs, built once per
/// poll instead of on each body evaluation.
nonisolated struct LoadedMilestone: Sendable {
    let detail: MilestoneDetail
    let index: MilestoneIndex
    let graph: DependencyGraph

    init(_ detail: MilestoneDetail) {
        self.detail = detail
        index = MilestoneIndex(detail)
        graph = DependencyGraph(detail.dependencies)
    }

    /// Building the indexes walks every item and link; keep it off the main actor.
    @concurrent
    static func prepare(_ detail: MilestoneDetail) async -> LoadedMilestone {
        LoadedMilestone(detail)
    }
}

enum LoadState: Equatable {
    case idle
    case loading
    case failed(String)
    case loaded
}

@MainActor
@Observable
final class MilestoneStore {
    static let pollInterval: Duration = .seconds(60)
    static let fallbackSiteURL = URL(string: "https://whiteaway.atlassian.net")!

    private(set) var program: ProgramOverview?
    private(set) var programState: LoadState = .idle
    private(set) var milestones: [String: LoadedMilestone] = [:]
    private(set) var milestoneStates: [String: LoadState] = [:]
    private(set) var lastUpdated: Date?
    private(set) var isRefreshing = false
    /// The latest background failure, kept only for a quiet indicator — once data is
    /// on screen a failed poll must not replace it with an error page.
    private(set) var backgroundError: String?
    private(set) var siteURL: URL = MilestoneStore.fallbackSiteURL

    private let fetchProgram: (String) async throws -> ProgramOverview
    private let fetchMilestone: (String, String) async throws -> MilestoneDetail
    private let fetchSiteURL: () async throws -> URL?
    private let projectKey: () -> String
    private var siteURLResolved = false
    private var inFlight = 0

    init(
        projectKey: @escaping () -> String = { Config.deliveryProjectKey },
        fetchProgram: @escaping (String) async throws -> ProgramOverview = {
            try await APIClient.shared.fetchProgram(project: $0)
        },
        fetchMilestone: @escaping (String, String) async throws -> MilestoneDetail = {
            try await APIClient.shared.fetchMilestone(versionID: $0, project: $1)
        },
        fetchSiteURL: @escaping () async throws -> URL? = { try await APIClient.shared.fetchSiteURL() }
    ) {
        self.projectKey = projectKey
        self.fetchProgram = fetchProgram
        self.fetchMilestone = fetchMilestone
        self.fetchSiteURL = fetchSiteURL
    }

    func milestone(_ id: String) -> LoadedMilestone? { milestones[id] }
    func state(ofMilestone id: String) -> LoadState { milestoneStates[id] ?? .idle }

    /// Refreshes the program and, if one is focused, that milestone. Both requests run
    /// concurrently — the milestone detail is the slow one and shouldn't wait on the
    /// overview.
    ///
    /// Overlapping refreshes are allowed on purpose: switching milestones restarts the
    /// polling task while the previous refresh may still be in flight, and skipping
    /// the new one would leave the newly selected milestone unloaded until the next poll.
    func refresh(milestoneID: String?) async {
        inFlight += 1
        isRefreshing = true
        defer {
            inFlight -= 1
            isRefreshing = inFlight > 0
        }

        let project = projectKey()
        async let overview: Void = loadProgram(project: project)
        async let detail: Void = loadMilestone(milestoneID, project: project)
        async let site: Void = resolveSiteURL()
        _ = await (overview, detail, site)
        if programState == .loaded || milestoneID.map({ milestoneStates[$0] == .loaded }) == true {
            lastUpdated = .now
        }
    }

    func runPollingLoop(milestoneID: String?) async {
        while !Task.isCancelled {
            await refresh(milestoneID: milestoneID)
            try? await Task.sleep(for: Self.pollInterval)
        }
    }

    /// Drops everything loaded for the old delivery project so a project-key change
    /// in Settings can't show one space's milestones under another's name.
    func reset() {
        program = nil
        programState = .idle
        milestones = [:]
        milestoneStates = [:]
        lastUpdated = nil
        backgroundError = nil
    }

    private func loadProgram(project: String) async {
        if program == nil { programState = .loading }
        do {
            let next = try await fetchProgram(project)
            // generatedAt changes on every response; replacing an otherwise identical
            // payload would invalidate every view that reads the program.
            if program?.hasSameContent(as: next) != true { program = next }
            programState = .loaded
            backgroundError = nil
        } catch {
            if program == nil { programState = .failed(error.localizedDescription) }
            else { backgroundError = error.localizedDescription }
        }
    }

    private func loadMilestone(_ id: String?, project: String) async {
        guard let id else { return }
        if milestones[id] == nil { milestoneStates[id] = .loading }
        do {
            let detail = try await fetchMilestone(id, project)
            // An unchanged poll must not hand the swimlane a new value — that would
            // rebuild its layout (and reset hover state) every 60 seconds for nothing.
            if milestones[id]?.detail.hasSameContent(as: detail) != true {
                let prepared = await LoadedMilestone.prepare(detail)
                TeamColors.register(detail.teams.map(\.name) + detail.items.map(\.team))
                milestones[id] = prepared
            }
            milestoneStates[id] = .loaded
        } catch {
            if milestones[id] == nil { milestoneStates[id] = .failed(error.localizedDescription) }
            else { backgroundError = error.localizedDescription }
        }
    }

    private func resolveSiteURL() async {
        guard !siteURLResolved else { return }
        if let url = try? await fetchSiteURL() {
            siteURL = url
            siteURLResolved = true
        }
    }
}
