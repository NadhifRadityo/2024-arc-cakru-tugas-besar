(async () => {
	async function importJSMpeg() {
		return new Promise((resolve, reject) => {
			if(window.JSMpeg != null) resolve(window.JSMpeg);
			const script = document.createElement("script");
			script.onload = () => resolve(window.JSMpeg);
			script.onerror = (e) => reject(e);
			script.src = "https://cdn.jsdelivr.net/gh/phoboslab/jsmpeg@b5799bf/jsmpeg.min.js";
			document.head.appendChild(script);
		});
	}
	async function loadMpegTsPlayer({
		url,
		canvas,
		mpegOptions
	}) {
		const JSMpeg = await importJSMpeg();
		const player = new JSMpeg.Player(url, {
			canvas: canvas,
			...mpegOptions
		});
		return player;
	}
	window.importJSMpeg = importJSMpeg;
	window.loadMpegTsPlayer = loadMpegTsPlayer;
})();
