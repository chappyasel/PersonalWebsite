# Books Frontend - Clarifying Questions

Please answer these questions to help me create the best plan for your books site. Feel free to add, modify, or skip any questions.

## 1. Visual Design & Bookshelf Concept

**Q1.1: Bookshelf Layout**

- Do you envision a 3D perspective bookshelf (like a real bookshelf with depth) or a 2D grid of book spines/covers?

A 2D grid of book covers to start.

- Should books be arranged horizontally (spines visible like a traditional bookshelf) or as a grid of covers facing forward?

Facing forward.

**Q1.2: Grouping & Organization**

- How should books be organized on the shelf by default?
  - [x] By finish date (most recent first) - matching your current Notion view
  - [ ] By rating (highest rated first)
  - [ ] By category/tags (grouped sections)
  - [ ] By year finished (matching your Notion groups)
  - [ ] Other: \***\*\_\_\_\*\***

**Q1.3: Visual Style**

- Should the bookshelf have a realistic wooden shelf aesthetic or a more minimal/modern design?

Modern

- Do you want subtle animations (books tilting on hover, sliding effects, etc.)?

Yes, subtle animations.

- Should the color palette match your main site's warm neutral tones?

Yes, the color palette should match the main site's warm neutral tones.

## 2. Book Cover Images

**Q2.1: Cover Image Source**

- I noticed your Notion database doesn't currently have book cover images. How would you like to handle this?
  - [ ] Add cover image URLs to your Notion database manually
  - [ ] Fetch covers automatically from an API (Google Books API, Open Library, etc.)
  - [x] Use a combination (manual override with API fallback)
  - [ ] Other: \***\*\_\_\_\*\***

**Q2.2: Missing Covers**

- How should we handle books without cover images?
  - [x] Show a placeholder with book title and author
  - [ ] Show a generic book spine/cover
  - [ ] Hide from the shelf until a cover is added
  - [ ] Other: \***\*\_\_\_\*\***

## 3. Data Source & Updates

**Q3.1: Data Synchronization**

- How should the site get book data?
  - [x] Live API calls to Notion (always up-to-date, requires Notion API)
  - [ ] Build-time static generation (fetch during deployment)
  - [ ] Hybrid (ISR - regenerate every X hours)
  - [ ] Manual JSON export from Notion
  - [ ] Other: \***\*\_\_\_\*\***

**Q3.2: Update Frequency**

- How often do you add new books?

Once a week.

- Is real-time sync important, or is daily/weekly acceptable?

Daily is acceptable.

## 4. Filtering & Interaction

**Q4.1: Filters**

- Which filters would be most useful to visitors?
  - [x] By tag/category (Business, Tech, Psychology, etc.)
  - [x] By rating (show only 4+ stars, for example)
  - [x] By year finished
  - [x] Books with notes/summaries only
  - [ ] Other: \***\*\_\_\_\*\***

**Q4.2: Search**

- Should there be a search bar to find books by title/author?

Yes, there should be a search bar to find books by title/author.

**Q4.3: Sorting**

- Should users be able to re-sort the shelf?
  - [x] By finish date
  - [ ] By rating
  - [x] By title (alphabetical)
  - [ ] By author
  - [ ] Other: \***\*\_\_\_\*\***

## 5. Individual Book Pages

**Q5.1: Book Details**

- What should happen when someone clicks a book?
  - [x] Open a modal/overlay with book details
  - [ ] Navigate to a dedicated page for that book
  - [ ] Link directly to your Notion page with notes
  - [ ] Other: \***\*\_\_\_\*\***

**Q5.2: Information Display**

- What information should be shown for each book?
  - [x] Title, author, publication year
  - [x] Rating
  - [x] Tags/categories
  - [x] Start/finish dates
  - [x] Your notes (full text)
  - [ ] Summary only
  - [x] Link to Notion (just in case)
  - [ ] Other: \***\*\_\_\_\*\***

**Q5.3: Notes & Summaries**

- I see you have detailed notes in Notion. Should these be:
  - [x] Displayed in full on the site
  - [ ] Displayed as a preview with "Read more" linking to Notion
  - [ ] Only accessible via Notion link
  - [x] Displayed only for books with content / notes
  - [ ] Other: \***\*\_\_\_\*\***

## 6. Integration with Main Site

**Q6.1: Site Structure**

- Should this be:
  - [x] A subdomain (books.chappyasel.com) - SAME deployment as this codebase (use middleware)
  - [ ] A route on your main site (/books)
  - [ ] Other: \***\*\_\_\_\*\***

**Q6.2: Navigation**

- Should there be navigation back to your main site?

Yes, there should be navigation back to your main site.

- Should it share the same header/footer as chappyasel.com?

No

## 7. Technical Approach

**Q7.1: Framework**

- Your main site uses Next.js 16. Should this:
  - [x] Be part of the same Next.js app (new route)
  - [ ] Be a separate Next.js deployment
  - [ ] Use a different framework
  - [ ] Other: \***\*\_\_\_\*\***

**Q7.2: Database**

- Should book data be:
  - [x] Fetched directly from Notion API
  - [ ] Synced to your PostgreSQL database
  - [ ] Stored in static JSON files
  - [ ] Other: \***\*\_\_\_\*\***

## 8. Additional Features

**Q8.1: Statistics**

- Would you like to show reading statistics?
  - [x] Total books read
  - [x] Books per year
  - [x] Average rating
  - [ ] Reading streak/pace
  - [x] Category breakdown
  - [ ] Other: \***\*\_\_\_\*\***

**Q8.2: Future Features**

- Any other features you're considering?
  - Currently reading section?
  - Reading goals/challenges?
  - Book recommendations?
  - Reading timeline/history? - this would be nice to have, but not necessary for the MVP.
  - Other: \***\*\_\_\_\*\***

## 9. Priority & Timeline

**Q9.1: Must-Have vs Nice-to-Have**

- What's the minimum viable version? (List the absolute must-haves)

See above.

**Q9.2: Phased Approach**

- Are you open to building this in phases (simple version first, then add features)?

Yes, I'm open to building this in phases (simple version first, then add features).

## 10. Inspiration

**Q10.1: Examples**

- Do you have any websites or designs that inspire the look/feel you're going for?

No, not really.

- Any specific bookshelf visualizations you've seen and liked?

No, not really.

---

## Your Answers

Please fill in your answers above and save this file, then let me know when you're ready for me to create the implementation plan!
