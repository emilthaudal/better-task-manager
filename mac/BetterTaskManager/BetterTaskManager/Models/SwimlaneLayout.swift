import CoreGraphics
import Foundation

nonisolated enum SwimlaneGrouping: String, CaseIterable, Hashable, Sendable {
    case team, epic
}

nonisolated struct SwimlaneOptions: Hashable, Sendable {
    var grouping: SwimlaneGrouping = .team
    var showDone = false
    var showExternal = true
}

nonisolated struct SwimlaneMetrics: Hashable, Sendable {
    var laneHeaderWidth: CGFloat = 176
    var columnHeaderHeight: CGFloat = 40
    var cardWidth: CGFloat = 228
    /// Tall enough for a two-line summary between the key row and the footer —
    /// Jira summaries often share a long prefix ("rma-integration-service: …").
    var cardHeight: CGFloat = 94
    /// Wide enough for an edge to curve between columns without hugging the cards.
    var columnGap: CGFloat = 64
    var rowGap: CGFloat = 16
    var lanePadding: CGFloat = 14
    var laneGap: CGFloat = 10
    var trailingPadding: CGFloat = 40
    var slackBarHeight: CGFloat = 4

    var columnPitch: CGFloat { cardWidth + columnGap }
}

/// Every position in the critical-path swimlane, computed in one pass so the lane
/// backgrounds, cards, slack bars and edges can't disagree about where a card is.
nonisolated struct SwimlaneLayout: Sendable {
    struct Lane: Identifiable, Hashable, Sendable {
        let id: String
        let title: String
        let subtitle: String?
        let team: String
        let isExternal: Bool
        let remaining: Int
        let critical: Int
        let frame: CGRect
    }

    struct Column: Identifiable, Hashable, Sendable {
        /// nil for the leading "Done" column.
        let level: Int?
        let frame: CGRect
        var id: Int { level ?? -1 }
    }

    struct Node: Identifiable, Hashable, Sendable {
        let key: String
        let laneID: String
        let column: Int
        let frame: CGRect
        /// Faint bar from the card to the latest column it can start in without
        /// delaying the milestone; nil when it has no slack (or no schedule).
        let slackFrame: CGRect?
        let isCritical: Bool
        let isDone: Bool
        let isExternal: Bool
        var id: String { key }
    }

    struct Edge: Identifiable, Hashable, Sendable {
        let from: String
        let to: String
        let start: CGPoint
        let control1: CGPoint
        let control2: CGPoint
        let end: CGPoint
        let critical: Bool
        let crossTeam: Bool
        let satisfied: Bool
        var id: String { "\(from)>\(to)" }
    }

    let lanes: [Lane]
    let columns: [Column]
    let nodes: [Node]
    let edges: [SwimlaneLayout.Edge]
    let size: CGSize
    let nodesByKey: [String: Node]

    static let empty = SwimlaneLayout(lanes: [], columns: [], nodes: [], edges: [], size: .zero, nodesByKey: [:])
}

nonisolated private struct Placement {
    let item: WorkItem
    let laneID: String
    let column: Int
}

