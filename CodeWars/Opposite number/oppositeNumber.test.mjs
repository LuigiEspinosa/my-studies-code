import * as chai from "chai";
const { assert } = chai;
import _ from "lodash";

import pkg from "./oppositeNumber.js";
const { opposite } = pkg;

describe("Fixed tests", () => {
	it("Is it a function?", () => {
		assert.strictEqual(typeof opposite, "function", "opposite should be a function");
	});
	it("should return -1", () => {
		assert.strictEqual(opposite(1), -1);
	});
	it("should return 0", () => {
		assert.strictEqual(opposite(0), 0);
	});
	it("should return -4.25", () => {
		assert.strictEqual(opposite(4.25), -4.25);
	});
	it("should return -3.3333333", () => {
		assert.strictEqual(opposite(3.3333333), -3.3333333);
	});
	it("should return 12525220.3325", () => {
		assert.strictEqual(opposite(-12525220.3325), 12525220.3325);
	});
	it("should return 5", () => {
		assert.strictEqual(opposite(-5), 5);
	});
});

describe("Random tests", () => {
	const generateRandom = (min, max) => Math.random() * (max - min + 1) + min;
	const oppositeSol = (number) => -number;
	for (let i = 0; i < 40; i++) {
		const randomNumber = generateRandom(-100, 100);
		const expected = oppositeSol(randomNumber);
		it(`should return ${expected}`, () => {
			assert.strictEqual(opposite(randomNumber), expected);
		});
	}
});
