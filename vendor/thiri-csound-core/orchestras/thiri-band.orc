; ══════════════════════════════════════════════════════════════════════════════
; thiri-band.orc — THIRI Conductor instrument orchestra
; © 2026 Blues Prince Media / Dennison Blackett. All rights reserved.
;
; PROPRIETARY — published for transparency, NOT released into the public domain.
; This file is served openly as part of THIRI's build-in-public site
; (build.thiri.ai/conductor) so anyone can hear and inspect how the browser
; renders a THIRI arrangement. You are welcome to read and learn from it.
; You may NOT redistribute, repackage, or ship it — in whole or in part — as part
; of another product or service without written permission from Blues Prince Media.
;
; What this file IS:  a generic Csound synthesis renderer (Rhodes, bass, drum kit,
;   master bus) built from standard opcodes. It turns note events into sound.
; What this file is NOT:  THIRI's intelligence. The harmonic engine — chord
;   analysis, voicing, reharmonization, and arrangement — lives server-side behind
;   an API key at chords.thiri.ai (/v2/conduct) and is never shipped to the browser.
;
; Disposition decision + rationale: see this repo's README.md →
; "Public assets & IP disposition".
; ══════════════════════════════════════════════════════════════════════════════

sr     = 44100
ksmps  = 32
nchnls = 2
0dbfs  = 1
ga_mix_L init 0
ga_mix_R init 0
ga_rev_L init 0
ga_rev_R init 0

; ══════════════════════════════════════════════════════════════════════════════
; PIANO — Rhodes-style electric piano  (instrument number: 1)
; ══════════════════════════════════════════════════════════════════════════════
;
; p-fields:
;   p1 = 1
;   p2 = start time (seconds)
;   p3 = duration (seconds)
;   p4 = frequency (Hz)
;   p5 = amplitude (0–1)
;   p6 = pan position (-1.0 to 1.0)
;   p7 = voice type (1=Rhodes electric, 2=acoustic-ish)
;   p8 = brightness (0–1, controls FM bell amount)

instr 1  ; PIANO
  ifreq    = p4
  iamp     = p5 * 0dbfs
  ipan     = (p6 < -1 ? -1 : (p6 > 1 ? 1 : p6))
  ivoice   = (p7 == 0 ? 1 : p7)
  ibright  = p8

  ; ── Envelope ────────────────────────────────────────────────────────
  aenv linen iamp, 0.004, p3, 0.22

  ; ── Detuned voices (Rhodes tine character) ──────────────────────────
  idet1 = ifreq * 1.0012
  idet2 = ifreq * 0.9988

  av1 poscil iamp * 0.55, ifreq          ; fundamental (pure tone core)
  av2 poscil iamp * 0.30, idet1          ; slight detune upper
  av3 poscil iamp * 0.20, idet2          ; slight detune lower

  ; ── FM bell overlay (tine click character) ──────────────────────────
  ; Modulator at 7× frequency gives metallic tine bite
  imod_amp = iamp * ibright * 0.18
  ; Clamp modulator amp if ibright=0 to avoid division issues
  imod_amp = (imod_amp < 0.0001 ? 0 : imod_amp)
  amod  poscil imod_amp, ifreq * 7
  abell = av1 + amod * 0.30

  ; ── Mix ────────────────────────────────────────────────────────────
  aout = (abell + av2 * 0.25 + av3 * 0.18) * aenv

  ; ── Stereo spread (high notes slightly right — piano soundboard) ────
  kpan = ipan + (log(ifreq / 220.0) * 0.06)
  kpan = (kpan < -0.9 ? -0.9 : (kpan > 0.9 ? 0.9 : kpan))

  al = aout * (0.5 - kpan * 0.5)
  ar = aout * (0.5 + kpan * 0.5)

  ; ── Mixer bus send ──────────────────────────────────────────────────
  ga_mix_L = ga_mix_L + al
  ga_mix_R = ga_mix_R + ar
  ga_rev_L = ga_rev_L + al * 0.22
  ga_rev_R = ga_rev_R + ar * 0.22
endin

; ══════════════════════════════════════════════════════════════════════════════
; MACRO UDO WRAPPER
; Catches: i "Piano" start duration "Chord" octave amplitude
; ══════════════════════════════════════════════════════════════════════════════
; ══════════════════════════════════════════════════════════════════════════════
; BASS — Electric bass  (instrument number: 2)
; ══════════════════════════════════════════════════════════════════════════════
;
; p-fields:
;   p1 = 2
;   p2 = start time (seconds)
;   p3 = duration (seconds)
;   p4 = frequency (Hz)
;   p5 = amplitude (0–1)
;   p6 = pan (-1.0 to 1.0)
;   p7 = articulation (0=normal, 1=staccato, 2=accent)
;   p8 = sub-octave mix (0–1)