nonisolated func buildSwimlaneLayout(
    detail: MilestoneDetail,
    options: SwimlaneOptions,
    metrics: SwimlaneMetrics = SwimlaneMetrics()
) -> SwimlaneLayout {
    let epicsByKey = Dictionary(detail.epics.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })

    let visible = detail.items.filter { item in
        if item.external && !options.showExternal { return false }
        return item.schedule != nil || options.showDone
    }
    guard !visible.isEmpty else { return .empty }

    // Done items have no schedule; they get their own leading column so the
    // remaining work keeps reading left → right from "now".
    let hasDoneColumn = options.showDone && visible.contains { $0.schedule == nil }
    let columnShift = hasDoneColumn ? 1 : 0
    let maxLevel = visible.compactMap { $0.schedule?.latestStart }.max() ?? 0
    let levelCount = max(detail.criticalPath.length, maxLevel + 1, visible.compactMap { $0.schedule?.earliestStart }.max().map { $0 + 1 } ?? 0)
    let columnCount = levelCount + columnShift

    let laneID: (WorkItem) -> String = { item in
        switch options.grouping {
        case .team: return "team:\(item.team)"
        case .epic: return item.epicKey.map { "epic:\($0)" } ?? "team-noepic:\(item.team)"
        }
    }

    let placements = visible.map { item in
        Placement(item: item, laneID: laneID(item), column: item.schedule.map { $0.earliestStart + columnShift } ?? 0)
    }

    let lanes = orderedLanes(placements: placements, grouping: options.grouping, epicsByKey: epicsByKey)

    // Lane heights depend only on how many cards share a (lane, column) cell.
    var cellCounts: [String: [Int: Int]] = [:]
    for placement in placements { cellCounts[placement.laneID, default: [:]][placement.column, default: 0] += 1 }

    var laneFrames: [String: CGRect] = [:]
    var y = metrics.columnHeaderHeight
    let contentWidth = metrics.laneHeaderWidth + CGFloat(columnCount) * metrics.columnPitch - metrics.columnGap + metrics.trailingPadding
    for lane in lanes {
        let rows = max(cellCounts[lane.id]?.values.max() ?? 1, 1)
        let height = metrics.lanePadding * 2 + CGFloat(rows) * metrics.cardHeight + CGFloat(rows - 1) * metrics.rowGap
        laneFrames[lane.id] = CGRect(x: 0, y: y, width: contentWidth, height: height)
        y += height + metrics.laneGap
    }
    let contentHeight = y - metrics.laneGap + metrics.trailingPadding

    let columnX: (Int) -> CGFloat = { metrics.laneHeaderWidth + CGFloat($0) * metrics.columnPitch }

    // Order cards within a cell column by column, left to right, so each card can sit
    // near the cards that block it — that keeps edges short and mostly horizontal.
    var rowCenterY: [String: CGFloat] = [:]
    var nodes: [SwimlaneLayout.Node] = []
    let byColumn = Dictionary(grouping: placements, by: \.column)
    for column in 0..<columnCount {
        let cells = Dictionary(grouping: byColumn[column] ?? [], by: \.laneID)
        for (lane, members) in cells {
            guard let laneFrame = laneFrames[lane] else { continue }
            let sorted = members.sorted { a, b in
                let critA = a.item.schedule?.critical ?? false
                let critB = b.item.schedule?.critical ?? false
                if critA != critB { return critA }
                let baryA = barycenter(of: a.item, placed: rowCenterY)
                let baryB = barycenter(of: b.item, placed: rowCenterY)
                if let baryA, let baryB, baryA != baryB { return baryA < baryB }
                if (baryA == nil) != (baryB == nil) { return baryA != nil }
                let downA = a.item.schedule?.downstream ?? 0
                let downB = b.item.schedule?.downstream ?? 0
                if downA != downB { return downA > downB }
                return a.item.key.localizedStandardCompare(b.item.key) == .orderedAscending
            }
            for (row, placement) in sorted.enumerated() {
                let frame = CGRect(
                    x: columnX(column),
                    y: laneFrame.minY + metrics.lanePadding + CGFloat(row) * (metrics.cardHeight + metrics.rowGap),
                    width: metrics.cardWidth,
                    height: metrics.cardHeight
                )
                rowCenterY[placement.item.key] = frame.midY
                var slackFrame: CGRect?
                if let schedule = placement.item.schedule, schedule.slack > 0 {
                    let latestMaxX = columnX(schedule.latestStart + columnShift) + metrics.cardWidth
                    slackFrame = CGRect(
                        x: frame.minX + 10,
                        y: frame.maxY + (metrics.rowGap - metrics.slackBarHeight) / 2,
                        width: latestMaxX - frame.minX - 10,
                        height: metrics.slackBarHeight
                    )
                }
                nodes.append(SwimlaneLayout.Node(
                    key: placement.item.key,
                    laneID: lane,
                    column: column,
                    frame: frame,
                    slackFrame: slackFrame,
                    isCritical: placement.item.schedule?.critical ?? false,
                    isDone: placement.item.status.isDone,
                    isExternal: placement.item.external
                ))
            }
        }
    }
    nodes.sort { $0.key.localizedStandardCompare($1.key) == .orderedAscending }
    let nodesByKey = Dictionary(nodes.map { ($0.key, $0) }, uniquingKeysWith: { first, _ in first })

    let edges: [SwimlaneLayout.Edge] = detail.dependencies.compactMap { dependency in
        guard let from = nodesByKey[dependency.from], let to = nodesByKey[dependency.to],
              to.column > from.column else { return nil }
        return makeEdge(dependency: dependency, from: from.frame, to: to.frame)
    }

    let columns = (0..<columnCount).map { column in
        SwimlaneLayout.Column(
            level: hasDoneColumn && column == 0 ? nil : column - columnShift,
            frame: CGRect(x: columnX(column), y: 0, width: metrics.cardWidth, height: contentHeight)
        )
    }

    let laneModels = lanes.map { lane in
        SwimlaneLayout.Lane(id: lane.id, title: lane.title, subtitle: lane.subtitle, team: lane.team, isExternal: lane.isExternal,
             remaining: lane.remaining, critical: lane.critical, frame: laneFrames[lane.id] ?? .zero)
    }

    return SwimlaneLayout(
        lanes: laneModels,
        columns: columns,
        nodes: nodes,
        edges: edges,
        size: CGSize(width: contentWidth, height: contentHeight),
        nodesByKey: nodesByKey
    )
}

