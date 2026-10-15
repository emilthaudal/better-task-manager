import Foundation

// Hand-mirrored from lib/milestoneTypes.ts in the web app. Field names match the
// JSON exactly so the default Codable synthesis works; when the TS contract
// changes, this file and the fixture decode tests need to change with it.

nonisolated enum StatusCategory: String, Codable, Hashable, Sendable {
    case new, indeterminate, done
}

nonisolated struct StatusRef: Codable, Hashable, Sendable {
    let name: String
    let category: StatusCategory

    var isDone: Bool { category == .done }
}

nonisolated struct IssueRef: Codable, Hashable, Identifiable, Sendable {
    let key: String
    let summary: String
    let status: StatusRef

    var id: String { key }
}

nonisolated struct DeliveryProject: Codable, Hashable, Sendable {
    let key: String
    let name: String
}

nonisolated struct WorkProgress: Codable, Hashable, Sendable {
    let done: Int
    let inProgress: Int
    let todo: Int
    let total: Int

    static let empty = WorkProgress(done: 0, inProgress: 0, todo: 0, total: 0)

    var remaining: Int { total - done }
    var fractionDone: Double { total == 0 ? 0 : Double(done) / Double(total) }
    var fractionInProgress: Double { total == 0 ? 0 : Double(inProgress) / Double(total) }
}

nonisolated struct Release: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let description: String?
    let released: Bool
    let archived: Bool
    let startDate: String?
    let releaseDate: String?
    let overdue: Bool
    let sequence: Int
}

nonisolated struct IncrementSummary: Codable, Hashable, Identifiable, Sendable {
    let key: String
    let summary: String
    let status: StatusRef
    let team: String?
    let capabilities: [IssueRef]
    let teamEpics: [IssueRef]
    let blocks: [String]
    let blockedBy: [String]

    var id: String { key }
}

/// The TS type is `Release & {...}`; flattening it here keeps decoding trivial and
/// `release` gives back the shared shape where views only need the release fields.
nonisolated struct ProgramRelease: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let description: String?
    let released: Bool
    let archived: Bool
    let startDate: String?
    let releaseDate: String?
    let overdue: Bool
    let sequence: Int
    let increments: [IncrementSummary]
    let progress: WorkProgress
    let epicProgress: WorkProgress

    var release: Release {
        Release(id: id, name: name, description: description, released: released, archived: archived,
                startDate: startDate, releaseDate: releaseDate, overdue: overdue, sequence: sequence)
    }
}

nonisolated struct ProgramOverview: Codable, Hashable, Sendable {
    let project: DeliveryProject
    let releases: [ProgramRelease]
    let unscheduled: [IncrementSummary]
    let warnings: [MilestoneWarning]
    let generatedAt: String
}

nonisolated struct ItemSchedule: Codable, Hashable, Sendable {
    let earliestStart: Int
    let earliestFinish: Int
    let latestStart: Int
    let slack: Int
    let critical: Bool
    let ready: Bool
    let downstream: Int
    let downstreamTeams: [String]
}

nonisolated struct WorkItem: Codable, Hashable, Identifiable, Sendable {
    let key: String
    let summary: String
    let type: String
    let status: StatusRef
    let assignee: String?
    let epicKey: String?
    let team: String
    let incrementKey: String?
    let points: Double?
    let external: Bool
    let placeholder: Bool
    /// Stands in for an increment with no open team epics. Optional so an older server's payload still decodes.
    let standIn: Bool?
    let blockedBy: [String]
    let blocks: [String]
    let schedule: ItemSchedule?

    var id: String { key }
}

nonisolated enum DependencyKind: String, Codable, Hashable, Sendable {
    case item, epic
}

nonisolated struct Dependency: Codable, Hashable, Sendable {
    let from: String
    let to: String
    let kind: DependencyKind
    let crossTeam: Bool
    let crossEpic: Bool
    let satisfied: Bool
    let critical: Bool
}

nonisolated struct TeamEpic: Codable, Hashable, Identifiable, Sendable {
    let key: String
    let summary: String
    let status: StatusRef
    let team: String
    let projectKey: String
    let assignee: String?
    let incrementKeys: [String]
    let itemKeys: [String]
    let progress: WorkProgress
    let blocksEpics: [String]
    let blockedByEpics: [String]
    let earliestStart: Int?
    let earliestFinish: Int?
    let criticalItems: Int
    let onCriticalPath: Bool
    /// The increment itself, standing in until it has open team epics. Optional so an older server's payload still decodes.
    let standIn: Bool?
    /// Carries the design-approved label: its decision log is signed off.
    let designApproved: Bool?

    var id: String { key }
}

