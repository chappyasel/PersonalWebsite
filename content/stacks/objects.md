# Scene objects

Captions for the objects in the homepage room. One section per addressable
object, keyed by the id the scene uses for it: the artifact id for anything in
the photo catalog, the `hoverKey` for everything else. Objects generated in a
loop get one section for the family, with `*` standing in for the part that
varies.

Chappy edits this file. Nothing here may assert a fact that is not already
written in the codebase, visible in the object itself, or published elsewhere
on the site. Where a caption would need something only he knows, who is in a
photograph, where it was taken, when, why it matters, the section is marked
`Status: needs-owner` and carries a single `NEEDS:` line naming what is
missing. That is the correct state for those sections, not a gap to fill in
with a guess.

<!-- Shared / global -->

## focus:monstera:about-books

Title: Monstera
Status: written

The big plant on the floor seam between the About desk and the library. It
belongs to the room instead of to either shelf, and it is the one thing in here
that does not answer a pointer at all: at 2.71 units it is the largest object on
screen, and a tree brightening because a cursor crossed it reads as a bug.

## sky:goldengate

Title: Golden Gate Bridge
Status: written

Click the bridge in the skyline and the sky sets off fireworks over it. The
longest launch is seven shells across about eight seconds. The hit area is
derived from the same constants the shader draws the bridge with, so it cannot
drift away from the thing you are aiming at.

## sky:salesforce

Title: Salesforce Tower
Status: written

Click the crown and it puts on a light show. The target is a box around the lit
band the shader already draws across the top of the tower.

## sky:jasper

Title: Jasper
Status: written

Jasper, at 45 Lansing, in the same skyline material as the bridge and the tower.
The hit area covers the whole building, but the response is confined to one
window on floor 33.

## shelf:\*:top

Title: Top Shelf Plank
Status: written

The physical plank. It carries no interaction of its own and never competes with
a prop for focus; it is addressable only so the insects have the real shelf
surface to land on. One per unit, `shelf:<unit>:top`.

## shelf:\*:lower

Title: Lower Shelf Plank
Status: written

The lower plank, addressable on the same terms as the top one and for the same
reason. `shelf:<unit>:lower`.

<!-- Unit 0 — About -->

## action:about:vision-ride

Title: Apple Vision Pro
Status: written
Link: Apple Vision Pro https://www.apple.com/apple-vision-pro/

Put on the product I worked on at Apple for a retrowave ride. The shelf model keeps its continuous front glass,
aluminum enclosure, light seal, Solo Knit Band, Digital Crown, and top button. I
was an AR/VR software engineer on the teams that launched Vision Pro.

## link:about:role:madrona

Title: Madrona
Status: written
Link: Madrona https://www.madrona.com/

One of four role tiles stacked two by two beside Vision Pro. I am a venture
scout at Madrona.

## link:about:role:roam

Title: Roam
Status: written
Link: Roam https://ro.am/

Advisor to the CEO at Roam.

## link:about:role:susa

Title: Susa Ventures
Status: written
Link: Susa Ventures https://susaventures.com/

Venture fellow at Susa Ventures. The tile carries their own sage accent, the one
from under the gorilla in their paper.

## link:about:role:weightlifting

Title: Weightlifting App
Status: written
Link: App Store https://apps.apple.com/us/app/id1266077653

The app I founded, on a tile the size of a die. The Projects shelf shows the
same icon artwork at twice this size.

## grab:ai-collective-mark

Title: The AI Collective
Status: written
Link: The AI Collective https://aicollective.com/

The Collective's mark, extruded straight out of the brand SVG so the open C,
both squared arrow tips and the inner negative space are the real paths. I
co-founded it as a weekly meetup with friends when ChatGPT launched. It is now a
nonprofit with more than 250,000 members and 200 chapters.

## grab:coordination-research:about

Title: Coordination Research
Status: written
Link: Coordination Research https://coordination.sh/

A small black hole on a black hexagonal plinth with a live network of sixty
nodes turning inside it. Green nodes are people, blue nodes are agents. Hover it
and one improbably long chord grows across the sphere; drag it and the shockwave
runs out through the rest of the room.

## grab:reading:\*

Title: Currently Reading
Status: written
Link: Book Notes https://books.chappyasel.com

The top three books I am reading right now, jackets fanned on the desk. They
come from the live library, so they change as it does, and each carries its real
cover. Tapping one previews its notes without leaving the room. The three books
peel into their own lanes on hover instead of taking the shared nod, which swung
them through each other. Ids are `grab:reading:<bookId>`.

## grab:tj-medallion:about

Title: TJHSST Medallion
Status: written
Link: TJHSST https://tjhsst.fcps.edu/

My high school medallion, class of 2017. I am an alumni director on the TJ
Partnership Fund board. The shape is authored geometry with the real artwork on
its face, and it is turned to catch the desk lamp beside it.

