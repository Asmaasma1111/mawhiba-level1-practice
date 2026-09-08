# Claude Code prompt

Put `exams.json` in an empty folder, open Claude Code there, and paste everything below the line.

---

Build a static, offline-capable practice-test web app in this folder. Arabic, right-to-left. It simulates the computer-based Saudi Mawhiba Level 1 aptitude test (مقياس موهبة للقدرات العقلية المتعددة) for my 8-year-old daughter, who sits the real thing at a Qiyas centre.

## Data

`exams.json` is in this folder and is the single source of truth. Read it before writing any code. Do not invent questions, do not edit the file, and do not hardcode any question in the app. Everything renders from that file, so adding a fourth exam later must require no code changes.

Note the schema: exams contain 12 blocks, each block has `seconds` and a `questions` array. Questions are `type: "text"` or `type: "figural"`. Figural questions carry a `stimulus` object (`kind` is `"row"` or `"matrix"`) and either `optionShapes` (draw them) or plain `options` (render as text). Shape items have `shape`, `fill`, `rotate`, or `dots`, and `{"blank": true}` marks the missing cell. `answer` is a zero-based index. Some blocks have a `passage` object to display above the questions.

## The one rule that matters most

The real test moves in short timed blocks and **you cannot return to a block once its timer expires**. This is the single behaviour I most need simulated, because it is where children lose marks. So:

- One block on screen at a time. Its own countdown timer.
- Within a block, free movement between questions, plus a "flag for review" toggle.
- When the timer hits zero, auto-submit the block and advance immediately. No warning dialog that blocks progress, no way back. Unanswered items score zero.
- Show a subtle visual state change in the last 60 seconds. Do not use sound, and do not use red flashing — this is an eight-year-old and panic is not the goal.
- A "next block" button lets her finish early, with one confirm step since it is irreversible.

## Screens

**Home** — pick an exam from `exams.json`. Show past attempts.

**Instructions** — brief, plain Arabic, short sentences. State the block rule explicitly before she starts. Include a two-question untimed warm-up so she meets the interface before the clock starts.

**Test** — top bar with block name, question N of M, timer, and a progress strip showing answered/unanswered/flagged within the current block only. Question centred. Four options as large tap targets, single select, clearly showing selected state. Previous/next within the block.

**Results** — total score out of 64, a breakdown by the four domains (`meta.domains`), and per-block: score, time used, and how many were left unanswered when time expired. That last number is the most useful figure on the page, so give it prominence. Then a review list of every question with her answer, the correct answer, and the `explain` text.

## Figural rendering

Draw all figural stimuli as inline SVG from the JSON data. No image files, no external assets, no icon libraries. Write one small renderer that takes a shape item and returns SVG: handle each `shape` value, `fill` (solid / empty / half), `rotate` in degrees, and `dots` (render as a tidy arrangement of small filled circles). Blank cells render as a dashed outline with a question mark. Matrices render as a 3x3 grid.

## Design

Calm and uncluttered, closer to a government exam portal than a children's game. No mascots, no confetti, no score animations, no streaks. Deep blue and white, generous whitespace, one accent colour for the selected state. Large type: this is a child reading Arabic on a screen for 103 minutes, so body text no smaller than 18px and question text larger. Cairo or Tajawal from a local font file, or system Arabic fallback. Full RTL: set `dir="rtl"`, and make sure numerals, timers and progress indicators read correctly in that direction.

Optimise for laptop and iPad landscape. It does not need to work on a phone.

## Technical

Plain HTML, CSS and vanilla JavaScript. No framework, no build step, no bundler, no npm install, no CDN links. It must run by opening `index.html` from the filesystem and must work with the network off. Keep it to a handful of files.

Persist attempt history and in-progress state in `localStorage` so a closed tab does not lose a session. Include a clearly labelled reset button that wipes stored data.

## Parent mode

A separate page reachable from home. No password. Show a table of all attempts: date, exam, score, per-domain breakdown, per-block time used, and questions left unanswered per block. Add a small line chart of scores over time, drawn as SVG by hand.

Also add a per-question difficulty view across attempts, so I can see which specific items she gets wrong repeatedly.

## Build order

Get the data layer and the block timer working first and verify the auto-advance behaviour before writing any styling. That timer is the core of the whole thing and everything else is secondary. Then the figural SVG renderer, then results, then parent mode, then visual design last.

When you are done, tell me which parts of the JSON schema you had to make assumptions about.
