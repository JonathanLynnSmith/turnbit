// Explicit dependency loading, in order. The classic helper scripts publish
// their entry points on window (they are also required by the unit tests);
// renderer.js is a module that composes the interface from them.
import './navigation.js';
import '../src/core/value-control.js';
import './library-cache.js';
import './center-click.js';
import '../src/core/transport-hold.js';
import '../src/core/input-steps.js';
import './artwork.js';
import './radial.js';
import './track-transition.js';
import './dial-overlay.js';
import './settings/preferences.js';
import './settings/value-steps.js';
import './client/settings-client.js';
import './renderer.js';
import './window-gestures.js';
