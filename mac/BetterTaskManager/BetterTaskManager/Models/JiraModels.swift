import Foundation

struct JiraProject: Decodable, Identifiable, Hashable {
    let id: String
    let key: String
    let name: String
}

struct JiraStatusCategory: Decodable, Hashable {
    let id: Int
    let key: String
    let name: String
}

struct JiraStatus: Decodable, Hashable {
    let id: String
    let name: String
    let statusCategory: JiraStatusCategory
}

struct JiraIssueType: Decodable, Hashable {
    let id: String
    let name: String
    let subtask: Bool
}

struct JiraUser: Decodable, Hashable, Identifiable {
    let accountId: String
    let displayName: String

    var id: String { accountId }
}

struct JiraParentRef: Decodable, Hashable {
    struct Fields: Decodable, Hashable {
        let summary: String
        let issuetype: JiraIssueType
        let status: JiraStatus
    }
    let id: String
    let key: String
    let fields: Fields
}

struct JiraSubtaskRef: Decodable, Hashable {
    struct Fields: Decodable, Hashable {
        let summary: String
        let status: JiraStatus
        let issuetype: JiraIssueType
    }
    let id: String
    let key: String
    let fields: Fields
}

struct JiraIssue: Decodable, Identifiable, Hashable {
    struct Fields: Decodable, Hashable {
        let summary: String
        var status: JiraStatus
        let issuetype: JiraIssueType
        let assignee: JiraUser?
        let parent: JiraParentRef?
        let subtasks: [JiraSubtaskRef]?
        let created: String?
    }

    let id: String
    let key: String
    var fields: Fields
}

struct JiraTransition: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let to: JiraStatus
    /// Jira lists transitions the user's role or the workflow blocks, marked unavailable.
    let isAvailable: Bool?
}
