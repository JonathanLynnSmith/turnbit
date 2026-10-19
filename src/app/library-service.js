// A library provider implements page({kind, id?, offset}) and returns normalized
// items, total, and nextOffset. Pagination is numeric; provider URLs stay private.
function createLibraryService(provider) {
  const pending = new Map();
  let generation = 0;
  return {
    page(request = {}) {
      const { kind, id, offset = 0 } = request;
      if (!['playlists', 'songs', 'playlist'].includes(kind))
        return Promise.reject(new Error('Invalid library request.'));
      if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
        return Promise.reject(new Error('Invalid library page.'));
      if (
        kind === 'playlist' &&
        (typeof id !== 'string' || !id || id.length > 512)
      )
        return Promise.reject(new Error('Invalid library collection.'));
      const key = JSON.stringify([generation, kind, id, offset]);
      if (!pending.has(key)) {
        const session = generation;
        const read = Promise.resolve()
          .then(() => provider.page({ kind, id, offset }))
          .then((page) => {
            if (session !== generation)
              throw new Error('Library connection changed. Try loading again.');
            return page;
          })
          .finally(() => pending.delete(key));
        pending.set(key, read);
      }
      return pending.get(key).then((page) => structuredClone(page));
    },
    reset() {
      generation++;
      pending.clear();
    },
  };
}
module.exports = { createLibraryService };
