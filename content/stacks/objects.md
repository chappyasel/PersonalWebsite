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
Audience: visitor
Link: Apple Vision Pro https://www.apple.com/apple-vision-pro/

The product I spent two years helping launch at Apple. I worked as an AR/VR software engineer on the teams behind Vision Pro.

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
Audience: visitor
Link: The AI Collective https://aicollective.com/

What started as a weekly meetup with friends after ChatGPT launched grew into a global nonprofit community.

## grab:coordination-research:about

Title: Coordination Research
Status: written
Audience: visitor
Link: Coordination Research https://coordination.sh/

An experiment in helping people and AI agents understand and strengthen the networks around them.

## golf-ball:about-a

Title: Golf Ball
Status: written

One of two golf balls tucked into the grass under the left side of About, in
front of the desk lamp. Carry it to the Training hitting bay, leave it still,
and the club will play it.

## golf-ball:about-b

Title: Golf Ball
Status: written

The second About golf ball. It stays in the grass in ordinary and screenshot
mode, and it can make the same trip to the hitting bay.

## grab:reading:\*

Title: Currently Reading
Status: written
Audience: visitor
Link: Book Notes https://books.chappyasel.com

The three books I am reading right now, pulled live from my library. Tap one to open my notes.

## grab:tj-medallion:about

Title: TJHSST Medallion
Status: written
Audience: visitor
Link: TJHSST https://tjhsst.fcps.edu/

My high school medallion, class of 2017. I now serve on the TJ Partnership Fund board as an alumni director.

## egg:lamp:0

Title: About Desk Lamp
Status: written

The warm practical from the original desk composition. Click it and it goes out;
click again and it comes back. Nothing is saved, so a reload lights it. It does
not move, because fixed task lighting is architecture and not a prop to throw.

## egg:globe

Title: Globe
Status: written
Audience: visitor

The darker countries are the 25 I have visited. The orange lights map the spread of AI Collective chapters around the world.

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
Audience: visitor
Link: LinkedIn https://www.linkedin.com/in/chappyasel/

Onstage at Consensus 2026 in Miami, making the case that AI agents may become crypto's first real users.

## about-collective-group-v8

Title: AI Collective
Status: written
Audience: visitor
Link: The AI Collective https://aicollective.com/

Kicking off The AI Collective's Bengaluru chapter in March 2025. A San Francisco meetup had somehow turned into this.

## about-family-v8

Title: Family Portrait
Status: written
Audience: visitor

My family on Martha's Vineyard in August 2026. This island has been one of the constants in our lives for nearly three decades.

## about-speaking-candid-v8

Title: Speaking Candid
Status: written
Audience: visitor

Making the case for trust and community as AI accelerates, during the lead-up to The AI Collective's June 2025 launch.

## about-delicate-arch-v8

Title: Delicate Arch
Status: written
Audience: visitor

Delicate Arch at sunset in July 2021, during a family trip through Moab.

## about-profile-full-v8

Title: Portrait
Status: written
Audience: visitor

Martha's Vineyard, August 2026. One of the rare times I managed to stand still long enough for a proper portrait.

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
Status: written
Audience: visitor

Golf with family and friends, one of the newer additions to our family rotation.

## training-pickleball-group-v8

Title: Pickleball Group
Status: written
Audience: visitor

Pickleball with the family. We picked it up on a Hilton Head trip and immediately stopped playing tennis.

## training-golf-flag-v8

Title: On the Green
Status: written
Audience: visitor

At the Chappaquiddick pin on Martha's Vineyard in August 2025.

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
Status: written
Audience: visitor

After my first natural bodybuilding show: second in novice bodybuilding and third in physique at Battle of the Bay in October 2022.

## training-stage-kneeling-v8

Title: Boys with Gains Stage Portrait
Status: written
Audience: visitor

Stepping onstage for the first time at Battle of the Bay in Fremont, October 2022.

## training-stage-side-v8

Title: Boys with Gains on Stage
Status: written
Audience: visitor

My first natural bodybuilding show, after twelve weeks of the hardest prep I had done.

## training-trophy-front-v8

Title: Boys with Gains Trophy Portrait
Status: written
Audience: visitor

The hardware from Battle of the Bay: second in novice bodybuilding and third in physique.

## aggregate-strength

Title: Aggregate One Rep Max Trend
Status: written
Audience: visitor
Link: Analyze data https://github.com/WeightliftingApp/WeightliftingApp-AnalyzeData
Link: Weightlifting https://weightlifting.chappyasel.com

Every lift rolled into one one-rep-max trend, built from the training data I have logged since 2018.

## big-three

Title: Big 3 Progression
Status: written
Audience: visitor
Link: Analyze data https://github.com/WeightliftingApp/WeightliftingApp-AnalyzeData
Link: Weightlifting https://weightlifting.chappyasel.com

Squat, bench, and deadlift over time. The lines are cleaner than the actual progression was.

## dexa-history

Title: DEXA Lean Mass vs Bodyweight
Status: written
Audience: visitor
Link: Analyze data https://github.com/WeightliftingApp/WeightliftingApp-AnalyzeData
Link: Weightlifting https://weightlifting.chappyasel.com

My bodyweight and lean mass across every DEXA scan. It looks like I may be nearing the asymptote, which is a fun hypothesis and definitely not something this chart can prove.

## training-gym-pose-v8

Title: Gym Portrait
Status: written
Audience: visitor

Near the end of my 2025 cut. Bodybuilding has been one of the stranger long-running experiments in my life.

## training-deadlift-v8

Title: Deadlift
Status: written
Audience: visitor

