import SwiftUI

/// The Weight tab: today's weigh-in at the top, the Log Weight Shortcut's
/// flow in place, then the Weeks table, edited like the web editor's.
struct WeightLogView: View {
    @State private var store = WeightLogStore.shared
    @State private var hasToken = OwnerToken.isSet
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NavigationStack {
            Group {
                if hasToken {
                    WeightLogContent(store: store, onForget: {
                        store.forgetToken()
                        hasToken = false
                    })
                } else {
                    TokenView { hasToken = true }
                }
            }
            .navigationTitle("Weight Log")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task(id: hasToken) { if hasToken { await store.refresh() } }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, hasToken { Task { await store.refresh() } }
        }
    }
}

private struct WeightLogContent: View {
    @Bindable var store: WeightLogStore
    let onForget: () -> Void

    @State private var entry = ""
    @State private var entryTyped = false
    @FocusState private var entryFocused: Bool
    @State private var editing: SheetCell?
    @State private var goToDate = false

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    TodayCard(store: store, entry: $entry, typed: $entryTyped, focused: $entryFocused)
                        .padding(.horizontal, 16)
                    statusLine.padding(.horizontal, 16)
                    if let sheet = store.sheet {
                        ForEach(sheet.sections) { section in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(section.phaseId == nil ? section.title : "Weeks")
                                    .font(.system(.footnote, design: .serif).weight(.bold))
                                    .foregroundStyle(.secondary)
                                    .padding(.horizontal, 16)
                                WeekGrid(rows: section.rows, columns: sheet.columns, interactive: interactive)
                            }
                        }
                    } else if let error = store.loadError {
                        ContentUnavailableView {
                            Label("The weekly table failed to load", systemImage: "exclamationmark.triangle")
                        } description: { Text(error) } actions: {
                            Button("Try again") { Task { await store.refresh() } }
                        }
                    } else {
                        ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                    }
                }
                .padding(.vertical, 12)
                .padding(.bottom, editing == nil ? 0 : 90)
            }
            .refreshable { await store.refresh() }
            .onChange(of: store.openAfterLoad) { _, cell in
                guard let cell, store.sheet?.day(cellDate(cell) ?? "") != nil else { return }
                store.openAfterLoad = nil
                open(cell)
                proxy.scrollTo(cell.week, anchor: .center)
            }
        }
        .safeAreaInset(edge: .bottom) {
            if let editing {
                CellEditor(store: store, cell: editing, order: order) { next in
                    self.editing = next
                }
                .id(editing)
            }
        }
        .toolbar { toolbar }
        .sheet(isPresented: $goToDate) {
            GoToDate(today: store.today) { date in
                goToDate = false
                Task { await store.jump(to: date) }
            }
            .presentationDetents([.medium])
        }
        .confirmationDialog(store.replacePrompt?.question ?? "", isPresented: replacing, titleVisibility: .visible,
                            presenting: store.replacePrompt) { prompt in
            Button("Replace with \(Sheet.pounds(prompt.pounds))") { Task { await store.confirmReplace(prompt) } }
            Button("Cancel", role: .cancel) { store.replacePrompt = nil }
        }
        .onChange(of: store.focusEntry) { _, focus in
            if focus { editing = nil; entryFocused = true; store.focusEntry = false }
        }
        .onAppear { if store.focusEntry { entryFocused = true; store.focusEntry = false } }
    }

    private var replacing: Binding<Bool> {
        Binding(get: { store.replacePrompt != nil }, set: { if !$0 { store.replacePrompt = nil } })
    }

    private func cellDate(_ cell: SheetCell) -> String? {
        if case .day(let date) = cell { return date }
        return nil
    }

    private var interactive: WeekGrid.Interactive {
        WeekGrid.Interactive(
            editing: editing,
            pending: store.pending,
            failed: store.failed,
            planLocked: store.planLanding,
            open: open,
            hint: { store.status = .init(message: $0) }
        )
    }

    private func open(_ cell: SheetCell) {
        entryFocused = false
        editing = cell
    }

    /// Every editable cell in reading order, for the editor's arrows.
    private var order: [SheetCell] {
        (store.sheet?.allRows ?? []).flatMap { row -> [SheetCell] in
            var cells = row.days.filter(\.editable).map { SheetCell.day($0.date) }
            if row.planEditable, !store.planLanding { cells += [.target(row.week), .rate(row.week)] }
            return cells
        }
    }

    @ViewBuilder
    private var statusLine: some View {
        if let status = store.status {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(status.message)
                    .font(.system(.footnote, design: .serif))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if status.undo != nil {
                    Button("Undo") { Task { await store.undo() } }
                        .font(.footnote.weight(.semibold))
                }
            }
            .transition(.opacity)
        }
        if !store.queued.isEmpty {
            Label("\(store.queued.count) weigh-in waiting to send", systemImage: "icloud.and.arrow.up")
                .font(.footnote)
                .foregroundStyle(.orange)
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            if let sheet = store.sheet {
                Menu {
                    Picker("Phase", selection: Binding(
                        get: { sheet.phaseId ?? "" },
                        set: { id in editing = nil; Task { await store.choosePhase(id) } }
                    )) {
                        ForEach(sheet.phases) { phase in
                            Label {
                                Text("\(phase.label) · Cycle \(phase.cycle)")
                            } icon: {
                                Image(systemName: "circle.fill").foregroundStyle(Color(hex: phase.color))
                            }
                            .tag(phase.id)
                        }
                    }
                    Divider()
                    Button("Forget Token", role: .destructive, action: onForget)
                } label: {
                    if let phase = sheet.phases.first(where: { $0.id == sheet.phaseId }) {
                        HStack(spacing: 6) {
                            Circle().fill(Color(hex: phase.color)).frame(width: 8, height: 8)
                            Text(phase.label).font(.subheadline).lineLimit(1)
                        }
                    } else {
                        Text("Phase")
                    }
                }
            }
        }
        ToolbarItem(placement: .topBarTrailing) {
            Button { goToDate = true } label: { Image(systemName: "calendar") }
                .accessibilityLabel("Go to date")
        }
    }
}