## egg:lamp:0

Title: About Desk Lamp
Status: written

The warm practical from the original desk composition. Click it and it goes out;
click again and it comes back. Nothing is saved, so a reload lights it. It does
not move, because fixed task lighting is architecture and not a prop to throw.

## egg:globe

Title: Globe
Status: written

Click it and it adds a lap. At rest it drifts at 0.11 rad/s, slow enough that
you notice it the second time you look. On hover it runs about nine times that,
a lap every six and a half seconds, which is a globe someone has just spun. Only
the ball turns; the stand stays put.

## grab:plant:about-cactus

Title: Cactus
Status: written

A cactus on the top shelf, opposite the succulent.

## grab:plant:about-succulent

Title: Succulent
Status: written

A succulent in a pot, near the middle of the top shelf.

## grab:plant:about-large

Title: Potted Plant
Status: written

The tall potted plant at the right end of the top shelf.

## portrait

Title: Chappy Asel
Status: written
Link: LinkedIn https://www.linkedin.com/in/chappyasel/

The framed portrait on the desk. It is the same photograph the About page uses,
turned a little toward the lamp side.

## about-collective-group-v8

Title: AI Collective
Status: written
Link: The AI Collective https://aicollective.com/

A group photograph from the AI Collective, lying flat on the top shelf between
the globe and the portrait.

## about-family-v8

Title: Family Portrait
Status: needs-owner

NEEDS: who is in this photograph, roughly where and when it was taken, and what you want the caption to say about it.

## about-speaking-candid-v8

Title: Speaking Candid
Status: needs-owner

NEEDS: which talk or event this candid is from and the year.

## about-delicate-arch-v8

Title: Delicate Arch
Status: needs-owner

NEEDS: when you were at Delicate Arch and who with, and whether the caption should be about the trip or the hike.

## about-profile-full-v8

Title: Portrait
Status: needs-owner

NEEDS: what this full-length portrait was shot for and when. The tap already opens Instagram.

## grab:dumbbell:about

Title: Dumbbell
Status: written
Link: Weightlifting https://weightlifting.chappyasel.com

A 10 kg dumbbell standing on the floor beside the About shelf. It opens the
weightlifting site.

## egg:chair

Title: Reading Chair
Status: written

Click the chair and you sit down in it, and the Washington skyline comes up
behind you. The view on the other side is the sky shader that is already
running, so sitting down costs no download. Three files own the mechanic and
none of them imports another: the chair owns the click and the ways out, the
camera rig owns the easing. The seat pose is measured off whatever model is
actually in the chair slot, because it was hard-coded once and went silently
wrong the moment the couch replaced the old chair.

<!-- Unit 1 — Book Notes -->

## book:\*

Title: Featured Books
Status: written
Link: Book Notes https://books.chappyasel.com

The books I have ticked as featured, standing cover-out in front of the packed
row instead of in it. A bookshelf already has a physical vocabulary for "this
one matters" and that is it. Each carries its real jacket and previews its own
notes. Matching is by book id and not by title, because the library holds two
reads of 7 Habits of Highly Effective People and only the 2023 one is ticked.
Ids are `book:<bookId>`.

## link:riser:1:\*

Title: Riser Books
Status: written
Link: Book Notes https://books.chappyasel.com

The flat book a featured cover stands on. It is a real volume, outside the
cover's carry group, and its exposed fore-edge is its own way into the library.
It pulls toward the viewer only, so it never steals the cover standing on it.
Ids are `link:riser:1:<bookId>`.

## link:row:1:15:\*

Title: Top Packed Row
Status: written
Link: Book Notes https://books.chappyasel.com

The top packed row: real finished reads, newest first, every spine sized from
its own page count. No covers here, because a second face-out book competes with
the featured ones standing in front of it. Each volume opens its own notes.

## link:row:1:40:\*

Title: Lower Packed Row
Status: written
Link: Book Notes https://books.chappyasel.com

The lower row picks up where the top row stopped, so the shelf reads newest at
the top instead of restarting halfway down.

## link:row:1:_:_:\*

Title: Flat Book Stacks
Status: written
Link: Book Notes https://books.chappyasel.com

The horizontal piles the phone and the headphones lie on. Each takes the
shortest books left rather than the next ones in shelf order, so no long read
gets buried face down, and each pile sits thickest first the way a real one
does. Their x is authored: left to the roll, both stacks landed directly behind
a featured cover and everything resting on them disappeared. Source template:
`link:row:1:<salt>:<i>:<j>`.

## bookend:books:lower

Title: Lower Bookend
Status: written

An L-steel bookend holding the loose start of the short row. It stands 2.6° off
plumb, because a bookend takes the row's lean, and the pointer eases it upright
as if you had just straightened the shelf. It has to be at least as deep as the
books it holds or the row leans over the top of it.

