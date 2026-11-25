import Foundation

/// The Weeks table's edit rules, ported from src/lib/weight-log/sheet.ts so
/// a cell refuses the same text the web table does. The server checks
/// everything again.
enum SheetCell: Hashable {
    case day(String)
    case target(String)
    case rate(String)

    var week: String {
        switch self {
        case .day(let date): WeekDate.monday(of: date)
        case .target(let week), .rate(let week): week
        }
    }
}

enum SheetEdit: Equatable {
    case none
    case invalid(String)
    case saveWeighIn(date: String, pounds: Double)
    case deleteWeighIn(date: String)
    case changeRate(week: String, poundsPerWeek: Double)
}

/// A change Undo can put back. One level is kept.
enum SheetChange: Equatable {
    case weighIn(date: String, before: Double?, after: Double?, excluded: Bool)
    case rate(phaseId: String, week: String, before: Double, after: Double)
}

enum Sheet {
    static let maxWeighIn = 1500.0
    static let maxTarget = 1500.0
    static let maxPoundsPerWeek = 10.0

    static func roundTenth(_ value: Double) -> Double { (value * 10).rounded() / 10 }
    static func roundHundredth(_ value: Double) -> Double { (value * 100).rounded() / 100 }
    static func cleanTarget(_ value: Double) -> Double { (value * 1_000_000).rounded() / 1_000_000 }

    enum Number: Equatable { case empty, invalid, value(Double) }

    /// Accepts a comma for the decimal point and the minus sign the table
    /// prints, and nothing else.
    static func read(_ text: String) -> Number {
        let cleaned = text.trimmingCharacters(in: .whitespaces)
            .replacingOccurrences(of: "−", with: "-")
            .replacingOccurrences(of: ",", with: ".")
        if cleaned.isEmpty { return .empty }
        guard cleaned.range(of: #"^[+-]?(\d+\.?\d*|\.\d+)$"#, options: .regularExpression) != nil,
              let value = Double(cleaned) else { return .invalid }
        return .value(value)
    }

    static func weighIn(date: String, text: String, current: Double?) -> SheetEdit {
        switch read(text) {
        case .empty: return current == nil ? .none : .deleteWeighIn(date: date)
        case .invalid: return .invalid("Type a weight in pounds.")
        case .value(let value):
            let pounds = roundTenth(value)
            guard pounds > 0, pounds <= maxWeighIn else {
                return .invalid("A weigh-in has to be above 0 and at most 1,500 lb.")
            }
            return pounds == current ? .none : .saveWeighIn(date: date, pounds: pounds)
        }
    }

    static func target(week: String, text: String, current: Double, previous: Double) -> SheetEdit {
        switch read(text) {
        case .empty: return .none
        case .invalid: return .invalid("Type a target in pounds.")
        case .value(let value):
            let target = roundTenth(value)
            guard target > 0, target <= maxTarget else {
                return .invalid("Targets have to stay above 0 and at most 1,500 lb.")
            }
            if target == roundTenth(current) { return .none }
            let rate = cleanTarget(target - previous)
            guard abs(rate) <= maxPoundsPerWeek else {
                return .invalid("A target can be at most 10 lb from the week before.")
            }
            return .changeRate(week: week, poundsPerWeek: rate)
        }
    }

    static func rate(week: String, text: String, current: Double) -> SheetEdit {
        switch read(text) {
        case .empty: return .none
        case .invalid: return .invalid("Type a rate in pounds per week.")
        case .value(let value):
            guard abs(value) <= maxPoundsPerWeek else {
                return .invalid("Keep the rate within 10 lbs/w either way.")
            }
            let rate = roundHundredth(value)
            return rate == roundHundredth(current) ? .none : .changeRate(week: week, poundsPerWeek: rate)
        }
    }

    // MARK: Formatting, as src/lib/weight-log/format.ts

    static func pounds(_ value: Double?) -> String {
        guard let value else { return "—" }
        return String(format: "%.1f", value)
    }

    static func rate(_ value: Double?) -> String {
        guard let value else { return "—" }
        let rounded = (abs(value) * 10).rounded() / 10
        if rounded == 0 { return "0.0" }
        return "\(value > 0 ? "+" : "−")\(String(format: "%.1f", rounded))"
    }

    /// "Nov 23", with the year when it isn't today's.
    static func weekLabel(_ week: String, today: String) -> String {
        guard let date = WeekDate.date(week) else { return week }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = week.prefix(4) == today.prefix(4) ? "MMM d" : "MMM d, yyyy"
        return formatter.string(from: date)
    }
}
