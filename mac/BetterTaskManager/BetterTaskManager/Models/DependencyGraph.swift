import Foundation

/// Adjacency over a milestone's dependencies, for the "what does this item hold up /
/// what holds it up" chain that hover and selection highlight.
nonisolated struct DependencyGraph: Sendable {
    private let successors: [String: [String]]
    private let predecessors: [String: [String]]

    init(_ dependencies: [Dependency]) {
        var successors: [String: [String]] = [:]
        var predecessors: [String: [String]] = [:]
        for dependency in dependencies where dependency.from != dependency.to {
            successors[dependency.from, default: []].append(dependency.to)
            predecessors[dependency.to, default: []].append(dependency.from)
        }
        self.successors = successors
        self.predecessors = predecessors
    }

    func upstream(of key: String) -> Set<String> { closure(from: key, along: predecessors) }
    func downstream(of key: String) -> Set<String> { closure(from: key, along: successors) }

    /// The item itself plus everything transitively before and after it. Cycles are
    /// tolerated: the backend reports them as warnings but still sends the links.
    func chain(through key: String) -> DependencyChain {
        DependencyChain(focus: key, upstream: upstream(of: key), downstream: downstream(of: key))
    }

    private func closure(from key: String, along edges: [String: [String]]) -> Set<String> {
        var seen: Set<String> = []
        var stack = edges[key] ?? []
        while let next = stack.popLast() {
            guard next != key, seen.insert(next).inserted else { continue }
            stack.append(contentsOf: edges[next] ?? [])
        }
        return seen
    }
}

nonisolated struct DependencyChain: Hashable, Sendable {
    let focus: String
    let upstream: Set<String>
    let downstream: Set<String>

    var members: Set<String> { upstream.union(downstream).union([focus]) }

    /// An edge belongs to the chain only when it runs through the focus's side of the
    /// graph — an upstream item that also links straight to a downstream one bypasses
    /// the focus, so that shortcut isn't part of its path even though both ends are.
    func contains(edgeFrom from: String, to: String) -> Bool {
        let fromIsBefore = from == focus || upstream.contains(from)
        let toIsBefore = to == focus || upstream.contains(to)
        let fromIsAfter = from == focus || downstream.contains(from)
        let toIsAfter = to == focus || downstream.contains(to)
        return (fromIsBefore && toIsBefore) || (fromIsAfter && toIsAfter)
    }
}
