import CoreGraphics
import Foundation

/// Scroll and culling math for the swimlane, kept out of the view so it can be tested
/// without a window. Rects are in the scroll view's content coordinates.
nonisolated enum SwimlaneViewport {
    /// The visible-area origin that centres `frame` in the part of the viewport not
    /// covered by the pinned lane/column headers, or nil when it's already in view.
    /// Clamped so the scroll never runs past the content.
    static func revealOrigin(
        for frame: CGRect,
        visible: CGRect,
        obstruction: CGSize,
        contentSize: CGSize
    ) -> CGPoint? {
        guard visible.width > 0, visible.height > 0 else { return nil }
        let clear = CGRect(
            x: visible.minX + obstruction.width, y: visible.minY + obstruction.height,
            width: max(visible.width - obstruction.width, 1), height: max(visible.height - obstruction.height, 1)
        )
        if clear.contains(frame) { return nil }
        let x = frame.midX - obstruction.width - (visible.width - obstruction.width) / 2
        let y = frame.midY - obstruction.height - (visible.height - obstruction.height) / 2
        return CGPoint(
            x: min(max(x, 0), max(contentSize.width - visible.width, 0)),
            y: min(max(y, 0), max(contentSize.height - visible.height, 0))
        )
    }

    /// The visible rect grown by a margin and snapped outward to a tile grid, so the
    /// set of rendered cards and edges only changes when scrolling crosses a tile
    /// boundary — not on every scroll frame.
    static func cullRect(visible: CGRect, tile: CGFloat = 400, bounds: CGRect) -> CGRect {
        guard visible.width > 0, visible.height > 0 else { return bounds }
        let grown = visible.insetBy(dx: -tile / 2, dy: -tile / 2)
        let snapped = CGRect(
            x: (grown.minX / tile).rounded(.down) * tile,
            y: (grown.minY / tile).rounded(.down) * tile,
            width: 0, height: 0
        )
        let maxX = (grown.maxX / tile).rounded(.up) * tile
        let maxY = (grown.maxY / tile).rounded(.up) * tile
        let rect = CGRect(x: snapped.minX, y: snapped.minY, width: maxX - snapped.minX, height: maxY - snapped.minY)
        return rect.intersection(bounds)
    }
}

nonisolated enum SwimlaneDirection: Sendable {
    case left, right, up, down
}

nonisolated extension SwimlaneLayout {
    /// The card arrow-key navigation lands on: sideways moves to the nearest column
    /// that has cards, picking the card closest in height; up/down stays in the
    /// column (crossing lanes) so the eye can follow a level top to bottom.
    func neighbor(of key: String, _ direction: SwimlaneDirection) -> String? {
        guard let current = nodesByKey[key] else { return nil }
        let candidates: [Node]
        switch direction {
        case .left, .right:
            let sideways = nodes.filter { direction == .right ? $0.column > current.column : $0.column < current.column }
            guard let column = (direction == .right ? sideways.map(\.column).min() : sideways.map(\.column).max()) else { return nil }
            candidates = sideways.filter { $0.column == column }
        case .up:
            candidates = nodes.filter { $0.column == current.column && $0.frame.midY < current.frame.midY }
        case .down:
            candidates = nodes.filter { $0.column == current.column && $0.frame.midY > current.frame.midY }
        }
        return candidates.min { abs($0.frame.midY - current.frame.midY) < abs($1.frame.midY - current.frame.midY) }?.key
    }

    /// Where keyboard navigation starts with nothing selected: the first critical
    /// card if there is one, else the top-left card.
    var keyboardEntryKey: String? {
        let ordered = nodes.sorted { ($0.column, $0.frame.minY) < ($1.column, $1.frame.minY) }
        return (ordered.first { $0.isCritical } ?? ordered.first)?.key
    }
}

nonisolated extension SwimlaneLayout.Edge {
    /// A bezier stays inside the hull of its control points; padded for the arrowhead
    /// and stroke so culling never clips a visible edge.
    var bounds: CGRect {
        let xs = [start.x, control1.x, control2.x, end.x]
        let ys = [start.y, control1.y, control2.y, end.y]
        return CGRect(x: xs.min()!, y: ys.min()!, width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!)
            .insetBy(dx: -8, dy: -8)
    }
}
