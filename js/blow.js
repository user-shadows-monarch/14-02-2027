/* Blow-out-the-candles detector.
   Listens to the microphone, calibrates to the room for a moment, then treats a sustained burst of
   loud breath noise as "blowing". Progress builds while she blows and fades if she stops, so the
   candles go out one by one. Nothing is recorded or sent anywhere: the audio is only measured
   live in the browser and the microphone is released as soon as the candles are out.
   Needs HTTPS (GitHub Pages is) or localhost. */
(function () {
  'use strict';
  let stream = null, ctx = null, timer = 0, active = false;

  function release() {
    clearInterval(timer); timer = 0; active = false;
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    if (ctx) { try { ctx.close(); } catch (e) { /* ignore */ } ctx = null; }
  }

  window.Blow = {
    supported() {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext);
    },
    /* opts: seconds, onReady(), onLevel(0..1), onProgress(0..1), onDone(), onFail(reason) */
    async start(opts) {
      if (active) return;
      if (!this.supported()) { opts.onFail && opts.onFail('unsupported'); return; }
      try {
        // breath noise is exactly what echo cancellation / noise suppression would remove
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      } catch (e) { release(); opts.onFail && opts.onFail('denied'); return; }

      const AC = window.AudioContext || window.webkitAudioContext;
      try { ctx = new AC(); if (ctx.state === 'suspended') await ctx.resume(); }
      catch (e) { release(); opts.onFail && opts.onFail('unsupported'); return; }

      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.2;
      src.connect(an); // analysed only, never played back
      const buf = new Float32Array(an.fftSize);
      const need = Math.max(0.4, opts.seconds || 1.1);
      const STEP = 50;
      let t0 = performance.now(), last = t0, calib = [], thr = 0.06, energy = 0, active_ = true;
      active = true;
      opts.onReady && opts.onReady();

      timer = setInterval(() => {
        if (!active_) return;
        const now = performance.now(), dt = Math.min(0.2, (now - last) / 1000); last = now;
        an.getFloatTimeDomainData(buf);
        let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        const rms = Math.sqrt(s / buf.length);

        if (now - t0 < 700) {           // learn the room (and any music) first
          calib.push(rms);
          const avg = calib.reduce((a, b) => a + b, 0) / calib.length;
          thr = Math.max(0.06, avg * 3 + 0.02);
          opts.onLevel && opts.onLevel(0);
          return;
        }
        const over = rms > thr;
        energy = over ? energy + dt : Math.max(0, energy - dt * 0.5);
        opts.onLevel && opts.onLevel(Math.max(0, Math.min(1, (rms - thr * 0.4) / (thr * 2.5))));
        const p = Math.min(1, energy / need);
        opts.onProgress && opts.onProgress(p);
        if (p >= 1) { active_ = false; release(); opts.onDone && opts.onDone(); }
      }, STEP);
    },
    stop() { release(); }
  };
})();
