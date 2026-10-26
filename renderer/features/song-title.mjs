// Presentation only: keep provider metadata and library/search titles intact.
export function splitSongTitle(value = '') {
  const original = String(value);
  let title = original;
  const details = [];
  // Only move recognizable credits and versions; parentheses can be part of a title.
  const annotation =
    /\s*[([]((?:feat\.?|ft\.?|featuring)\s+[^()[\]]+|[^()[\]]*\b(?:remix|remaster(?:ed)?|version|edit|mix|live|acoustic|instrumental|demo)\b[^()[\]]*)[)\]]/gi;
  title = title.replace(annotation, (_, detail) => {
    details.push(detail.trim());
    return '';
  });
  const version = title.match(
    /\s+[–—-]\s+(.*\b(?:remix|remaster(?:ed)?|version|edit|mix|live|acoustic|instrumental|demo)\b.*)$/i,
  );
  if (version) {
    details.push(version[1].trim());
    title = title.slice(0, version.index);
  }
  title = title.trim();
  return title && details.length
    ? { title, detail: details.join(' · ') }
    : { title: original, detail: '' };
}

export function renderSongTitle(titleNode, detailNode, original) {
  const { title, detail } = splitSongTitle(original);
  titleNode.textContent = title;
  titleNode.title = original;
  detailNode.textContent = detail;
  detailNode.title = detail;
  detailNode.hidden = !detail;
}
