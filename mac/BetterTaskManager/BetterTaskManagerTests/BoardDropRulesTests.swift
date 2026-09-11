import Foundation
import Testing

@testable import BetterTaskManager

private func issue(
    key: String,
    statusId: String,
    statusCategory: String = "new",
    parentKey: String? = nil,
    parentType: String = "Epic",
    parentStatusCategory: String = "new"
) -> String {
    let parent = parentKey.map { key in
        """
        "parent": {
          "id": "p-\(key)", "key": "\(key)",
          "fields": {
            "summary": "\(key) parent",
            "issuetype": {"id": "10", "name": "\(parentType)", "subtask": false},
            "status": {"id": "1", "name": "Open", "statusCategory": {"id": 2, "key": "\(parentStatusCategory)", "name": "To Do"}}
          }
        },
        """
    } ?? ""

    return """
    {
      "id": "id-\(key)", "key": "\(key)",
      "fields": {
        "summary": "\(key) summary",
        \(parent)
        "issuetype": {"id": "1", "name": "Task", "subtask": false},
        "status": {"id": "\(statusId)", "name": "Status \(statusId)", "statusCategory": {"id": 2, "key": "\(statusCategory)", "name": "Cat"}},
        "assignee": null, "subtasks": [], "created": "2026-01-01T00:00:00.000+0000"
      }
    }
    """
}

private func board(_ issues: [String]) throws -> BoardData {
    let data = Data("[\(issues.joined(separator: ","))]".utf8)
    return buildBoardData(from: try JSONDecoder().decode([JiraIssue].self, from: data))
}

@Suite("Board drop rules")
struct BoardDropRulesTests {
    @Test func allowsMoveToAnotherColumnInTheSameEpic() throws {
        let data = try board([issue(key: "AB-1", statusId: "10", parentKey: "AB-100")])
        #expect(data.canMove(issueKey: "AB-1", toEpic: "AB-100", toStatus: "20"))
    }

    @Test func rejectsMoveIntoAnotherEpicsSwimlane() throws {
        let data = try board([
            issue(key: "AB-1", statusId: "10", parentKey: "AB-100"),
            issue(key: "AB-2", statusId: "10", parentKey: "AB-200"),
        ])
        #expect(!data.canMove(issueKey: "AB-1", toEpic: "AB-200", toStatus: "20"))
    }

    @Test func rejectsDropBackOnTheColumnTheIssueIsAlreadyIn() throws {
        let data = try board([issue(key: "AB-1", statusId: "10", parentKey: "AB-100")])
        #expect(!data.canMove(issueKey: "AB-1", toEpic: "AB-100", toStatus: "10"))
    }

    @Test func rejectsAnIssueThatIsNotOnTheBoard() throws {
        let data = try board([issue(key: "AB-1", statusId: "10", parentKey: "AB-100")])
        #expect(!data.canMove(issueKey: "AB-9", toEpic: "AB-100", toStatus: "20"))
    }

    @Test func placesAParentlessIssueInTheUnassignedSwimlane() throws {
        let data = try board([issue(key: "AB-1", statusId: "10")])
        #expect(data.canMove(issueKey: "AB-1", toEpic: UnassignedEpic.key, toStatus: "20"))
    }

    /// A subtask's epic is its grandparent — the drop rule has to agree with the
    /// swimlane the grouping walk actually put the card in.
    @Test func resolvesTheEpicThroughAnIntermediateParent() throws {
        let data = try board([
            issue(key: "AB-1", statusId: "10", parentKey: "AB-50", parentType: "Task"),
            issue(key: "AB-50", statusId: "10", parentKey: "AB-100"),
        ])
        #expect(data.canMove(issueKey: "AB-1", toEpic: "AB-100", toStatus: "20"))
        #expect(!data.canMove(issueKey: "AB-1", toEpic: "AB-50", toStatus: "20"))
    }
}

@Suite("Issue permissions decoding")
struct IssuePermissionsDecodingTests {
    /// Jira's real payload carries far more per transition than the app models;
    /// decoding must ignore the extras rather than fail the whole move.
    @Test func decodesJiraTransitionPayload() throws {
        let json = """
        {
          "transitions": [{
            "id": "31", "name": "Done", "hasScreen": false, "isGlobal": true,
            "isInitial": false, "isAvailable": true, "isConditional": false, "isLooped": false,
            "to": {
              "self": "https://example.atlassian.net/rest/api/3/status/10002",
              "description": "", "iconUrl": "https://example.atlassian.net/icon.png",
              "name": "Done", "id": "10002",
              "statusCategory": {"self": "https://example.atlassian.net/rest/api/3/statuscategory/3", "id": 3, "key": "done", "colorName": "green", "name": "Done"}
            }
          }],
          "editableFields": ["summary", "assignee"],
          "canDelete": true
        }
        """
        let permissions = try JSONDecoder().decode(IssuePermissions.self, from: Data(json.utf8))
        #expect(permissions.transitions.count == 1)
        #expect(permissions.transitions[0].to.id == "10002")
        #expect(permissions.transitions[0].isAvailable == true)
        #expect(permissions.canDelete)
    }
}
