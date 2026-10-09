import CoreGraphics
import Foundation
import Testing

@testable import BetterTaskManager

private func item(
    _ key: String,
    team: String = "A",
    epic: String? = "E-1",
    level: Int? = 0,
    slack: Int = 0,
    external: Bool = false,
    blockedBy: [String] = [],
    downstream: Int = 0
) -> WorkItem {
    let schedule = level.map {
        ItemSchedule(earliestStart: $0, earliestFinish: $0 + 1, latestStart: $0 + slack, slack: slack,
                     critical: slack == 0, ready: blockedBy.isEmpty, downstream: downstream, downstreamTeams: [])
    }
    return WorkItem(key: key, summary: "\(key) summary", type: "Story",
                    status: StatusRef(name: level == nil ? "Done" : "To Do", category: level == nil ? .done : .new),
                    assignee: nil, epicKey: epic, team: team, incrementKey: nil, points: nil, external: external,
                    placeholder: false, blockedBy: blockedBy, blocks: [], schedule: schedule)
}

private func dep(_ from: String, _ to: String, critical: Bool = false, crossTeam: Bool = false, satisfied: Bool = false) -> Dependency {
    Dependency(from: from, to: to, kind: .item, crossTeam: crossTeam, crossEpic: false, satisfied: satisfied, critical: critical)
}

private func detail(items: [WorkItem], dependencies: [Dependency] = [], length: Int, epics: [TeamEpic] = []) -> MilestoneDetail {
    MilestoneDetail(
        project: DeliveryProject(key: "LAD", name: "Delivery"),
        release: Release(id: "1", name: "M", description: nil, released: false, archived: false, startDate: nil,
                         releaseDate: nil, overdue: false, sequence: 0),
        increments: [], epics: epics, items: items, dependencies: dependencies, teams: [],
        criticalPath: CriticalPath(keys: [], criticalKeys: [], length: length),
        blockerEpics: [], readyNow: [], progress: .empty, warnings: [], generatedAt: ""
    )
}

@Suite struct SwimlaneLayoutTests {
    let metrics = SwimlaneMetrics()

    @Test func placesItemsInTheirLevelColumnAndTeamLane() throws {
        let layout = buildSwimlaneLayout(
            detail: detail(items: [item("A-1"), item("B-1", team: "B", level: 1, blockedBy: ["A-1"])],
                           dependencies: [dep("A-1", "B-1", critical: true, crossTeam: true)], length: 2),
            options: SwimlaneOptions()
        )
        let a = try #require(layout.nodesByKey["A-1"])
        let b = try #require(layout.nodesByKey["B-1"])
        #expect(a.column == 0)
        #expect(b.column == 1)
        #expect(b.frame.minX - a.frame.minX == metrics.columnPitch)
        #expect(a.laneID == "team:A")
        #expect(b.laneID == "team:B")
        #expect(layout.columns.map(\.level) == [0, 1])
        for node in layout.nodes {
            #expect(layout.lanes.first { $0.id == node.laneID }?.frame.contains(node.frame) == true)
        }
    }

    @Test func doneItemsAreHiddenUnlessAskedForAndThenGetALeadingColumn() throws {
        let items = [item("A-0", level: nil), item("A-1", level: 0)]
        let hidden = buildSwimlaneLayout(detail: detail(items: items, dependencies: [dep("A-0", "A-1", satisfied: true)], length: 1),
                                         options: SwimlaneOptions())
        #expect(hidden.nodesByKey["A-0"] == nil)
        #expect(hidden.edges.isEmpty)

        let shown = buildSwimlaneLayout(detail: detail(items: items, dependencies: [dep("A-0", "A-1", satisfied: true)], length: 1),
                                        options: SwimlaneOptions(showDone: true))
        #expect(shown.columns.map(\.level) == [nil, 0])
        #expect(shown.nodesByKey["A-0"]?.column == 0)
        #expect(shown.nodesByKey["A-1"]?.column == 1)
        #expect(shown.edges.first?.satisfied == true)
    }

    @Test func externalItemsCanBeFilteredAndSinkToTheBottomLane() throws {
        let items = [item("X-1", team: "Ext", external: true), item("A-1", level: 1, blockedBy: ["X-1"])]
        let layout = buildSwimlaneLayout(detail: detail(items: items, length: 2), options: SwimlaneOptions())
        #expect(layout.lanes.last?.isExternal == true)

        let filtered = buildSwimlaneLayout(detail: detail(items: items, length: 2), options: SwimlaneOptions(showExternal: false))
        #expect(filtered.nodesByKey["X-1"] == nil)
    }

