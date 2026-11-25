import SwiftUI

/// The Weeks table: the Week column held at the left, then the seven days
/// and the summary columns, which scroll sideways together. Colors, text,
/// and which cells take an edit all come from the server (`appSheet`).
struct WeekGrid: View {
    let rows: [AppRow]
    let columns: [AppSheet.Column]
    var compact = false
    /// Cells that take a tap, and what each reads while sending or refused.
    var interactive: Interactive?

    struct Interactive {
        let editing: SheetCell?
        let pending: [SheetCell: String]
        let failed: [SheetCell: String]
        let planLocked: Bool
        let open: (SheetCell) -> Void
        let hint: (String) -> Void
    }

    static let dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    private var cellWidth: CGFloat { compact ? 44 : 54 }
    private var rowHeight: CGFloat { compact ? 26 : 34 }
    private var labelWidth: CGFloat { compact ? 46 : 54 }
    private var font: Font { .system(size: compact ? 11 : 13).monospacedDigit() }

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            VStack(spacing: 0) {
                header("Week", alignment: .leading)
                    .frame(width: labelWidth, height: rowHeight, alignment: .leading)
                ForEach(rows) { row in
                    weekLabel(row).frame(width: labelWidth, height: rowHeight, alignment: .leading)
                }
            }
            .padding(.leading, compact ? 0 : 12)
            .background(.background)
            .zIndex(1)
            ScrollView(.horizontal, showsIndicators: false) {
                VStack(spacing: 0) {
                    HStack(spacing: 0) {
                        ForEach(Self.dayNames, id: \.self) { day in
                            header(day).frame(width: cellWidth, height: rowHeight, alignment: .trailing)
                        }
                        if !compact {
                            ForEach(Array(columns.enumerated()), id: \.offset) { index, column in
                                Button { interactive?.hint(column.hint) } label: {
                                    header(column.label)
                                }
                                .buttonStyle(.plain)
                                .frame(width: cellWidth, height: rowHeight, alignment: .trailing)
                                .overlay(alignment: .leading) { if index == 0 { divider } }
                            }
                        }
                    }
                    .overlay(alignment: .bottom) { Rectangle().fill(.separator).frame(height: 0.5) }
                    ForEach(rows) { row in
                        HStack(spacing: 0) {
                            ForEach(Array(row.days.enumerated()), id: \.offset) { _, day in dayCell(day) }
                            if !compact {
                                ForEach(Array(row.summary.enumerated()), id: \.offset) { index, cell in
                                    summaryCell(row, index: index, cell: cell)
                                        .overlay(alignment: .leading) { if index == 0 { divider } }
                                }
                            }
                        }
                    }
                }
                .padding(.trailing, compact ? 0 : 12)
            }
        }
    }

    private var divider: some View { Rectangle().fill(.separator).frame(width: 0.5) }

    private func header(_ text: String, alignment: Alignment = .trailing) -> some View {
        Text(text)
            .font(.system(size: compact ? 10 : 12, weight: .bold))
            .foregroundStyle(.secondary)
            .padding(.horizontal, 6)
            .frame(maxWidth: .infinity, alignment: alignment)
    }

    private func weekLabel(_ row: AppRow) -> some View {
        HStack(spacing: 5) {
            Text(row.number.map(String.init) ?? "")
                .font(.system(size: compact ? 9 : 11, weight: .bold))
                .foregroundStyle(.secondary)
                .frame(width: compact ? 12 : 16, alignment: .trailing)
            VStack(alignment: .leading, spacing: 0) {
                Text(row.month).font(.system(size: compact ? 8 : 10, weight: .bold)).foregroundStyle(.secondary)
                Text(row.day).font(.system(size: compact ? 11 : 13, weight: .bold))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(row.number.map { "\(row.label), week \($0)" } ?? row.label)
    }

    @ViewBuilder
    private func dayCell(_ day: AppDay) -> some View {
        let cell = SheetCell.day(day.date)
        let shown = readout(cell, saved: day.text)
        let struck = day.excluded && shown.text == day.text && day.value != nil
        let content = Text(shown.text.isEmpty ? " " : shown.text)
            .font(font)
            .strikethrough(struck)
            .foregroundStyle(shown.style ?? (struck ? AnyShapeStyle(.secondary) : AnyShapeStyle(day.color?.text ?? .primary)))
            .padding(.horizontal, 6)
            .frame(width: cellWidth, height: rowHeight, alignment: .trailing)
            .background(day.color?.background ?? .clear)
            .overlay {
                if day.isToday || interactive?.editing == cell {
                    Rectangle().strokeBorder(day.isToday ? Color.red : Color.secondary, lineWidth: 2)
                }
            }
        if let interactive, day.editable {
            Button { interactive.open(cell) } label: { content }
                .buttonStyle(.plain)
                .accessibilityLabel("Weigh-in, \(day.date)\(day.isToday ? ", today" : ""), \(shown.text.isEmpty ? "empty" : "\(shown.text) lb")\(struck ? ", left out of the weekly average" : "")")
        } else {
            content
        }
    }

    @ViewBuilder
    private func summaryCell(_ row: AppRow, index: Int, cell: AppCell) -> some View {
        let editable: SheetCell? = switch index {
        case 2: row.planEditable ? .target(row.week) : nil
        case 4: row.planEditable ? .rate(row.week) : nil
        default: nil
        }
        let shown = editable.map { readout($0, saved: cell.text) } ?? (text: cell.text, style: nil)
        let empty = cell.value == nil && cell.color == nil
        let content = Text(shown.text)
            .font(font)
            .foregroundStyle(shown.style ?? (empty ? AnyShapeStyle(Color(.tertiaryLabel)) : AnyShapeStyle(cell.color?.text ?? .primary)))
            .padding(.horizontal, 6)
            .frame(width: cellWidth, height: rowHeight, alignment: .trailing)
            .background(cell.color?.background ?? .clear)
            .overlay {
                if let editable, interactive?.editing == editable {
                    Rectangle().strokeBorder(Color.secondary, lineWidth: 2)
                }
            }
        if let interactive, let editable {
            Button { interactive.open(editable) } label: { content }
                .buttonStyle(.plain)
                .disabled(interactive.planLocked)
        } else {
            content
        }
    }

    /// What a cell reads while it isn't open: sent, refused, or saved.
    private func readout(_ cell: SheetCell, saved: String) -> (text: String, style: AnyShapeStyle?) {
        if let failed = interactive?.failed[cell] { return (failed, AnyShapeStyle(Color.red)) }
        if let pending = interactive?.pending[cell] { return (pending, AnyShapeStyle(.secondary)) }
        return (saved, nil)
    }
}
