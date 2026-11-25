import SwiftUI

/// Mirrors `AppSheet` in src/lib/weight-log/app-sheet.ts.
struct AppSheet: Codable, Equatable {
    struct Phase: Codable, Equatable, Identifiable {
        let id: String
        let label: String
        let kind: String
        let start: String
        let end: String
        let cycle: Int
        let color: String
    }

    struct Column: Codable, Equatable {
        let key: String
        let label: String
        let hint: String
    }

    struct Section: Codable, Equatable, Identifiable {
        let title: String
        let phaseId: String?
        let rows: [AppRow]
        var id: String { phaseId ?? "outside" }
    }

    struct WeighIn: Codable, Equatable {
        let date: String
        let pounds: Double
    }

    let today: String
    let phaseId: String?
    let phases: [Phase]
    let runningId: String?
    let columns: [Column]
    let sections: [Section]
    let carried: WeighIn?
    let revision: String

    var allRows: [AppRow] { sections.flatMap(\.rows) }

    func row(for week: String) -> AppRow? { allRows.first { $0.week == week } }

    func day(_ date: String) -> AppDay? {
        row(for: WeekDate.monday(of: date))?.days.first { $0.date == date }
    }

    /// The section a week's plan edit is made in.
    func phaseId(holding week: String) -> String? {
        sections.first { section in section.rows.contains { $0.week == week } }?.phaseId
    }
}

struct CellColor: Codable, Equatable {
    struct Pair: Codable, Equatable {
        let background: String
        let text: String
    }

    let light: Pair
    let dark: Pair

    var background: Color { Color.dynamic(light: light.background, dark: dark.background) }
    var text: Color { Color.dynamic(light: light.text, dark: dark.text) }
}

struct AppDay: Codable, Equatable {
    let date: String
    let text: String
    let value: Double?
    let color: CellColor?
    let excluded: Bool
    let isToday: Bool
    let editable: Bool
}

struct AppCell: Codable, Equatable {
    let text: String
    let value: Double?
    let color: CellColor?
}

struct AppRow: Codable, Equatable, Identifiable {
    let week: String
    let number: Int?
    let month: String
    let day: String
    let label: String
    let days: [AppDay]
    let summary: [AppCell]
    let planEditable: Bool
    var id: String { week }

    /// `SUMMARY_COLUMNS` order: Avg, +/-, Target, Gap, lbs/w, Orig, Gap.
    var target: Double? { summary[safe: 2]?.value }
    var poundsPerWeek: Double? { summary[safe: 4]?.value }
}

/// The answer to `weightLog.logWeighIn`.
struct LogResult: Codable, Equatable {
    let status: String
    let date: String
    let pounds: Double
    let previous: Double?
    let title: String
    let summary: String
    let question: String?
    let card: [AppRow]
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

extension Color {
    init(hex: String) {
        let value = UInt32(hex.dropFirst(), radix: 16) ?? 0
        self.init(red: Double((value >> 16) & 0xff) / 255,
                  green: Double((value >> 8) & 0xff) / 255,
                  blue: Double(value & 0xff) / 255)
    }

    static func dynamic(light: String, dark: String) -> Color {
        Color(UIColor { traits in
            UIColor(Color(hex: traits.userInterfaceStyle == .dark ? dark : light))
        })
    }
}

/// ISO dates (`yyyy-MM-dd`) as the site writes them, read in UTC so a date
/// never shifts a day.
enum WeekDate {
    private static let utc = TimeZone(identifier: "UTC")!

    private static func formatter(_ format: String, zone: TimeZone) -> DateFormatter {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = zone
        formatter.dateFormat = format
        return formatter
    }

    /// Today on the phone's clock (decision 22).
    static func today(_ now: Date = .now) -> String {
        formatter("yyyy-MM-dd", zone: .current).string(from: now)
    }

    static func date(_ iso: String) -> Date? { formatter("yyyy-MM-dd", zone: utc).date(from: iso) }

    static func iso(_ date: Date) -> String { formatter("yyyy-MM-dd", zone: utc).string(from: date) }

    static func add(_ iso: String, days: Int) -> String {
        guard let date = date(iso) else { return iso }
        return self.iso(date.addingTimeInterval(Double(days) * 86_400))
    }

    static func monday(of iso: String) -> String {
        guard let date = date(iso) else { return iso }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        let weekday = calendar.component(.weekday, from: date) // Sunday 1
        return add(iso, days: -((weekday + 5) % 7))
    }

    /// "Mon, Nov 24".
    static func shortDay(_ iso: String) -> String {
        guard let date = date(iso) else { return iso }
        return formatter("EEE, MMM d", zone: utc).string(from: date)
    }

    /// "Today", "Yesterday", or "Mon, Nov 24", with the year when it isn't this one.
    static func dayLabel(_ iso: String, today: String) -> String {
        if iso == today { return "Today" }
        if iso == add(today, days: -1) { return "Yesterday" }
        let format = iso.prefix(4) == today.prefix(4) ? "EEE, MMM d" : "EEE, MMM d, yyyy"
        guard let date = date(iso) else { return iso }
        return formatter(format, zone: utc).string(from: date)
    }
}
