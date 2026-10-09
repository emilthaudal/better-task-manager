import Foundation
import Testing

@testable import BetterTaskManager

/// `milestone-detail-large.json` is a six-team, ~320-item synthetic milestone from
/// mac/scripts/generate-milestone-fixtures.ts — the scale the swimlane has to stay
/// smooth at. Timings are printed so regressions are visible in test logs; the
/// bounds are loose enough not to flake on a busy CI machine.
@Suite struct LargeMilestoneTests {
    private func time(_ body: () -> Void) -> Duration {
        let clock = ContinuousClock()
        return clock.measure(body)
    }

    @Test func layoutOfALargeMilestoneIsFast() throws {
        let detail: MilestoneDetail = try loadFixture("milestone-detail-large")
        #expect(detail.items.count > 300)
        #expect(Set(detail.items.map(\.team)).count == 6)

        var layout = SwimlaneLayout.empty
        let elapsed = time {
            for _ in 0..<10 { layout = buildSwimlaneLayout(detail: detail, options: SwimlaneOptions()) }
        }
        print("[perf] buildSwimlaneLayout large ×10: \(elapsed)")
        #expect(layout.nodes.count + layout.hiddenLaneByKey.count == detail.items.filter { $0.schedule != nil }.count)
        #expect(elapsed < .seconds(2))
    }

    @Test func indexingAndChainsOfALargeMilestoneAreFast() throws {
        let detail: MilestoneDetail = try loadFixture("milestone-detail-large")
        var loaded: LoadedMilestone?
        let build = time { loaded = LoadedMilestone(detail) }
        let graph = try #require(loaded).graph
        let chains = time {
            for item in detail.items { _ = graph.chain(through: item.key) }
        }
        print("[perf] LoadedMilestone large: \(build); chain for every item: \(chains)")
        #expect(build < .milliseconds(500))
        #expect(chains < .seconds(1))
    }

    @Test func crowdedCellsFoldBehindAMorePill() throws {
        let detail: MilestoneDetail = try loadFixture("milestone-detail-large")
        let metrics = SwimlaneMetrics()
        let folded = buildSwimlaneLayout(detail: detail, options: SwimlaneOptions(), metrics: metrics)
        let remaining = detail.items.filter { $0.schedule != nil }

        #expect(!folded.overflows.isEmpty)
        // Every remaining item is either a card or accounted for behind a pill.
        #expect(folded.nodes.count + folded.hiddenLaneByKey.count == remaining.count)
        #expect(folded.overflows.map(\.hiddenCount).reduce(0, +) == folded.hiddenLaneByKey.count)
        #expect(folded.columnCounts.reduce(0, +) == remaining.count)
        // No cell shows more than the limit, and critical work is never folded away.
        let cells = Dictionary(grouping: folded.nodes) { "\($0.laneID)#\($0.column)" }
        #expect(cells.values.allSatisfy { $0.count <= metrics.cellLimit })
        let index = MilestoneIndex(detail)
        #expect(folded.hiddenLaneByKey.keys.allSatisfy { index.itemsByKey[$0]?.schedule?.critical == false })
        // Edges only join cards that are on screen.
        #expect(folded.edges.allSatisfy { folded.nodesByKey[$0.from] != nil && folded.nodesByKey[$0.to] != nil })

        let lane = try #require(folded.overflows.first?.laneID)
        let unfolded = buildSwimlaneLayout(detail: detail, options: SwimlaneOptions(), metrics: metrics, expandedLanes: [lane])
        #expect(unfolded.overflows.allSatisfy { $0.laneID != lane })
        #expect(unfolded.hiddenLaneByKey.values.allSatisfy { $0 != lane })
        #expect(unfolded.lanes.first { $0.id == lane }?.isExpanded == true)
        #expect(unfolded.size.height > folded.size.height)
        // Unfolded, the six lanes of this fixture are ~16,000pt tall.
        #expect(folded.size.height < unfolded.size.height)
        #expect(folded.size.height < 7000)
    }

    @Test func theSelectedCardIsNeverFoldedAway() throws {
        let detail: MilestoneDetail = try loadFixture("milestone-detail-large")
        let folded = buildSwimlaneLayout(detail: detail, options: SwimlaneOptions())
        let hidden = try #require(folded.hiddenLaneByKey.keys.sorted().first)
        let pinned = buildSwimlaneLayout(detail: detail, options: SwimlaneOptions(), pinnedKey: hidden)
        #expect(pinned.nodesByKey[hidden] != nil)
        #expect(pinned.hiddenLaneByKey.count == folded.hiddenLaneByKey.count)
        #expect(pinned.size == folded.size)
    }

    @Test func smallMilestonesNeverFold() throws {
        for fixture in ["milestone-detail", "milestone-detail-multiteam"] {
            let detail: MilestoneDetail = try loadFixture(fixture)
            let layout = buildSwimlaneLayout(detail: detail, options: SwimlaneOptions())
            #expect(layout.overflows.isEmpty)
            #expect(layout.hiddenLaneByKey.isEmpty)
        }
    }

    @MainActor
    @Test func teamsInOneMilestoneGetDistinctColours() throws {
        let detail: MilestoneDetail = try loadFixture("milestone-detail-large")
        let names = detail.teams.map(\.name)
        TeamColors.reset()
        TeamColors.register(names)
        let slots = names.map(TeamColors.slot(for:))
        #expect(Set(slots).count == names.count)
        // Registration order doesn't matter: the same set always gets the same colours.
        TeamColors.reset()
        TeamColors.register(names.reversed())
        #expect(names.map(TeamColors.slot(for:)) == slots)
        TeamColors.reset()
    }

    @Test func unchangedPayloadOnlyDiffersInTimestamp() throws {
        let detail: MilestoneDetail = try loadFixture("milestone-detail-large")
        let restamped = MilestoneDetail(
            project: detail.project, release: detail.release, increments: detail.increments, epics: detail.epics,
            items: detail.items, dependencies: detail.dependencies, teams: detail.teams, criticalPath: detail.criticalPath,
            blockerEpics: detail.blockerEpics, readyNow: detail.readyNow, progress: detail.progress,
            warnings: detail.warnings, generatedAt: "2099-01-01T00:00:00Z"
        )
        #expect(detail.hasSameContent(as: restamped))
        let changed = MilestoneDetail(
            project: detail.project, release: detail.release, increments: detail.increments, epics: detail.epics,
            items: Array(detail.items.dropLast()), dependencies: detail.dependencies, teams: detail.teams,
            criticalPath: detail.criticalPath, blockerEpics: detail.blockerEpics, readyNow: detail.readyNow,
            progress: detail.progress, warnings: detail.warnings, generatedAt: detail.generatedAt
        )
        #expect(!detail.hasSameContent(as: changed))
    }
}
