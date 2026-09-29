/*
 * Touch controls: on-screen buttons that emulate keyboard keys.
 *
 * Game-agnostic: each button dispatches synthetic keydown/keyup events on
 * window, so any page listening to the keyboard (e.g. Emscripten's GLUT/SDL,
 * which read event.keyCode) receives them as real key presses. Multiple
 * buttons can be held at the same time (multi-touch).
 *
 * Usage:
 *   <link rel="stylesheet" href="touch-controls.css">
 *   <script src="touch-controls.js"></script>
 *   TouchControls.create({
 *     buttons: [
 *       { label: "▲", keyCode: 87, position: { right: "8%", bottom: "30%" } },
 *       { label: "⛶", onPress: () => TouchControls.enterFullscreen(), position: { right: "2%", top: "2%" }, size: "small" },
 *     ],
 *     rotateHint: "Rotate your device",
 *   });
 */
(function (global) {
	"use strict";

	const isTouchDevice = () => global.matchMedia("(pointer: coarse)").matches;

	// Synthetic KeyboardEvent: keyCode can't be set through the constructor
	// in every browser, so it's defined as a property
	function sendKey(type, keyCode) {
		const event = new KeyboardEvent(type, { bubbles: true, cancelable: true });
		Object.defineProperty(event, "keyCode", { get: () => keyCode });
		Object.defineProperty(event, "which", { get: () => keyCode });
		global.dispatchEvent(event);
	}

	// Fullscreen + landscape lock (Android); silently unavailable on iPhone
	function enterFullscreen(element = document.documentElement) {
		const request = element.requestFullscreen || element.webkitRequestFullscreen;
		if (!request) return Promise.resolve(false);

		return Promise.resolve(request.call(element, { navigationUI: "hide" }))
			.then(() => screen.orientation && screen.orientation.lock
				? screen.orientation.lock("landscape").catch(() => {})
				: undefined)
			.then(() => true)
			.catch(() => false);
	}

	function createButton(config, minPressMs) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "tc-button" + (config.size ? " tc-" + config.size : "");
		button.textContent = config.label;
		button.setAttribute("aria-label", config.name || config.label);
		Object.assign(button.style, config.position);

		let pressed = false;
		let pressTime = 0;
		let releaseTimer = null;

		const press = (event) => {
			event.preventDefault();
			if (pressed) return;
			pressed = true;
			pressTime = performance.now();
			// A quick re-tap cancels the pending release: the key is still down
			if (releaseTimer !== null) {
				clearTimeout(releaseTimer);
				releaseTimer = null;
				button.classList.add("tc-pressed");
				return;
			}
			button.classList.add("tc-pressed");
			// Keep receiving events for this finger even if it slides off the button
			if (event.pointerId !== undefined) button.setPointerCapture(event.pointerId);
			if (config.keyCode !== undefined) sendKey("keydown", config.keyCode);
			if (config.onPress) config.onPress();
		};

		const doRelease = () => {
			releaseTimer = null;
			button.classList.remove("tc-pressed");
			if (config.keyCode !== undefined) sendKey("keyup", config.keyCode);
			if (config.onRelease) config.onRelease();
		};

		// Keep the key down for at least minPressMs, so that games polling the
		// keyboard state once per frame don't miss very short taps
		const release = (event) => {
			event.preventDefault();
			if (!pressed) return;
			pressed = false;
			const remaining = config.keyCode !== undefined
				? minPressMs - (performance.now() - pressTime)
				: 0;
			if (remaining > 0) releaseTimer = setTimeout(doRelease, remaining);
			else doRelease();
		};

		button.addEventListener("pointerdown", press);
		button.addEventListener("pointerup", release);
		button.addEventListener("pointercancel", release);
		button.addEventListener("lostpointercapture", release);
		button.addEventListener("contextmenu", (event) => event.preventDefault());

		return button;
	}

	/*
	 * options:
	 *   buttons      array of { label, name?, keyCode?, onPress?, onRelease?,
	 *                position: CSS left/right/top/bottom, size?: "small"|"large" }
	 *   container    element the controls are added to (default: document.body)
	 *   touchOnly    show only on touch devices (default: true)
	 *   rotateHint   text shown in portrait orientation (default: none)
	 *   minPressMs   minimum time a key stays down, so that short taps are not
	 *                missed by games polling the keyboard once per frame (default: 60)
	 * Returns { root, destroy() }, or null when not shown.
	 */
	function create(options) {
		const { buttons = [], container = document.body, touchOnly = true, rotateHint, minPressMs = 60 } = options;

		if (touchOnly && !isTouchDevice()) return null;

		const root = document.createElement("div");
		root.className = "tc-root";

		for (const config of buttons)
			root.appendChild(createButton(config, minPressMs));

		if (rotateHint) {
			const hint = document.createElement("div");
			hint.className = "tc-rotate-hint";
			hint.textContent = rotateHint;
			root.appendChild(hint);
		}

		container.appendChild(root);

		return {
			root,
			destroy: () => root.remove(),
		};
	}

	global.TouchControls = { create, sendKey, enterFullscreen, isTouchDevice };
})(window);