instr 2  ; BASS
  ifreq  = p4
  iamp   = p5 * 0dbfs
  ipan   = p6
  iart   = p7
  isub   = p8

  ; ── Envelope ────────────────────────────────────────────────────────
  iatk = (iart == 2 ? 0.003 : 0.008)
  irel = (iart == 1 ? 0.04  : 0.12)
  aenv linen iamp, iatk, p3, irel

  ; ── Main oscillator: sawtooth approximation via additive (poscil safer than vco2) ──
  ; poscil is reliable across all Csound 6.x — no mode/table argument issues
  abass1 poscil iamp * 0.80, ifreq            ; fundamental
  abass2 poscil iamp * 0.30, ifreq * 2        ; 2nd harmonic
  abass3 poscil iamp * 0.15, ifreq * 3        ; 3rd harmonic (saw approximation)
  abass  = abass1 + abass2 * 0.4 + abass3 * 0.2

  ; ── Sub-octave sine at half frequency (tight sub foundation) ────────
  asub = 0
  if (isub > 0.001) then
    asub poscil iamp * isub * 0.85, ifreq * 0.5   ; sub-octave
    asub butterlp asub, 180                         ; low-pass for sub only
  endif

  ; ── Low-pass filter sweep (warm, not too bright) ────────────────────
  acutoff linseg 800, 0.025, 400, p3, 220
  abass   butterlp abass, acutoff

  ; ── Combine + apply envelope ────────────────────────────────────────
  aout = (abass + asub) * aenv * 0.85

  ; ── Stereo pan (panning law: equal power) ───────────────────────────
  ipan_r = (ipan + 1.0) * 0.5     ; 0.0 = full left, 1.0 = full right
  al = aout * sqrt(1.0 - ipan_r)
  ar = aout * sqrt(ipan_r)

  ; ── Mixer bus send ──────────────────────────────────────────────────
  ga_mix_L = ga_mix_L + al
  ga_mix_R = ga_mix_R + ar
  ga_rev_L = ga_rev_L + al * 0.06
  ga_rev_R = ga_rev_R + ar * 0.06
endin

; ══════════════════════════════════════════════════════════════════════════════
; MACRO UDO WRAPPER
; Catches: i "Bass" start duration "ChordRoot" octave amplitude
; ══════════════════════════════════════════════════════════════════════════════
; ══════════════════════════════════════════════════════════════════════════════
; DRUM KIT — KICK(3) SNARE(4) HIHAT(5) RIDE(6)
; ══════════════════════════════════════════════════════════════════════════════
;
; All drums are single-trigger events — short p3 duration (0.05–0.50s).
; All write to ga_mix_L / ga_mix_R mixer buses. No direct outs.
;
; p-fields (common):
;   p1 = instrument number (3/4/5/6)
;   p2 = start time (seconds)
;   p3 = duration (seconds)
;   p4 = instrument-specific pitch/mode (see each instr)
;   p5 = amplitude (0–1)
;   p6 = pan (-1.0 to 1.0)

; ── KICK (instr 3) ──────────────────────────────────────────────────────────
; p4 = body pitch Hz (55–80 Hz recommended)
instr 3  ; KICK
  iamp   = p5 * 0dbfs
  ipitch = p4

  ; Click: short noise burst for transient
  aenv_click linseg 1.0, 0.005, 0,  p3, 0
  anoise     rand iamp
  aclick     = anoise * aenv_click

  ; Body: sine tone with pitch drop (classic kick character)
  kpitch linseg ipitch * 1.8, 0.06, ipitch, p3, ipitch * 0.6
  aenv_body  linseg 1.0, 0.08, 0.4, p3, 0.001
  abody      poscil iamp * aenv_body, kpitch

  ; Low-pass to remove excess click edge from body
  abody butterlp abody, 200

  aout = (aclick * 0.25 + abody * 0.9)

  ; Center — kick is always mono dead-center
  ga_mix_L = ga_mix_L + aout * 0.5
  ga_mix_R = ga_mix_R + aout * 0.5
endin

; ── SNARE (instr 4) ─────────────────────────────────────────────────────────
; p4 = body pitch Hz (160–220 Hz recommended)
instr 4  ; SNARE
  iamp   = p5 * 0dbfs
  ipitch = p4
  ipan   = p6      ; slightly left is traditional

  ; Body tone: short tonal thump
  aenv_tone  linseg 1.0, 0.006, 0.3, p3, 0.001
  abody      poscil iamp * 0.35, ipitch
  abody      = abody * aenv_tone
  abody      butterlp abody, 600

  ; Rattle: bandpass-filtered noise (the snare wire character)
  aenv_rattle linseg 1.0, 0.003, 0.6, 0.08, 0.1, p3, 0.001
  anoise      rand iamp * 0.7
  arattle     butterhp anoise, 1500
  arattle     butterlp arattle, 10000
  arattle     = arattle * aenv_rattle

  aout = abody + arattle

  ; Equal-power pan
  ipan_r = (ipan + 1.0) * 0.5
  al = aout * sqrt(1.0 - ipan_r)
  ar = aout * sqrt(ipan_r)

  ga_mix_L = ga_mix_L + al
  ga_mix_R = ga_mix_R + ar
  ga_rev_L = ga_rev_L + al * 0.12
  ga_rev_R = ga_rev_R + ar * 0.12