## bookend:books:top

Title: Top Bookend
Status: written

Its twin, leaning the other way against the packed spines on the top row.

## grab:phone:books

Title: Phone
Status: written

Face down on the flat stack, the way a phone gets put down mid-chapter. It goes
nowhere on purpose: the headphones already carry the library, and two names for
one place is one too many. It is still a real prop, so you can pick it up and
throw it.

## grab:headphones:books

Title: Headphones
Status: written
Link: Book Notes https://books.chappyasel.com

Left on top of the flat stack, and the only way into the library index from this
unit. Every packed volume behind it opens its own notes now, so nothing else
here needs to open the index.

<!-- Unit 2 — Weightlifting -->

## training-golf-group-v8

Title: Golf Group
Status: needs-owner

NEEDS: who is in the group and which course or outing this was.

## training-pickleball-group-v8

Title: Pickleball Group
Status: needs-owner

NEEDS: who is in this photo, which court, and roughly when. Six of you at the net with paddles.

## training-golf-flag-v8

Title: On the Green
Status: needs-owner

NEEDS: which course this is and roughly when.

## grab:golf-tee:shelf-left

Title: Loose Tee
Status: written

One of three tees lying loose at the foot of the golf prints, as if tipped out
of a pocket. Three yaws, not a row. This is the left one.

## grab:golf-tee:shelf-middle

Title: Loose Tee
Status: written

The middle tee of the three at the foot of the golf prints.

## grab:golf-tee:shelf-right

Title: Loose Tee
Status: written

The right tee of the three at the foot of the golf prints.

## grab:ball:tennis

Title: Tennis Ball
Status: written

A 6.7 cm tennis ball, in front of the flag print rather than behind it, where
the print hid all but its crown. Like every ball on this shelf it can be carried
into the golf bay and struck.

## grab:ball:baseball

Title: Baseball
Status: written

A 7.4 cm baseball, in front of the basketball. Carry it to the golf bay, leave
it still, and the club will swing at it.

## golf-ball:shelf-a

Title: Golf Ball
Status: written

One of two golf balls at the foot of the golf prints. Same prop as the four in
the bay, so carry it over and the club will play it.

## golf-ball:shelf-b

Title: Golf Ball
Status: written

The second of the two golf balls at the foot of the golf prints.

## grab:can:diet-dr-pepper

Title: Diet Dr Pepper
Status: written

One of two 330 ml cans standing a few millimetres apart on the wood. Carried
into the golf bay it can be struck too, and a can tumbles where a ball rolls.

## grab:can:mtn-dew-zero

Title: Mtn Dew Zero
Status: written

The other can on the wood, with the Sunkist resting across its rim.

## grab:can:sunkist-zero

Title: Sunkist Zero
Status: written

Stacked on the rims of the other two.

## grab:dumbbell:training:left

Title: Heavy Dumbbell
Status: written
Link: Weightlifting https://weightlifting.chappyasel.com

12 kg, lying across the back of the lower shelf at an angle, one plate toward
the cans and the other toward the front. Set down, not squared up.

## grab:basketball

Title: Basketball
Status: written

A 24 cm basketball. It is the only sphere in the room, so it rolls on hover
instead of taking the tilt every other prop takes; a ball has no support edge to
tip about.

## training-trophy-side-v8

Title: Boys with Gains Trophy
Status: needs-owner

NEEDS: which show and year this trophy is from, what you placed, and whether Boys with Gains is your own account or the promoter's.

## training-stage-kneeling-v8

Title: Boys with Gains Stage Portrait
Status: needs-owner

NEEDS: which show and year this stage portrait is from.

## training-stage-side-v8

Title: Boys with Gains on Stage
Status: needs-owner

NEEDS: which show and year, and whether this is the same day as the other stage shot.

## training-trophy-front-v8

Title: Boys with Gains Trophy Portrait
Status: needs-owner

NEEDS: whether this is the same show as the other trophy shot, and what the trophy was for.

## aggregate-strength

Title: Aggregate One Rep Max Trend
Status: written
Link: Analyze data https://github.com/WeightliftingApp/WeightliftingApp-AnalyzeData
Link: Weightlifting https://weightlifting.chappyasel.com

Aggregate one rep max across every lift, plotted from my Weightlifting App data.
The code that draws it is in the AnalyzeData repo.

## big-three

Title: Big 3 Progression
Status: written
Link: Analyze data https://github.com/WeightliftingApp/WeightliftingApp-AnalyzeData
Link: Weightlifting https://weightlifting.chappyasel.com

The big three over time, from the same export.

## dexa-history

Title: DEXA Lean Mass vs Bodyweight
Status: written
Link: Analyze data https://github.com/WeightliftingApp/WeightliftingApp-AnalyzeData
Link: Weightlifting https://weightlifting.chappyasel.com

Lean mass against bodyweight across my DEXA scans.