/// Leaves the card's right edge horizontally and enters the next card's left edge
/// horizontally — the tangents make a long multi-column edge read as one sweep.
nonisolated func makeEdge(dependency: Dependency, from: CGRect, to: CGRect) -> SwimlaneLayout.Edge {
    let start = CGPoint(x: from.maxX, y: from.midY)
    let end = CGPoint(x: to.minX, y: to.midY)
    let reach = max((end.x - start.x) * 0.5, 32)
    return SwimlaneLayout.Edge(
        from: dependency.from,
        to: dependency.to,
        start: start,
        control1: CGPoint(x: start.x + reach, y: start.y),
        control2: CGPoint(x: end.x - reach, y: end.y),
        end: end,
        critical: dependency.critical,
        crossTeam: dependency.crossTeam,
        satisfied: dependency.satisfied
    )
}

nonisolated private func barycenter(of item: WorkItem, placed: [String: CGFloat]) -> CGFloat? {
    let ys = item.blockedBy.compactMap { placed[$0] }
    guard !ys.isEmpty else { return nil }
    return ys.reduce(0, +) / CGFloat(ys.count)
}

nonisolated private struct LaneSeed {
    let id: String
    let title: String
    let subtitle: String?
    let team: String
    let isExternal: Bool
    let remaining: Int
    let critical: Int
    let firstCriticalLevel: Int?
    let firstLevel: Int
}

/// Lanes that carry the critical path come first, in the order the path reaches
/// them, so the path reads top-down as well as left-to-right; work outside the
/// milestone sinks to the bottom.
nonisolated private func orderedLanes(
    placements: [Placement],
    grouping: SwimlaneGrouping,
    epicsByKey: [String: TeamEpic]
) -> [LaneSeed] {
    let groups = Dictionary(grouping: placements, by: \.laneID)
    let seeds = groups.map { id, members -> LaneSeed in
        let sample = members[0].item
        let remaining = members.filter { $0.item.schedule != nil }
        let criticalLevels = remaining.compactMap { $0.item.schedule?.critical == true ? $0.item.schedule?.earliestStart : nil }
        let title: String
        let subtitle: String?
        switch grouping {
        case .team:
            title = sample.team
            subtitle = nil
        case .epic:
            if let epicKey = sample.epicKey {
                title = epicsByKey[epicKey]?.summary ?? epicKey
                subtitle = "\(epicKey) · \(sample.team)"
            } else {
                title = "No epic"
                subtitle = sample.team
            }
        }
        return LaneSeed(
            id: id,
            title: title,
            subtitle: subtitle,
            team: sample.team,
            isExternal: members.allSatisfy(\.item.external),
            remaining: remaining.count,
            critical: criticalLevels.count,
            firstCriticalLevel: criticalLevels.min(),
            firstLevel: remaining.compactMap { $0.item.schedule?.earliestStart }.min() ?? Int.max
        )
    }
    return seeds.sorted { a, b in
        if a.isExternal != b.isExternal { return !a.isExternal }
        switch (a.firstCriticalLevel, b.firstCriticalLevel) {
        case let (x?, y?) where x != y: return x < y
        case (.some, nil): return true
        case (nil, .some): return false
        default: break
        }
        if grouping == .epic, a.team != b.team { return a.team.localizedStandardCompare(b.team) == .orderedAscending }
        if a.firstLevel != b.firstLevel { return a.firstLevel < b.firstLevel }
        return a.title.localizedStandardCompare(b.title) == .orderedAscending
    }
}
