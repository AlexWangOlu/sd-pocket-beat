# Submitting Pocket Beat to the community apps

**Where:** <https://fivem.samueldev.shop/apps/new>
**Sign in first:** Continue with Discord. The form is only visible once you are signed in.

Every value below is ready to paste. If a field on the live form is named differently, match it by meaning — the four fields that decide how the app is listed are **Frameworks**, **Version**, **Resource** and **Category**, and those names are fixed.

---

## Field by field

| Field | Value |
|---|---|
| **Name** | `Pocket Beat` |
| **Tagline** (one line) | `A 16-step drum machine in your phone.` |
| **Frameworks** | `Standalone` |
| **Category** | `Games` |
| **Version** | `1.0.0` |
| **Resource** | `sd-pocket-beat` |
| **Licence** | `MIT` |
| **Author / Creator** | `Alexoulu` |
| **Source / Repository** | `https://github.com/AlexWangOlu/sd-pocket-beat` |
| **Icon** | `docs/previews/icon-512.png` |
| **Screenshots** | `ui/screenshot-1.png`, `ui/screenshot-2.png` |

`Standalone` is the important one. It tells people the app needs no framework, no inventory and no database, which is exactly what this resource is.

---

## Description

Paste this into the long description field:

```
A 16-step drum machine that lives in the phone. Six tracks, four kits, and not
a single audio file in the resource — every kick, snare and hat is synthesised
from oscillators and noise the moment it plays, so the whole app is 111 kB and
needs no server, no database and no framework.

Built for roleplay where someone is actually playing: a DJ warming up a club,
a busker on a corner, a crew arguing over a beat. It also just works as a toy.

• Six tracks, sixteen steps — kick, snare, clap, closed hat, open hat and tom
• Four kits that are not samples — 808, Trap, House and Lo-Fi, each a set of
  synthesis parameters, so switching kit changes the whole character without
  loading a byte
• Four grooves to start from — Boom Bap, Trap, House and Breaks each set the
  pattern, tempo, swing and kit in one tap
• Drag to paint — press a cell and drag to fill a run of steps, or tap one to
  hear that voice on its own
• Tempo 60–180 BPM with a press-and-hold stepper, or tap the tempo in
• Swing up to 60%, delaying every odd sixteenth
• The pattern survives a reconnect — saved through the phone's own storage
• Light and dark themes

No dependencies. Install sd-phone, ensure this after it, and it is in the App
Store. Also opens with /pocketbeat.
```

---

## Before you submit

- [ ] `README.md` renders on GitHub with the banner and screenshot showing
- [ ] The repo is **public** (community apps are listed as open source)
- [ ] The version in `fxmanifest.lua` matches what you type into the form
- [ ] You have actually opened the app in game at least once — the listing says it works

## After it is listed

The listing URL will look like `https://fivem.samueldev.shop/apps/<id>`. Add it to the README's badges row and to the description in `config.lua` if you want the two to point at each other.
