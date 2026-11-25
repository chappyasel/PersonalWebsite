import Foundation
import Observation

/// The app's Weight Log: the last Weeks table it loaded, kept on the phone so
/// the tab opens on it at once, and every edit the web editor makes, with
/// the same messages and one level of Undo. A weigh-in for today made
/// offline waits in a queue and sends on the next refresh.
@MainActor
@Observable
final class WeightLogStore {
    static let shared = WeightLogStore()

    struct Status: Equatable {
        let message: String
        var undo: SheetChange?
    }

    /// A date's weigh-in that already holds a different one: the server's
    /// question, asked before replacing.
    struct ReplacePrompt: Equatable, Identifiable {
        let date: String
        let pounds: Double
        let question: String
        var id: String { "\(date):\(pounds)" }
    }

    struct Queued: Codable, Equatable {
        let date: String
        let pounds: Double
    }

    private(set) var sheet: AppSheet?
    private(set) var loading = false
    private(set) var loadError: String?
    /// The phase picked in the menu; nil shows the one holding today.
    private(set) var chosenPhaseId: String?
    /// Text sent and not yet back, shown in its cell meanwhile.
    private(set) var pending: [SheetCell: String] = [:]
    /// Text the server refused, kept in its cell until saved or cancelled.
    private(set) var failed: [SheetCell: String] = [:]
    var status: Status?
    private(set) var planLanding = false
    /// The last Log Weight answer: its outcome line, week line, and card.
    var lastResult: LogResult?
    var replacePrompt: ReplacePrompt?
    private(set) var queued: [Queued] = []
    private(set) var saving = false
    /// Set by the Log Weight intent: open the tab with today's field focused.
    var focusEntry = false
    /// A day Go to date picked, opened once its row is on screen.
    var openAfterLoad: SheetCell?
    /// The table came from the site this launch, not the cache. Cell edits
    /// wait for it, since a cached cell can miss a weigh-in made elsewhere
    /// and Undo would then delete instead of restore.
    private(set) var live = false

    var today: String { WeekDate.today() }

    private init() {
        sheet = Self.readCache()
        queued = (UserDefaults.standard.data(forKey: "weightLogQueue"))
            .flatMap { try? JSONDecoder().decode([Queued].self, from: $0) } ?? []
    }

    // MARK: Loading

    func refresh() async {
        guard OwnerToken.isSet else { return }
        loading = true
        defer { loading = false }
        await flushQueue()
        do {
            let next = try await WeightLogAPI.sheet(today: today, phaseId: chosenPhaseId)
            sheet = next
            live = true
            loadError = nil
            if chosenPhaseId == nil { Self.writeCache(next) }
        } catch let failure as WeightLogAPI.Failure {
            loadError = failure.message(fallback: "The weekly table failed to load.")
        } catch {
            loadError = "The weekly table failed to load."
        }
    }

    func choosePhase(_ id: String?) async {
        chosenPhaseId = id
        await refresh()
    }

    /// The loader's rule: the latest phase starting on or before the date
    /// that runs past it or is still running.
    func phaseHolding(_ date: String, in sheet: AppSheet) -> String? {
        sheet.phases
            .filter { $0.start <= date && ($0.id == sheet.runningId || date <= $0.end) }
            .max { $0.start < $1.start }?.id
    }

    /// Go to date: show the phase holding it and open its day.
    func jump(to date: String) async {
        guard let sheet else { return }
        let day = min(date, today)
        chosenPhaseId = phaseHolding(day, in: sheet)
        openAfterLoad = .day(day)
        await refresh()
    }

    // MARK: Today's entry (the Log Weight Shortcut's flow)

    /// What today's field starts from: today's weigh-in, or the latest
    /// counted one before it, which shows grey until it's typed over.
    var todayStart: (text: String, carried: AppSheet.WeighIn?) {
        if let value = sheet?.day(today)?.value { return (Sheet.pounds(value), nil) }
        if let carried = sheet?.carried { return (Sheet.pounds(carried.pounds), carried) }
        return ("", nil)
    }

    func logToday(_ text: String) async {
        guard case .value(let value) = Sheet.read(text) else {
            status = Status(message: "Type a weight in pounds.")
            return
        }
        let pounds = Sheet.roundTenth(value)
        guard pounds > 0, pounds <= Sheet.maxWeighIn else {
            status = Status(message: "A weigh-in has to be above 0 and at most 1,500 lb.")
            return
        }
        await log(date: today, pounds: pounds, replace: false)
    }

    func confirmReplace(_ prompt: ReplacePrompt) async {
        replacePrompt = nil
        await log(date: prompt.date, pounds: prompt.pounds, replace: true)
    }