## training-gym-pose-v8

Title: Gym Portrait
Status: needs-owner

NEEDS: when this was taken and whether it belongs to a particular prep.

## training-deadlift-v8

Title: Deadlift
Status: needs-owner

NEEDS: the weight on the bar and roughly when.

## training-bench-v8

Title: Bench Press
Status: needs-owner

NEEDS: the weight on the bar and roughly when.

## lift-table

Title: Lift Table
Status: written
Link: PDF https://www.chappyasel.com/documents/lift-table.pdf

The first lifting chart I put together. It is a letter page, lying flat in a row
with the three photographs beside it.

## grab:dumbbell:training:right

Title: Light Dumbbell
Status: written
Link: Weightlifting https://weightlifting.chappyasel.com

10 kg, standing front to back at the left end of the top shelf. Two dumbbells
set down at different moments, not a pair on display.

## grab:protein

Title: Whey Protein
Status: written
Link: Routine https://www.chappyasel.com/routine

The 5 lb whey tub, about 18 cm across and 23 cm tall, the tallest of the three
and the only one with a wide blue lid. A scoop of it, 30 g of protein, is the
base of the morning shake. It stands in the back row with the PRE-X.

## grab:gorilla-mode

Title: Gorilla Mode
Status: written
Link: Routine https://www.chappyasel.com/routine

The pre-workout. It ships in a squat 800 g tub, but standing beside the 5 lb
whey at true size it read as a mini, so it is a touch bigger than life. It stands
in front of the other two with the shakers, because it is the one taken first:
400 mg of it goes into each of the two pre-workout bottles I fill the morning
before and leave on the bedside stand.

## grab:pre-x

Title: Nutricost PRE-X
Status: written

The 996 g tub, 17.5 cm tall, with a shoulder that narrows into a tall black lid.
Back row, beside the whey.

## grab:shaker:training

Title: Shaker Bottle
Status: written

The front shaker, tucked in ahead of the PRE-X tub. Hover it and what is inside
moves: two slow sinusoids a fifth apart, which is what liquid finding its level
looks like.

## grab:shaker:training-navy

Title: Navy Shaker
Status: written

The navy one. The three shakers fan in depth instead of standing in a rank.

## grab:shaker:training-amber

Title: Amber Shaker
Status: written

The amber one, at the back of the fan.

## grab:barbell

Title: Loaded Barbell
Status: written
Link: Weightlifting https://weightlifting.chappyasel.com

The single loaded bar, 60 kg, in the rear exercise bay. Two loose bumper stacks
used to sit behind the unit; they repeated this bar's plates and read as
unrelated weights, so they are gone.

## golf-club:strike

Title: Golf Club
Status: written

The iron at rest in the aisle. Tap it and it swings at whatever is sitting in
the bay: a golf ball, or the basketball, or a soda can if you carried one over.

## golf-ball:one

Title: Teed Ball
Status: written

The ball on the planted tee. Pull the tee and it settles to the ground beside
it.

## golf-ball:two

Title: Bay Golf Ball
Status: written

One of the four balls in the hitting bay. They are kept at least 28 cm apart so
their targets and their colliders never start out overlapped.

## golf-ball:three

Title: Bay Golf Ball
Status: written

One of the four balls in the hitting bay.

## golf-ball:four

Title: Bay Golf Ball
Status: written

One of the four balls in the hitting bay.

## grab:golf-tee:stand

Title: Planted Tee
Status: written

The tee holding the first ball up. It is the reason that ball is elevated.

## grab:golf-tee:near-spare

Title: Spare Tee
Status: written

A loose spare in the grass, within reach and not lined up with anything.

## grab:golf-tee:white-spare

Title: Spare Tee
Status: written

The other loose spare in the grass.

<!-- Unit 3 — Systems -->

## grab:plant:sansevieria

Title: Sansevieria
Status: written

A snake plant in a soil disc at the left end of the lower shelf.

## grab:bag:realgood

Title: Frozen Chicken
Status: written

A 3 lb bag of frozen Real Good chicken, back against the plank so it stands in
the plank's shadow like stock on a shelf. There were three in an arc until they
crowded the whole left half of the plank; one says the daily food system as
plainly as three did. Nothing on the label is a photograph. It is flat colour
and word shapes, drawn for the scene.

## grab:bag:creatine

Title: Creatine
Status: written
Link: Routine https://www.chappyasel.com/routine

A 1 kg pouch of creatine monohydrate on the same bag, wearing a label I drew. It
is the largest of the three powders and sits at the back edge of the plank. 10
to 15 g in the morning stack, and the same again in each pre-workout bottle.

## grab:bag:betaalanine

Title: Beta Alanine
Status: written
Link: Routine https://www.chappyasel.com/routine

A 1 kg pouch of beta alanine, the smallest of the three, tucked in beside the
creatine. 10 g goes into each pre-workout bottle.

