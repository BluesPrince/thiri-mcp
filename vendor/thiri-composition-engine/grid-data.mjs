// THIRI grid — the database of numbers. Single source of truth for the base
// grid (D1 can override/extend at runtime). Pure data, importable by node and
// by the Worker. Labels encode diatonic degree (needed for spelling).

export const QUALITIES = [
  // triads
  { id: "maj",  intervals: [0,4,7],       labels: ["P1","M3","P5"],            display: "Major",            aliases: ["","maj","major","M","Δ","△"] },
  { id: "min",  intervals: [0,3,7],       labels: ["P1","m3","P5"],            display: "Minor",            aliases: ["m","min","minor","-"] },
  { id: "dim",  intervals: [0,3,6],       labels: ["P1","m3","d5"],            display: "Diminished",       aliases: ["dim","o","°","mb5"] },
  { id: "aug",  intervals: [0,4,8],       labels: ["P1","M3","A5"],            display: "Augmented",        aliases: ["aug","+","#5"] },
  { id: "sus2", intervals: [0,2,7],       labels: ["P1","M2","P5"],            display: "Suspended 2nd",    aliases: ["sus2"] },
  { id: "sus4", intervals: [0,5,7],       labels: ["P1","P4","P5"],            display: "Suspended 4th",    aliases: ["sus4","sus"] },
  { id: "5",    intervals: [0,7],         labels: ["P1","P5"],                 display: "Power chord",      aliases: ["5"] },
  // sixths
  { id: "6",    intervals: [0,4,7,9],     labels: ["P1","M3","P5","M6"],       display: "Major 6th",        aliases: ["6","maj6","major6","M6"] },
  { id: "m6",   intervals: [0,3,7,9],     labels: ["P1","m3","P5","M6"],       display: "Minor 6th",        aliases: ["m6","min6","minor6","-6"] },
  { id: "69",   intervals: [0,4,7,9,14],  labels: ["P1","M3","P5","M6","M9"],  display: "6/9",              aliases: ["69","6/9"] },
  // sevenths
  { id: "maj7", intervals: [0,4,7,11],    labels: ["P1","M3","P5","M7"],       display: "Major 7th",        aliases: ["maj7","major7","M7","Δ7","△7","ma7","j7"] },
  { id: "7",    intervals: [0,4,7,10],    labels: ["P1","M3","P5","m7"],       display: "Dominant 7th",     aliases: ["7","dom7","dominant7"] },
  { id: "m7",   intervals: [0,3,7,10],    labels: ["P1","m3","P5","m7"],       display: "Minor 7th",        aliases: ["m7","min7","minor7","-7"] },
  { id: "m7b5", intervals: [0,3,6,10],    labels: ["P1","m3","d5","m7"],       display: "Half-Diminished",  aliases: ["m7b5","min7b5","ø","ø7","halfdim","m7-5"] },
  { id: "dim7", intervals: [0,3,6,9],     labels: ["P1","m3","d5","d7"],       display: "Diminished 7th",   aliases: ["dim7","o7","°7"] },
  { id: "mMaj7",intervals: [0,3,7,11],    labels: ["P1","m3","P5","M7"],       display: "Minor-Major 7th",  aliases: ["mMaj7","mM7","m(maj7)","minmaj7","mmaj7","m#7","mΔ7","-maj7","minmajor7","mmajor7"] },
  { id: "7sus4",intervals: [0,5,7,10],    labels: ["P1","P4","P5","m7"],       display: "Dominant 7 sus4",  aliases: ["7sus4","7sus"] },
  { id: "maj7#5",intervals:[0,4,8,11],    labels: ["P1","M3","A5","M7"],       display: "Major 7 #5",       aliases: ["maj7#5","M7#5","+M7","augmaj7"] },
  // ninths
  { id: "maj9", intervals: [0,4,7,11,14], labels: ["P1","M3","P5","M7","M9"],  display: "Major 9th",        aliases: ["maj9","major9","M9","Δ9"] },
  { id: "9",    intervals: [0,4,7,10,14], labels: ["P1","M3","P5","m7","M9"],  display: "Dominant 9th",     aliases: ["9","dom9"] },
  { id: "m9",   intervals: [0,3,7,10,14], labels: ["P1","m3","P5","m7","M9"],  display: "Minor 9th",        aliases: ["m9","min9","minor9","-9"] },
  { id: "add9", intervals: [0,4,7,14],    labels: ["P1","M3","P5","M9"],       display: "Add 9",            aliases: ["add9","add2","2"] },
  // elevenths
  { id: "11",   intervals: [0,7,10,14,17],labels: ["P1","P5","m7","M9","P11"], display: "Dominant 11th",    aliases: ["11","dom11"] },
  { id: "m11",  intervals: [0,3,7,10,14,17], labels: ["P1","m3","P5","m7","M9","P11"], display: "Minor 11th", aliases: ["m11","min11","-11"] },
  // thirteenths (NO #11 in plain 13 — the fix, by construction)
  { id: "13",   intervals: [0,4,7,10,14,21], labels: ["P1","M3","P5","m7","M9","M13"], display: "Dominant 13th", aliases: ["13","dom13"] },
  { id: "maj13",intervals: [0,4,7,11,14,21], labels: ["P1","M3","P5","M7","M9","M13"], display: "Major 13th",   aliases: ["maj13","Δ13"] },
  { id: "m13",  intervals: [0,3,7,10,14,21], labels: ["P1","m3","P5","m7","M9","M13"], display: "Minor 13th",   aliases: ["m13","min13","-13"] },
  // altered dominants
  { id: "7b9",  intervals: [0,4,7,10,13], labels: ["P1","M3","P5","m7","m9"],  display: "7♭9",         aliases: ["7b9","dom7b9"] },
  { id: "7#9",  intervals: [0,4,7,10,15], labels: ["P1","M3","P5","m7","A9"],  display: "7♯9",         aliases: ["7#9","dom7#9"] },
  { id: "7#11", intervals: [0,4,7,10,18], labels: ["P1","M3","P5","m7","A11"], display: "7♯11",        aliases: ["7#11","dom7#11"] },
  { id: "7b13", intervals: [0,4,7,10,20], labels: ["P1","M3","P5","m7","m13"], display: "7♭13",        aliases: ["7b13"] },
  { id: "7b5",  intervals: [0,4,6,10],    labels: ["P1","M3","d5","m7"],       display: "7♭5",         aliases: ["7b5","dom7b5"] },
  { id: "7alt", intervals: [0,4,8,10,13,15], labels: ["P1","M3","A5","m7","m9","A9"], display: "Altered Dominant", aliases: ["7alt","alt","altered"] },
];

