// Línea de tiempo y reloj de animación.
import { icon } from './icons.js';
import { h } from './ui.js';

const SPEEDS = [0.25, 0.5, 1, 1.5, 2];

export function createPlayback({ root, store, onFrame, onComplete }) {
  let duration = 2;
  let t = 0;
  let playing = false;
  let speed = 1;
  let loop = false;
  let simFrames = null;
  let els = {};

  function mount() {
    root.innerHTML = '';
    const controls = h('div', { class: 'tl-controls' });
    const btnBack = h('button', {
      class: 'btn icon ghost sm',
      title: 'Volver al inicio',
      'aria-label': 'Volver al inicio',
      html: icon('step-back', { size: 13 }),
      onclick: () => seek(0),
    });
    const btnPlay = h('button', {
      class: 'tl-play',
      title: 'Reproducir (espacio)',
      'aria-label': 'Reproducir',
      html: icon('play', { size: 15 }),
      onclick: () => toggle(),
    });
    const btnEnd = h('button', {
      class: 'btn icon ghost sm',
      title: 'Ir al final',
      'aria-label': 'Ir al final',
      html: icon('step-fwd', { size: 13 }),
      onclick: () => seek(duration),
    });
    controls.append(btnBack, btnPlay, btnEnd);

    const track = h('div', { class: 'tl-track', role: 'slider', tabindex: '0', 'aria-label': 'Progreso de la jugada' });
    const fill = h('div', { class: 'tl-fill' });
    const marks = h('div', { class: 'tl-events' });
    const thumb = h('div', { class: 'tl-thumb' });
    track.append(fill, marks, thumb);
    const labels = h('div', { class: 'tl-labels' });
    const scrub = h('div', { class: 'tl-scrub' }, track, labels);

    let dragging = false;
    const seekFromEvent = (e) => {
      const r = track.getBoundingClientRect();
      const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      seek(f * duration);
    };
    track.addEventListener('pointerdown', (e) => {
      dragging = true;
      track.setPointerCapture(e.pointerId);
      pause();
      seekFromEvent(e);
    });
    track.addEventListener('pointermove', (e) => {
      if (dragging) seekFromEvent(e);
    });
    track.addEventListener('pointerup', (e) => {
      dragging = false;
      try {
        track.releasePointerCapture(e.pointerId);
      } catch {}
    });
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') seek(Math.min(duration, t + 0.1));
      if (e.key === 'ArrowLeft') seek(Math.max(0, t - 0.1));
      if (e.key === 'Home') seek(0);
      if (e.key === 'End') seek(duration);
    });

    const time = h('div', { class: 'tl-time' });
    const right = h('div', { class: 'tl-right' });
    const speedBtn = h('button', {
      class: 'btn sm mono',
      title: 'Velocidad de reproducción',
      text: '1×',
      onclick: () => {
        const i = SPEEDS.indexOf(speed);
        speed = SPEEDS[(i + 1) % SPEEDS.length];
        speedBtn.textContent = `${speed}×`;
        renderUI();
      },
    });
    const loopBtn = h('button', {
      class: 'btn icon sm',
      title: 'Repetir en bucle',
      'aria-label': 'Repetir en bucle',
      html: icon('undo', { size: 13 }),
      onclick: () => {
        loop = !loop;
        loopBtn.classList.toggle('primary', loop);
        renderUI();
      },
    });
    right.append(speedBtn, loopBtn);

    root.append(controls, scrub, time, right);
    els = { btnPlay, fill, thumb, time, labels, marks, track, speedBtn, loopBtn };
    renderUI();
  }

  function formatTime(v) {
    return `${v.toFixed(2)}s`;
  }

  function renderUI() {
    if (!els.track) return;
    const f = duration > 0 ? Math.max(0, Math.min(1, t / duration)) : 0;
    els.fill.style.width = `${f * 100}%`;
    els.thumb.style.left = `${f * 100}%`;
    els.time.innerHTML = `<b>${formatTime(t)}</b> / ${formatTime(duration)}`;
    els.labels.innerHTML = `<span>0.0s</span><span>${(duration / 2).toFixed(1)}s</span><span>${duration.toFixed(1)}s</span>`;
    els.btnPlay.innerHTML = icon(playing ? 'pause' : 'play', { size: 15 });
    els.btnPlay.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
    els.track.setAttribute('aria-valuenow', String(Math.round(f * 100)));
    els.track.setAttribute('aria-valuemin', '0');
    els.track.setAttribute('aria-valuemax', '100');
  }

  function renderMarks(play) {
    if (!els.marks || !play) return;
    const rel = Math.max(0, Math.min(duration, Number(play.ball?.releaseAt ?? 0)));
    const pct = duration > 0 ? (rel / duration) * 100 : 0;
    els.marks.innerHTML = `<div class="tl-mark" style="left:${pct}%" title="Lanzamiento"></div>`;
  }

  function notify() {
    renderUI();
    onFrame?.(t, duration);
  }

  // Reloj determinista: usamos performance.now() como referencia y setTimeout como
  // motor. Es tan fluido como rAF para una animación de 2-4 s y funciona igual en
  // cualquier entorno (pestañas en segundo plano, headless, navegadores antiguos).
  let lastNow = 0;
  let timer = null;

  function step() {
    timer = null;
    if (!playing) return;
    const now = performance.now();
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 0;
    lastNow = now;
    t += dt * speed;
    if (t >= duration) {
      if (loop) {
        t = 0;
      } else {
        t = duration;
        playing = false;
        notify();
        onComplete?.();
        return;
      }
    }
    notify();
    schedule();
  }

  function schedule() {
    if (!playing || timer) return;
    timer = setTimeout(step, 16);
  }

  function play() {
    if (playing) return;
    if (t >= duration - 0.001) t = 0;
    playing = true;
    lastNow = 0;
    renderUI();
    schedule();
  }

  function pause() {
    playing = false;
    if (timer) clearTimeout(timer);
    timer = null;
    renderUI();
  }

  function toggle() {
    if (playing) pause();
    else play();
  }

  function seek(v) {
    t = Math.max(0, Math.min(duration, v));
    notify();
  }

  function setDuration(v, opts = {}) {
    const changed = Math.abs(v - duration) > 0.001;
    duration = Math.max(0.8, Number(v) || 2);
    if (opts.reset) t = 0;
    if (t > duration) t = duration;
    if (changed) renderUI();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && playing) pause();
    });
  }

  function setSimFrames(frames) {
    simFrames = frames;
  }

  return {
    mount,
    render: renderUI,
    renderMarks,
    play,
    pause,
    toggle,
    seek,
    setDuration,
    getTime: () => t,
    isPlaying: () => playing,
    getDuration: () => duration,
    setSpeed: (v) => {
      speed = v;
      if (els.speedBtn) els.speedBtn.textContent = `${speed}×`;
    },
    reset() {
      pause();
      t = 0;
      renderUI();
    },
    destroy() {
      pause();
    },
  };
}
