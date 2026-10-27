// Retain the outgoing artwork and metadata while the new track becomes ready.
// Album covers swap as static images; only metadata fades.
class TrackTransition {
  constructor(
    panel,
    {
      reducedMotion = () => false,
      duration = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--tb-duration-track',
        ),
      ) || 360,
    } = {},
  ) {
    Object.assign(this, { panel, reducedMotion, duration });
    this.key = null;
    this.generation = 0;
    this.animations = [];
    this.snapshot = null;
  }
  visuals() {
    return [...this.panel.querySelectorAll('.radial-track,.radial-timeline')];
  }
  reset() {
    this.generation++;
    this.animations.forEach((animation) => animation.cancel());
    this.animations = [];
    this.snapshot?.remove();
    this.snapshot = null;
    this.panel.querySelector('.radial-art').style.visibility = '';
    this.visuals().forEach((element) => (element.style.opacity = ''));
    this.key = null;
  }
  update(key) {
    if (key === this.key) return;
    if (this.key === null || this.reducedMotion()) {
      this.reset();
      this.key = key;
      return;
    }
    this.key = key;
    const generation = ++this.generation;
    this.animations.forEach((animation) => animation.cancel());
    this.animations = [];
    if (!this.snapshot) {
      const snapshot = this.panel.cloneNode(true);
      snapshot.removeAttribute('id');
      snapshot.classList.add('radial-now-snapshot');
      snapshot.removeAttribute('hidden');
      snapshot.setAttribute('aria-hidden', 'true');
      snapshot.inert = true;
      snapshot
        .querySelectorAll('[id]')
        .forEach((element) => element.removeAttribute('id'));
      snapshot.querySelector('.radial-volume').style.visibility = 'hidden';
      snapshot.style.animation = 'none';
      snapshot.style.pointerEvents = 'none';
      this.panel.before(snapshot);
      this.snapshot = snapshot;
    }
    this.snapshot.style.opacity = '1';
    this.snapshot.querySelector('.radial-art').style.visibility = '';
    this.panel.querySelector('.radial-art').style.visibility = 'hidden';
    this.visuals().forEach((element) => (element.style.opacity = '0'));
    queueMicrotask(async () => {
      const image = this.panel.querySelector('.radial-art img');
      if (image && !image.hidden && !image.complete)
        await Promise.race([
          image.decode().catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 600)),
        ]);
      if (generation !== this.generation) return;
      this.snapshot.querySelector('.radial-art').style.visibility = 'hidden';
      this.panel.querySelector('.radial-art').style.visibility = '';
      const options = {
        duration: this.duration,
        easing: 'cubic-bezier(.25,.1,.25,1)',
        fill: 'both',
      };
      this.animations = [
        ...Array.from(
          this.snapshot.querySelectorAll('.radial-track,.radial-timeline'),
          (element) =>
            element.animate([{ opacity: 1 }, { opacity: 0 }], options),
        ),
        ...this.visuals().map((element) =>
          element.animate([{ opacity: 0 }, { opacity: 1 }], options),
        ),
      ];
      await Promise.all(
        this.animations.map((animation) => animation.finished.catch(() => {})),
      );
      if (generation !== this.generation) return;
      this.snapshot.remove();
      this.snapshot = null;
      this.visuals().forEach((element) => (element.style.opacity = ''));
      this.animations.forEach((animation) => animation.cancel());
      this.animations = [];
    });
  }
}
window.TrackTransition = TrackTransition;