endin

; ── HIHAT (instr 5) ─────────────────────────────────────────────────────────
; p4 = open flag (0=closed, 1=open)
; p5 = amplitude
; p6 = pan
instr 5  ; HIHAT
  iopen  = p4
  iamp   = p5 * 0dbfs
  ipan   = p6

  ; Open hat: longer decay; closed hat: very short
  idecay = (iopen == 1 ? 0.25 : 0.025)
  aenv   linen iamp, 0.001, p3, idecay

  ; Metallic noise source
  anoise rand 1
  ; Two resonant peaks — gives the cymbal "ting"
  ametal1 reson anoise, 8000, 3000, 1
  ametal2 reson anoise, 12000, 5000, 1
  ametal  = (ametal1 + ametal2 * 0.5) * aenv * 0.35
  ametal  butterhp ametal, 6000     ; cut all low-frequency mud

  ipan_r = (ipan + 1.0) * 0.5
  al = ametal * sqrt(1.0 - ipan_r)
  ar = ametal * sqrt(ipan_r)

  ga_mix_L = ga_mix_L + al
  ga_mix_R = ga_mix_R + ar
endin

; ── RIDE (instr 6) ──────────────────────────────────────────────────────────
; p4 = bell flag (0=bow/stick, 1=bell center)
; p5 = amplitude
; p6 = pan
instr 6  ; RIDE
  ibell  = p4
  iamp   = p5 * 0dbfs
  ipan   = p6

  ; Main bow sound: darker, longer than hihat
  aenv    linen iamp, 0.002, p3, 0.45
  anoise  rand 1
  ametal1 reson anoise, 4800, 1800, 1
  ametal2 reson anoise, 7200, 3000, 1
  ametal  = (ametal1 + ametal2 * 0.4) * aenv * 0.28
  ametal  butterhp ametal, 2500

  ; Bell accent: adds bright ping when striking bell
  if (ibell == 1) then
    abenv   linen iamp * 0.5, 0.001, p3, 0.8
    aring   poscil abenv, 2800        ; triangle-ish ring at bell frequency
    ametal  = ametal + aring * 0.3
  endif

  ipan_r = (ipan + 1.0) * 0.5
  al = ametal * sqrt(1.0 - ipan_r)
  ar = ametal * sqrt(ipan_r)

  ga_mix_L = ga_mix_L + al
  ga_mix_R = ga_mix_R + ar
endin

; ══════════════════════════════════════════════════════════════════════════════
; MACRO UDO WRAPPER
; Catches: i "DrumKit" start duration "Pattern" amplitude
; ══════════════════════════════════════════════════════════════════════════════
instr 99  ; MASTER
  ; ── Read dry mix ─────────────────────────────────────────────────────
  adry_L = ga_mix_L
  adry_R = ga_mix_R

  ; ── Read reverb send ─────────────────────────────────────────────────
  arev_in_L = ga_rev_L
  arev_in_R = ga_rev_R

  ; ── Clear all buses (MUST happen each k-cycle AFTER reading) ─────────
  ga_mix_L = 0
  ga_mix_R = 0
  ga_rev_L = 0
  ga_rev_R = 0

  ; ── FDN Reverb (reverbsc — high quality 8-delay-line) ────────────────
  ; kfblvl: 0.72 = medium-large hall (< 1.0 always to prevent runaway)
  ; kfco:   6500 Hz high-frequency cutoff (controls reverb brightness)
  awet_L, awet_R reverbsc arev_in_L, arev_in_R, 0.72, 6500, sr, 0.5, 1

  ; ── Master sum: dry + reverb return ──────────────────────────────────
  ; Reverb return at -9dB (0.35) — instruments are mostly dry,
  ; reverb adds space without washing out the mix
  aout_L = (adry_L + awet_L * 0.35) * 0.85
  aout_R = (adry_R + awet_R * 0.35) * 0.85

  ; ── Soft limiter (gentle clip prevention) ────────────────────────────
  ; tanh saturation: smooth limiting, never hard-clips
  aout_L = tanh(aout_L)
  aout_R = tanh(aout_R)

  ; ── Final stereo output ───────────────────────────────────────────────
  outs aout_L, aout_R
endin
