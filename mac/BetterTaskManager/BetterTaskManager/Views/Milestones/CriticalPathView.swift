import SwiftUI

private struct LayoutKey: Hashable {
    let generatedAt: String
    let releaseID: String
    let options: SwimlaneOptions
}

/// The hero view: remaining work as team (or epic) swimlanes laid out by dependency
/// level, so the critical path reads left → right and cross-team hand-offs stand out.
struct CriticalPathView: View {
    let loaded: LoadedMilestone
    @Binding var options: SwimlaneOptions
    let searchText: String

    @Environment(\.milestoneNavigator) private var navigator
    @State private var layout = SwimlaneLayout.empty
    @State private var hoveredKey: String?
    @State private var zoom: CGFloat = 1
    @State private var pinchBase: CGFloat?
    @State private var scrollOffset: CGPoint = .zero
    @State private var viewport: CGSize = .zero
    @State private var revealRequest: RevealRequest?
    @Namespace private var selectionNamespace
    @Namespace private var glassNamespace

    private let metrics = SwimlaneMetrics()

    private var selectedKey: String? {
        if case let .item(key) = navigator.inspected { return key }
        return nil
    }

    /// Hover wins over selection so the user can explore without losing their place.
    private var chain: DependencyChain? {
        guard let focus = hoveredKey ?? selectedKey, layout.nodesByKey[focus] != nil else { return nil }
        return loaded.graph.chain(through: focus)
    }