    @Test func laneGrowsToTheTallestCellAndCriticalCardsStackFirst() throws {
        let items = [item("A-2", slack: 1), item("A-1", slack: 0), item("A-3", slack: 2)]
        let layout = buildSwimlaneLayout(detail: detail(items: items, length: 3), options: SwimlaneOptions())
        let lane = try #require(layout.lanes.first)
        let expectedHeight = metrics.lanePadding * 2 + 3 * metrics.cardHeight + 2 * metrics.rowGap
        #expect(lane.frame.height == expectedHeight)
        let ordered = layout.nodes.sorted { $0.frame.minY < $1.frame.minY }.map(\.key)
        #expect(ordered.first == "A-1")
    }

    @Test func slackBarReachesTheLatestStartColumn() throws {
        let layout = buildSwimlaneLayout(detail: detail(items: [item("A-1", slack: 2)], length: 3), options: SwimlaneOptions())
        let node = try #require(layout.nodesByKey["A-1"])
        let bar = try #require(node.slackFrame)
        #expect(bar.maxX == node.frame.minX + 2 * metrics.columnPitch + metrics.cardWidth)
        #expect(bar.minY >= node.frame.maxY)
        #expect(layout.nodesByKey["A-1"].map { $0.isCritical } == false)
    }

    @Test func cardsSitNextToTheirBlockersToKeepEdgesShort() throws {
        // A-1 and A-2 both start now; B-1 is blocked by the lower one (A-2 has slack so
        // stacks second) and B-2 by the upper — B-2 should end up above B-1.
        let items = [
            item("A-1", slack: 0), item("A-2", slack: 1),
            item("B-1", team: "A", level: 1, slack: 1, blockedBy: ["A-2"]),
            item("B-2", team: "A", level: 1, slack: 1, blockedBy: ["A-1"]),
        ]
        let layout = buildSwimlaneLayout(detail: detail(items: items, length: 3), options: SwimlaneOptions())
        let b1 = try #require(layout.nodesByKey["B-1"])
        let b2 = try #require(layout.nodesByKey["B-2"])
        #expect(b2.frame.minY < b1.frame.minY)
    }

    @Test func edgesLeaveRightEdgeAndEnterLeftEdgeHorizontally() throws {
        let layout = buildSwimlaneLayout(
            detail: detail(items: [item("A-1"), item("A-2", level: 2, blockedBy: ["A-1"])],
                           dependencies: [dep("A-1", "A-2")], length: 3),
            options: SwimlaneOptions()
        )
        let edge = try #require(layout.edges.first)
        let from = try #require(layout.nodesByKey["A-1"]).frame
        let to = try #require(layout.nodesByKey["A-2"]).frame
        #expect(edge.start == CGPoint(x: from.maxX, y: from.midY))
        #expect(edge.end == CGPoint(x: to.minX, y: to.midY))
        #expect(edge.control1.y == edge.start.y)
        #expect(edge.control2.y == edge.end.y)
        #expect(edge.control1.x > edge.start.x && edge.control2.x < edge.end.x)
    }

    @Test func epicGroupingMakesOneLanePerEpicTitledBySummary() throws {
        let epic = TeamEpic(key: "E-1", summary: "Checkout epic", status: StatusRef(name: "To Do", category: .new), team: "A",
                            projectKey: "E", assignee: nil, incrementKeys: [], itemKeys: [], progress: .empty, blocksEpics: [],
                            blockedByEpics: [], earliestStart: 0, earliestFinish: 1, criticalItems: 1, onCriticalPath: true)
        let items = [item("A-1"), item("A-2", epic: nil, slack: 1)]
        let layout = buildSwimlaneLayout(detail: detail(items: items, length: 2, epics: [epic]),
                                         options: SwimlaneOptions(grouping: .epic))
        #expect(layout.lanes.map(\.title) == ["Checkout epic", "No epic"])
        #expect(layout.lanes.first?.subtitle == "E-1 · A")
    }

    @Test func realMilestoneLaysOutWithoutOverlaps() throws {
        for fixture in ["milestone-detail", "milestone-detail-multiteam"] {
            let detail: MilestoneDetail = try loadFixture(fixture)
            for options in [SwimlaneOptions(), SwimlaneOptions(grouping: .epic, showDone: true)] {
                let layout = buildSwimlaneLayout(detail: detail, options: options)
                #expect(!layout.nodes.isEmpty)
                for (i, a) in layout.nodes.enumerated() {
                    for b in layout.nodes[(i + 1)...] {
                        #expect(!a.frame.intersects(b.frame), "\(a.key) overlaps \(b.key) in \(fixture)")
                    }
                    #expect(CGRect(origin: .zero, size: layout.size).contains(a.frame))
                }
                if !options.showDone {
                    #expect(layout.nodes.count == detail.items.filter { $0.schedule != nil }.count)
                }
            }
        }
    }
}

