import SwiftUI

enum InspectorTarget: Hashable {
    case item(String)
    case epic(String)
    case increment(String)

    var key: String {
        switch self {
        case let .item(key), let .epic(key), let .increment(key): key
        }
    }
}

/// Lets any row, card or chip deep in the milestone views drive the window's
/// selection and inspector without threading bindings through every layer.
struct MilestoneNavigator {
    /// Selects and shows the inspector.
    var inspect: (InspectorTarget) -> Void = { _ in }
    /// Selects without opening a hidden inspector — keyboard navigation moves
    /// through cards without the inspector popping in on every arrow press.
    var select: (InspectorTarget) -> Void = { _ in }
    var clearSelection: () -> Void = {}
    var showTeam: (String) -> Void = { _ in }
    var showMilestone: (String) -> Void = { _ in }
    var inspected: InspectorTarget?
    /// Bumped to ask the swimlane to scroll the current selection back into view,
    /// e.g. when a search jump lands on the card that's already selected.
    var revealRequest = 0
}

extension EnvironmentValues {
    @Entry var milestoneNavigator = MilestoneNavigator()
}

/// Red and green are deliberately absent — they mean "critical" and "done/ready" here.
private let teamPalette: [Color] = [
    .blue, .indigo, .mint, .pink, .brown, .cyan, .teal, .yellow, .orange, .purple,
    Color(red: 0.45, green: 0.52, blue: 0.95),
]

/// FNV-1a rather than String.hashValue, which is seeded per process — a team has to
/// keep its color across launches in the sidebar, lanes and charts.
func teamColor(_ name: String) -> Color {
    teamPalette[TeamColors.slot(for: name)]
}

/// Hashing alone put two of six teams on the same orange. Teams seen together in a
/// milestone are registered as a group and probe past slots already taken, in name
/// order, so the same set of teams always gets the same distinct colours.
enum TeamColors {
    private static var assigned: [String: Int] = [:]

    static func register(_ names: [String]) {
        for name in Set(names).sorted() where assigned[name] == nil {
            let used = Set(assigned.values)
            var slot = hashSlot(name)
            for _ in 0..<teamPalette.count where used.contains(slot) {
                slot = (slot + 1) % teamPalette.count
            }
            assigned[name] = slot
        }
    }

    static func slot(for name: String) -> Int {
        assigned[name] ?? hashSlot(name)
    }

    static func reset() { assigned = [:] }

    private static func hashSlot(_ name: String) -> Int {
        var hash: UInt64 = 0xcbf2_9ce4_8422_2325
        for byte in name.utf8 { hash = (hash ^ UInt64(byte)) &* 0x100_0000_01b3 }
        return Int(hash % UInt64(teamPalette.count))
    }
}

func statusTint(_ category: StatusCategory) -> Color {
    switch category {
    case .new: .gray
    case .indeterminate: .blue
    case .done: .green
    }
}

extension ReleaseState {
    var tint: Color {
        switch self {
        case .released: .green
        case .overdue: .red
        case .due: .accentColor
        case .undated: .secondary
        }
    }

    var symbol: String {
        switch self {
        case .released: "checkmark.seal.fill"
        case .overdue: "exclamationmark.circle.fill"
        case .due: "calendar"
        case .undated: "calendar.badge.questionmark"
        }
    }
}

struct ProgressRing: View {
    let progress: WorkProgress
    var size: CGFloat = 22
    var lineWidth: CGFloat = 3
    var tint: Color = .green

