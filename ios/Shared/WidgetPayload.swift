import Foundation

/// Mirrors `AppWidgetData` in src/server/queries/appWidget.ts.
struct WidgetPayload: Codable, Sendable {
    struct Book: Codable, Sendable {
        let title: String
        let author: String
        let coverUrl: String?
        let coverColor: String?
        let started: String
        let url: String
    }

    struct Workout: Codable, Sendable {
        let name: String
        let date: String
        let setCount: Int
        let volume: Double
        let url: String
    }

    struct Musing: Codable, Sendable {
        let title: String
        let date: String
        let url: String
    }

    let reading: [Book]
    let latestWorkout: Workout?
    let latestMusing: Musing?

    static let placeholder = WidgetPayload(
        reading: [Book(title: "The Beginning of Infinity", author: "David Deutsch",
                       coverUrl: nil, coverColor: "#3b5b7a",
                       started: "2026-11-01T00:00:00.000Z",
                       url: "https://books.chappyasel.com/")],
        latestWorkout: Workout(name: "Push", date: "2026-11-22", setCount: 18,
                               volume: 21450, url: SiteTab.lifts.rootURL.absoluteString),
        latestMusing: nil
    )

    /// tRPC with superjson wraps a query result as {"result":{"data":{"json":…}}}.
    private struct Envelope: Decodable {
        struct Result: Decodable {
            struct DataBox: Decodable { let json: WidgetPayload }
            let data: DataBox
        }
        let result: Result
    }

    static func fetch() async throws -> WidgetPayload {
        var request = URLRequest(url: SiteAPI.widgetURL)
        request.timeoutInterval = 15
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(Envelope.self, from: data).result.data.json
    }
}