    private func log(date: String, pounds: Double, replace: Bool) async {
        saving = true
        defer { saving = false }
        let excluded = sheet?.day(date)?.excluded ?? false
        do {
            let result = try await WeightLogAPI.logWeighIn(date: date, pounds: pounds, replace: replace)
            apply(result, excluded: excluded)
            await refresh()
        } catch WeightLogAPI.Failure.offline {
            enqueue(Queued(date: date, pounds: pounds))
            status = Status(message: "Saved \(Sheet.pounds(pounds)) lb on this phone. It sends when the site is reachable.")
        } catch let failure as WeightLogAPI.Failure {
            status = Status(message: failure.message(fallback: "The weigh-in didn't save. Try again."))
        } catch {
            status = Status(message: "The weigh-in didn't save. Try again.")
        }
    }

    /// Takes a Log Weight answer from the app or from an intent.
    func apply(_ result: LogResult, excluded: Bool) {
        switch result.status {
        case "exists":
            replacePrompt = ReplacePrompt(date: result.date, pounds: result.pounds,
                                          question: result.question ?? "Replace it?")
        case "saved":
            lastResult = result
            status = Status(message: "\(result.title) · \(result.summary)",
                            undo: .weighIn(date: result.date, before: nil, after: result.pounds, excluded: false))
        case "replaced":
            lastResult = result
            status = Status(message: "\(result.title) · \(result.summary)",
                            undo: .weighIn(date: result.date, before: result.previous,
                                           after: result.pounds, excluded: excluded))
        default:
            lastResult = result
            status = Status(message: "\(result.title) · \(result.summary)")
        }
    }

    private func enqueue(_ item: Queued) {
        queued.removeAll { $0.date == item.date }
        queued.append(item)
        saveQueue()
    }

    private func saveQueue() {
        UserDefaults.standard.set(try? JSONEncoder().encode(queued), forKey: "weightLogQueue")
    }

    /// Sends what was saved offline. A date that has a different weigh-in by
    /// now asks before replacing, as a live save does.
    private func flushQueue() async {
        for item in queued {
            do {
                let result = try await WeightLogAPI.logWeighIn(date: item.date, pounds: item.pounds, replace: false)
                queued.removeAll { $0 == item }
                saveQueue()
                apply(result, excluded: false)
            } catch WeightLogAPI.Failure.offline {
                return
            } catch let failure as WeightLogAPI.Failure where failure.needsSetup {
                // Kept on the phone: it sends once the token or site is fixed.
                status = Status(message: failure.message(fallback: "The site refused the token."))
                return
            } catch {
                queued.removeAll { $0 == item }
                saveQueue()
                status = Status(message: "\(Sheet.pounds(item.pounds)) lb saved offline didn't go through.")
            }
        }
    }

    // MARK: Table cells

    func startText(for cell: SheetCell) -> (text: String, prefilled: Bool) {
        if let text = failed[cell] { return (text, false) }
        guard let sheet else { return ("", false) }
        switch cell {
        case .day(let date):
            if let value = sheet.day(date)?.value { return (Sheet.pounds(value), false) }
            if date == today, let carried = sheet.carried { return (Sheet.pounds(carried.pounds), true) }
            return ("", false)
        case .target(let week):
            return (sheet.row(for: week)?.target.map { String(format: "%.1f", $0) } ?? "", false)
        case .rate(let week):
            return (sheet.row(for: week)?.poundsPerWeek.map { String(format: "%.2f", $0) } ?? "", false)
        }
    }

    func edit(for cell: SheetCell, text: String) -> SheetEdit {
        guard let sheet else { return .none }
        switch cell {
        case .day(let date):
            return Sheet.weighIn(date: date, text: text, current: sheet.day(date)?.value)
        case .target(let week):
            guard let row = sheet.row(for: week), let target = row.target, let rate = row.poundsPerWeek
            else { return .none }
            return Sheet.target(week: week, text: text, current: target, previous: target - rate)
        case .rate(let week):
            guard let rate = sheet.row(for: week)?.poundsPerWeek else { return .none }
            return Sheet.rate(week: week, text: text, current: rate)
        }
    }

    /// Ends a cell's edit. A message comes back when the text can't be sent,
    /// and the cell stays open on it.
    func commit(_ cell: SheetCell, text: String) -> String? {
        let edit = edit(for: cell, text: text)
        if case .invalid(let message) = edit {
            status = Status(message: message)
            return message
        }
        failed[cell] = nil
        if edit != .none { Task { await send(cell, edit, text: text) } }
        return nil
    }

    func cancel(_ cell: SheetCell) { failed[cell] = nil }

    private func dayLabel(_ date: String) -> String { WeekDate.dayLabel(date, today: today) }

