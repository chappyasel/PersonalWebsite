# YouTube Information Diet

This context describes Chappy's private analysis of the YouTube videos he has selected and the emotional and intellectual character of that viewing.

## Language

**Video**:
A unique YouTube item that can be selected in one or more Watch Events and receive Classifications.
_Avoid_: Watch, history row

**Watch Event**:
A record that a Video was selected at a particular time; it does not prove that the Video was completed.
_Avoid_: Video, completed view

**Channel**:
The stable publishing identity associated with a Video, independent of changes to its displayed name.
_Avoid_: Channel name, creator score

**Information Diet**:
The collection and composition of videos Chappy selected over a period of time.
_Avoid_: Feed quality, YouTube quality

**Personal Viewing Analysis**:
An interpretation of Chappy's own viewing history for self-reflection and behavior change; it is not a public rating system.
_Avoid_: Channel ranking, creator rating

**Channel Aggregate**:
A summary of the videos Chappy watched from a channel, not a judgment about the channel or creator as a whole.
_Avoid_: Channel score, creator score

**Learning Value**:
The expected improvement in Chappy's knowledge, understanding, capability, or decision quality, whether durable or meaningfully time-sensitive; it remains independent of emotional tone, entertainment value, and production quality.
_Avoid_: Quality, productivity score, intentionality

**Learning Value Components**:
Independent judgments of depth and rigor, current relevance, and durability used to derive Learning Value; no single component places a hard cap on the Headline Score.
_Avoid_: Topic category, channel reputation, viewing intent

**Relevance Profile**:
A short, stable description of topics that are personally relevant to Chappy: AI, agents, software, data systems, product development, startups, investing, company-building, leadership, organizations, relationships, communication, psychology, decision-making, learning, health, fitness, and human performance, plus consequential current affairs such as economics, geopolitics, governance, institutions, and technology policy. It provides context only for Current Relevance and must not rescue shallow or low-quality content.
_Avoid_: Viewing intent, inferred interests, watch-history profile, versioned priorities

**Positivity**:
The expected emotional character of a video's content, from anger, fear, humiliation, despair, cynicism, and doom through neutrality to warmth, joy, calm, amusement, hope, and constructive agency.
_Avoid_: Mood, happiness score, arousal

**Positivity Components**:
Independent judgments of positive affect, negative affect, and optimism used to derive Positivity; arousal describes intensity but does not raise or lower Positivity by itself.
_Avoid_: Headline Score, mood dimensions

**Unscored**:
The explicit state for a video whose available evidence cannot support a Learning Value or Positivity judgment; it is not a neutral score.
_Avoid_: Unknown = 0.5, default score

**Estimated Exposure**:
A modeled amount of viewing associated with a watch event, calculated as the Video's full runtime divided by the assumed 2.2× playback speed; it is not confirmed time watched or proof that the Video was completed.
_Avoid_: Actual watch time, completed viewing

**Score Coverage**:
The proportion of Estimated Exposure represented by accepted scores for a dimension.
_Avoid_: Model confidence, percent of videos available

**Trailing Trend**:
A past-only moving summary across consecutive periods. The default dashboard view uses daily periods over one year with a trailing seven-day window; raw values remain visible while the Trailing Trend is emphasized. Learning Value and Positivity trends are weighted by scored Estimated Exposure.
_Avoid_: Centered smoothing, future-looking average, replacement for raw values

**Calibration Set**:
A deliberately varied set of videos labeled by Chappy and held apart from the full history to evaluate and improve scorers.
_Avoid_: Training data, model guesses, random sample

**Headline Score**:
A whole-number rating from 0 through 10 assigned to an individual video for either Learning Value or Positivity; aggregates may be decimal averages.
_Avoid_: 0–1 score, percentage, component rating

**Score Band**:
A shared visual interpretation of a Headline Score or aggregate: 0–3 is low/red, 4–6 is middle/amber, 7–10 is high/green, and Unscored remains gray with no numeric substitute. Chart series retain their own dimension colors—blue for Learning Value and green for Positivity—so identity and evaluation are not conflated.
_Avoid_: Dimension color, category label, default score for Unscored

**Classification**:
A versioned scorer's judgment of one Video for one dimension, including an Unscored judgment when evidence is insufficient.
_Avoid_: Watch-event score, permanent truth

**Manual Override**:
Chappy's explicitly chosen Headline Score for a Video, taking precedence over an automated Classification without deleting it.
_Avoid_: Corrected model score, overwritten classification
