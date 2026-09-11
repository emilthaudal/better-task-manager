import SwiftUI

struct BoardCardView: View {
    let issue: JiraIssue
    var isPending = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Circle()
                    .fill(statusColor(for: issue.fields.status.statusCategory.key))
                    .frame(width: 6, height: 6)
                Text(issue.key)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 8)
                assigneeBadge
            }

            Text(issue.fields.summary)
                .font(.system(size: 13, weight: .medium))
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 6) {
                Text(issue.fields.issuetype.name.uppercased())
                    .font(.system(size: 9.5, weight: .bold))
                    .tracking(0.3)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3.5)
                    .background(issueTypeColor(for: issue.fields.issuetype.name).opacity(0.16), in: Capsule())
                    .foregroundStyle(issueTypeColor(for: issue.fields.issuetype.name))

                if let subtasks = issue.fields.subtasks, !subtasks.isEmpty {
                    Text("↳ \(subtasks.count)")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)
            }
        }
        .padding(12)
        .frame(width: 240, alignment: .leading)
        // A painted surface rather than a glass material: a lifted card is rendered
        // detached from the window, where a backdrop-sampling material has nothing to
        // sample and the card comes out blank.
        .background(Color(nsColor: .controlBackgroundColor), in: .rect(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(Color(nsColor: .separatorColor), lineWidth: 0.5)
        }
        .shadow(color: .black.opacity(0.12), radius: 2.5, y: 1)
        .opacity(isPending ? 0.5 : 1)
        .animation(.snappy(duration: 0.2), value: isPending)
    }

    @ViewBuilder
    private var assigneeBadge: some View {
        Group {
            if let assignee = issue.fields.assignee {
                Text(initials(for: assignee.displayName))
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 22, height: 22)
                    .background(avatarColor(for: assignee.displayName), in: Circle())
            } else {
                Image(systemName: "person.fill")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                    .frame(width: 22, height: 22)
                    .background(.fill.tertiary, in: Circle())
            }
        }
        .overlay(Circle().strokeBorder(.white.opacity(0.12), lineWidth: 1))
    }
}
