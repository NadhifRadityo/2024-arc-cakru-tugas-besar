import express from "express";

const { PORT } = Object.assign({ PORT: 3000 }, process.env);

(async () => {
	const app = express();
	app.listen(PORT, () => {
		console.log(`Server started on port ${PORT}`);
	});
})();
