import Foundation

/// The site sections the app shows as tabs, and how a URL maps onto one.
enum SiteTab: String, CaseIterable, Identifiable, Sendable {
    case home, books, musings, lifts

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: "Home"
        case .books: "Books"
        case .musings: "Musings"
        case .lifts: "Lifts"
        }
    }

    var symbol: String {
        switch self {
        case .home: "house"
        case .books: "books.vertical"
        case .musings: "text.book.closed"
        case .lifts: "dumbbell"
        }
    }

    var rootURL: URL {
        switch self {
        case .home: URL(string: "https://www.chappyasel.com/")!
        case .books: URL(string: "https://books.chappyasel.com/")!
        case .musings: URL(string: "https://www.chappyasel.com/musings")!
        case .lifts: URL(string: "https://www.chappyasel.com/weightlifting")!
        }
    }

    /// The tab a link belongs to, or nil when it leaves the site.
    static func owning(_ url: URL) -> SiteTab? {
        guard let host = url.host?.lowercased(), isSiteHost(host) else { return nil }
        if host.hasPrefix("books.") { return .books }
        let path = url.path.lowercased()
        if path.hasPrefix("/musings") { return .musings }
        if path.hasPrefix("/weightlifting") { return .lifts }
        return .home
    }

    static func isSiteHost(_ host: String) -> Bool {
        host == "chappyasel.com" || host.hasSuffix(".chappyasel.com")
    }
}

enum SiteAPI {
    static let widgetURL = URL(string: "https://www.chappyasel.com/api/trpc/app.widget")!
}
