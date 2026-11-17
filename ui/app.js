/* Pocket Beat — a 16-step drum machine for sd-phone.
 *
 * How it is put together:
 *   Audio     four synthesised kits. No audio files: every hit is built from
 *             oscillators and a pre-rendered noise buffer at play time.
 *   Sequencer lookahead scheduling. A 25 ms timer queues hits 120 ms into the
 *             future on the Web Audio clock, so timing never wobbles with the
 *             game's frame rate. The playhead is painted by requestAnimationFrame
 *             from the same queue, so what you see matches what you hear.
 *   Storage   the pattern is saved through the phone's GetStorage/SetStorage
 *             component, falling back to localStorage in a plain browser.
 */
(function () {
  "use strict";

  var STEPS = 16;

  /* Tunables. This is the block a server owner edits. */
  var SETTINGS = {
    bpmMin: 60,
    bpmMax: 180,
    defaultPreset: "boombap", // the groove a fresh install opens on
    defaultSwing: 0.18,
    masterVolume: 0.9
  };

  var TRACKS = [
    { id: "kick", label: "KICK", color: "#ff7a00" },
    { id: "snare", label: "SNR", color: "#ffb340" },
    { id: "clap", label: "CLAP", color: "#ff5e5e" },
    { id: "hat", label: "HAT", color: "#4fc3f7" },
    { id: "ohat", label: "OPEN", color: "#7c8cff" },
    { id: "tom", label: "TOM", color: "#9ad35a" }
  ];

  /* ---------------------------------------------------------------- kits ---
   * Each kit is a set of synthesis parameters, not a sample set. f0/f1 are the
   * kick and tom pitch sweep, pdec its length, dec the amplitude decay. */

  var KITS = {
    "808": {
      lp: 20000,
      kick: { f0: 148, f1: 42, pdec: 0.06, dec: 0.92, gain: 1.0 },
      snare: { dec: 0.22, gain: 0.5, tone: 182, toneGain: 0.38, hp: 1150 },
      clap: { dec: 0.18, gain: 0.46, bp: 1300, spread: 0.011 },
      hat: { dec: 0.06, gain: 0.24, hp: 7000 },
      ohat: { dec: 0.3, gain: 0.2, hp: 6500 },
      tom: { f0: 220, f1: 98, dec: 0.4, gain: 0.5 }
    },
    trap: {
      lp: 20000,
      kick: { f0: 172, f1: 46, pdec: 0.042, dec: 0.55, gain: 1.0 },
      snare: { dec: 0.13, gain: 0.52, tone: 214, toneGain: 0.3, hp: 1600 },
      clap: { dec: 0.12, gain: 0.5, bp: 1650, spread: 0.008 },
      hat: { dec: 0.034, gain: 0.22, hp: 8600 },
      ohat: { dec: 0.17, gain: 0.18, hp: 8200 },
      tom: { f0: 262, f1: 120, dec: 0.26, gain: 0.46 }
    },
    house: {
      lp: 20000,
      kick: { f0: 162, f1: 50, pdec: 0.038, dec: 0.36, gain: 1.0 },
      snare: { dec: 0.16, gain: 0.46, tone: 200, toneGain: 0.3, hp: 1450 },
      clap: { dec: 0.16, gain: 0.5, bp: 1500, spread: 0.01 },
      hat: { dec: 0.048, gain: 0.22, hp: 7800 },
      ohat: { dec: 0.22, gain: 0.18, hp: 7300 },
      tom: { f0: 240, f1: 128, dec: 0.3, gain: 0.44 }
    },
    "lo-fi": {
      lp: 3400,
      kick: { f0: 132, f1: 38, pdec: 0.07, dec: 1.0, gain: 0.92 },
      snare: { dec: 0.2, gain: 0.44, tone: 158, toneGain: 0.42, hp: 820 },
      clap: { dec: 0.2, gain: 0.4, bp: 1050, spread: 0.014 },
      hat: { dec: 0.044, gain: 0.18, hp: 5200 },
      ohat: { dec: 0.26, gain: 0.16, hp: 5000 },
      tom: { f0: 190, f1: 88, dec: 0.45, gain: 0.42 }
    }
  };

  var KIT_ORDER = ["808", "trap", "house", "lo-fi"];
  var KIT_LABEL = { "808": "808", trap: "Trap", house: "House", "lo-fi": "Lo-Fi" };

  /* ------------------------------------------------------------ presets ---
   * step lists per track, plus the tempo and swing that suit the groove. */

  var PRESETS = [
    {
      id: "boombap",
      name: "Boom Bap",
      bpm: 90,
      swing: 0.18,
      kit: "808",
      steps: {
        kick: [0, 7, 10],
        snare: [4, 12],
        clap: [],
        hat: [0, 2, 4, 6, 8, 10, 12, 14],
        ohat: [14],
        tom: [15]
      }
    },
    {
      id: "trap",
      name: "Trap",
      bpm: 138,
      swing: 0,
      kit: "trap",
      steps: {
        kick: [0, 3, 6, 10, 11],
        snare: [8],
        clap: [8],
        hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        ohat: [15],
        tom: [13]
      }
    },
    {
      id: "house",
      name: "House",
      bpm: 124,
      swing: 0.06,
      kit: "house",
      steps: {
        kick: [0, 4, 8, 12],
        snare: [12],
        clap: [4, 12],
        hat: [2, 6, 10, 14],
        ohat: [],
        tom: [7]
      }
    },
    {
      id: "breaks",
      name: "Breaks",
      bpm: 168,
      swing: 0.1,
      kit: "house",
      steps: {
        kick: [0, 6, 10],
        snare: [4, 12, 14],
        clap: [12],
        hat: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14],
        ohat: [7],
        tom: [15]
      }
    }
  ];

  /* ------------------------------------------------------------- audio ---- */

  var Audio = {
    ctx: null,
    master: null,
    tone: null,
    noise: null,
    kit: KITS["808"],

    init: function () {
      if (this.ctx) return true;
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      try {
        this.ctx = new Ctor();
      } catch (e) {
        return false;
      }
      var comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 10;
      comp.ratio.value = 5;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;

      this.tone = this.ctx.createBiquadFilter();
      this.tone.type = "lowpass";
      this.tone.frequency.value = 20000;
      this.tone.Q.value = 0.4;

      this.master = this.ctx.createGain();
      this.master.gain.value = SETTINGS.masterVolume;

      this.master.connect(this.tone);
      this.tone.connect(comp);
      comp.connect(this.ctx.destination);

      this.noise = this._noiseBuffer(1.2);
      return true;
    },

    resume: function () {
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(function () {});
      }
    },

    setKit: function (kit) {
      this.kit = kit;
      if (this.tone && this.ctx) {
        this.tone.frequency.setTargetAtTime(kit.lp, this.ctx.currentTime, 0.02);
      }
    },

    _noiseBuffer: function (seconds) {
      var ctx = this.ctx;
      var len = Math.floor(ctx.sampleRate * seconds);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return buf;
    },

    _noiseSource: function () {
      var src = this.ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      return src;
    },

    kick: function (t, k) {
      var ctx = this.ctx;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(k.f0, t);
      osc.frequency.exponentialRampToValueAtTime(k.f1, t + k.pdec);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(k.gain, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + k.dec);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      osc.stop(t + k.dec + 0.05);

      // A short click on top gives the kick its attack on small speakers.
      var click = this._noiseSource();
      var hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 2600;
      var cg = ctx.createGain();
      cg.gain.setValueAtTime(0.28, t);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);
      click.connect(hp);
      hp.connect(cg);
      cg.connect(this.master);
      click.start(t);
      click.stop(t + 0.03);
    },

    snare: function (t, k) {
      var ctx = this.ctx;
      var src = this._noiseSource();
      var hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = k.hp;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(k.gain, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + k.dec);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + k.dec + 0.03);

      var body = ctx.createOscillator();
      body.type = "triangle";
      body.frequency.setValueAtTime(k.tone, t);
      body.frequency.exponentialRampToValueAtTime(k.tone * 0.72, t + k.dec * 0.7);
      var bg = ctx.createGain();
      bg.gain.setValueAtTime(k.gain * k.toneGain, t);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + k.dec * 0.62);
      body.connect(bg);
      bg.connect(this.master);
      body.start(t);
      body.stop(t + k.dec);
    },

    clap: function (t, k) {
      var ctx = this.ctx;
      // Three quick bursts read as a hand clap; a single one reads as a snare.
      for (var i = 0; i < 3; i++) {
        var at = t + i * k.spread;
        var src = this._noiseSource();
        var bp = ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = k.bp;
        bp.Q.value = 1.1;
        var g = ctx.createGain();
        var peak = k.gain * (i === 2 ? 1 : 0.72);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(peak, at + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, at + (i === 2 ? k.dec : 0.026));
        src.connect(bp);
        bp.connect(g);
        g.connect(this.master);
        src.start(at);
        src.stop(at + k.dec + 0.02);
      }
    },

    hat: function (t, k) {
      var ctx = this.ctx;
      var src = this._noiseSource();
      var hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = k.hp;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(k.gain, t + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + k.dec);
      src.connect(hp);
      hp.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + k.dec + 0.02);
    },

    ohat: function (t, k) {
      this.hat(t, k);
    },

    tom: function (t, k) {
      var ctx = this.ctx;
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(k.f0, t);
      osc.frequency.exponentialRampToValueAtTime(k.f1, t + k.dec * 0.7);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(k.gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + k.dec);
      osc.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + k.dec + 0.05);
    },

    hit: function (id, t) {
      var k = this.kit;
      switch (id) {
        case "kick": return this.kick(t, k.kick);
        case "snare": return this.snare(t, k.snare);
        case "clap": return this.clap(t, k.clap);
        case "hat": return this.hat(t, k.hat);
        case "ohat": return this.ohat(t, k.ohat);
        case "tom": return this.tom(t, k.tom);
      }
    }
  };

  /* --------------------------------------------------------------- state -- */

  var state = {
    bpm: 90,
    swing: SETTINGS.defaultSwing,
    kit: "808",
    preset: SETTINGS.defaultPreset,
    pattern: {}
  };

  function emptyPattern() {
    var p = {};
    for (var i = 0; i < TRACKS.length; i++) {
      p[TRACKS[i].id] = new Array(STEPS).fill(false);
    }
    return p;
  }

  state.pattern = emptyPattern();

  function applyPreset(preset) {
    state.pattern = emptyPattern();
    for (var track in preset.steps) {
      if (!preset.steps.hasOwnProperty(track)) continue;
      var list = preset.steps[track];
      if (!state.pattern[track]) continue;
      for (var i = 0; i < list.length; i++) state.pattern[track][list[i]] = true;
    }
    state.bpm = preset.bpm;
    state.swing = preset.swing;
    state.kit = preset.kit;
    state.preset = preset.id;
    Audio.setKit(KITS[state.kit]);
    syncTransport();
    syncPills();
    paintAll();
    save();
  }

  /* ----------------------------------------------------------- sequencer -- */

  var Seq = {
    playing: false,
    step: 0,
    nextTime: 0,
    timer: null,
    queue: [],
    raf: 0,
    shown: -1,

    start: function () {
      if (!Audio.init()) {
        toast("This device cannot play audio");
        return;
      }
      Audio.resume();
      Audio.setKit(KITS[state.kit]);
      this.playing = true;
      this.step = 0;
      this.queue.length = 0;
      this.shown = -1;
      this.nextTime = Audio.ctx.currentTime + 0.1;
      var self = this;
      this.timer = setInterval(function () {
        self.tick();
      }, 25);
      this.tick();
      this.raf = requestAnimationFrame(function () {
        self.draw();
      });
      syncTransport();
    },

    stop: function () {
      this.playing = false;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.queue.length = 0;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      paintHead(-1);
      syncTransport();
    },

    stepDur: function () {
      return 60 / state.bpm / 4;
    },

    tick: function () {
      if (!this.playing || !Audio.ctx) return;
      var ctx = Audio.ctx;
      while (this.nextTime < ctx.currentTime + 0.12) {
        this.schedule(this.step, this.nextTime);
        this.nextTime += this.stepDur();
        this.step = (this.step + 1) % STEPS;
      }
    },

    schedule: function (index, base) {
      var dur = this.stepDur();
      // Swing delays every odd sixteenth, which is what gives a groove its limp.
      var when = base + (index % 2 === 1 ? state.swing * dur * 0.6 : 0);
      for (var t = 0; t < TRACKS.length; t++) {
        var id = TRACKS[t].id;
        if (state.pattern[id][index]) Audio.hit(id, when);
      }
      this.queue.push({ step: index, time: when });
    },

    draw: function () {
      if (!this.playing) return;
      var now = Audio.ctx.currentTime;
      var last = -1;
      while (this.queue.length && this.queue[0].time <= now + 0.006) {
        last = this.queue.shift().step;
      }
      if (last >= 0 && last !== this.shown) {
        this.shown = last;
        paintHead(last);
      }
      var self = this;
      this.raf = requestAnimationFrame(function () {
        self.draw();
      });
    }
  };

  /* ---------------------------------------------------------------- DOM --- */

  var root = document.getElementById("root");
  var cells = {}; // cells[track][step] -> element
  var wraps = {}; // wraps[track][step] -> .cell-wrap

  function q(id) {
    return document.getElementById(id);
  }

  function build() {
    var html = [];
    html.push('<div class="app">');

    html.push('<div class="top">');
    html.push('<div class="brand"><span class="spark"></span>Pocket Beat');
    html.push('<span class="sub" id="kitName">808</span></div>');
    html.push('<div class="status" id="status">16 STEPS</div>');
    html.push("</div>");

    html.push('<div class="deck">');
    html.push('<div class="bpm-block"><div class="bpm" id="bpm">90</div>');
    html.push('<div class="bpm-label">BPM</div></div>');
    html.push('<div class="deck-actions">');
    html.push('<div class="round" id="bpmDown" role="button" aria-label="Slower">&#8722;</div>');
    html.push('<div class="round" id="bpmUp" role="button" aria-label="Faster">+</div>');
    html.push('<div class="tap" id="tap" role="button">TAP</div>');
    html.push("</div>");
    html.push('<div class="play" id="play" role="button" aria-label="Play">');
    html.push(
      '<svg viewBox="0 0 24 24" fill="none"><path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor"/></svg>'
    );
    html.push("</div>");
    html.push("</div>");

    html.push('<div class="grid" id="grid"></div>');

    html.push('<div class="swing-row">');
    html.push('<span class="label">SWING</span>');
    html.push('<input type="range" id="swing" min="0" max="60" step="1" value="18" />');
    html.push('<span class="value" id="swingVal">18%</span>');
    html.push("</div>");

    html.push('<div class="pills-group">');
    html.push('<div class="group-title">KIT</div>');
    html.push('<div class="pills" id="kits"></div>');
    html.push("</div>");

    html.push('<div class="pills-group">');
    html.push('<div class="group-title">GROOVE</div>');
    html.push('<div class="pills" id="presets"></div>');
    html.push("</div>");

    html.push('<div class="foot">');
    html.push("<span>No samples &middot; synthesised live</span>");
    html.push('<button class="link" id="clear">Clear</button>');    html.push("</div>");

    html.push("</div>");
    html.push('<div class="toast" id="toast"></div>');

    root.innerHTML = html.join("");

    buildGrid();
    buildPills();
    bind();
    syncTransport();
    paintAll();
  }

  function buildGrid() {
    var grid = q("grid");
    var html = [];
    for (var t = 0; t < TRACKS.length; t++) {
      var tr = TRACKS[t];
      html.push(
        '<div class="track"><i style="background:' + tr.color + '"></i>' + tr.label + "</div>"
      );
      for (var s = 0; s < STEPS; s++) {
        html.push(
          '<div class="cell-wrap" data-beat="' +
            (s % 4 === 0 ? "1" : "0") +
            '"><div class="cell" role="button" data-track="' +
            tr.id +
            '" data-step="' +
            s +
            '" aria-label="' +
            tr.label +
            " step " +
            (s + 1) +
            '"></div></div>'
        );
      }
    }
    grid.innerHTML = html.join("");

    cells = {};
    wraps = {};
    for (var i = 0; i < TRACKS.length; i++) {
      var id = TRACKS[i].id;
      cells[id] = [];
      wraps[id] = [];
      for (var st = 0; st < STEPS; st++) {
        cells[id][st] = grid.querySelector(
          '.cell[data-track="' + id + '"][data-step="' + st + '"]'
        );
        wraps[id][st] = cells[id][st].parentNode;
      }
    }
  }

  function buildPills() {
    var kits = q("kits");
    var presets = q("presets");
    var html = [];
    for (var i = 0; i < KIT_ORDER.length; i++) {
      var k = KIT_ORDER[i];
      html.push(
        '<div class="pill" role="button" data-kit="' + k + '">' + KIT_LABEL[k] + "</div>"
      );
    }
    kits.innerHTML = html.join("");

    html = [];
    for (var p = 0; p < PRESETS.length; p++) {
      html.push(
        '<div class="pill" role="button" data-preset="' +
          PRESETS[p].id +
          '">' +
          PRESETS[p].name +
          "</div>"
      );
    }
    presets.innerHTML = html.join("");
  }

  /* -------------------------------------------------------------- paint --- */

  function paintCell(track, step) {
    var el = cells[track][step];
    if (!el) return;
    if (state.pattern[track][step]) el.classList.add("on");
    else el.classList.remove("on");
  }

  function paintAll() {
    for (var t = 0; t < TRACKS.length; t++) {
      var id = TRACKS[t].id;
      for (var s = 0; s < STEPS; s++) paintCell(id, s);
    }
  }

  function paintHead(step) {
    for (var t = 0; t < TRACKS.length; t++) {
      var id = TRACKS[t].id;
      for (var s = 0; s < STEPS; s++) {
        var w = wraps[id][s];
        if (!w) continue;
        if (s === step) w.classList.add("head");
        else w.classList.remove("head");
      }
    }
  }

  function syncTransport() {
    var bpmEl = q("bpm");
    if (bpmEl) bpmEl.textContent = String(state.bpm);

    var swingEl = q("swing");
    if (swingEl) swingEl.value = String(Math.round(state.swing * 100));
    var swingVal = q("swingVal");
    if (swingVal) swingVal.textContent = Math.round(state.swing * 100) + "%";

    var kitName = q("kitName");
    if (kitName) kitName.textContent = KIT_LABEL[state.kit] || state.kit;

    var status = q("status");
    if (status) status.textContent = Seq.playing ? "PLAYING" : "16 STEPS";

    var play = q("play");
    if (play) {
      play.classList.toggle("playing", Seq.playing);
      play.setAttribute("aria-label", Seq.playing ? "Stop" : "Play");
      play.innerHTML = Seq.playing
        ? '<svg viewBox="0 0 24 24"><rect x="7" y="6" width="10" height="12" rx="2" fill="currentColor"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none"><path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor"/></svg>';
    }
  }

  function syncPills() {
    var kits = q("kits").children;
    for (var i = 0; i < kits.length; i++) {
      kits[i].classList.toggle("on", kits[i].getAttribute("data-kit") === state.kit);
    }
    var presets = q("presets").children;
    for (var p = 0; p < presets.length; p++) {
      presets[p].classList.toggle("on", presets[p].getAttribute("data-preset") === state.preset);
    }
  }

  /* ------------------------------------------------------------ actions --- */

  function setBpm(value) {
    var next = Math.max(SETTINGS.bpmMin, Math.min(SETTINGS.bpmMax, Math.round(value)));
    if (next === state.bpm) return;
    state.bpm = next;
    state.preset = "";
    syncTransport();
    syncPills();
    save();
  }

  function preview(track) {
    if (!Audio.init()) return;
    Audio.resume();
    Audio.setKit(KITS[state.kit]);
    Audio.hit(track, Audio.ctx.currentTime + 0.012);
  }

  var tapTimes = [];
  var tapTimer = 0;

  function tap() {
    var now = performance.now();
    if (tapTimes.length && now - tapTimes[tapTimes.length - 1] > 2200) tapTimes = [];
    tapTimes.push(now);
    if (tapTimes.length > 6) tapTimes.shift();

    var btn = q("tap");
    if (btn) {
      btn.classList.add("lit");
      if (tapTimer) clearTimeout(tapTimer);
      tapTimer = setTimeout(function () {
        btn.classList.remove("lit");
      }, 160);
    }

    if (tapTimes.length >= 2) {
      var total = tapTimes[tapTimes.length - 1] - tapTimes[0];
      var avg = total / (tapTimes.length - 1);
      if (avg > 200) setBpm(60000 / avg);
    }
  }

  var toastTimer = 0;
  function toast(message) {
    var el = q("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("show");
    }, 1800);
  }

  /* ------------------------------------------------------------- storage -- */

  var SAVE_KEY = "pattern-v1";
  var saveTimer = 0;

  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var payload = {
        bpm: state.bpm,
        swing: state.swing,
        kit: state.kit,
        preset: state.preset,
        pattern: state.pattern
      };
      var text = JSON.stringify(payload);
      setStorage(SAVE_KEY, text).then(function (ok) {
        if (!ok) toast("Could not save — storage is full");
      });
    }, 350);
  }

  function setStorage(key, value) {
    var comps = window.components;
    if (comps && typeof comps.fetchPhone === "function") {
      return Promise.resolve(comps.fetchPhone("SetStorage", { key: key, value: value }))
        .then(function (res) {
          if (res === true) return true;
          return false;
        })
        .catch(function () {
          return true; // not fatal: the phone may not expose storage yet
        });
    }
    try {
      window.localStorage.setItem("pb:" + key, value);
      return Promise.resolve(true);
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  function getStorage(key) {
    var comps = window.components;
    if (comps && typeof comps.fetchPhone === "function") {
      return Promise.resolve(comps.fetchPhone("GetStorage", { key: key })).catch(function () {
        return null;
      });
    }
    try {
      return Promise.resolve(window.localStorage.getItem("pb:" + key));
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function restore() {
    return getStorage(SAVE_KEY).then(function (raw) {
      if (!raw) return false;
      var data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        return false;
      }
      if (!data || !data.pattern) return false;
      var fresh = emptyPattern();
      for (var i = 0; i < TRACKS.length; i++) {
        var id = TRACKS[i].id;
        var src = data.pattern[id];
        if (!src || src.length !== STEPS) continue;
        for (var s = 0; s < STEPS; s++) fresh[id][s] = !!src[s];
      }
      state.pattern = fresh;
      state.bpm = Math.max(SETTINGS.bpmMin, Math.min(SETTINGS.bpmMax, Number(data.bpm) || 90));
      state.swing = Math.max(0, Math.min(0.6, Number(data.swing) || 0));
      state.kit = KITS[data.kit] ? data.kit : "808";
      state.preset = typeof data.preset === "string" ? data.preset : "";
      Audio.setKit(KITS[state.kit]);
      return true;
    });
  }

  /* --------------------------------------------------------------- bind --- */

  function bind() {
    var grid = q("grid");

    // Drag-to-paint. A press decides the value, then every cell the finger
    // crosses takes that same value — the way hardware sequencers are edited.
    var painting = null;

    grid.addEventListener("pointerdown", function (e) {
      var cell = e.target.closest ? e.target.closest(".cell") : null;
      if (!cell) return;
      e.preventDefault();
      var track = cell.getAttribute("data-track");
      var step = Number(cell.getAttribute("data-step"));
      if (painting) return;
      painting = { value: !state.pattern[track][step], last: track + ":" + step };
      state.pattern[track][step] = painting.value;
      paintCell(track, step);
      if (painting.value) preview(track);
      state.preset = "";
      syncPills();
      save();
    });

    grid.addEventListener("pointermove", function (e) {
      if (!painting) return;
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var cell = el && el.closest ? el.closest(".cell") : null;
      if (!cell) return;
      var track = cell.getAttribute("data-track");
      var step = Number(cell.getAttribute("data-step"));
      var key = track + ":" + step;
      if (key === painting.last) return;
      painting.last = key;
      if (state.pattern[track][step] === painting.value) return;
      state.pattern[track][step] = painting.value;
      paintCell(track, step);
      if (painting.value) preview(track);
    });

    function endPaint() {
      painting = null;
    }
    window.addEventListener("pointerup", endPaint);
    window.addEventListener("pointercancel", endPaint);

    q("play").addEventListener("click", function () {
      if (Seq.playing) Seq.stop();
      else Seq.start();
    });

    q("bpmUp").addEventListener("click", function () {
      setBpm(state.bpm + 1);
    });
    q("bpmDown").addEventListener("click", function () {
      setBpm(state.bpm - 1);
    });
    // Press and hold to sweep the tempo.
    holdRepeat(q("bpmUp"), function () { setBpm(state.bpm + 1); });
    holdRepeat(q("bpmDown"), function () { setBpm(state.bpm - 1); });

    q("tap").addEventListener("click", tap);

    q("swing").addEventListener("input", function (e) {
      state.swing = Number(e.target.value) / 100;
      q("swingVal").textContent = e.target.value + "%";
      save();
    });

    q("kits").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".pill") : null;
      if (!btn) return;
      var kit = btn.getAttribute("data-kit");
      if (!KITS[kit]) return;
      state.kit = kit;
      Audio.setKit(KITS[kit]);
      state.preset = "";
      syncTransport();
      syncPills();
      preview("kick");
      save();
    });

    q("presets").addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".pill") : null;
      if (!btn) return;
      var id = btn.getAttribute("data-preset");
      for (var i = 0; i < PRESETS.length; i++) {
        if (PRESETS[i].id === id) {
          applyPreset(PRESETS[i]);
          preview("kick");
          return;
        }
      }
    });

    q("clear").addEventListener("click", function () {
      state.pattern = emptyPattern();
      state.preset = "";
      paintAll();
      syncPills();
      save();
      toast("Pattern cleared");
    });

    // Keep the playhead honest if the app is hidden or the page is scrolled away.
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && Seq.playing) Seq.stop();
    });
  }

  function holdRepeat(node, fn) {
    var delay = 0;
    var interval = 0;
    function start() {
      delay = setTimeout(function () {
        interval = setInterval(fn, 55);
      }, 420);
    }
    function stop() {
      if (delay) clearTimeout(delay);
      if (interval) clearInterval(interval);
      delay = 0;
      interval = 0;
    }
    node.addEventListener("pointerdown", start);
    node.addEventListener("pointerup", stop);
    node.addEventListener("pointerleave", stop);
    node.addEventListener("pointercancel", stop);
  }

  /* -------------------------------------------------------------- theme --- */

  function applyTheme(settings) {
    if (!settings) return;
    var theme = (settings.display && settings.display.theme) || settings.theme;
    if (theme === "light" || theme === "dark") {
      document.body.setAttribute("data-theme", theme);
    }
  }

  function initTheme() {
    if (typeof window.GetSettings === "function") {
      Promise.resolve(window.GetSettings()).then(applyTheme).catch(function () {});
    } else if (window.matchMedia) {
      var dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.body.setAttribute("data-theme", dark ? "dark" : "light");
    }
    if (typeof window.OnSettingsChange === "function") {
      window.OnSettingsChange(applyTheme);
    }
  }

  /* --------------------------------------------------------------- boot --- */

  var booted = false;

  function boot() {
    if (booted) return;
    booted = true;
    build();
    initTheme();
    restore().then(function (loaded) {
      if (!loaded) {
        // First run: open on a groove rather than 96 dark cells.
        var start = PRESETS[0];
        for (var i = 0; i < PRESETS.length; i++) {
          if (PRESETS[i].id === SETTINGS.defaultPreset) start = PRESETS[i];
        }
        applyPreset(start);
        return;
      }
      Audio.setKit(KITS[state.kit]);
      paintAll();
      syncTransport();
      syncPills();
    }).catch(function () {});
  }

  window.addEventListener("message", function (e) {
    var data = e.data;
    if (data === "componentsLoaded") {
      boot();
      return;
    }
    if (data && typeof data === "object") {
      if (data.type === "appClose") Seq.stop();
      else if (data.type === "settingsUpdated") applyTheme(data.settings);
    }
  });

  // Plain browser (no FiveM): render immediately on the sample pattern.
  if (typeof window.invokeNative === "undefined") {
    document.documentElement.style.visibility = "visible";
    document.body.style.visibility = "visible";
    document.body.setAttribute("data-theme", "dark");
    boot();
  }
})();