## grab:bag:collagen

Title: Collagen Peptides
Status: written
Link: Routine https://www.chappyasel.com/routine

A 1 kg pouch of collagen peptides, stepped forward from the other two and turned
the other way so three near-identical white pouches at one depth do not read as
one wide object. 20 g a day, for tendons and skin.

## grab:mio:hydrate:\*

Title: MiO Hydrate
Status: written
Link: Routine https://www.chappyasel.com/routine

Two bottles of MiO Hydrate, Berry Blast, in the 1.62 oz size. It goes into the
blender bottle with water, lemon juice and a little caffeine, as a home-brewed
low-calorie substitute for Gatorade. The bottles stand the way they land when
you put them down, gaps uneven, one forward and one back, each turned its own
way. There were six on this plank until six read as a case bought that week;
three reads as the ones that are open. There is no model behind any of them: the
whole skin is one drawn label wrapped on a lathed egg.

## grab:mio:lemonade:\*

Title: MiO Lemonade
Status: written
Link: Routine https://www.chappyasel.com/routine

The Lemonade, in the 3.24 oz "2X" bottle, standing with the two Hydrate in front
of the chicken bag. Same construction: a drawn label wrapped on a lathed egg,
with no model underneath it.

## grab:notebook:systems

Title: Notebook
Status: written

The notebook, over from Projects. A system is something you write down, so it
belongs beside the routine board more than it did beside the Mac. Its dark-theme
tint is lighter here than it was there: on Projects it sat in the desk lamp's
spill beside a beige Mac, and here it stands between near-white bags and a lit
print, where the old slate read as a hole in the light.

## systems-supplements-v8

Title: Daily Supplements
Status: written
Link: Routine https://www.chappyasel.com/routine

The daily supplements laid out. The print stands right back against the plank's
rear edge, directly behind the two physical pill cases it shows. The full list,
twelve in the morning and eight at night with doses and what each one is for, is
on the routine page.

## grab:pills:organizer:back-lower

Title: Pill Case
Status: written

One of four seven-day cases, 8.86 by 1.34 by 1.26 inches each. This is the
frosted white one at the bottom of the back pair. Two cases end to end need more
length than the bay has, so they stack in pairs instead.

## grab:pills:organizer:back-upper

Title: Pill Case
Status: written

The smoke-black case on top of the back pair. Each pair shows opposite faces,
because the desk lamp aims down this row and its spill is additive: a black case
on top at the lamp end came out khaki.

## grab:pills:organizer:front-lower

Title: Pill Case
Status: written

The smoke-black case at the bottom of the front pair, standing in front of the
supplements print.

## grab:pills:organizer:front-upper

Title: Pill Case
Status: written

The frosted white case on top of the front pair.

## grab:pills:bottle:\*

Title: Supplement Bottles
Status: written
Link: Routine https://www.chappyasel.com/routine

Fifteen bottles in three loose rows, packed either side of the supplements print
wherever the cases are not. Six size and proportion families in three tones,
because one cylinder at three scales read as a matching set instead of a shelf
that filled up one purchase at a time. No black bottle: the cases carry the black
and white in this corner. Nothing is written on the labels, because at about five
real centimetres a plain cream band reads as a label and any text would be a
smear. Ids are `grab:pills:bottle:<column>-<level>`.

## egg:lamp:3

Title: Systems Desk Lamp
Status: written

Aimed straight down the pill-case row. Click it off and on.

## link:row:3:68:\*

Title: Manual Row
Status: written
Link: Personal Manual https://www.chappyasel.com/manual

Six volumes on the top shelf. Every other book row in the room points at the
library; this one points at the personal manual.

## egg:clock:alarm

Title: Alarm Clock
Status: written
Link: Routine https://www.chappyasel.com/routine

At rest it shows your own local time. Click it and the hands wind clockwise to
3:45, which is when I get up, hold a beat, then wind on around to your time
again. That contrast is the whole joke. On hover it shivers, about a degree and
a half of roll and 2.6 mm of travel, which is what a bell housing on a hard
surface actually does.

## systems-working-session-v8

Title: Working Session
Status: needs-owner

NEEDS: whose session, where, and roughly when.

## systems-home-office-v8

Title: Home Office
Status: needs-owner

NEEDS: which home office this is and when, and whether the caption should say anything about the setup.

## systems-sf-dusk-v8

Title: San Francisco at Dusk
Status: needs-owner

NEEDS: where this was shot from and when, and whether it should say anything about living there.

## systems-lake-v8

Title: At the Lake
Status: needs-owner

NEEDS: where this lake is and when you were there. The print is in the artifact catalog but is not mounted on any shelf right now; it is waiting for a slot the way the lighthouse print did.

## link:routineboard

Title: Routine Board
Status: written
Link: Routine https://www.chappyasel.com/routine

