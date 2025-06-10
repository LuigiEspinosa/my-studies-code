import Phaser from "phaser";

class PlayScene extends Phaser.Scene {
	constructor() {
		super("PlayScene");
	}

	create() {
		const map = this.createMap();
		const layers = this.createLayers(map);

		this.player = this.createPlayer();

		this.playerSpeed = 200;
		this.physics.add.collider(this.player, layers.platformsColliders);
		this.cursors = this.input.keyboard.createCursorKeys();
	}

	createMap() {
		const map = this.make.tilemap({ key: "map" });
		map.addTilesetImage("main_lev_build_1", "tiles-1");
		map.addTilesetImage("main_lev_build_2", "tiles-2");

		return map;
	}

	createLayers(map) {
		const tileset1 = map.getTileset("main_lev_build_1");
		const tileset2 = map.getTileset("main_lev_build_2");

		const platformsColliders = map.createStaticLayer("platforms_colliders", tileset1);
		const environment = map.createStaticLayer("environment", [tileset1, tileset2]);
		const platforms = map.createStaticLayer("platforms", tileset1);

		platformsColliders.setCollisionByProperty({ collides: true });

		return { environment, platforms, platformsColliders };
	}

	createPlayer() {
		const player = this.physics.add.sprite(100, 250, "player");
		player.body.setGravityY(500);
		player.setCollideWorldBounds(true);

		return player;
	}

	update() {
		const { left, right } = this.cursors;

		if (left.isDown) {
			this.player.setVelocityX(-this.playerSpeed);
		} else if (right.isDown) {
			this.player.setVelocityX(this.playerSpeed);
		} else {
			this.player.setVelocityX(0);
		}
	}
}

export default PlayScene;
