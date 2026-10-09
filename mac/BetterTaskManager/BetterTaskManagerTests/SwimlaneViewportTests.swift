import CoreGraphics
import Foundation
import Testing

@testable import BetterTaskManager

@Suite struct SwimlaneViewportTests {
    private let content = CGSize(width: 4000, height: 3000)
    private let obstruction = CGSize(width: 176, height: 40)

    @Test func aCardAlreadyInTheClearAreaDoesNotScroll() {
        let visible = CGRect(x: 0, y: 0, width: 1200, height: 800)
        let card = CGRect(x: 400, y: 300, width: 228, height: 82)
        #expect(SwimlaneViewport.revealOrigin(for: card, visible: visible, obstruction: obstruction, contentSize: content) == nil)
    }

    @Test func aCardUnderThePinnedHeadersCountsAsHidden() {
        let visible = CGRect(x: 500, y: 0, width: 1200, height: 800)
        let underLaneHeader = CGRect(x: 520, y: 300, width: 228, height: 82)
        #expect(SwimlaneViewport.revealOrigin(for: underLaneHeader, visible: visible, obstruction: obstruction, contentSize: content) != nil)
    }

    @Test func aFarCardIsCentredInTheClearArea() throws {
        let visible = CGRect(x: 0, y: 0, width: 1200, height: 800)
        let card = CGRect(x: 2500, y: 1500, width: 228, height: 82)
        let origin = try #require(SwimlaneViewport.revealOrigin(for: card, visible: visible, obstruction: obstruction, contentSize: content))
        let clearMidX = origin.x + obstruction.width + (visible.width - obstruction.width) / 2
        let clearMidY = origin.y + obstruction.height + (visible.height - obstruction.height) / 2
        #expect(abs(clearMidX - card.midX) < 0.5)
        #expect(abs(clearMidY - card.midY) < 0.5)
    }

    @Test func revealNeverScrollsPastTheContent() throws {
        let visible = CGRect(x: 0, y: 0, width: 1200, height: 800)
        let corner = CGRect(x: 3760, y: 2900, width: 228, height: 82)
        let origin = try #require(SwimlaneViewport.revealOrigin(for: corner, visible: visible, obstruction: obstruction, contentSize: content))
        #expect(origin == CGPoint(x: 2800, y: 2200))
        let start = CGRect(x: 180, y: 42, width: 228, height: 82)
        let scrolled = CGRect(x: 1500, y: 1500, width: 1200, height: 800)
        #expect(SwimlaneViewport.revealOrigin(for: start, visible: scrolled, obstruction: obstruction, contentSize: content) == .zero)
    }

    @Test func cullRectOnlyChangesAcrossTileBoundaries() {
        let bounds = CGRect(origin: .zero, size: content)
        let a = SwimlaneViewport.cullRect(visible: CGRect(x: 810, y: 410, width: 1000, height: 600), bounds: bounds)
        let b = SwimlaneViewport.cullRect(visible: CGRect(x: 830, y: 430, width: 1000, height: 600), bounds: bounds)
        #expect(a == b)
        #expect(a.contains(CGRect(x: 810, y: 410, width: 1000, height: 600)))
        let far = SwimlaneViewport.cullRect(visible: CGRect(x: 2500, y: 410, width: 1000, height: 600), bounds: bounds)
        #expect(far != a)
        #expect(bounds.contains(far))
    }

    @Test func cullingKeepsAFractionOfALargeMilestone() throws {
        let detail: MilestoneDetail = try loadFixture("milestone-detail-large")
        let layout = buildSwimlaneLayout(detail: detail, options: SwimlaneOptions())
        let cull = SwimlaneViewport.cullRect(visible: CGRect(x: 0, y: 0, width: 1400, height: 900),
                                             bounds: CGRect(origin: .zero, size: layout.size))
        let cards = layout.nodes.filter { $0.frame.intersects(cull) }.count
        let edges = layout.edges.filter { $0.bounds.intersects(cull) }.count
        #expect(cards < layout.nodes.count / 3)
        #expect(edges < layout.edges.count)
    }

    @Test func edgeBoundsContainTheWholeCurve() throws {
        let detail: MilestoneDetail = try loadFixture("milestone-detail-multiteam")
        let layout = buildSwimlaneLayout(detail: detail, options: SwimlaneOptions())
        for edge in layout.edges {
            #expect(edge.bounds.contains(edge.start))
            #expect(edge.bounds.contains(edge.end))
        }
    }

    @Test func arrowKeysMoveBetweenNeighbouringCards() throws {
        let detail: MilestoneDetail = try loadFixture("milestone-detail-multiteam")
        let layout = buildSwimlaneLayout(detail: detail, options: SwimlaneOptions())
        let entry = try #require(layout.keyboardEntryKey)
        #expect(layout.nodesByKey[entry]?.isCritical == true)

        let start = try #require(layout.nodesByKey[entry])
        let right = try #require(layout.neighbor(of: entry, .right))
        #expect(layout.nodesByKey[right]!.column > start.column)
        #expect(layout.neighbor(of: right, .left) != nil)

        for node in layout.nodes {
            if let down = layout.neighbor(of: node.key, .down) {
                let below = layout.nodesByKey[down]!
                #expect(below.column == node.column)
                #expect(below.frame.midY > node.frame.midY)
            }
        }
        let lastColumn = layout.nodes.map(\.column).max()!
        let rightmost = layout.nodes.first { $0.column == lastColumn }!
        #expect(layout.neighbor(of: rightmost.key, .right) == nil)
    }
}