nonisolated struct Increment: Codable, Hashable, Identifiable, Sendable {
    let key: String
    let summary: String
    let status: StatusRef
    let team: String?
    let capabilities: [IssueRef]
    let teamEpics: [IssueRef]
    let blocks: [String]
    let blockedBy: [String]
    let progress: WorkProgress
    let derivedBlocks: [String]
    let derivedBlockedBy: [String]
    let criticalItems: Int
    let earliestFinish: Int?

    var id: String { key }
}

nonisolated struct TeamSummary: Codable, Hashable, Identifiable, Sendable {
    let name: String
    let epicKeys: [String]
    let progress: WorkProgress
    let remaining: Int
    let criticalItems: Int
    let readyNow: Int
    let unassignedRemaining: Int
    let waitingOnOtherTeams: Int
    let blockingOtherTeams: Int
    let loadByLevel: [Int]
    let criticalByLevel: [Int]

    var id: String { name }
}

nonisolated struct BlockerEpic: Codable, Hashable, Identifiable, Sendable {
    let epicKey: String
    let team: String
    let remaining: Int
    let blockedEpics: [String]
    let blockedTeams: [String]
    let downstreamItems: Int
    let onCriticalPath: Bool
    let gatingItems: [String]

    var id: String { epicKey }
}

/// Unknown kinds decode as `.other` so a new warning type on the server degrades to
/// a generic row instead of failing the whole milestone decode.
nonisolated enum WarningKind: Hashable, Sendable, Codable {
    case cycle
    case undeclaredDependency
    case unbackedDependency
    case outOfOrderDependency
    case externalBlocker
    case noTeamEpics
    case unscheduled
    case unassignedCritical
    case unapprovedDesign
    case other(String)

    private static let known: [String: WarningKind] = [
        "cycle": .cycle,
        "undeclared-dependency": .undeclaredDependency,
        "unbacked-dependency": .unbackedDependency,
        "out-of-order-dependency": .outOfOrderDependency,
        "external-blocker": .externalBlocker,
        "no-team-epics": .noTeamEpics,
        "unscheduled": .unscheduled,
        "unassigned-critical": .unassignedCritical,
        "unapproved-design": .unapprovedDesign,
    ]

    var rawValue: String {
        if case let .other(raw) = self { return raw }
        return Self.known.first { $0.value == self }?.key ?? ""
    }

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self.known[raw] ?? .other(raw)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

nonisolated struct MilestoneWarning: Codable, Hashable, Sendable {
    let kind: WarningKind
    let message: String
    let keys: [String]
}

nonisolated struct CriticalPath: Codable, Hashable, Sendable {
    let keys: [String]
    let criticalKeys: [String]
    let length: Int
}

nonisolated struct MilestoneDetail: Codable, Hashable, Sendable {
    let project: DeliveryProject
    let release: Release
    let increments: [Increment]
    let epics: [TeamEpic]
    let items: [WorkItem]
    let dependencies: [Dependency]
    let teams: [TeamSummary]
    let criticalPath: CriticalPath
    let blockerEpics: [BlockerEpic]
    let readyNow: [String]
    let progress: WorkProgress
    let warnings: [MilestoneWarning]
    let generatedAt: String
}

nonisolated extension MilestoneDetail {
    /// Everything but `generatedAt`, which the server stamps fresh on every response.
    func hasSameContent(as other: MilestoneDetail) -> Bool {
        project == other.project && release == other.release && progress == other.progress
            && criticalPath == other.criticalPath && readyNow == other.readyNow
            && items == other.items && dependencies == other.dependencies && epics == other.epics
            && increments == other.increments && teams == other.teams
            && blockerEpics == other.blockerEpics && warnings == other.warnings
    }
}

nonisolated extension ProgramOverview {
    func hasSameContent(as other: ProgramOverview) -> Bool {
        project == other.project && releases == other.releases
            && unscheduled == other.unscheduled && warnings == other.warnings
    }
}

/// Key → value lookups over a milestone, built once per payload rather than on every
/// view access — the swimlane, inspector and lists all resolve keys constantly.
nonisolated struct MilestoneIndex: Sendable {
    let itemsByKey: [String: WorkItem]
    let epicsByKey: [String: TeamEpic]
    let incrementsByKey: [String: Increment]
    let teamsByName: [String: TeamSummary]

    init(_ detail: MilestoneDetail) {
        itemsByKey = Dictionary(detail.items.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })
        epicsByKey = Dictionary(detail.epics.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })
        incrementsByKey = Dictionary(detail.increments.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })
        teamsByName = Dictionary(detail.teams.map { ($0.name, $0) }, uniquingKeysWith: { first, _ in first })
    }
}
