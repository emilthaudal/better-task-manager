import Foundation
import Testing

@testable import BetterTaskManager

private struct Boom: Error, LocalizedError {
    var errorDescription: String? { "server down" }
}

@MainActor
@Suite struct MilestoneStoreTests {
    @Test func loadsProgramAndFocusedMilestoneTogether() async throws {
        let program: ProgramOverview = try loadFixture("program-overview")
        let detail: MilestoneDetail = try loadFixture("milestone-detail")
        var requested: [String] = []
        let store = MilestoneStore(
            projectKey: { "LAD" },
            fetchProgram: { requested.append("program:\($0)"); return program },
            fetchMilestone: { id, project in requested.append("milestone:\(id):\(project)"); return detail },
            fetchSiteURL: { URL(string: "https://example.atlassian.net") }
        )

        await store.refresh(milestoneID: "10140")

        #expect(Set(requested) == ["program:LAD", "milestone:10140:LAD"])
        #expect(store.programState == .loaded)
        #expect(store.state(ofMilestone: "10140") == .loaded)
        #expect(store.milestone("10140")?.index.itemsByKey.count == detail.items.count)
        #expect(store.lastUpdated != nil)
        #expect(store.siteURL.host() == "example.atlassian.net")
    }

    @Test func firstLoadFailureIsShownButLaterFailuresKeepTheData() async throws {
        let detail: MilestoneDetail = try loadFixture("milestone-detail")
        var fail = true
        let store = MilestoneStore(
            projectKey: { "LAD" },
            fetchProgram: { _ in throw Boom() },
            fetchMilestone: { _, _ in if fail { throw Boom() }; return detail },
            fetchSiteURL: { nil }
        )

        await store.refresh(milestoneID: "10140")
        #expect(store.programState == .failed("server down"))
        #expect(store.state(ofMilestone: "10140") == .failed("server down"))
        #expect(store.siteURL == MilestoneStore.fallbackSiteURL)

        fail = false
        await store.refresh(milestoneID: "10140")
        #expect(store.state(ofMilestone: "10140") == .loaded)

        fail = true
        await store.refresh(milestoneID: "10140")
        #expect(store.state(ofMilestone: "10140") == .loaded)
        #expect(store.milestone("10140") != nil)
        #expect(store.backgroundError == "server down")
    }

    @Test func aRefreshStartedWhileAnotherIsInFlightStillLoadsItsMilestone() async throws {
        let program: ProgramOverview = try loadFixture("program-overview")
        let detail: MilestoneDetail = try loadFixture("milestone-detail")
        let store = MilestoneStore(
            projectKey: { "LAD" },
            fetchProgram: { _ in try await Task.sleep(for: .milliseconds(50)); return program },
            fetchMilestone: { _, _ in detail },
            fetchSiteURL: { nil }
        )
        async let first: Void = store.refresh(milestoneID: nil)
        async let second: Void = store.refresh(milestoneID: "10140")
        _ = await (first, second)
        #expect(store.state(ofMilestone: "10140") == .loaded)
        #expect(!store.isRefreshing)
    }

    @Test func resetForgetsTheOldProject() async throws {
        let program: ProgramOverview = try loadFixture("program-overview")
        let store = MilestoneStore(projectKey: { "LAD" }, fetchProgram: { _ in program },
                                   fetchMilestone: { _, _ in throw Boom() }, fetchSiteURL: { nil })
        await store.refresh(milestoneID: nil)
        #expect(store.program != nil)
        store.reset()
        #expect(store.program == nil)
        #expect(store.programState == .idle)
    }
}