A clipboard with the daily checklist and three boxes struck through. There is no
model behind it: the prop library has no clipboard, notebook, planner or desk
tray of any kind, and four boxes and a canvas is cheaper than the wrong model.
The sheet is deliberately unreadable, using the same title marks the book spines
use, because at the size it covers on screen real words would be a smear and
fake words would be a lie.

## egg:clock:floor

Title: Grandfather Clock Face
Status: written

The live dial on the floor clock, on the seam between Systems and Projects, and
turned so the face reads from both bays. Click it and the hands wind to 3:45 the
way the alarm clock's do.

## egg:clock:case

Title: Grandfather Clock Case
Status: written

The timber case and the pendulum. Click it and the whole clock shoves into a
damped rock. Face and case keep separate clicks but share one transform now;
before that the timber moved while the live dial floated in place.

<!-- Unit 4 — Projects -->

## grab:trophy

Title: Trophy
Status: written

A hollow metal trophy, the one prop in the room with a real metal finish. It
goes nowhere: you pick it up, and its restrained glint on hover is the whole
reaction. It keeps the shared nod as well, because a prop whose only answer is
reflectance has nothing to say in silhouette. It stands under the Homework icon
because the acquisition earned it.

## projects-coding-couch-v8

Title: Coding on the Couch
Status: needs-owner

NEEDS: when and where this was, and whether it is worth saying what you were building.

## grab:phone:projects

Title: Phone
Status: written

Lying face up on the lower shelf. It slid left into the notebook's old place
when the notebook went to Systems, so the two circuit boards could stand between
it and the Mac.

## egg:pixel:arduino

Title: Arduino Uno
Status: written

An Arduino lying flat at the plank lip. Tap it and the whole room redraws in
eight levels a channel; tap the lit board again and the finish comes off. Its
ATmega is an 8-bit part, so the look goes by "8-bit". It is a name, not a claim
about colour depth. Otherwise it is an ordinary prop you can pick up.

## egg:pixel:card

Title: Circuit Board
Status: written

A green expansion card standing upright behind the Arduino, gold fingers down,
leaning back a hair so the face catches the lamp. Tap it and the room redraws in
a 32-colour palette.

## projects-facebook-v8

Title: At Facebook
Status: needs-owner

NEEDS: what you were at Facebook for and when.

## link:projects:mac

Title: Macintosh
Status: written
Link: GitHub https://github.com/chappyasel

A compact Macintosh with a live pixel Happy Mac face that tracks the pointer and
blinks, and the way to my GitHub. It is a compact Mac and not a laptop for a
plain reason: at the twenty-odd pixels this covers on screen a MacBook is a grey
wedge, while the beige box with the recessed screen, the floppy slot and the
chin is unmistakable from across the room.

## egg:lamp:4

Title: Projects Desk Lamp
Status: written

The visible practical at the left end of the top shelf. It supplies the warm
reflection that travels across the two polished icon faces. Click it off and on.

## link:projects:weightlifting-icon

Title: Weightlifting App Icon
Status: written
Link: App Store https://apps.apple.com/us/app/id1266077653

The app's own icon on a shelf billet: the real artwork, not a screenshot mounted
as wall art.

## link:projects:dice:bottom-left

Title: Die
Status: written
Link: Liar's Dice https://www.chappyasel.com/liarsdice

One of six dice in a three-two-one pyramid, for Liar's Dice. They are six
separate props and not one sculpture, so the stack can collapse; the shared
edges mean moving a supporting die wakes the ones resting on it.

## link:projects:dice:bottom-center

Title: Die
Status: written
Link: Liar's Dice https://www.chappyasel.com/liarsdice

The middle die of the bottom row of the pyramid.

## link:projects:dice:bottom-right

Title: Die
Status: written
Link: Liar's Dice https://www.chappyasel.com/liarsdice

The right die of the bottom row of the pyramid.

## link:projects:dice:middle-left

Title: Die
Status: written
Link: Liar's Dice https://www.chappyasel.com/liarsdice

The left die of the middle row, resting on the two below it.

## link:projects:dice:middle-right

Title: Die
Status: written
Link: Liar's Dice https://www.chappyasel.com/liarsdice

The right die of the middle row.

## link:projects:dice:top

Title: Die
Status: written
Link: Liar's Dice https://www.chappyasel.com/liarsdice

The die on top of the pyramid. Restacking all six into a tower is one of the
field notes.

## homework-app

Title: Homework App
Status: written

The icon of the app I built in high school for organizing, tracking and
reminding people about upcoming homework assignments. It became the number one
homework app in the world, and Haystack AI acquired it in 2019 while I was still
in college: 338k installs, 63k monthly actives, a 4.7 rating and a top-60
Productivity app at the time. The lift-and-orbit preview behind this icon is
switched off for now, so on the shelf it is a plain grabbable.