/// Today's weigh-in, as the Shortcut asked for it: the field starts from
/// the last counted weigh-in, grey until typed over, and saving shows the
/// site's outcome line, its week line, and the card's three weeks.
private struct TodayCard: View {
    let store: WeightLogStore
    @Binding var entry: String
    @Binding var typed: Bool
    var focused: FocusState<Bool>.Binding

    var body: some View {
        let start = store.todayStart
        VStack(alignment: .leading, spacing: 10) {
            Text("Today · \(WeekDate.shortDay(store.today))")
                .font(.system(.footnote, design: .serif).weight(.bold))
                .foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                TextField(start.text.isEmpty ? "000.0" : start.text, text: $entry)
                    .keyboardType(.decimalPad)
                    .font(.system(size: 52, weight: .regular, design: .default).monospacedDigit())
                    .foregroundStyle(typed || start.carried == nil ? .primary : .secondary)
                    .focused(focused)
                    .onChange(of: entry) { _, _ in typed = true }
                    .fixedSize()
                Text("lb").font(.title3).foregroundStyle(.secondary)
                Spacer()
                Button {
                    save(start)
                } label: {
                    if store.saving { ProgressView() } else { Text(saveTitle) }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(store.saving)
            }
            if let carried = start.carried, !typed {
                Text("Filled in from \(WeekDate.dayLabel(carried.date, today: store.today).replacingOccurrences(of: "Yesterday", with: "yesterday")). Not saved yet.")
                    .font(.system(.caption, design: .serif))
                    .foregroundStyle(.secondary)
            }
            if let result = store.lastResult, result.date == store.today {
                VStack(alignment: .leading, spacing: 8) {
                    Text(result.title).font(.headline.monospacedDigit())
                    Text(result.summary).font(.system(.subheadline, design: .serif)).foregroundStyle(.secondary)
                    WeekGrid(rows: result.card, columns: [], compact: true)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .onAppear { reset(start) }
        .onChange(of: store.sheet?.day(store.today)?.value) { _, _ in reset(store.todayStart) }
        .onChange(of: store.sheet?.carried) { _, _ in if !typed { reset(store.todayStart) } }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                if focused.wrappedValue {
                    Spacer()
                    Button(saveTitle) { save(store.todayStart) }.fontWeight(.semibold)
                }
            }
        }
    }

    private var saveTitle: String { store.sheet?.day(store.today)?.value == nil ? "Save" : "Update" }

    private func reset(_ start: (text: String, carried: AppSheet.WeighIn?)) {
        entry = start.text
        typed = false
    }

    private func save(_ start: (text: String, carried: AppSheet.WeighIn?)) {
        focused.wrappedValue = false
        let text = entry.isEmpty ? start.text : entry
        Task { await store.logToday(text) }
    }
}

/// The open cell's field, above the keyboard: Done saves, the arrows save
/// and move, Cancel leaves the cell as it was. An emptied day deletes its
/// weigh-in, as on the web.
private struct CellEditor: View {
    let store: WeightLogStore
    let cell: SheetCell
    let order: [SheetCell]
    let move: (SheetCell?) -> Void