    var body: some View {
        ZStack {
            Circle().stroke(.quaternary, lineWidth: lineWidth)
            Circle()
                .trim(from: 0, to: progress.fractionDone + progress.fractionInProgress)
                .stroke(Color.blue.opacity(0.55), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Circle()
                .trim(from: 0, to: progress.fractionDone)
                .stroke(tint, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: size, height: size)
        .animation(.smooth, value: progress)
        .accessibilityElement()
        .accessibilityLabel("\(Int((progress.fractionDone * 100).rounded())) percent done")
    }
}

/// Done / in progress / to do as one segmented capsule.
struct ProgressBar: View {
    let progress: WorkProgress
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { proxy in
            HStack(spacing: 1.5) {
                if progress.done > 0 {
                    Capsule().fill(.green).frame(width: segment(progress.done, proxy.size.width))
                }
                if progress.inProgress > 0 {
                    Capsule().fill(.blue.opacity(0.75)).frame(width: segment(progress.inProgress, proxy.size.width))
                }
                Capsule().fill(.quaternary)
            }
        }
        .frame(height: height)
        .help("\(progress.done) done · \(progress.inProgress) in progress · \(progress.todo) to do")
    }

    private func segment(_ count: Int, _ width: CGFloat) -> CGFloat {
        guard progress.total > 0 else { return 0 }
        return max(width * CGFloat(count) / CGFloat(progress.total) - 1.5, height)
    }
}

struct StatusDot: View {
    let status: StatusRef
    var size: CGFloat = 7

    var body: some View {
        Circle()
            .fill(statusTint(status.category))
            .frame(width: size, height: size)
            .help(status.name)
    }
}

struct StatusPill: View {
    let status: StatusRef

    var body: some View {
        Text(status.name)
            .font(.caption2.weight(.semibold))
            .padding(.horizontal, 7)
            .padding(.vertical, 2.5)
            .background(statusTint(status.category).opacity(0.15), in: Capsule())
            .foregroundStyle(statusTint(status.category))
    }
}

struct TeamBadge: View {
    let team: String

    var body: some View {
        HStack(spacing: 4) {
            Circle().fill(teamColor(team)).frame(width: 6, height: 6)
            Text(team).lineLimit(1)
        }
        .font(.caption.weight(.medium))
        .padding(.horizontal, 7)
        .padding(.vertical, 2.5)
        .background(teamColor(team).opacity(0.12), in: Capsule())
    }
}

struct Badge: View {
    let text: String
    var systemImage: String?
    var tint: Color = .secondary

    var body: some View {
        HStack(spacing: 3) {
            if let systemImage { Image(systemName: systemImage) }
            Text(text)
        }
        .font(.caption2.weight(.semibold))
        .padding(.horizontal, 6)
        .padding(.vertical, 2.5)
        .background(tint.opacity(0.14), in: Capsule())
        .foregroundStyle(tint)
    }
}

struct CriticalBadge: View {
    var body: some View {
        Badge(text: "Critical path", systemImage: "flame.fill", tint: .red)
            .help("On the critical path: a delay here delays the milestone.")
    }
}

/// A navigable issue key. Clicking it opens the issue in the inspector.
struct KeyChip: View {
    let key: String
    var title: String?
    var status: StatusRef?
    var target: InspectorTarget?
    var isCritical = false

    @Environment(\.milestoneNavigator) private var navigator
    @State private var isHovered = false