One of the deadlift sessions behind the charts on this shelf. I have logged every set since 2018, including the ugly ones.

## training-bench-v8

Title: Bench Press
Status: written
Audience: visitor

Benching nearly 500 pounds of estimated one-rep max. The actual rep looked about as graceful as this photo.

## lift-table

Title: Lift Table
Status: written
Audience: visitor
Link: PDF https://www.chappyasel.com/documents/lift-table.pdf

The first lifting chart I put together, before the analysis became a small research project of its own.

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
to 15 g in the morning stack, and 15 to 20 g more in each pre-workout bottle.

## grab:bag:betaalanine

Title: Beta Alanine
Status: written
Link: Routine https://www.chappyasel.com/routine

A 1 kg pouch of beta alanine, the smallest of the three, tucked in beside the
creatine. 15 g goes into each pre-workout bottle.

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
Audience: visitor
Link: Routine https://www.chappyasel.com/routine

One of the dorkier parts of my routine: twelve supplements in the morning, eight at night, each with an explicit dose and purpose.

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
Audience: visitor
Link: Routine https://www.chappyasel.com/routine

It shows your local time until you click it. Then it winds back to 3:45, which is when I get up.

## systems-working-session-v8

Title: Working Session
Status: written
Audience: visitor

A working session with The AI Collective team, turning a wall of ideas into something people could actually use.

## systems-home-office-v8

Title: Home Office
Status: written
Audience: visitor

My blissful work-from-home setup, complete with a view of Salesforce Tower.

## systems-sf-dusk-v8

Title: San Francisco at Dusk
Status: written
Audience: visitor

Sunset from my 33rd-floor apartment in San Francisco, where many AI Collective dinners and founder gatherings began.

## systems-lake-v8

Title: At the Lake
Status: written
Audience: visitor

Jumping into Lake Alpine during a 2020 road trip through California.

## link:routineboard

Title: Routine Board
Status: written
Audience: visitor
Link: Routine https://www.chappyasel.com/routine

The daily checklist I actually use, compressed into one board. The full version lives in my routine.

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
Status: written
Audience: visitor

Building with the team I joined after leaving Apple, July 2024. Three laptops on one couch was a pretty accurate picture of that chapter.

## grab:phone:projects

Title: Phone
Status: written

Lying face down on the lower shelf. It slid left into the notebook's old place
when the notebook went to Systems, so the two circuit boards could stand between
it and the Mac. Pick it up and it turns to face you: the Weightlifting App's
list view, an iPhone 15 screenshot with the Dynamic Island painted back in
where the panel has it, since a screenshot never shows the hole.

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
Status: written
Audience: visitor

At 1 Hacker Way during my Facebook software engineering internship in February 2020. COVID cut the internship short a few weeks later.

## action:projects:mac

Title: Macintosh
Status: written
Audience: visitor
automaton: a one-dimensional rule scrolling up from the bottom row into a band

A compact Mac running the cellular automaton that formed the background of the previous version of this site.

## egg:lamp:4

Title: Projects Desk Lamp
Status: written

The visible practical at the left end of the top shelf. It supplies the warm
reflection that travels across the two polished icon faces. Click it off and on.

## link:projects:weightlifting-icon

Title: Weightlifting App Icon
Status: written
Audience: visitor
Link: App Store https://apps.apple.com/us/app/id1266077653

The app I founded to track my own lifting. I have used it to log every workout since 2018.

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
Audience: visitor

The homework app I built in high school grew to 338,000 installs and number one in its category before Haystack AI acquired it in 2019.

## projects-wwdc-v8

Title: WWDC
Status: written
Audience: visitor

Launching App Intents at Apple's WWDC 2022.

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
Audience: visitor
Link: Medium https://medium.com/@chappyasel

My 2021 college paper on GPT-3 and the technological singularity. Researching it first pointed me toward community as the missing layer around AI.

## grab:pen:5

Title: Pen
Status: written

The pen lying on the stack of pages. It is its own prop; only the paper is a
portal.

## grab:trust-essay:musings

Title: Trust in the Age of Acceleration
Status: written
Audience: visitor
Link: Read the essay https://www.aicollective.com/trust

My argument that trust is the invisible thread holding society together, and that AI acceleration is pulling on it faster than our institutions can adapt.

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
Audience: visitor

Martha's Vineyard in miniature. My family has returned to the island every summer for nearly three decades.

## systems-lighthouse-v8

Title: Lighthouse
Status: written
Audience: visitor

Gay Head Light in Aquinnah, part of the island my family has returned to for nearly three decades.

## grab:lighthouse:musings

Title: Gay Head Light
Status: written
Audience: visitor
sand: weathered red brick gone salmon in the sun, a greyed brownstone band under

Gay Head Light in Aquinnah. The real lighthouse, the photograph, and this slightly ridiculous souvenir all made it onto the same shelf.

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
Status: written
Audience: visitor

Our first large-scale AI Collective Demo Night in May 2024. Find the people building interesting things and put them in a room together.

## talk-consensus-phone-v8

Title: Consensus
Status: written
Audience: visitor

An audience member filming my Consensus 2026 fireside on AI agents and crypto in Miami.

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
Status: written
Audience: visitor

Talking about The AI Collective and the optimism at the AI frontier on ANN News in January 2025.

## talk-dc-policy-v8

Title: DC Policy Talk
Status: written
Audience: visitor

Talking through what AI acceleration asks of policymakers and the people building the technology in Washington, DC.

## talk-panel-v8

Title: Panel Discussion
Status: written
Audience: visitor

Moderating "The Future of AI Beyond the Chatbot Era" at Stanford in August 2026.

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
