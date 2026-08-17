# Stacks scene sound pack

These locally hosted Ogg/Opus files are edited from the recordings and licenses
listed below. Mixkit recordings may be used in commercial and non-commercial
projects under the [Mixkit Sound Effects Free License](https://mixkit.co/license/).
The source files are incorporated here as part of the Stacks web experience,
not redistributed as a standalone sound library.

## Sources

| Local file                                                                       | Source                                                                                                                                                                             |       Source ID |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------: |
| `wind-meadow-a.ogg`                                                              | [Wind blowing ambience](https://mixkit.co/free-sound-effects/wind/)                                                                                                               |            2658 |
| `wind-meadow-b.ogg`                                                              | [Wind in the top of the mountain](https://mixkit.co/free-sound-effects/wind/)                                                                                                     |            1267 |
| `spring-birds-meadow.ogg`                                                        | [Spring Birds Loop with Low-Cut (New Jersey)](https://freesound.org/people/hargissssound/sounds/345852/) by hargissssound ([CC0](https://creativecommons.org/publicdomain/zero/1.0/)) | Freesound 345852 |
| `golf-strike.ogg`, `golf-strike-b.ogg`, `golf-strike-c.ogg`, `golf-strike-d.ogg` | [Golf.wav](https://freesound.org/people/CGEffex/sounds/98334/) by CGEffex ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/))                                             | Freesound 98334 |
| `golf-turf.ogg`                                                                  | [Golf ball bouncing](https://mixkit.co/free-sound-effects/golf/) (single first impact only)                                                                                       |            2075 |
| `golf-cup.ogg`                                                                   | [Golf putting](https://freesound.org/people/inbeeld/sounds/21878/) by inbeeld ([CC0](https://creativecommons.org/publicdomain/zero/1.0/))                                           | Freesound 21878 |
| `golf-win.ogg`                                                                   | [woo.wav](https://freesound.org/people/Reitanna/sounds/215341/) by Reitanna ([CC0](https://creativecommons.org/publicdomain/zero/1.0/))                                             | Freesound 215341 |
| `flagstick.ogg`                                                                  | [Golf metal shot](https://mixkit.co/free-sound-effects/golf/)                                                                                                                     |            2123 |

The turf effect contains only the first restrained impact from its source. The
cup effect contains one scoring transient, with the repeated bounce sequence
removed. The spring-bird recording replaces the former city bed and randomized
bird one-shots; it is normalized as a continuous 42-second loop with a circular
three-second crossfade, while the two wind loops remain tied to only the
strongest grass gusts. The woo
is peak-limited in the asset and played quietly through the scene limiter. No
generic object pickup/collision recordings are used. One-shots are trimmed,
normalized, high-pass filtered, and encoded at 48–56 kbps mono. The four 6-iron
strikes are separate edits of the supplied Freesound recording and are credited
above as required. No synthetic placeholder audio remains. The complete
compressed payload is about 380 KB and must stay below the homepage's 1.5 MB
audio budget. The browser downloads none of it until the first pointer or
keyboard gesture unlocks Web Audio.