    var body: some View {
        Button {
            if let target { navigator.inspect(target) }
        } label: {
            // Neutral capsules: a list of chips each tinted by team or criticality
            // turned whole panels pink. Criticality is a glyph, not a fill.
            HStack(spacing: 5) {
                if let status { StatusDot(status: status, size: 6) }
                Text(key).font(.caption.monospaced().weight(.medium)).fixedSize()
                if let title {
                    Text(title).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                if isCritical {
                    Image(systemName: "flame.fill").font(.caption2).foregroundStyle(.red)
                        .accessibilityLabel("critical")
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(isHovered && target != nil ? AnyShapeStyle(.fill.secondary) : AnyShapeStyle(.fill.tertiary), in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(target == nil)
        .onHover { isHovered = $0 }
        .help(title ?? key)
    }
}

/// Wrapping row of chips — keys lists can be long and shouldn't force the inspector wide.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(subviews: subviews, width: proposal.width ?? .infinity)
        return CGSize(width: rows.width, height: rows.height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let rows = arrange(subviews: subviews, width: bounds.width)
        for (index, origin) in rows.origins.enumerated() {
            subviews[index].place(
                at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y),
                proposal: ProposedViewSize(rows.sizes[index])
            )
        }
    }

    /// A chip wider than the row is squeezed to the row's width (its title truncates) — measuring it
    /// unconstrained would report that width upward and stretch the whole card or grid cell.
    private func arrange(subviews: Subviews, width: CGFloat) -> (origins: [CGPoint], sizes: [CGSize], width: CGFloat, height: CGFloat) {
        var origins: [CGPoint] = []
        var sizes: [CGSize] = []
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for subview in subviews {
            var size = subview.sizeThatFits(.unspecified)
            if size.width > width {
                size = subview.sizeThatFits(ProposedViewSize(width: width, height: nil))
                size.width = min(size.width, width)
            }
            sizes.append(size)
            if x > 0 && x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            origins.append(CGPoint(x: x, y: y))
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return (origins, sizes, maxX, y + rowHeight)
    }
}

struct StatTile: View {
    let title: String
    let value: String
    var detail: String?
    var systemImage: String
    var tint: Color = .accentColor

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            // Only the symbol carries the tint — a row of coloured labels reads as noise.
            Label {
                Text(title).foregroundStyle(.secondary)
            } icon: {
                Image(systemName: systemImage).foregroundStyle(tint)
            }
            .font(.caption.weight(.medium))
            Text(value)
                .font(.title2.weight(.semibold).monospacedDigit())
                .contentTransition(.numericText())
                .lineLimit(1)
            if let detail {
                Text(detail).font(.caption).foregroundStyle(.tertiary).lineLimit(1)
            }
        }
        .frame(minWidth: 96, alignment: .leading)
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.fill.quinary, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

struct SectionTitle: View {
    let title: String
    var systemImage: String?
    var count: Int?

    var body: some View {
        HStack(spacing: 6) {
            if let systemImage { Image(systemName: systemImage).foregroundStyle(.secondary) }
            Text(title).font(.headline)
            if let count {
                Text("\(count)")
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .background(.fill.tertiary, in: Capsule())
            }
            Spacer()
        }
    }
}

struct AssigneeLabel: View {
    let name: String?

    var body: some View {
        if let name {
            HStack(spacing: 4) {
                Text(initials(for: name))
                    .font(.system(size: 8.5, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 17, height: 17)
                    .background(avatarColor(for: name), in: Circle())
                Text(name.split(separator: " ").first.map(String.init) ?? name)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .help(name)
        } else {
            Label("Unassigned", systemImage: "person.crop.circle.badge.questionmark")
                .font(.caption)
                .foregroundStyle(.orange)
        }
    }
}

/// A card surface for content (not controls) — content stays content; glass is
/// reserved for the navigation and control layer above it.
struct ContentCard<Content: View>: View {
    var padding: CGFloat = 16
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(.separator.opacity(0.6), lineWidth: 0.5))
    }
}

/// Resolves a key to the inspector target it should open, based on what the
/// loaded milestone knows it to be.
func inspectorTarget(for key: String, in index: MilestoneIndex?) -> InspectorTarget? {
    guard let index else { return nil }
    if index.incrementsByKey[key] != nil { return .increment(key) }
    if index.epicsByKey[key] != nil { return .epic(key) }
    if index.itemsByKey[key] != nil { return .item(key) }
    return nil
}

/// A chip for any key in the milestone, labelled and navigable when it's known.
struct MilestoneKeyChip: View {
    let key: String
    let index: MilestoneIndex?
    var showTitle = false

    var body: some View {
        let item = index?.itemsByKey[key]
        let epic = index?.epicsByKey[key]
        let increment = index?.incrementsByKey[key]
        let title = increment?.summary ?? epic?.summary ?? item?.summary
        let status = increment?.status ?? epic?.status ?? item?.status
        let critical = item?.schedule?.critical == true || epic?.onCriticalPath == true
        KeyChip(
            key: key,
            title: showTitle ? title : nil,
            status: status,
            target: inspectorTarget(for: key, in: index),
            isCritical: critical
        )
        .help(title.map { "\(key) — \($0)" } ?? key)
    }
}
