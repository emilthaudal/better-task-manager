import Foundation
import Testing

@testable import BetterTaskManager

private final class FixtureBundleMarker {}

/// `program-overview.json` / `milestone-detail.json` are real responses from the
/// LAD space; the `-multi*` ones were produced by running the backend's own
/// analyzeMilestone over synthetic multi-team input (mac/scripts/generate-milestone-fixtures.ts),
/// so both shapes come from the server code, not hand-written JSON.
func loadFixture<T: Decodable>(_ name: String, as type: T.Type = T.self) throws -> T {
    let bundle = Bundle(for: FixtureBundleMarker.self)
    let url = try #require(bundle.url(forResource: name, withExtension: "json"), "missing fixture \(name).json")
    return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
}

@Suite struct MilestoneDecodingTests {
    @Test func decodesRealProgramOverview() throws {
        let program: ProgramOverview = try loadFixture("program-overview")
        #expect(program.project.key == "LAD")
        let wholesale = try #require(program.releases.first)
        #expect(wholesale.id == "10140")
        #expect(wholesale.name == "B2B Wholesale")
        #expect(wholesale.sequence == 0)
        #expect(!wholesale.increments.isEmpty)
        #expect(wholesale.increments.allSatisfy { $0.key.hasPrefix("LAD-") })
        #expect(wholesale.increments.contains { !$0.capabilities.isEmpty })
        #expect(wholesale.progress.total == wholesale.increments.count)
    }

    @Test func decodesRealMilestoneDetail() throws {
        let detail: MilestoneDetail = try loadFixture("milestone-detail")
        #expect(detail.release.id == "10140")
        #expect(detail.criticalPath.length == detail.criticalPath.keys.count)
        #expect(Set(detail.criticalPath.keys).isSubset(of: Set(detail.criticalPath.criticalKeys)))

        let index = MilestoneIndex(detail)
        for key in detail.readyNow {
            let item = try #require(index.itemsByKey[key])
            #expect(item.schedule?.ready == true)
        }
        // Done items carry no schedule; every remaining one does.
        for item in detail.items {
            #expect((item.schedule == nil) == item.status.isDone)
        }
        for team in detail.teams {
            #expect(team.loadByLevel.count == detail.criticalPath.length)
            #expect(team.loadByLevel.reduce(0, +) == team.remaining)
        }
    }

    @Test func decodesSyntheticMultiTeamMilestone() throws {
        let detail: MilestoneDetail = try loadFixture("milestone-detail-multiteam")
        #expect(detail.teams.map(\.name) == ["Aftersales", "Checkout", "Fulfilment", "Platform"])
        #expect(detail.dependencies.contains { $0.crossTeam && $0.critical })
        #expect(detail.items.contains { $0.external })
        #expect(detail.warnings.contains { $0.kind == .externalBlocker })
        #expect(detail.blockerEpics.contains { !$0.blockedTeams.isEmpty })

        let program: ProgramOverview = try loadFixture("program-overview-multi")
        #expect(program.releases.map(\.sequence) == Array(0..<program.releases.count))
        #expect(program.releases.first?.state == .overdue)
    }

    @Test func unknownWarningKindDegradesInsteadOfFailing() throws {
        let json = #"{"kind": "brand-new-kind", "message": "m", "keys": []}"#
        let warning = try JSONDecoder().decode(MilestoneWarning.self, from: Data(json.utf8))
        #expect(warning.kind == .other("brand-new-kind"))
        #expect(warning.kind.title == "Brand New Kind")

        let known = try JSONDecoder().decode(MilestoneWarning.self, from: Data(#"{"kind": "out-of-order-dependency", "message": "m", "keys": ["A"]}"#.utf8))
        #expect(known.kind == .outOfOrderDependency)
        #expect(known.kind.rawValue == "out-of-order-dependency")
    }
}