    @State private var text = ""
    @State private var prefilled = false
    @State private var typed = false
    @State private var invalid = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(hint ?? label)
                .font(.system(.caption, design: .serif))
                .foregroundStyle(invalid ? .red : .secondary)
            HStack(spacing: 10) {
                TextField("", text: $text)
                    .keyboardType(cell.isRate ? .numbersAndPunctuation : .decimalPad)
                    .font(.title2.monospacedDigit())
                    .foregroundStyle(invalid ? .red : (prefilled && !typed ? .secondary : .primary))
                    .focused($focused)
                    .onChange(of: text) { _, _ in typed = true; invalid = false }
                    .onSubmit { finish(next: nil, enter: true) }
                Button { step(-1) } label: { Image(systemName: "chevron.up") }
                    .disabled(index.map { $0 == 0 } ?? true)
                Button { step(1) } label: { Image(systemName: "chevron.down") }
                    .disabled(index.map { $0 == order.count - 1 } ?? true)
                Button("Cancel") { store.cancel(cell); move(nil) }
                Button("Done") { finish(next: nil, enter: true) }.fontWeight(.semibold)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.bar)
        .onAppear {
            let start = store.startText(for: cell)
            text = start.text
            prefilled = start.prefilled
            typed = false
            focused = true
        }
    }

    private var index: Int? { order.firstIndex(of: cell) }

    private var label: String {
        switch cell {
        case .day(let date): "Weigh-in, \(WeekDate.dayLabel(date, today: store.today))"
        case .target(let week): "Target, week of \(Sheet.weekLabel(week, today: store.today))"
        case .rate(let week): "lbs/w, week of \(Sheet.weekLabel(week, today: store.today))"
        }
    }

    private var hint: String? {
        if prefilled, !typed, let carried = store.sheet?.carried {
            let from = WeekDate.dayLabel(carried.date, today: store.today)
                .replacingOccurrences(of: "Yesterday", with: "yesterday")
            return "Filled in from \(from). Not saved yet."
        }
        if case .day(let date) = cell, store.sheet?.day(date)?.excluded == true {
            return "This weigh-in stays left out of the weekly average."
        }
        return nil
    }

    private func step(_ delta: Int) {
        guard let index, order.indices.contains(index + delta) else { return }
        finish(next: order[index + delta], enter: false)
    }

    private func finish(next: SheetCell?, enter: Bool) {
        // A carried weigh-in saves only on Done, as the web's Return.
        if prefilled, !typed, !enter { move(next); return }
        if store.commit(cell, text: text) != nil { invalid = true; return }
        move(next)
    }
}

private extension SheetCell {
    var isRate: Bool { if case .rate = self { true } else { false } }
}

private struct GoToDate: View {
    let today: String
    let go: (String) -> Void
    @State private var date = Date.now

    var body: some View {
        NavigationStack {
            DatePicker("Date", selection: $date, in: ...Date.now, displayedComponents: .date)
                .datePickerStyle(.graphical)
                .padding()
                .navigationTitle("Go to Date")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Go") { go(WeekDate.today(date)) }
                    }
                }
        }
    }
}

/// Shown until the phone has the Weight Log token.
private struct TokenView: View {
    let saved: () -> Void
    @State private var token = ""
    @State private var base = WeightLogAPI.base
    @State private var refused = false

    var body: some View {
        Form {
            Section {
                SecureField("Token", text: $token)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Paste") { token = UIPasteboard.general.string ?? "" }
            } header: {
                Text("Weight Log Token")
            } footer: {
                Text("The site's WEIGHT_LOG_APP_TOKEN. It stays in this phone's Keychain.")
                    .foregroundStyle(refused ? .red : .secondary)
            }
            Section("Site") {
                TextField("Site", text: $base)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
            }
            Button("Save") {
                WeightLogAPI.base = base
                if OwnerToken.save(token) { saved() } else { refused = true }
            }
            .disabled(token.isEmpty)
        }
    }
}
