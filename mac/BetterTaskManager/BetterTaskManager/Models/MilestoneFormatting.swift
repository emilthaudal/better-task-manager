import Foundation

/// Plain-language reading of an item's schedule. Levels are "steps": each remaining
/// item counts as one, because the backend deliberately schedules without trusting
/// estimates (see lib/milestoneAnalysis.ts).
func scheduleSummary(_ schedule: ItemSchedule) -> String {
    let start: String
    if schedule.ready {
        start = "Can start now"
    } else if schedule.earliestStart == 0 {
        start = "Waiting on a blocker"
    } else {
        start = "Starts after \(steps(schedule.earliestStart))"
    }
    let float = schedule.slack == 0 ? "on the critical path" : "\(steps(schedule.slack)) of slack"
    return "\(start) · \(float)"
}

func scheduleExplanation(_ schedule: ItemSchedule) -> String {
    if schedule.critical {
        return "Any delay here delays the whole milestone — nothing in the plan can absorb it."
    }
    return "Can slip up to \(steps(schedule.slack)) without moving the milestone's finish."
}

func steps(_ count: Int) -> String {
    count == 1 ? "1 step" : "\(count) steps"
}

func pluralized(_ count: Int, _ singular: String, _ plural: String? = nil) -> String {
    "\(count) \(count == 1 ? singular : (plural ?? singular + "s"))"
}

/// The column header for a dependency level — level 0 is "now" because it holds
/// everything with no remaining blockers.
func levelTitle(_ level: Int?) -> String {
    guard let level else { return "Done" }
    return level == 0 ? "Now" : "Step \(level + 1)"
}

extension WarningKind {
    var title: String {
        switch self {
        case .cycle: "Dependency cycle"
        case .undeclaredDependency: "Undeclared dependency"
        case .unbackedDependency: "Unbacked dependency"
        case .outOfOrderDependency: "Out-of-order dependency"
        case .externalBlocker: "Blocked from outside"
        case .noTeamEpics: "No team epics"
        case .unscheduled: "Unscheduled"
        case .unassignedCritical: "Unassigned critical work"
        case .unapprovedDesign: "Building without sign-off"
        case let .other(raw): raw.replacingOccurrences(of: "-", with: " ").capitalized
        }
    }

    var symbol: String {
        switch self {
        case .cycle: "arrow.triangle.2.circlepath"
        case .undeclaredDependency: "link.badge.plus"
        case .unbackedDependency: "link"
        case .outOfOrderDependency: "arrow.uturn.backward"
        case .externalBlocker: "arrow.down.right.and.arrow.up.left"
        case .noTeamEpics: "person.2.slash"
        case .unscheduled: "calendar.badge.exclamationmark"
        case .unassignedCritical: "person.crop.circle.badge.questionmark"
        case .unapprovedDesign: "exclamationmark.shield"
        case .other: "exclamationmark.triangle"
        }
    }

    /// Cycles and out-of-order links make the plan itself wrong; the rest are
    /// hygiene the user should know about but can schedule around.
    var isSevere: Bool {
        switch self {
        case .cycle, .outOfOrderDependency, .externalBlocker, .unassignedCritical, .unapprovedDesign: true
        default: false
        }
    }
}

enum ReleaseState: Hashable {
    case released
    case overdue
    case due(Date)
    case undated
}

extension Release {
    var state: ReleaseState {
        if released { return .released }
        if overdue { return .overdue }
        if let date = parseJiraDate(releaseDate) { return .due(date) }
        return .undated
    }
}

extension ProgramRelease {
    var state: ReleaseState { release.state }
}

/// Jira version dates are plain calendar days ("2026-12-15") with no zone; reading
/// them in the user's calendar keeps "Due 15 Dec" from shifting a day either way.
func parseJiraDate(_ string: String?) -> Date? {
    guard let string, string.count >= 10 else { return nil }
    let parts = string.prefix(10).split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
}

func releaseStateLabel(_ state: ReleaseState, now: Date = .now) -> String {
    switch state {
    case .released: return "Released"
    case .overdue: return "Overdue"
    case .undated: return "No date"
    case let .due(date):
        return "Due \(date.formatted(.dateTime.day().month(.abbreviated)))"
    }
}

/// Increment → the blockers that land in a later milestone (or none at all), which
/// means the increment can't actually ship with its own milestone. Blockers the
/// program doesn't know about are left to the server's warnings.
func outOfOrderBlockers(in program: ProgramOverview) -> [String: [String]] {
    var sequenceOf: [String: Int] = [:]
    for release in program.releases {
        for increment in release.increments { sequenceOf[increment.key] = release.sequence }
    }
    for increment in program.unscheduled { sequenceOf[increment.key] = .max }

    var result: [String: [String]] = [:]
    for release in program.releases {
        for increment in release.increments {
            let late = increment.blockedBy.filter { (sequenceOf[$0] ?? .min) > release.sequence }
            if !late.isEmpty { result[increment.key] = late }
        }
    }
    return result
}

func jiraBrowseURL(site: URL, key: String) -> URL {
    site.appending(path: "browse").appending(path: key)
}

func matchesSearch(_ query: String, _ fields: String?...) -> Bool {
    let needle = query.trimmingCharacters(in: .whitespaces)
    guard !needle.isEmpty else { return true }
    return fields.contains { $0?.localizedStandardContains(needle) ?? false }
}
