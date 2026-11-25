import SwiftUI
import WidgetKit

@main
struct ChappyWidgets: WidgetBundle {
    var body: some Widget {
        ReadingWidget()
        LatestWidget()
    }
}

struct SiteEntry: TimelineEntry {
    let date: Date
    let payload: WidgetPayload
    /// The first book's jacket, fetched up front: widgets can't load images lazily.
    let cover: UIImage?
}

struct SiteProvider: TimelineProvider {
    func placeholder(in context: Context) -> SiteEntry {
        SiteEntry(date: .now, payload: .placeholder, cover: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping @Sendable (SiteEntry) -> Void) {
        if context.isPreview {
            completion(placeholder(in: context))
            return
        }
        Task { completion(await Self.load()) }
    }

    func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<SiteEntry>) -> Void) {
        Task {
            let entry = await Self.load()
            let next = Calendar.current.date(byAdding: .hour, value: 2, to: .now)!
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    private static func load() async -> SiteEntry {
        guard let payload = try? await WidgetPayload.fetch() else {
            return SiteEntry(date: .now, payload: .placeholder, cover: nil)
        }
        var cover: UIImage?
        if let raw = payload.reading.first?.coverUrl, let url = URL(string: raw),
           let (data, _) = try? await URLSession.shared.data(from: url) {
            cover = UIImage(data: data)?.preparingThumbnail(of: CGSize(width: 240, height: 360))
        }
        return SiteEntry(date: .now, payload: payload, cover: cover)
    }
}

// MARK: - Reading

struct ReadingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "reading", provider: SiteProvider()) { entry in
            ReadingView(entry: entry)
                .containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("Currently Reading")
        .description("The book Chappy is reading now.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct ReadingView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SiteEntry

    var body: some View {
        if let book = entry.payload.reading.first {
            content(book)
                .widgetURL(URL(string: book.url))
        } else {
            Text("Between books")
                .font(.system(.headline, design: .serif))
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func content(_ book: WidgetPayload.Book) -> some View {
        switch family {
        case .systemSmall:
            VStack(alignment: .leading, spacing: 6) {
                jacket(book).frame(width: 44, height: 66)
                Spacer(minLength: 0)
                caption(book, lines: 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        default:
            HStack(spacing: 14) {
                jacket(book).frame(width: 84, height: 126)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Currently Reading")
                        .font(.system(.caption, design: .serif))
                        .foregroundStyle(.secondary)
                    caption(book, lines: 3)
                    Spacer(minLength: 0)
                }
                Spacer(minLength: 0)
            }
        }
    }

    private func caption(_ book: WidgetPayload.Book, lines: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(book.title)
                .font(.system(.headline, design: .serif))
                .lineLimit(lines)
            Text(book.author)
                .font(.system(.caption, design: .serif))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }

    private func jacket(_ book: WidgetPayload.Book) -> some View {
        Group {
            if let cover = entry.cover {
                Image(uiImage: cover).resizable().aspectRatio(contentMode: .fill)
            } else {
                Rectangle().fill(Color(hex: book.coverColor) ?? .gray.opacity(0.3))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 3))
        .shadow(radius: 1, y: 1)
    }
}

// MARK: - Latest

struct LatestWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "latest", provider: SiteProvider()) { entry in
            LatestView(payload: entry.payload)
                .containerBackground(.background, for: .widget)
        }
        .configurationDisplayName("Latest")
        .description("Chappy's latest workout and musing.")
        .supportedFamilies([.systemMedium])
    }
}

struct LatestView: View {
    let payload: WidgetPayload

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let workout = payload.latestWorkout, let url = URL(string: workout.url) {
                Link(destination: url) {
                    row(label: "Last Workout", title: workout.name,
                        detail: "\(workout.setCount) sets · \(Int(workout.volume).formatted()) lb")
                }
            }
            if let musing = payload.latestMusing, let url = URL(string: musing.url) {
                Link(destination: url) {
                    row(label: "Latest Musing", title: musing.title, detail: nil)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func row(label: String, title: String, detail: String?) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label).font(.system(.caption2, design: .serif)).foregroundStyle(.secondary)
            Text(title).font(.system(.subheadline, design: .serif).weight(.semibold)).lineLimit(1)
            if let detail {
                Text(detail).font(.system(.caption, design: .serif)).foregroundStyle(.secondary)
            }
        }
    }
}

extension Color {
    init?(hex: String?) {
        guard let hex, hex.count == 7, hex.hasPrefix("#"),
              let value = UInt32(hex.dropFirst(), radix: 16) else { return nil }
        self.init(red: Double((value >> 16) & 0xff) / 255,
                  green: Double((value >> 8) & 0xff) / 255,
                  blue: Double(value & 0xff) / 255)
    }
}
