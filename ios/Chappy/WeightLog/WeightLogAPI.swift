import Foundation

/// The site's tRPC endpoints, called over HTTP with the owner token. A query
/// is `GET /api/trpc/<path>?input=<superjson>`, a mutation a `POST` of the
/// same body, and both answer `{"result":{"data":{"json":…}}}`.
enum WeightLogAPI {
    static let defaultBase = "https://www.chappyasel.com"

    /// Settable on the token screen, for trying a local build of the site.
    static var base: String {
        get { UserDefaults.standard.string(forKey: "weightLogBase") ?? defaultBase }
        set {
            let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty || trimmed == defaultBase {
                UserDefaults.standard.removeObject(forKey: "weightLogBase")
            } else {
                UserDefaults.standard.set(trimmed, forKey: "weightLogBase")
            }
        }
    }

    struct Refusal: LocalizedError {
        /// The tRPC code, such as CONFLICT or UNAUTHORIZED.
        let code: String
        let message: String
        /// The server's own words are shown only for these, as the web
        /// editor's `failure` does. A validation dump never is.
        var isOwnMessage: Bool { ["BAD_REQUEST", "NOT_FOUND", "CONFLICT"].contains(code) && !validation }
        let validation: Bool
        var errorDescription: String? { message }
    }

    enum Failure: LocalizedError {
        case noToken
        case offline
        case refused(Refusal)
        case unreadable
        case badSite

        var errorDescription: String? {
            switch self {
            case .noToken: "Add the Weight Log token first."
            case .offline: "No connection to the site."
            case .refused(let refusal): refusal.message
            case .unreadable: "The site's answer couldn't be read."
            case .badSite: "The site address isn't a URL. Fix it on the token screen."
            }
        }

        /// What to show, with the web editor's fallback when the server's
        /// words aren't meant for the page.
        func message(fallback: String) -> String {
            switch self {
            case .refused(let refusal) where refusal.isOwnMessage: refusal.message
            case .refused(let refusal) where refusal.code == "UNAUTHORIZED":
                "The site refused the token. Check it on the token screen."
            case .noToken, .offline, .badSite: errorDescription ?? fallback
            default: fallback
            }
        }

        /// A refusal no retry fixes on its own: the token or the site needs changing.
        var needsSetup: Bool {
            switch self {
            case .noToken, .badSite: true
            case .refused(let refusal): ["UNAUTHORIZED", "FORBIDDEN"].contains(refusal.code)
            default: false
            }
        }

        var isConflict: Bool {
            if case .refused(let refusal) = self { return refusal.code == "CONFLICT" }
            return false
        }
    }

    private struct Envelope<T: Decodable>: Decodable {
        struct Result: Decodable {
            struct Box: Decodable { let json: T }
            let data: Box
        }
        let result: Result
    }

    private struct ErrorEnvelope: Decodable {
        struct Body: Decodable {
            struct Info: Decodable {
                let code: String?
                let zodError: AnyDecodable?
            }
            let message: String
            let data: Info?
        }
        struct Box: Decodable { let json: Body }
        let error: Box
    }

    private struct AnyDecodable: Decodable {
        let isNull: Bool
        init(from decoder: Decoder) throws {
            isNull = (try? decoder.singleValueContainer().decodeNil()) ?? true
        }
    }

    private struct Input<T: Encodable>: Encodable { let json: T }

    static func query<In: Encodable, Out: Decodable>(_ path: String, _ input: In) async throws -> Out {
        let body = try JSONEncoder().encode(Input(json: input))
        guard var components = URLComponents(string: "\(base)/api/trpc/\(path)") else { throw Failure.badSite }
        components.queryItems = [URLQueryItem(name: "input", value: String(decoding: body, as: UTF8.self))]
        guard let url = components.url else { throw Failure.badSite }
        var request = URLRequest(url: url)
        return try await send(request: &request)
    }

    static func mutate<In: Encodable, Out: Decodable>(_ path: String, _ input: In) async throws -> Out {
        guard let url = URL(string: "\(base)/api/trpc/\(path)") else { throw Failure.badSite }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(Input(json: input))
        return try await send(request: &request)
    }

    private static func send<Out: Decodable>(request: inout URLRequest) async throws -> Out {
        guard let token = OwnerToken.value else { throw Failure.noToken }
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 20
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw Failure.offline
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 200, let envelope = try? JSONDecoder().decode(Envelope<Out>.self, from: data) {
            return envelope.result.data.json
        }
        if let refusal = try? JSONDecoder().decode(ErrorEnvelope.self, from: data) {
            let body = refusal.error.json
            throw Failure.refused(Refusal(
                code: body.data?.code ?? "INTERNAL_SERVER_ERROR",
                message: body.message,
                validation: body.data?.zodError.map { !$0.isNull } ?? false
            ))
        }
        throw Failure.unreadable
    }

    // MARK: Procedures

    private struct SheetInput: Encodable {
        let today: String
        let phaseId: String?

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(today, forKey: .today)
            try container.encode(phaseId, forKey: .phaseId) // null, not absent
        }
        enum CodingKeys: String, CodingKey { case today, phaseId }
    }

    static func sheet(today: String, phaseId: String?) async throws -> AppSheet {
        try await query("weightLog.sheet", SheetInput(today: today, phaseId: phaseId))
    }

    private struct LogInput: Encodable { let date: String; let pounds: Double; let replace: Bool }

    static func logWeighIn(date: String, pounds: Double, replace: Bool) async throws -> LogResult {
        try await mutate("weightLog.logWeighIn", LogInput(date: date, pounds: pounds, replace: replace))
    }

    private struct DayPounds: Encodable { let date: String; let pounds: Double }
    private struct Day: Encodable { let date: String }
    private struct Restore: Encodable { let date: String; let pounds: Double; let excluded: Bool }
    private struct Rate: Encodable {
        let phaseId: String; let weekStart: String; let poundsPerWeek: Double; let revision: String
    }
    private struct Ignored: Decodable {}

    static func upsert(date: String, pounds: Double) async throws {
        let _: Ignored = try await mutate("weightLog.upsertWeighIn", DayPounds(date: date, pounds: pounds))
    }

    static func delete(date: String) async throws {
        let _: Ignored = try await mutate("weightLog.deleteWeighIn", Day(date: date))
    }

    static func restore(date: String, pounds: Double, excluded: Bool) async throws {
        let _: Ignored = try await mutate("weightLog.restoreWeighIn",
                                          Restore(date: date, pounds: pounds, excluded: excluded))
    }

    static func changeRate(phaseId: String, week: String, poundsPerWeek: Double, revision: String) async throws {
        let _: Ignored = try await mutate("weightLog.changeRate",
                                          Rate(phaseId: phaseId, weekStart: week,
                                               poundsPerWeek: poundsPerWeek, revision: revision))
    }
}
