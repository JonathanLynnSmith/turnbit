// All three cover sizes share the same missing/failed image treatment.
(() => {
  function setSource(image, source) {
    source = source || '';
    if (!image.dataset.artworkBound) {
      image.dataset.artworkBound = 'true';
      image.addEventListener('error', () => {
        if (!image.dataset.artworkSource) return;
        image.dataset.failedSource = image.dataset.artworkSource;
        image.hidden = true;
        image.nextElementSibling.hidden = false;
      });
      image.addEventListener('load', () => {
        const current = image.dataset.artworkSource;
        if (
          !current ||
          image.currentSrc !== new URL(current, location.href).href
        )
          return;
        image.dataset.failedSource = '';
        image.hidden = false;
        image.nextElementSibling.hidden = true;
      });
    }
    image.dataset.artworkSource = source;
    const visible = !!source && image.dataset.failedSource !== source;
    image.hidden = !visible;
    image.nextElementSibling.hidden = visible;
    if (source && image.src !== new URL(source, location.href).href)
      image.src = source;
  }
  window.TurnbitArtwork = { setSource };
})();
