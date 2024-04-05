import * as url from "url";
import path from "path";
import fs0 from "fs";
import fs from "fs/promises";
import express from "express";
import expressWs from "express-ws";
import compression from "express-compression";
import { path as ffmpegPath } from "@ffmpeg-installer/ffmpeg";
import { spawn } from "child_process";
import EventEmitter from "events";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const { PORT } = Object.assign({ PORT: 3000 }, process.env);

(async () => {
	const app = express();
	const appWs = expressWs(app, null, { wsOptions: { perMessageDeflate: true } });

	app.set("view engine", "ejs");
	app.use((req, res, next) => {
		try {
			req.socket.setNoDelay(true);
			res.socket.setNoDelay(true);
		} finally { return next(); }
	});
	app.use(compression({
		brotli: { enabled: true },
		filter: (req, res) => {
			const type = res.getHeader('Content-Type')?.trim();
			if(type == null) return false;
			if(compression.filter(req, res)) return true;
			return [
				"image/webp",
				"video/mp4",
				"video/mp2t",
				"application/vnd.apple.mpegurl"
			]
				.some(t => type.includes(t));
		}
	}));
	app.use(express.static(path.join(__dirname, "public/")));

	app.get("/", (req, res) => {
		res.render("main");
	});
	app.get("/viewer/*", (req, res) => {
		const link = req.params["0"];
		res.render("viewer", { link });
	});
	app.get("/viewer-frame/*", (req, res) => {
		const link = req.params["0"];
		res.render("viewer-frame", { link });
	});

	app.ws("/stream/*", (ws, req) => {
		const link = req.params["0"];
		addMpegTsStream(ws, link);
		ws.on("close", () => {
			removeMpegTsStream(ws);
		});
	});
	app.ws("/mpegts/:id", (ws, req) => {
		const { id } = req.params;
		const [stream] = mpegTsStreams.find(([s]) => s.id == id) || [];
		if(stream == null) { ws.close(); return; }

		const streamHeader = Buffer.alloc(0x8);
		streamHeader.write("jsmp");
		streamHeader.writeUInt16BE(0, 0x4);
		streamHeader.writeUInt16BE(0, 0x6);
		ws.send(streamHeader, { binary: true });

		const callback = d => ws.send(d);
		const exitCallback = () => ws.close();
		stream.on("data", callback);
		stream.on("exit", exitCallback);
		ws.on("close", () => {
			stream.off("data", callback);
			stream.off("exit", exitCallback);
		});
	});

	app.listen(PORT, () => {
		console.log(`Server started on port ${PORT}`);
	});
})();

function filterLogMessages(msg) {
	return msg;
}

const mpegTsStreams = [];
function addMpegTsStream(ws, link) {
	let [stream, clients] = mpegTsStreams.find(([s]) => s.link == link) || [];
	if(stream == null) {
		stream = new MpegTsStream(link);
		clients = [];
		mpegTsStreams.push([stream, clients]);
		console.log(`Started MpegTs stream ${link}`);
		stream.on("error", (e) => console.error("error", link, e));
		stream.on("progress", (e) => console.log("progress", link, e));
		stream.on("exit", () => console.log("exit", link));
		stream.start();
	}

	clients.push(ws);
	if(!stream.readySend) {
		const readyCallback = () => {
			if(ws.readyState != ws.OPEN) return;
			ws.send(JSON.stringify({ type: "ready", link: `/mpegts/${stream.id}` }));
		};
		stream.on("ready", readyCallback);
		ws.on("close", () => stream.off("ready", readyCallback));
	} else
		ws.send(JSON.stringify({ type: "ready", link: `/mpegts/${stream.id}` }));
	const progressCallback = d => {
		if(ws.readyState != ws.OPEN) return;
		d = filterLogMessages(d);
		ws.send(JSON.stringify({ type: "log", content: d }));
	};
	stream.on("progress", progressCallback);
	ws.on("close", () => stream.off("progress", progressCallback));
}
function removeMpegTsStream(ws) {
	const streamIndex = mpegTsStreams.findIndex(([_, c]) => c.includes(ws));
	if(streamIndex == -1) return;
	let [stream, clients] = mpegTsStreams[streamIndex];
	const clientIndex = clients.indexOf(ws);
	clients.splice(clientIndex, 1);
	if(clients.length > 0) return;
	mpegTsStreams.splice(streamIndex, 1);
	stream.stop();
}

class MpegTsStream extends EventEmitter {

	constructor(link) {
		super();
		this.id = Math.random().toString(36).substring(2, 7);
		this.link = link;
		this.readySend = false;
		this.__readyHandler = 0;
	}

	start() {
		this.__readyHandler = setTimeout(() => {
			this.readySend = true;
			this.__readyHandler = 0;
			this.emit("ready");
		}, 1000);
		const process = this.process = spawn(ffmpegPath, [
			"-strict", "experimental",
			...(this.link.startsWith("rtsp:") ? ["-rtsp_transport", "tcp"] : []),
			"-i", this.link,
			"-map_metadata", "-1",
			"-metadata", `id=${this.id}`,
			"-metadata", `title=${this.link}`,
			"-codec:v", "mpeg1video",
			"-codec:a", "mp2",
			"-maxrate:v", "2048k",
			"-maxrate:a", "384k",
			"-bufsize:v", "1024k",
			"-bufsize:a", "192k",
			"-pix_fmt", "yuv420p",
			"-r", "24",
			"-crf", "24",
			"-ac", "2",
			"-ar", "16000",
			"-preset", "veryfast",
			"-tune", "zerolatency",
			"-force_key_frames", "expr:gte(t,n_forced)",
			"-f", "mpegts",
			"-"
		], {
			detached: false,
			windowsHide: true
		});
		process.on("error", e => this.emit("error", e));
		process.on("exit", () => { this.emit("exit"); this.process = null; });
		process.stderr.on("data", d => this.emit("progress", d.toString()));
		process.stdout.on("data", d => this.emit("data", d));
	}
	stop() {
		if(this.process == null)
			return;
		if(this.__readyHandler) {
			clearTimeout(this.__readyHandler);
			this.__readyHandler = 0;
		}
		const process = this.process;
		process.kill("SIGTERM");
		this.process = null;
	}
}
