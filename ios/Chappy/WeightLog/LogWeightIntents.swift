import AppIntents
import SwiftUI

/// Log Weight, the Shortcut's replacement. Run from the Action button, Siri,
/// or Shortcuts, it opens the Weight tab with today's field focused and
/// filled from the last weigh-in, so the flow needs no token in a Shortcut.
struct LogWeightIntent: AppIntent {
    static let title: LocalizedStringResource = "Log Weight"
    static let description = IntentDescription("Opens today's weigh-in, filled in from the last one.")
    static let openAppWhenRun = true

    @MainActor
    func perform() async throws -> some IntentResult {
        AppNavigation.shared.showWeight()
        WeightLogStore.shared.focusEntry = true
        return .result()
    }
}

/// Saves a weight without opening the app, for "Log 221.4 in Chappy" or a
/// Shortcut that already has the number. A date that already holds a
/// different weigh-in asks before replacing, as the Shortcut did.
struct SaveWeightIntent: AppIntent {
    static let title: LocalizedStringResource = "Save Weight"
    static let description = IntentDescription("Saves today's weigh-in on the Weight Log.")

    @Parameter(title: "Weight", description: "Pounds, to one decimal.", inclusiveRange: (1, 1500))
    var pounds: Double

    static var parameterSummary: some ParameterSummary { Summary("Save \(\.$pounds) lb for today") }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        let date = WeekDate.today()
        let value = Sheet.roundTenth(pounds)
        let store = WeightLogStore.shared
        var result = try await Self.log(date: date, pounds: value, replace: false)
        if result.status == "exists" {
            try await requestConfirmation(
                actionName: .set,
                dialog: IntentDialog(stringLiteral: result.question ?? "Replace it?")
            )
            result = try await Self.log(date: date, pounds: value, replace: true)
        }
        store.apply(result, excluded: store.sheet?.day(date)?.excluded ?? false)
        Task { await store.refresh() }
        return .result(dialog: IntentDialog(stringLiteral: "\(result.title). \(result.summary)")) {
            WeekGrid(rows: result.card, columns: [], compact: true)
                .padding(.vertical, 8)
        }
    }

    private static func log(date: String, pounds: Double, replace: Bool) async throws -> LogResult {
        do {
            return try await WeightLogAPI.logWeighIn(date: date, pounds: pounds, replace: replace)
        } catch let failure as WeightLogAPI.Failure {
            throw IntentFailure(message: failure.message(fallback: "The weigh-in didn't save. Try again."))
        }
    }
}

struct IntentFailure: LocalizedError, CustomLocalizedStringResourceConvertible {
    let message: String
    var errorDescription: String? { message }
    var localizedStringResource: LocalizedStringResource { "\(message)" }
}

struct ChappyShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: LogWeightIntent(),
            phrases: ["Log weight in \(.applicationName)", "Log my weight in \(.applicationName)"],
            shortTitle: "Log Weight",
            systemImageName: "scalemass"
        )
        AppShortcut(
            intent: SaveWeightIntent(),
            phrases: ["Save weight in \(.applicationName)"],
            shortTitle: "Save Weight",
            systemImageName: "scalemass.fill"
        )
    }
}
