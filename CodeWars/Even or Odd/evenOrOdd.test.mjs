import * as chai from "chai";
const { assert } = chai;
import _ from "lodash";

import pkg from "./evenOrOdd.js";
const { evenOrOdd } = pkg;

// Fixed tests for every posibbly interesting type of input:
//  - even positive numbers,
//  - odd positive numbers,
//  - even negative numbers
//  - odd negative numbers (can be tricky due to how modulo works)

describe("Fixed tests", () => {
  it("2 is even", () => {
    assert.strictEqual(evenOrOdd(2), "Even");
  });
  it("7 is odd", () => {
    assert.strictEqual(evenOrOdd(7), "Odd");
  });
  it("-42 is even", () => {
    assert.strictEqual(evenOrOdd(-42), "Even");
  });
  it("-7 is odd", () => {
    assert.strictEqual(evenOrOdd(-7), "Odd");
  });
  it("0 is even", () => {
    assert.strictEqual(evenOrOdd(0), "Even");
  });
});

describe("Random tests", () => {
  let generateCases = (odd, sign, count) => {
    return Array.from({ length: count }, () => [
      sign * _.random(500) * 2 + odd,
      odd ? "Odd" : "Even",
    ]);
  };

  // Random generators which are guaranteed
  // to generate test cases of every relevant
  // kind.
  let generateTestCases = () => [
    ...generateCases(0, 1, 10), // generator for positive even inputs
    ...generateCases(0, -1, 10), // generator for negative even inputs
    ...generateCases(1, 1, 10), // generator for positive odd inputs
    ...generateCases(1, -1, 10), // generator for negative odd inputs
  ];

  let cases = _.shuffle(generateTestCases());
  for (let [input, expected] of cases) {
    it(`Should return "${expected}" for ${input}`, () => {
      let actual = evenOrOdd(input);
      assert.strictEqual(actual, expected);
    });
  }
});
