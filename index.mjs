import * as url from "url";
import path from "path";
import fs0 from "fs";
import fs from "fs/promises";
import express from "express";
import expressWs from "express-ws";
import compression from "express-compression";
import { path as ffmpegPath } from "@ffmpeg-installer/ffmpeg";
import { spawn } from "child_process";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = url.fileURLToPath(new URL(".", import.meta.url));
const { PORT } = Object.assign({ PORT: 3000 }, process.env);

(async () => {
	const app = express();

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
	app.get("/viewer/:link", (req, res) => {
		const { link } = req.params;
		res.render("viewer", { link });
	});

	app.listen(PORT, () => {
		console.log(`Server started on port ${PORT}`);
	});
})();