export const SCALES = [
  { id: "ionian",           intervals: [0,2,4,5,7,9,11],   character: "Major. Bright, resolved." },
  { id: "dorian",           intervals: [0,2,3,5,7,9,10],   character: "Minor with a natural 6. Cool, modal." },
  { id: "phrygian",         intervals: [0,1,3,5,7,8,10],   character: "Minor with a flat 2. Spanish, dark." },
  { id: "lydian",           intervals: [0,2,4,6,7,9,11],   character: "Major with a #4. Floating, dreamy." },
  { id: "mixolydian",       intervals: [0,2,4,5,7,9,10],   character: "Major with a flat 7. Rock, blues, gospel." },
  { id: "aeolian",          intervals: [0,2,3,5,7,8,10],   character: "Natural minor." },
  { id: "locrian",          intervals: [0,1,3,5,6,8,10],   character: "Diminished, unstable. Over m7b5." },
  { id: "locrian2",         intervals: [0,2,3,5,6,8,10],   character: "Locrian natural 2. Smoother m7b5 sound." },
  { id: "melodic_minor",    intervals: [0,2,3,5,7,9,11],   character: "Minor with raised 6 and 7." },
  { id: "harmonic_minor",   intervals: [0,2,3,5,7,8,11],   character: "Minor with a raised 7. Exotic." },
  { id: "lydian_dominant",  intervals: [0,2,4,6,7,9,10],   character: "Mixolydian with #11. The tritone-sub scale." },
  { id: "altered",          intervals: [0,1,3,4,6,8,10],   character: "Superlocrian. Every tension. Over 7alt." },
  { id: "whole_tone",       intervals: [0,2,4,6,8,10],     character: "Six whole steps. Augmented, dreamlike." },
  { id: "dim_hw",           intervals: [0,1,3,4,6,7,9,10], character: "Half-Whole. Symmetrical. b9 dominants." },
  { id: "dim_wh",           intervals: [0,2,3,5,6,8,9,11], character: "Whole-Half. Over dim7 chords." },
  { id: "major_pentatonic", intervals: [0,2,4,7,9],        character: "Five-note major. Open, universal." },
  { id: "minor_pentatonic", intervals: [0,3,5,7,10],       character: "Five-note minor. Blues, rock." },
  { id: "blues",            intervals: [0,3,5,6,7,10],     character: "Minor pentatonic + blue note." },
  { id: "bebop_dominant",   intervals: [0,2,4,5,7,9,10,11],character: "Mixolydian + major 7. V7 bebop line." },
];
