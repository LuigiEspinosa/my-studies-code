export default (anims) => {
	anims.create({
		key: "idle",
		frameRate: 8,
		repeat: -1,
		frames: anims.generateFrameNumbers("player", {
			start: 0,
			end: 8,
		}),
	});

	anims.create({
		key: "run",
		frameRate: 8,
		repeat: -1,
		frames: anims.generateFrameNumbers("player", {
			start: 9,
			end: 16,
		}),
	});

	anims.create({
		key: "jump",
		frameRate: 2,
		repeat: 1,
		frames: anims.generateFrameNumbers("player", {
			start: 17,
			end: 23,
		}),
	});
};