    private func send(_ cell: SheetCell, _ edit: SheetEdit, text: String) async {
        guard let sheet else { return }
        switch edit {
        case .saveWeighIn(let date, let pounds):
            let before = sheet.day(date)?.value
            let excluded = sheet.day(date)?.excluded ?? false
            let sent = Sheet.pounds(pounds)
            pending[cell] = sent
            do {
                try await WeightLogAPI.upsert(date: date, pounds: pounds)
                await refresh()
                status = Status(
                    message: before == nil
                        ? "Saved \(sent) lb for \(dayLabel(date))."
                        : "Changed \(dayLabel(date)) from \(Sheet.pounds(before)) to \(sent) lb.",
                    undo: .weighIn(date: date, before: before, after: pounds, excluded: excluded))
            } catch {
                refused(cell, text, error, "The weigh-in didn't save. Try again.")
            }
            if pending[cell] == sent { pending[cell] = nil }
        case .deleteWeighIn(let date):
            let before = sheet.day(date)?.value
            let excluded = sheet.day(date)?.excluded ?? false
            pending[cell] = ""
            do {
                try await WeightLogAPI.delete(date: date)
                await refresh()
                status = Status(message: "Deleted \(Sheet.pounds(before)) lb from \(dayLabel(date)).",
                                undo: .weighIn(date: date, before: before, after: nil, excluded: excluded))
            } catch {
                refused(cell, text, error, "The weigh-in didn't delete. Try again.")
            }
            if pending[cell] == "" { pending[cell] = nil }
        case .changeRate(let week, let rate):
            guard let row = sheet.row(for: week), let target = row.target, let current = row.poundsPerWeek,
                  let phaseId = sheet.phaseId(holding: week) else { return }
            let previous = target - current
            let newTarget = previous + rate
            let moved = newTarget - target
            let later = sheet.allRows.contains { $0.week > week && $0.target != nil }
            pending[.target(week)] = Sheet.pounds(newTarget)
            pending[.rate(week)] = Sheet.rate(rate)
            planLanding = true
            do {
                try await WeightLogAPI.changeRate(phaseId: phaseId, week: week,
                                                  poundsPerWeek: rate, revision: sheet.revision)
                await refresh()
                let label = Sheet.weekLabel(week, today: today)
                status = Status(
                    message: "Set the week of \(label) to \(Sheet.pounds(newTarget)) lb at \(Sheet.rate(rate)) lbs/w."
                        + (later ? " Later targets moved \(Sheet.rate(moved)) lb." : ""),
                    undo: .rate(phaseId: phaseId, week: week, before: current, after: rate))
            } catch {
                if (error as? WeightLogAPI.Failure)?.isConflict == true { await refresh() }
                refused(cell, text, error, "The plan didn't change. Try again.")
            }
            planLanding = false
            pending[.target(week)] = nil
            pending[.rate(week)] = nil
        case .none, .invalid:
            return
        }
    }

    private func refused(_ cell: SheetCell, _ text: String, _ error: Error, _ fallback: String) {
        failed[cell] = text
        let message = (error as? WeightLogAPI.Failure)?.message(fallback: fallback) ?? fallback
        status = Status(message: message)
    }

    // MARK: Undo

    func undo() async {
        guard let change = status?.undo, let sheet else { return }
        status?.undo = nil
        let undone: String
        do {
            switch change {
            case .rate(let phaseId, let week, let before, _):
                planLanding = true
                defer { planLanding = false }
                let rate = Sheet.cleanTarget(before)
                try await WeightLogAPI.changeRate(phaseId: phaseId, week: week,
                                                  poundsPerWeek: rate, revision: sheet.revision)
                undone = "Put the week of \(Sheet.weekLabel(week, today: today)) back to \(Sheet.rate(rate)) lbs/w."
            case .weighIn(let date, let before, let after, let excluded):
                if before == nil {
                    try await WeightLogAPI.delete(date: date)
                    undone = "Removed the weigh-in for \(dayLabel(date))."
                } else if after == nil, let before {
                    try await WeightLogAPI.restore(date: date, pounds: before, excluded: excluded)
                    undone = "Put \(dayLabel(date)) back to \(Sheet.pounds(before)) lb"
                        + (excluded ? ", still left out of the weekly average." : ".")
                } else if let before {
                    try await WeightLogAPI.upsert(date: date, pounds: before)
                    undone = "Put \(dayLabel(date)) back to \(Sheet.pounds(before)) lb."
                } else {
                    return
                }
            }
            lastResult = nil
            await refresh()
            status = Status(message: undone)
        } catch {
            if (error as? WeightLogAPI.Failure)?.isConflict == true { await refresh() }
            let message = (error as? WeightLogAPI.Failure)?
                .message(fallback: "The undo didn't go through. Try again.")
                ?? "The undo didn't go through. Try again."
            status = Status(message: message, undo: change)
        }
    }

    // MARK: Cache

    private static var cacheURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("weight-log-sheet.json")
    }

    private static func readCache() -> AppSheet? {
        guard let data = try? Data(contentsOf: cacheURL) else { return nil }
        return try? JSONDecoder().decode(AppSheet.self, from: data)
    }

    private static func writeCache(_ sheet: AppSheet) {
        try? FileManager.default.createDirectory(at: cacheURL.deletingLastPathComponent(),
                                                 withIntermediateDirectories: true)
        try? JSONEncoder().encode(sheet).write(to: cacheURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    func forgetToken() {
        OwnerToken.clear()
        sheet = nil
        try? FileManager.default.removeItem(at: Self.cacheURL)
    }
}
