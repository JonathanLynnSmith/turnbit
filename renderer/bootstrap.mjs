// Explicit dependency loading. Existing screens keep their named entry points
// during migration; feature modules receive their dependencies through factories.
import './navigation.js';
import '../src/core/value-control.js';
import './library-cache.js';
import './center-click.js';
import '../src/core/transport-hold.js';
import './themes.js';
import './radial.js';
import './track-transition.js';
import './dial-overlay.js';
import './settings/preferences.js';
import './client/playback-client.js';
import './client/settings-client.js';
import { createRadialView } from './features/radial-view.mjs';
import { createPlaybackView } from './features/playback-view.mjs';
import { createLibraryController } from './features/library-controller.mjs';
import { createSettingsController } from './features/settings-controller.mjs';

window.TurnbitFeatures = {
  createRadialView,
  createPlaybackView,
  createLibraryController,
  createSettingsController,
};
await new Promise((resolve, reject) => {
  const entry = document.createElement('script');
  entry.src = new URL('./renderer.js', import.meta.url).href;
  entry.onload = resolve;
  entry.onerror = () =>
    reject(new Error('Could not load the desktop interface.'));
  document.body.append(entry);
});
await import('./window-gestures.js');
