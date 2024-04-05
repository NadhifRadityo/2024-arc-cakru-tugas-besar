import express from "express";

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
