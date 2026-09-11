import Foundation

struct AtlassianSite: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let url: String
    let scopes: [String]
    let avatarUrl: String
}

struct AtlassianUser: Decodable, Hashable {
    let accountId: String
    let email: String
    let name: String
    let picture: String

    enum CodingKeys: String, CodingKey {
        case accountId = "account_id"
        case email, name, picture
    }
}