@Suite struct DependencyGraphTests {
    // A → B → D, A → C → D, D → E, and an unrelated X → Y.
    let graph = DependencyGraph([
        dep("A", "B"), dep("B", "D"), dep("A", "C"), dep("C", "D"), dep("D", "E"), dep("X", "Y"),
    ])

    @Test func upstreamAndDownstreamAreTransitive() {
        #expect(graph.upstream(of: "D") == ["A", "B", "C"])
        #expect(graph.downstream(of: "B") == ["D", "E"])
        #expect(graph.downstream(of: "E").isEmpty)
    }

    @Test func chainEdgesFollowThePathThroughTheFocus() {
        let chain = graph.chain(through: "B")
        #expect(chain.members == ["A", "B", "D", "E"])
        #expect(chain.contains(edgeFrom: "A", to: "B"))
        #expect(chain.contains(edgeFrom: "D", to: "E"))
        #expect(!chain.contains(edgeFrom: "A", to: "C"))
        #expect(!chain.contains(edgeFrom: "X", to: "Y"))
    }

    @Test func toleratesCycles() {
        let cyclic = DependencyGraph([dep("A", "B"), dep("B", "A"), dep("B", "C")])
        #expect(cyclic.downstream(of: "A") == ["B", "C"])
        #expect(cyclic.upstream(of: "A") == ["B"])
    }
}

@Suite struct MilestoneFormattingTests {
    private func schedule(start: Int, slack: Int, ready: Bool) -> ItemSchedule {
        ItemSchedule(earliestStart: start, earliestFinish: start + 1, latestStart: start + slack, slack: slack,
                     critical: slack == 0, ready: ready, downstream: 0, downstreamTeams: [])
    }

    @Test func describesScheduleInPlainLanguage() {
        #expect(scheduleSummary(schedule(start: 0, slack: 2, ready: true)) == "Can start now · 2 steps of slack")
        #expect(scheduleSummary(schedule(start: 0, slack: 0, ready: true)) == "Can start now · on the critical path")
        #expect(scheduleSummary(schedule(start: 3, slack: 1, ready: false)) == "Starts after 3 steps · 1 step of slack")
        #expect(scheduleSummary(schedule(start: 0, slack: 0, ready: false)) == "Waiting on a blocker · on the critical path")
    }

    @Test func levelTitles() {
        #expect(levelTitle(nil) == "Done")
        #expect(levelTitle(0) == "Now")
        #expect(levelTitle(2) == "Step 3")
    }

    @Test func releaseStateAndDates() throws {
        let base = Release(id: "1", name: "M", description: nil, released: false, archived: false, startDate: nil,
                           releaseDate: "2026-12-15", overdue: false, sequence: 0)
        let date = try #require(parseJiraDate("2026-12-15"))
        #expect(Calendar.current.component(.day, from: date) == 15)
        #expect(base.state == .due(date))
        #expect(parseJiraDate(nil) == nil)
        #expect(parseJiraDate("garbage") == nil)
    }

    @Test func flagsBlockersThatShipInALaterMilestone() {
        func increment(_ key: String, blockedBy: [String] = []) -> IncrementSummary {
            IncrementSummary(key: key, summary: key, status: StatusRef(name: "To Do", category: .new), team: nil,
                             capabilities: [], teamEpics: [], blocks: [], blockedBy: blockedBy)
        }
        func release(_ sequence: Int, _ increments: [IncrementSummary]) -> ProgramRelease {
            ProgramRelease(id: "\(sequence)", name: "R\(sequence)", description: nil, released: false, archived: false,
                           startDate: nil, releaseDate: nil, overdue: false, sequence: sequence, increments: increments,
                           progress: .empty, epicProgress: .empty)
        }
        let program = ProgramOverview(
            project: DeliveryProject(key: "LAD", name: "D"),
            releases: [
                release(0, [increment("A", blockedBy: ["B", "U", "OUTSIDE"]), increment("A2")]),
                release(1, [increment("B", blockedBy: ["A2"])]),
            ],
            unscheduled: [increment("U")],
            warnings: [],
            generatedAt: ""
        )
        #expect(outOfOrderBlockers(in: program) == ["A": ["B", "U"]])
    }

    @Test func browseURL() {
        #expect(jiraBrowseURL(site: URL(string: "https://whiteaway.atlassian.net")!, key: "AS-1").absoluteString
                == "https://whiteaway.atlassian.net/browse/AS-1")
    }

    @Test func configURLValidation() {
        #expect(Config.url(from: " http://localhost:3100 ")?.port == 3100)
        #expect(Config.url(from: "localhost:3100") == nil)
        #expect(Config.url(from: "") == nil)
        #expect(Config.url(from: nil) == nil)
    }
}
