import SwiftUI

private struct LayoutKey: Hashable {
    let generatedAt: String
    let releaseID: String
    let options: SwimlaneOptions
}

/// Scroll state shared by the swimlane's layers. Kept in an observable object rather
/// than view state so each property invalidates only the layers that read it: the
/// pinned headers follow `visible` every frame, while cards and edges only re-render
/// when `cull` crosses a tile boundary.
@MainActor
@Observable
final class SwimlaneScrollState {
    /// The visible rect in scaled content coordinates, excluding content insets.
    var visible: CGRect = .zero
    var insets = EdgeInsets()
    /// Tile-snapped region (unscaled canvas coordinates) that cards and edges render in.
    var cull: CGRect = .zero
    var viewportSize: CGSize = .zero

    func update(visible: CGRect, insets: EdgeInsets, zoom: CGFloat, bounds: CGSize) {
        self.visible = visible
        self.insets = insets
        if viewportSize != visible.size { viewportSize = visible.size }
        recull(zoom: zoom, bounds: bounds)
    }

    func recull(zoom: CGFloat, bounds: CGSize) {
        let unscaled = CGRect(x: visible.minX / zoom, y: visible.minY / zoom, width: visible.width / zoom, height: visible.height / zoom)
        let next = SwimlaneViewport.cullRect(visible: unscaled, bounds: CGRect(origin: .zero, size: bounds))
        if next != cull { cull = next }
    }
}

/// The hero view: remaining work as team (or epic) swimlanes laid out by dependency
/// level, so the critical path reads left → right and cross-team hand-offs stand out.
struct CriticalPathView: View {
    let loaded: LoadedMilestone
    @Binding var options: SwimlaneOptions
    let searchText: String