## projects-wwdc-v8

Title: WWDC
Status: needs-owner

NEEDS: which WWDC year this is and what you were there for.

## shimmer:apple

Title: Apple Mark
Status: written
Link: Apple https://www.apple.com/

An extruded Apple mark on a bead-blasted billet, now beside my Apple photo on
the Projects shelf. Click it and a band of light runs across the face. It sits
square to the plank so the polished mark keeps reflecting the room instead of
turning black.

## grab:plant:projects-small

Title: Small Potted Plant
Status: written

A potted plant at the end of the Projects top shelf.

## grab:plant:projects-yucca

Title: Yucca
Status: written

A yucca standing on the floor at the seam after Projects. It fills the empty
transition without taking shelf space from the Mac and the gallery.

<!-- Unit 5 — Musings -->

## grab:mug

Title: Mug
Status: written

A mug on the Musings top shelf, near the kettle.

## grab:paper:5

Title: GPT-3 Paper
Status: written
Link: Medium https://medium.com/@chappyasel

Five real pages of the paper I wrote in 2021, loose on the shelf with a pen on
top of them. It was my final paper in college, on the technological singularity,
written right after GPT-3 came out, and that research is what pointed me at
community. The pages open my writing.

## grab:pen:5

Title: Pen
Status: written

The pen lying on the stack of pages. It is its own prop; only the paper is a
portal.

## grab:trust-essay:musings

Title: Trust in the Age of Acceleration
Status: written
Link: Read the essay https://www.aicollective.com/trust

The essay printed and stab-sewn into a booklet on a small wooden reading stand.
Its own line is that trust is the invisible thread that holds the world
together, so the binding thread is the one detail here that is not plain
stationery. The cover is page one of the real PDF, the beam artwork and the
title block, rasterised at twice letter resolution so the type survives being
carried up close. Nothing is redrawn and no mark is invented.

## grab:vineyard-sign

Title: Vineyard Signpost
Status: written

A Martha's Vineyard town-mileage post, 11 cm of souvenir. Oak Bluffs 3 and
Edgartown 8 one way; West Tisbury 8, Chilmark 11 and Aquinnah 18 the other, with
a grapes medallion on top. The face is a print die-cut off its mat, with a
mirrored copy behind it so the text still reads the right way round when you
carry it and turn it over.

## grab:vineyard-cutout

Title: Martha's Vineyard Cutout
Status: written

The island cut out of wood and standing in a slotted base, its coastline
extruded from a silhouette, the grain sun-bleached. It stands up instead of
lying flat because the camera sits only about eleven degrees above this shelf,
and a flat piece would foreshorten to five centimetres of nothing. The pin marks
the Katama house. It is a marker only; the Maps link that used to open the
address is gone.

## systems-lighthouse-v8

Title: Lighthouse
Status: written

Gay Head Light, photographed on the island. The print stands between the wooden
cutout of the island it was taken on and the souvenir of the light it shows.

## grab:lighthouse:musings

Title: Gay Head Light
Status: written

A 32 cm resin souvenir of Gay Head Light in Aquinnah, standing in a tray of
sand: weathered red brick gone salmon in the sun, a greyed brownstone band under
the gallery, black iron above that, and a lantern that turns on a seven and a
half second period. The beam is four crossed sheets per direction with a soft
analytic cone, because a flat glowing rectangle looks like a rotating prop
instead of light in the air. Three tries at the sand ended with the tray:
strewn grains broke physics and strewn decals read as paint. Tower, rim and sand
move as one souvenir.

## grab:sticker:vineyard-vines

Title: Vineyard Vines Sticker
Status: written

A thin die-cut decal left flat on the wood in front of the lighthouse.

## grab:plant:musings

Title: Succulent Bowl
Status: written

A succulent bowl, front left on the top shelf, standing in front of the lamp's
foot where the head does not reach. It came up from the lower plank to make room
for the lighthouse print.

## egg:lamp:5

Title: Musings Desk Lamp
Status: written

The shared measured angle-poise rig. Shade glow, hot mouth, spot and local spill
all switch together when you click it.

## grab:headphones

Title: Headphones
Status: written
Link: SoundCloud https://soundcloud.com/chappyasel

Beats red shell, neutral rails, near-black cushions. They open my SoundCloud,
where the RAGE and HARDcore playlists are what I lift to.

## grab:kettle

Title: Kettle
Status: written

A kettle on the top shelf, next to the tea.

## egg:tea

Title: Cup of Tea
Status: written

It steams all the time, because a hot drink that only steams when clicked is a
button. The click is still there as a stronger puff. The cup keeps its nod on
hover too, since the steam is already moving and the nod is what tells you which
prop is answering.

## grab:openbook

Title: Open Book
Status: written
Link: Book Notes https://books.chappyasel.com

An open book left on the top shelf. It opens the library.