    var body: some View {
        let chain = chain
        ScrollViewReader { proxy in
            ScrollView([.horizontal, .vertical]) {
                ZStack(alignment: .topLeading) {
                    canvas(chain: chain)
                        .frame(width: layout.size.width, height: layout.size.height, alignment: .topLeading)
                        .scaleEffect(zoom, anchor: .topLeading)
                        .frame(width: layout.size.width * zoom, height: layout.size.height * zoom, alignment: .topLeading)
                    revealAnchors
                }
                // Room to scroll the last lane clear of the floating legend and zoom
                // controls, which sit over the bottom edge.
                .padding(.trailing, 40)
                .padding(.bottom, 64)
            }
            // Selecting also slides the inspector in (and on first appearance the
            // window is still laying out), which resizes the scroll view. Restarting on
            // every viewport change and waiting for it to hold still means the scroll
            // is computed against the final size, not one that's about to shrink.
            .task(id: RevealTrigger(request: revealRequest, viewport: viewport, contentSize: layout.size)) {
                guard let request = revealRequest else { return }
                try? await Task.sleep(for: .milliseconds(250))
                guard !Task.isCancelled else { return }
                withAnimation(.smooth) { proxy.scrollTo(request.key, anchor: .center) }
                revealRequest = nil
            }
        }
        // The scroll view runs under the glass sidebar, so the content the user can
        // actually see starts after the leading inset — pinned lane headers placed at
        // the raw offset (or at visibleRect, which includes the covered strip) end up
        // hidden behind the sidebar.
        .onScrollGeometryChange(for: CGRect.self) { geometry in
            let insets = geometry.contentInsets
            return CGRect(
                x: geometry.contentOffset.x + insets.leading,
                y: geometry.contentOffset.y + insets.top,
                width: geometry.containerSize.width - insets.leading - insets.trailing,
                height: geometry.containerSize.height - insets.top - insets.bottom
            )
        } action: { _, visible in
            scrollOffset = visible.origin
            viewport = visible.size
        }
        .gesture(
            MagnifyGesture()
                .onChanged { value in
                    let base = pinchBase ?? zoom
                    pinchBase = base
                    zoom = clampZoom(base * value.magnification)
                }
                .onEnded { _ in pinchBase = nil }
        )
        .overlay(alignment: .bottomLeading) { legend.padding(14) }
        .overlay(alignment: .bottomTrailing) { zoomControls.padding(14) }
        .overlay {
            if layout.nodes.isEmpty {
                ContentUnavailableView(
                    "Nothing left on the path",
                    systemImage: "checkmark.seal",
                    description: Text(options.showDone ? "This milestone has no work items yet." : "Every item in this milestone is done. Show done items to see what was delivered.")
                )
            }
        }
        .onChange(of: LayoutKey(generatedAt: loaded.detail.generatedAt, releaseID: loaded.detail.release.id, options: options), initial: true) { old, new in
            let next = buildSwimlaneLayout(detail: loaded.detail, options: new.options, metrics: metrics)
            // Animate only user-driven changes; a background poll shouldn't make cards dance.
            if old.options != new.options, old.releaseID == new.releaseID {
                withAnimation(.snappy(duration: 0.35)) { layout = next }
            } else {
                layout = next
            }
        }
        .onChange(of: selectedKey) { _, key in
            if let key { reveal(key) }
        }
        // A selection made before this view existed (another tab, a launch argument)
        // can only be revealed once both the layout and the viewport are known.
        .onChange(of: layout.size != .zero && viewport != .zero) { _, ready in
            if ready, let key = selectedKey { reveal(key) }
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    // MARK: Canvas

    private func canvas(chain: DependencyChain?) -> some View {
        ZStack(alignment: .topLeading) {
            columnBands
            laneBackgrounds
            slackBars(chain: chain)
            edges(chain: chain)
            cards(chain: chain)
            columnHeaders
            laneHeaders
        }
    }

    private var columnBands: some View {
        ForEach(layout.columns) { column in
            let isNow = column.level == 0
            Rectangle()
                .fill(isNow ? AnyShapeStyle(Color.green.opacity(0.06)) : AnyShapeStyle(column.id.isMultiple(of: 2) ? Color.primary.opacity(0.018) : .clear))
                .frame(width: column.frame.width + metrics.columnGap, height: column.frame.height)
                .offset(x: column.frame.minX - metrics.columnGap / 2, y: 0)
        }
    }

    private var laneBackgrounds: some View {
        ForEach(layout.lanes) { lane in
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(teamColor(lane.team).opacity(lane.isExternal ? 0.025 : 0.05))
                .overlay(
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .strokeBorder(teamColor(lane.team).opacity(0.14), style: StrokeStyle(lineWidth: 1, dash: lane.isExternal ? [5, 4] : []))
                )
                .frame(width: lane.frame.width - 12, height: lane.frame.height)
                .offset(x: lane.frame.minX + 6, y: lane.frame.minY)
        }
    }

    private func slackBars(chain: DependencyChain?) -> some View {
        ForEach(layout.nodes.filter { $0.slackFrame != nil }) { node in
            if let bar = node.slackFrame {
                Capsule()
                    .fill(LinearGradient(colors: [Color.accentColor.opacity(0.3), Color.accentColor.opacity(0.0)], startPoint: .leading, endPoint: .trailing))
                    .frame(width: bar.width, height: bar.height)
                    .offset(x: bar.minX, y: bar.minY)
                    .opacity(dimmed(node.key, chain: chain) ? 0.25 : 1)
                    .help("\(node.key) can slip \(steps(Int(((bar.maxX - node.frame.maxX) / metrics.columnPitch).rounded()))) without delaying the milestone")
            }
        }
    }

    private func edges(chain: DependencyChain?) -> some View {
        let edges = layout.edges
        return Canvas { context, _ in
            // Background edges first so highlighted and critical ones always draw on top.
            let ordered = edges.sorted { rank($0, chain: chain) < rank($1, chain: chain) }
            for edge in ordered {
                let onChain = chain?.contains(edgeFrom: edge.from, to: edge.to) ?? false
                let faded = chain != nil && !onChain
                var path = Path()
                path.move(to: edge.start)
                path.addCurve(to: edge.end, control1: edge.control1, control2: edge.control2)

                let color: Color
                var width: CGFloat
                var dash: [CGFloat] = []
                if edge.satisfied {
                    color = .secondary
                    width = 1
                    dash = [3, 3]
                } else if edge.critical {
                    color = .red
                    width = 2.4
                } else if edge.crossTeam {
                    color = .accentColor
                    width = 1.8
                    dash = [6, 3]
                } else {
                    color = .secondary
                    width = 1.2
                }
                if onChain { width += 0.8 }
                let opacity: Double = faded ? 0.1 : (edge.satisfied ? 0.45 : (edge.critical || onChain ? 0.95 : 0.6))

                if edge.critical && !faded {
                    var glow = context
                    glow.addFilter(.blur(radius: 4))
                    glow.stroke(path, with: .color(.red.opacity(0.45)), style: StrokeStyle(lineWidth: width + 3, lineCap: .round))
                }
                context.stroke(path, with: .color(color.opacity(opacity)),
                               style: StrokeStyle(lineWidth: width, lineCap: .round, dash: dash))
                context.fill(arrowhead(at: edge.end, size: 4 + width), with: .color(color.opacity(opacity)))
            }
        }
        .frame(width: layout.size.width, height: layout.size.height)
        .allowsHitTesting(false)
    }

    private func rank(_ edge: SwimlaneLayout.Edge, chain: DependencyChain?) -> Int {
        if chain?.contains(edgeFrom: edge.from, to: edge.to) == true { return 3 }
        if edge.critical { return 2 }
        if edge.crossTeam { return 1 }
        return 0
    }

    private func arrowhead(at point: CGPoint, size: CGFloat) -> Path {
        Path { path in
            path.move(to: point)
            path.addLine(to: CGPoint(x: point.x - size * 1.4, y: point.y - size * 0.75))
            path.addLine(to: CGPoint(x: point.x - size * 1.4, y: point.y + size * 0.75))
            path.closeSubpath()
        }
    }

    private func cards(chain: DependencyChain?) -> some View {
        ForEach(layout.nodes) { node in
            if let item = loaded.index.itemsByKey[node.key] {
                SwimlaneCard(
                    item: item,
                    epicSummary: item.epicKey.flatMap { loaded.index.epicsByKey[$0]?.summary },
                    isSelected: selectedKey == node.key,
                    isSearchHit: !searchText.isEmpty && matches(item)
                )
                .frame(width: node.frame.width, height: node.frame.height)
                .background {
                    if selectedKey == node.key {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color.accentColor, lineWidth: 2.5)
                            .padding(-4)
                            .matchedGeometryEffect(id: "selection", in: selectionNamespace)
                    }
                }
                .opacity(dimmed(node.key, chain: chain) || (!searchText.isEmpty && !matches(item)) ? 0.28 : 1)
                .scaleEffect(hoveredKey == node.key ? 1.025 : 1)
                .onHover { hovering in
                    withAnimation(.easeOut(duration: 0.15)) {
                        if hovering { hoveredKey = node.key } else if hoveredKey == node.key { hoveredKey = nil }
                    }
                }
                .onTapGesture { navigator.inspect(.item(node.key)) }
                .offset(x: node.frame.minX, y: node.frame.minY)
                .zIndex(hoveredKey == node.key ? 1 : 0)
            }
        }
    }

    /// Pinned to the top of the viewport while scrolling — the content is scaled, so
    /// the scroll offset is converted back into unscaled canvas points.
    private var columnHeaders: some View {
        let y = max(scrollOffset.y / zoom, 0)
        let counts = Dictionary(grouping: layout.nodes, by: \.column).mapValues(\.count)
        return ZStack(alignment: .topLeading) {
            LinearGradient(colors: [Color(nsColor: .windowBackgroundColor), Color(nsColor: .windowBackgroundColor).opacity(0)],
                           startPoint: .top, endPoint: .bottom)
                .frame(width: layout.size.width, height: metrics.columnHeaderHeight + 6)
            ForEach(Array(layout.columns.enumerated()), id: \.element.id) { index, column in
                HStack(spacing: 6) {
                    Text(levelTitle(column.level))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(column.level == 0 ? .green : .primary)
                    Text("\(counts[index] ?? 0)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                .frame(width: column.frame.width, height: metrics.columnHeaderHeight - 6)
                .offset(x: column.frame.minX, y: 4)
                .help(column.level == 0 ? "Work with no remaining blockers — can start now" : column.level == nil ? "Already done" : "Can start once \(steps(column.level ?? 0)) of blocking work is done")
            }
        }
        .offset(y: y)
        .allowsHitTesting(true)
    }

    private var laneHeaders: some View {
        let x = max(scrollOffset.x / zoom, 0)
        return ForEach(layout.lanes) { lane in
            LaneHeader(lane: lane)
                .frame(width: metrics.laneHeaderWidth - 18, height: lane.frame.height)
                .offset(x: x + 6, y: lane.frame.minY)
                .onTapGesture { navigator.showTeam(lane.team) }
        }
    }

    // MARK: Controls

    private var legend: some View {
        HStack(spacing: 14) {
            LegendSwatch(color: .red, label: "Critical", glow: true)
            LegendSwatch(color: .accentColor, label: "Cross-team", dashed: true)
            LegendSwatch(color: .secondary, label: "Same team")
            HStack(spacing: 5) {
                Capsule().fill(LinearGradient(colors: [Color.accentColor.opacity(0.5), Color.accentColor.opacity(0.08)], startPoint: .leading, endPoint: .trailing))
                    .frame(width: 22, height: 4)
                Text("Slack")
            }
        }
        .font(.caption)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .glassEffect(.regular, in: Capsule())
    }

    private var zoomControls: some View {
        GlassEffectContainer(spacing: 8) {
            HStack(spacing: 8) {
                if zoom != 1 {
                    Button {
                        withAnimation(.smooth) { zoom = 1 }
                    } label: {
                        Text("\(Int((zoom * 100).rounded()))%")
                            .font(.callout.monospacedDigit())
                            .frame(minWidth: 40)
                    }
                    .buttonStyle(.glass)
                    .glassEffectID("reset", in: glassNamespace)
                    .help("Reset zoom (⌘0)")
                    .keyboardShortcut("0", modifiers: .command)
                }
                HStack(spacing: 0) {
                    Button { withAnimation(.smooth) { zoom = clampZoom(zoom - 0.15) } } label: {
                        Image(systemName: "minus.magnifyingglass").frame(width: 26, height: 22)
                    }
                    .help("Zoom out (⌘−)")
                    .keyboardShortcut("-", modifiers: .command)
                    Button { withAnimation(.smooth) { zoom = clampZoom(zoom + 0.15) } } label: {
                        Image(systemName: "plus.magnifyingglass").frame(width: 26, height: 22)
                    }
                    .help("Zoom in (⌘+)")
                    .keyboardShortcut("=", modifiers: .command)
                }
                .buttonStyle(.borderless)
                .padding(.horizontal, 6)
                .padding(.vertical, 5)
                .glassEffect(.regular.interactive(), in: Capsule())
                .glassEffectID("zoom", in: glassNamespace)
            }
        }
        .animation(.smooth, value: zoom == 1)
    }

    // MARK: Helpers

    private func clampZoom(_ value: CGFloat) -> CGFloat { min(max(value, 0.4), 1.8) }

    private func dimmed(_ key: String, chain: DependencyChain?) -> Bool {
        guard let chain else { return false }
        return !chain.members.contains(key)
    }

    private func matches(_ item: WorkItem) -> Bool {
        matchesSearch(searchText, item.key, item.summary, item.assignee, item.team, item.epicKey,
                      item.epicKey.flatMap { loaded.index.epicsByKey[$0]?.summary })
    }

    /// Centers a card the user navigated to from elsewhere (inspector chips, lists),
    /// unless it's already comfortably on screen.
    private func reveal(_ key: String) {
        guard let node = layout.nodesByKey[key], viewport.width > 0 else { return }
        let frame = CGRect(x: node.frame.minX * zoom, y: node.frame.minY * zoom,
                           width: node.frame.width * zoom, height: node.frame.height * zoom)
        // Pinned lane and column headers cover the top-left of the viewport.
        let unobstructed = CGRect(
            x: scrollOffset.x + metrics.laneHeaderWidth * zoom, y: scrollOffset.y + metrics.columnHeaderHeight * zoom,
            width: viewport.width - metrics.laneHeaderWidth * zoom, height: viewport.height - metrics.columnHeaderHeight * zoom
        )
        guard !unobstructed.contains(frame) else { return }
        revealRequest = RevealRequest(key: key)
    }

    /// Invisible stand-ins at each card's *scaled* frame. The cards themselves sit
    /// inside a scaleEffect, which doesn't move their layout frames, so scrolling to
    /// them by id would land in the wrong place at any zoom other than 100%.
    private var revealAnchors: some View {
        ForEach(layout.nodes) { node in
            Color.clear
                .frame(width: node.frame.width * zoom, height: node.frame.height * zoom)
                .id(node.key)
                .padding(.leading, node.frame.minX * zoom)
                .padding(.top, node.frame.minY * zoom)
                .allowsHitTesting(false)
        }
    }
}

private struct RevealTrigger: Hashable {
    let request: RevealRequest?
    let viewport: CGSize
    let contentSize: CGSize
}

/// A fresh value per request so asking to reveal the same card twice still scrolls.
private struct RevealRequest: Hashable {
    let key: String
    let id = UUID()
}

private struct LegendSwatch: View {
    let color: Color
    let label: String
    var dashed = false
    var glow = false

    var body: some View {
        HStack(spacing: 5) {
            Path { path in
                path.move(to: CGPoint(x: 0, y: 5))
                path.addLine(to: CGPoint(x: 22, y: 5))
            }
            .stroke(color, style: StrokeStyle(lineWidth: glow ? 2.4 : 1.6, lineCap: .round, dash: dashed ? [5, 3] : []))
            .frame(width: 22, height: 10)
            .shadow(color: glow ? color.opacity(0.6) : .clear, radius: 3)
            Text(label)
        }
    }
}

private struct LaneHeader: View {
    let lane: SwimlaneLayout.Lane
    @State private var isHovered = false

    var body: some View {
        HStack(spacing: 0) {
            Capsule()
                .fill(teamColor(lane.team))
                .frame(width: 4)
                .padding(.vertical, 12)
            VStack(alignment: .leading, spacing: 4) {
                Text(lane.title)
                    .font(.headline)
                    .lineLimit(3)
                if let subtitle = lane.subtitle {
                    Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                if lane.isExternal {
                    Badge(text: "Outside milestone", systemImage: "arrow.up.forward.square", tint: .secondary)
                }
                HStack(spacing: 8) {
                    Label("\(lane.remaining)", systemImage: "circle.dashed")
                        .help("\(lane.remaining) remaining")
                    if lane.critical > 0 {
                        Label("\(lane.critical)", systemImage: "flame.fill")
                            .foregroundStyle(.red)
                            .help("\(lane.critical) on the critical path")
                    }
                }
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 10).padding(.top, 12).frame(maxHeight: .infinity, alignment: .top)
            Spacer(minLength: 0)
        }
        .frame(maxHeight: .infinity, alignment: .top)
        .padding(.top, 2)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(.separator.opacity(isHovered ? 1 : 0.5), lineWidth: 0.5))
        .onHover { isHovered = $0 }
        .help("Show \(lane.team)")
    }
}

struct SwimlaneCard: View {
    let item: WorkItem
    let epicSummary: String?
    var isSelected = false
    var isSearchHit = false

    var body: some View {
        let schedule = item.schedule
        let critical = schedule?.critical == true
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 5) {
                StatusDot(status: item.status, size: 6)
                Text(item.key)
                    .font(.caption.monospaced().weight(.medium))
                    .foregroundStyle(.secondary)
                if item.external {
                    Image(systemName: "arrow.up.forward.square")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .help("Outside this milestone")
                }
                Spacer(minLength: 4)
                if schedule?.ready == true {
                    Image(systemName: "play.circle.fill")
                        .foregroundStyle(.green)
                        .help("Ready — every blocker is done")
                }
                if critical {
                    Image(systemName: "flame.fill")
                        .foregroundStyle(.red)
                        .help("On the critical path")
                }
            }
            .font(.caption)

            Text(item.summary)
                .font(.callout.weight(.medium))
                .lineLimit(2)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)

            Spacer(minLength: 0)

            HStack(spacing: 6) {
                if item.placeholder {
                    Badge(text: "Not broken down", systemImage: "square.dashed", tint: .orange)
                } else {
                    AssigneeLabel(name: item.assignee)
                }
                Spacer(minLength: 0)
                if let schedule, schedule.downstream > 0 {
                    Label("\(schedule.downstream)", systemImage: "arrow.turn.down.right")
                        .font(.caption2.monospacedDigit().weight(.semibold))
                        .foregroundStyle(schedule.downstreamTeams.isEmpty ? Color.secondary : Color.accentColor)
                        .help("Unblocks \(pluralized(schedule.downstream, "item"))" + (schedule.downstreamTeams.isEmpty ? "" : " incl. \(schedule.downstreamTeams.joined(separator: ", "))"))
                }
                if let schedule, schedule.slack > 0 {
                    Text("+\(schedule.slack)")
                        .font(.caption2.monospacedDigit().weight(.semibold))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(Color.accentColor.opacity(0.12), in: Capsule())
                        .foregroundStyle(Color.accentColor)
                        .help("\(steps(schedule.slack)) of slack")
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color(nsColor: .controlBackgroundColor))
                .shadow(color: critical ? .red.opacity(0.35) : .black.opacity(0.08), radius: critical ? 8 : 3, y: critical ? 0 : 1)
        }
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(
                    isSearchHit ? Color.yellow : (critical ? Color.red.opacity(0.75) : Color.primary.opacity(0.1)),
                    lineWidth: isSearchHit ? 2 : (critical ? 1.5 : 0.75)
                )
        }
        .overlay(alignment: .leading) {
            if schedule?.ready == true {
                UnevenRoundedRectangle(topLeadingRadius: 12, bottomLeadingRadius: 12)
                    .fill(.green)
                    .frame(width: 3.5)
            }
        }
        .opacity(item.status.isDone ? 0.6 : 1)
        .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .help([item.key, item.summary, epicSummary.map { "Epic: \($0)" }, item.schedule.map(scheduleSummary)].compactMap { $0 }.joined(separator: "\n"))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}