    @Environment(\.milestoneNavigator) private var navigator
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var layout = SwimlaneLayout.empty
    @State private var hoveredKey: String?
    @State private var zoom: CGFloat = 1
    @State private var pinchBase: CGFloat?
    @State private var scroll = SwimlaneScrollState()
    @State private var position = ScrollPosition()
    /// A card to bring into view once the layout and viewport exist, and to re-check
    /// while the inspector slides in and narrows the viewport.
    @State private var pendingReveal: (key: String, until: Date, from: CGPoint)?
    @FocusState private var isFocused: Bool
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
        ScrollView([.horizontal, .vertical]) {
            SwimlaneCanvas(
                layout: layout,
                loaded: loaded,
                chain: chain,
                selectedKey: selectedKey,
                hoveredKey: $hoveredKey,
                searchText: searchText,
                scroll: scroll,
                zoom: zoom,
                metrics: metrics
            )
            .frame(width: layout.size.width, height: layout.size.height, alignment: .topLeading)
            .scaleEffect(zoom, anchor: .topLeading)
            .frame(width: layout.size.width * zoom, height: layout.size.height * zoom, alignment: .topLeading)
            // Room to scroll the last lane clear of the floating legend and zoom
            // controls, which sit over the bottom edge.
            .padding(.trailing, 40)
            .padding(.bottom, 64)
        }
        .scrollPosition($position)
        // The scroll view runs under the glass sidebar, so the content the user can
        // actually see starts after the leading inset — pinned lane headers placed at
        // the raw offset end up hidden behind the sidebar.
        .onScrollGeometryChange(for: ScrollSnapshot.self) { geometry in
            let insets = geometry.contentInsets
            return ScrollSnapshot(
                visible: CGRect(
                    x: geometry.contentOffset.x + insets.leading,
                    y: geometry.contentOffset.y + insets.top,
                    width: geometry.containerSize.width - insets.leading - insets.trailing,
                    height: geometry.containerSize.height - insets.top - insets.bottom
                ),
                insets: insets
            )
        } action: { _, snapshot in
            scroll.update(visible: snapshot.visible, insets: snapshot.insets, zoom: zoom, bounds: layout.size)
        }
        .focusable()
        .focusEffectDisabled()
        .focused($isFocused)
        .onKeyPress(keys: [.leftArrow, .rightArrow, .upArrow, .downArrow, .return, .escape]) { press in
            handleKey(press.key)
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
        .overlay(alignment: .bottomLeading) { SwimlaneLegend().padding(14) }
        .overlay(alignment: .bottomTrailing) { zoomControls.padding(14) }
        .overlay {
            if layout.nodes.isEmpty {
                ContentUnavailableView(
                    "Nothing Left on the Path",
                    systemImage: "checkmark.seal",
                    description: Text(options.showDone ? "This milestone has no work items yet." : "Every item in this milestone is done. Show done items to see what was delivered.")
                )
            }
        }
        .onChange(of: LayoutKey(generatedAt: loaded.detail.generatedAt, releaseID: loaded.detail.release.id, options: options), initial: true) { old, new in
            let next = buildSwimlaneLayout(detail: loaded.detail, options: new.options, metrics: metrics)
            // Animate only user-driven changes; a background poll shouldn't make cards dance.
            if old.options != new.options, old.releaseID == new.releaseID, !reduceMotion {
                withAnimation(.snappy(duration: 0.35)) { layout = next }
            } else {
                layout = next
            }
            scroll.recull(zoom: zoom, bounds: next.size)
            if let key = selectedKey { requestReveal(key) }
        }
        .onChange(of: zoom) { _, zoom in scroll.recull(zoom: zoom, bounds: layout.size) }
        .onChange(of: selectedKey, initial: true) { _, key in
            if let key { requestReveal(key) }
        }
        // The viewport changes size when the inspector slides in after a selection,
        // and on first appearance while the window is still laying out.
        .onChange(of: scroll.viewportSize) {
            guard let pending = pendingReveal else { return }
            if pending.until < .now { pendingReveal = nil } else { reveal(pending.key) }
        }
        .defaultFocus($isFocused, true)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    // MARK: Reveal & keyboard

    private func requestReveal(_ key: String) {
        pendingReveal = (key, .now.addingTimeInterval(1.2), scroll.visible.origin)
        reveal(key)
    }

    /// Scrolls to an explicit point: `ScrollViewReader.scrollTo(id)` can't target a
    /// card here, because the cards sit inside a scaleEffect (their layout frames
    /// don't move with zoom) and are culled when off screen, so there's no view with
    /// that id to scroll to.
    ///
    /// While a reveal is pending the decision is re-made from where the scroll was
    /// when it was requested: a transiently narrow viewport (window still laying
    /// out, inspector mid-slide) must not leave the view scrolled for no reason
    /// once the card turns out to fit.
    private func reveal(_ key: String) {
        guard let node = layout.nodesByKey[key], scroll.visible.width > 0 else { return }
        let frame = CGRect(x: node.frame.minX * zoom, y: node.frame.minY * zoom,
                           width: node.frame.width * zoom, height: node.frame.height * zoom)
        let from = pendingReveal?.key == key ? (pendingReveal?.from ?? scroll.visible.origin) : scroll.visible.origin
        let origin = SwimlaneViewport.revealOrigin(
            for: frame.insetBy(dx: -12, dy: -12),
            visible: CGRect(origin: from, size: scroll.visible.size),
            obstruction: CGSize(width: metrics.laneHeaderWidth * zoom, height: metrics.columnHeaderHeight * zoom),
            contentSize: CGSize(width: layout.size.width * zoom + 40, height: layout.size.height * zoom + 64)
        ) ?? from
        guard origin != scroll.visible.origin else { return }
        // `scrollTo(point:)` sets the raw content offset, which starts under the
        // leading/top insets; the visible rect is measured from past them.
        let point = CGPoint(x: origin.x - scroll.insets.leading, y: origin.y - scroll.insets.top)
        if reduceMotion {
            position.scrollTo(point: point)
        } else {
            withAnimation(.smooth(duration: 0.45)) { position.scrollTo(point: point) }
        }
    }

    private func handleKey(_ key: KeyEquivalent) -> KeyPress.Result {
        switch key {
        case .escape:
            guard navigator.inspected != nil else { return .ignored }
            navigator.clearSelection()
            return .handled
        case .return:
            guard let selectedKey else { return .ignored }
            navigator.inspect(.item(selectedKey))
            return .handled
        default:
            let direction: SwimlaneDirection = switch key {
            case .leftArrow: .left
            case .rightArrow: .right
            case .upArrow: .up
            default: .down
            }
            let next = selectedKey.flatMap { layout.neighbor(of: $0, direction) }
                ?? (selectedKey == nil ? layout.keyboardEntryKey : nil)
            guard let next else { return .handled }
            hoveredKey = nil
            navigator.select(.item(next))
            return .handled
        }
    }

    // MARK: Controls

    private var zoomControls: some View {
        GlassEffectContainer(spacing: 8) {
            HStack(spacing: 8) {
                if zoom != 1 {
                    Button {
                        withAnimation(.smooth) { zoom = 1 }
                    } label: {
                        Text(Double(zoom).formatted(.percent.precision(.fractionLength(0))))
                            .font(.callout.monospacedDigit())
                            .frame(minWidth: 40)
                    }
                    .buttonStyle(.glass)
                    .glassEffectID("reset", in: glassNamespace)
                    .help("Actual Size (⌘0)")
                    .keyboardShortcut("0", modifiers: .command)
                }
                HStack(spacing: 0) {
                    Button { withAnimation(.smooth) { zoom = clampZoom(zoom - 0.15) } } label: {
                        Label("Zoom Out", systemImage: "minus.magnifyingglass").labelStyle(.iconOnly).frame(width: 26, height: 22)
                    }
                    .help("Zoom Out (⌘−)")
                    .keyboardShortcut("-", modifiers: .command)
                    .disabled(zoom <= 0.4)
                    Button { withAnimation(.smooth) { zoom = clampZoom(zoom + 0.15) } } label: {
                        Label("Zoom In", systemImage: "plus.magnifyingglass").labelStyle(.iconOnly).frame(width: 26, height: 22)
                    }
                    .help("Zoom In (⌘+)")
                    .keyboardShortcut("=", modifiers: .command)
                    .disabled(zoom >= 1.8)
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

    private func clampZoom(_ value: CGFloat) -> CGFloat { min(max(value, 0.4), 1.8) }
}

private struct ScrollSnapshot: Equatable {
    let visible: CGRect
    let insets: EdgeInsets
}

// MARK: - Canvas layers

/// Everything inside the scroll view, in unscaled canvas coordinates. Split into
/// layers so a hover only re-renders cards and edges, and a scroll frame only moves
/// the pinned headers.
private struct SwimlaneCanvas: View {
    let layout: SwimlaneLayout
    let loaded: LoadedMilestone
    let chain: DependencyChain?
    let selectedKey: String?
    @Binding var hoveredKey: String?
    let searchText: String
    let scroll: SwimlaneScrollState
    let zoom: CGFloat
    let metrics: SwimlaneMetrics

    var body: some View {
        ZStack(alignment: .topLeading) {
            SwimlaneBackdrop(layout: layout, metrics: metrics)
            SwimlaneSlackLayer(layout: layout, chain: chain, metrics: metrics)
            SwimlaneEdgeLayer(edges: layout.edges, chain: chain, scroll: scroll)
            SwimlaneCardLayer(
                layout: layout, loaded: loaded, chain: chain, selectedKey: selectedKey,
                hoveredKey: $hoveredKey, searchText: searchText, scroll: scroll
            )
            ColumnHeaderLayer(layout: layout, metrics: metrics, scroll: scroll, zoom: zoom)
            LaneHeaderLayer(layout: layout, metrics: metrics, scroll: scroll, zoom: zoom)
        }
    }
}

private struct SwimlaneBackdrop: View {
    let layout: SwimlaneLayout
    let metrics: SwimlaneMetrics

    var body: some View {
        ZStack(alignment: .topLeading) {
            ForEach(layout.columns) { column in
                Rectangle()
                    .fill(column.level == 0 ? Color.green.opacity(0.05) : Color.primary.opacity(column.id.isMultiple(of: 2) ? 0.015 : 0))
                    .frame(width: column.frame.width + metrics.columnGap, height: column.frame.height)
                    .offset(x: column.frame.minX - metrics.columnGap / 2)
            }
            ForEach(layout.lanes) { lane in
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(teamColor(lane.team).opacity(lane.isExternal ? 0.02 : 0.045))
                    .overlay {
                        if lane.isExternal {
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .strokeBorder(.separator, style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                        }
                    }
                    .frame(width: lane.frame.width - 12, height: lane.frame.height)
                    .offset(x: lane.frame.minX + 6, y: lane.frame.minY)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// Slack only shows for the chain being explored — drawn for every card at once,
/// the bars turn a large milestone into a wall of stripes.
private struct SwimlaneSlackLayer: View {
    let layout: SwimlaneLayout
    let chain: DependencyChain?
    let metrics: SwimlaneMetrics

    var body: some View {
        ZStack(alignment: .topLeading) {
            if let chain {
                ForEach(chain.members.sorted(), id: \.self) { key in
                    if let node = layout.nodesByKey[key], let bar = node.slackFrame {
                        Capsule()
                            .fill(LinearGradient(colors: [Color.accentColor.opacity(0.45), Color.accentColor.opacity(0.05)],
                                                 startPoint: .leading, endPoint: .trailing))
                            .frame(width: bar.width, height: bar.height)
                            .offset(x: bar.minX, y: bar.minY)
                            .help("\(node.key) can slip \(steps(Int(((bar.maxX - node.frame.maxX) / metrics.columnPitch).rounded()))) without delaying the milestone")
                            .transition(.opacity)
                    }
                }
            }
        }
        .animation(.easeOut(duration: 0.15), value: chain?.focus)
    }
}

/// One Canvas for every edge, sized to the culled region rather than the whole
/// milestone — a full-size canvas on a large milestone is a bitmap of hundreds of
/// megabytes that has to be redrawn on every hover.
private struct SwimlaneEdgeLayer: View {
    let edges: [SwimlaneLayout.Edge]
    let chain: DependencyChain?
    let scroll: SwimlaneScrollState

    var body: some View {
        let cull = scroll.cull
        let visible = edges.filter { $0.bounds.intersects(cull) }
            .sorted { rank($0) < rank($1) }
        Canvas { context, _ in
            context.translateBy(x: -cull.minX, y: -cull.minY)
            for edge in visible { draw(edge, in: context) }
        }
        .frame(width: max(cull.width, 1), height: max(cull.height, 1))
        .offset(x: cull.minX, y: cull.minY)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func draw(_ edge: SwimlaneLayout.Edge, in context: GraphicsContext) {
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
            width = 2
        } else if edge.crossTeam {
            color = .accentColor
            width = 1.5
            dash = [6, 3]
        } else {
            color = .secondary
            width = 1
        }
        if onChain { width += 0.75 }
        let opacity: Double = faded ? 0.08 : (edge.satisfied ? 0.4 : (edge.critical || onChain ? 0.9 : 0.5))

        // A soft halo under critical edges instead of a blur filter, which would
        // force an offscreen pass for the whole canvas.
        if edge.critical && !faded {
            context.stroke(path, with: .color(.red.opacity(0.14)), style: StrokeStyle(lineWidth: width + 5, lineCap: .round))
        }
        context.stroke(path, with: .color(color.opacity(opacity)), style: StrokeStyle(lineWidth: width, lineCap: .round, dash: dash))
        context.fill(arrowhead(at: edge.end, size: 3.5 + width), with: .color(color.opacity(opacity)))
    }

    private func rank(_ edge: SwimlaneLayout.Edge) -> Int {
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
}

/// Only cards in the culled region exist as views; a 300-card milestone keeps a few
/// dozen alive instead of all of them.
private struct SwimlaneCardLayer: View {
    let layout: SwimlaneLayout
    let loaded: LoadedMilestone
    let chain: DependencyChain?
    let selectedKey: String?
    @Binding var hoveredKey: String?
    let searchText: String
    let scroll: SwimlaneScrollState

    @Environment(\.milestoneNavigator) private var navigator

    var body: some View {
        let cull = scroll.cull
        ZStack(alignment: .topLeading) {
            ForEach(layout.nodes.filter { $0.frame.intersects(cull) || $0.key == selectedKey }) { node in
                if let item = loaded.index.itemsByKey[node.key] {
                    let isMatch = searchText.isEmpty || matches(item)
                    SwimlaneCard(
                        item: item,
                        epicSummary: item.epicKey.flatMap { loaded.index.epicsByKey[$0]?.summary },
                        isSelected: selectedKey == node.key,
                        isHovered: hoveredKey == node.key,
                        isSearchHit: !searchText.isEmpty && isMatch
                    )
                    .frame(width: node.frame.width, height: node.frame.height)
                    .opacity(dimmed(node.key) || !isMatch ? 0.3 : 1)
                    .onHover { hovering in
                        if hovering { hoveredKey = node.key } else if hoveredKey == node.key { hoveredKey = nil }
                    }
                    .onTapGesture { navigator.inspect(.item(node.key)) }
                    .offset(x: node.frame.minX, y: node.frame.minY)
                    .zIndex(selectedKey == node.key ? 1 : 0)
                }
            }
        }
        .animation(.easeOut(duration: 0.15), value: chain?.focus)
    }

    private func dimmed(_ key: String) -> Bool {
        guard let chain else { return false }
        return !chain.members.contains(key)
    }

    private func matches(_ item: WorkItem) -> Bool {
        matchesSearch(searchText, item.key, item.summary, item.assignee, item.team, item.epicKey,
                      item.epicKey.flatMap { loaded.index.epicsByKey[$0]?.summary })
    }
}

/// Pinned to the top of the viewport while scrolling — the content is scaled, so
/// the scroll offset is converted back into unscaled canvas points.
private struct ColumnHeaderLayer: View {
    let layout: SwimlaneLayout
    let metrics: SwimlaneMetrics
    let scroll: SwimlaneScrollState
    let zoom: CGFloat

    var body: some View {
        let counts = Dictionary(grouping: layout.nodes, by: \.column).mapValues(\.count)
        ZStack(alignment: .topLeading) {
            Rectangle()
                .fill(.bar)
                .frame(width: layout.size.width, height: metrics.columnHeaderHeight - 4)
                .overlay(alignment: .bottom) { Divider() }
            ForEach(Array(layout.columns.enumerated()), id: \.element.id) { index, column in
                HStack(spacing: 6) {
                    Text(levelTitle(column.level))
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(column.level == 0 ? Color.green : Color.primary)
                    Text("\(counts[index] ?? 0)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                .frame(width: column.frame.width, height: metrics.columnHeaderHeight - 4)
                .offset(x: column.frame.minX)
                .help(column.level == 0 ? "Work with no remaining blockers — can start now" : column.level == nil ? "Already done" : "Can start once \(steps(column.level ?? 0)) of blocking work is done")
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
            }
        }
        .offset(y: max(scroll.visible.minY / zoom, 0))
    }
}

private struct LaneHeaderLayer: View {
    let layout: SwimlaneLayout
    let metrics: SwimlaneMetrics
    let scroll: SwimlaneScrollState
    let zoom: CGFloat

    @Environment(\.milestoneNavigator) private var navigator

    var body: some View {
        let x = max(scroll.visible.minX / zoom, 0)
        ZStack(alignment: .topLeading) {
            // A solid strip under the pinned headers: cards scrolled beneath them
            // otherwise show through the material and through the gaps between lanes.
            if x > 0 {
                HStack(spacing: 0) {
                    Color(nsColor: .windowBackgroundColor)
                    LinearGradient(colors: [Color(nsColor: .windowBackgroundColor), Color(nsColor: .windowBackgroundColor).opacity(0)],
                                   startPoint: .leading, endPoint: .trailing)
                        .frame(width: 16)
                }
                .frame(width: metrics.laneHeaderWidth + 4, height: layout.size.height)
                .offset(x: x)
                .allowsHitTesting(false)
            }
            ForEach(layout.lanes) { lane in
                LaneHeader(lane: lane)
                    .frame(width: metrics.laneHeaderWidth - 18, height: lane.frame.height)
                    .offset(x: x + 6, y: lane.frame.minY)
                    .onTapGesture { navigator.showTeam(lane.team) }
            }
        }
    }
}

// MARK: - Pieces

private struct SwimlaneLegend: View {
    var body: some View {
        HStack(spacing: 14) {
            LegendSwatch(color: .red, label: "Critical")
            LegendSwatch(color: .accentColor, label: "Cross-team", dashed: true)
            LegendSwatch(color: .secondary, label: "Same team")
            HStack(spacing: 5) {
                Capsule().fill(LinearGradient(colors: [Color.accentColor.opacity(0.5), Color.accentColor.opacity(0.08)], startPoint: .leading, endPoint: .trailing))
                    .frame(width: 22, height: 4)
                Text("Slack")
            }
            .help("Hover or select a card to see how far it can slip")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .glassEffect(.regular, in: Capsule())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Legend: red lines are the critical path, dashed blue lines cross teams, grey lines stay within a team")
    }
}

private struct LegendSwatch: View {
    let color: Color
    let label: String
    var dashed = false

    var body: some View {
        HStack(spacing: 5) {
            Path { path in
                path.move(to: CGPoint(x: 0, y: 5))
                path.addLine(to: CGPoint(x: 22, y: 5))
            }
            .stroke(color, style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: dashed ? [5, 3] : []))
            .frame(width: 22, height: 10)
            Text(label)
        }
    }
}

private struct LaneHeader: View {
    let lane: SwimlaneLayout.Lane
    @State private var isHovered = false

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Capsule()
                .fill(teamColor(lane.team))
                .frame(width: 4, height: 28)
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
                HStack(spacing: 10) {
                    Label("\(lane.remaining)", systemImage: "circle.dashed")
                        .help("\(lane.remaining) remaining")
                    if lane.critical > 0 {
                        Label("\(lane.critical)", systemImage: "flame.fill")
                            .foregroundStyle(.red)
                            .help("\(lane.critical) on the critical path")
                    }
                }
                .labelStyle(.titleAndIcon)
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(Color.primary.opacity(isHovered ? 0.18 : 0.06), lineWidth: 0.5)
        }
        .onHover { isHovered = $0 }
        .help("Show \(lane.team)")
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(lane.title), \(lane.remaining) remaining, \(lane.critical) on the critical path")
        .accessibilityAddTraits(.isButton)
    }
}

struct SwimlaneCard: View {
    let item: WorkItem
    let epicSummary: String?
    var isSelected = false
    var isHovered = false
    var isSearchHit = false

    @Environment(\.colorSchemeContrast) private var contrast

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 12, style: .continuous) }

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
            shape
                .fill(Color(nsColor: .controlBackgroundColor))
                .shadow(color: .black.opacity(isHovered ? 0.12 : 0.05), radius: isHovered ? 4 : 1, y: isHovered ? 2 : 0.5)
        }
        .overlay(alignment: .leading) {
            if schedule?.ready == true {
                UnevenRoundedRectangle(topLeadingRadius: 12, bottomLeadingRadius: 12)
                    .fill(.green)
                    .frame(width: 3)
            }
        }
        .overlay { shape.strokeBorder(borderColor(critical: critical), lineWidth: borderWidth(critical: critical)) }
        .overlay {
            if isSelected {
                shape.inset(by: -4).stroke(Color.accentColor, lineWidth: 2.5)
            }
        }
        .opacity(item.status.isDone ? 0.6 : 1)
        .contentShape(shape)
        .animation(.easeOut(duration: 0.12), value: isHovered)
        .help([item.key, item.summary, epicSummary.map { "Epic: \($0)" }, item.schedule.map(scheduleSummary)].compactMap { $0 }.joined(separator: "\n"))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(item.key), \(item.summary)")
        .accessibilityValue(accessibilityValue)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    private func borderColor(critical: Bool) -> Color {
        if isSearchHit { return .yellow }
        if critical { return .red.opacity(contrast == .increased ? 1 : 0.7) }
        return .primary.opacity(contrast == .increased ? 0.4 : (isHovered ? 0.2 : 0.1))
    }

    private func borderWidth(critical: Bool) -> CGFloat {
        isSearchHit ? 2 : (critical ? 1.5 : (contrast == .increased ? 1 : 0.5))
    }

    private var accessibilityValue: String {
        var parts = [item.status.name, item.team]
        parts.append(item.assignee.map { "assigned to \($0)" } ?? "unassigned")
        if let schedule = item.schedule {
            parts.append(scheduleSummary(schedule))
            if schedule.downstream > 0 { parts.append("unblocks \(pluralized(schedule.downstream, "item"))") }
        }
        if let epicSummary { parts.append("epic \(epicSummary)") }
        return parts.joined(separator: ", ")
    }
}