## link:row:5:75:\*

Title: Musings Book Row
Status: written
Link: Book Notes https://books.chappyasel.com

Eight volumes standing upright on the top shelf. They are scenery rather than
particular books, so they all open the library.

<!-- Unit 6 — Talks -->

## talk-demo-night-v8

Title: Demo Night
Status: needs-owner

NEEDS: which demo night, where, and when.

## talk-consensus-phone-v8

Title: Consensus
Status: needs-owner

NEEDS: confirm this is Consensus 2026 in Miami, the one talk on the Talks page from that stage, and say what is on the phone.

## grab:sticker-camera:talks-a

Title: Sticker Camera
Status: written

One of two small brushed-aluminium box cameras that print dithered
black-and-white stickers, standing on the wood under the hung board. This is the
one shelf in the room where a camera is not decoration. The body is built rather
than downloaded, because the shape is simple and the room already owns its
aluminium and its pixel font, and it is built at the real size: 2.90 inches wide
by 3.64 tall by 1.35 deep.

## grab:sticker-camera:talks-b

Title: Sticker Camera
Status: written

The second camera. The two are turned differently so the pair does not read as
one object copied.

## grab:microphone

Title: Microphone
Status: written

A microphone lying on the lower plank. It was on the top shelf until the
harmonica took that spot.

## grab:plant:talks-pothos

Title: Pothos
Status: written

A pothos on the Talks lower shelf.

## talk-ann-interview-v8

Title: Interview with Ann
Status: needs-owner

NEEDS: who Ann is, what show or outlet the interview was for, and when.

## talk-dc-policy-v8

Title: DC Policy Talk
Status: needs-owner

NEEDS: which DC event this was, the year, and what the talk was about.

## talk-panel-v8

Title: Panel Discussion
Status: needs-owner

NEEDS: which panel, where, and who else was on it.

## grab:harmonica:talks

Title: Harmonica
Status: written

A harmonica on the top shelf, in the microphone's old spot.

## grab:plant:talks-top

Title: Potted Plant
Status: written

A potted plant at the end of the Talks top shelf.

## egg:lamp:floor:6

Title: Floor Lamp
Status: written

The floor lamp standing in the grass between Musings and Talks. Its local x is
half the pitch between the two units, so it belongs to neither while warming
both. Click it off and back on, like the two desk lamps. The trigger wraps the
pole and the shade only: the glow sprite is a metre-wide transparent quad, and
inside the trigger it would become an invisible hit box over half the unit.

<!-- coverage

Not covered, and why.

Removed from the scene; their absence is asserted by tests, so a caption would
be dead weight:
- focus:couch:about
- grab:notebook:projects

Components that define interaction ids but are not mounted anywhere today, so
none of these ids exists at runtime:
- grab:pile:*, link:pile:* (BookPile)
- link:plates:* (BumperPlates)
- grab:frame:*, frame:* (FrameRow)
- notebook:*, grab:notebook:<unit>:<i> (NotebookLean)
- CardStack, Polaroid, PostcardPrint
- RollBall, BounceProp

Not object ids at all:
- "photo:" (INERT_HOVER), a per-instance non-interactive hover slot used by
  ModelProp
- test:owner, test:force-owner, test:perch-owner, test:sprite-perch-owner,
  test:authored-contact-owner, test:exact-owner-stale-hint, and the
  grab:ball:a / grab:ball:b / grab:ball:missing / book:visible-from-golf /
  grab:books:featured-cover fixtures, all of which appear only in tests

Grouped rather than given one section each, because the objects are identical in
role and only their position differs. Each family section names its own id
template:
- grab:reading:* (three live books)
- book:*, link:riser:1:*, link:row:1:15:*, link:row:1:40:*, link:row:1:*:*:*
  (the Books unit's rows, packed at runtime from the live library)
- link:row:3:68:*, link:row:5:75:*
- grab:mio:hydrate:*, grab:mio:lemonade:*, grab:pills:bottle:*
- shelf:*:top, shelf:*:lower

Written but not resolvable by the current parser, which wildcards one segment at
a time and so cannot match a template with more than one `*`:
- link:row:1:*:*:* — the flat-stack volumes, whose runtime ids are
  link:row:1:<salt>:<itemIndex>:<volumeIndex>. Both the salt and the item index
  vary, so no single-wildcard template reaches them. The section is written and
  correct; it needs either cumulative right-to-left wildcarding in
  objectNoteFor, or a stable per-stack key.

Inventory entries that no longer match the source as of 2026-08-28, captioned
under the ids the code uses today:
- grab:bag:realgood:0 / :1 / :2 are now one bag, grab:bag:realgood
- grab:bag:creatine has been joined by grab:bag:betaalanine and
  grab:bag:collagen; all three are supplement pouches on the same model
- the MiO row is three bottles, not six

-->
