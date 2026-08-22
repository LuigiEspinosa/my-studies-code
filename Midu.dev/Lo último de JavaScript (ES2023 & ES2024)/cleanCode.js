/* *********
 * Numeric Separator
 ********* */

const price = 48312345;
const priceNew = 48_312_345;

const price2 = 48_312_345;
price2 + 1; // -> 48312345 + 1 -> 48312346

const color = 0x00_99_ff;
const binary = 0b1010_1010_1111_0000;
const decimal = 0.12_34_56;

/* *********
 * Symbol()
 ********* */

const sym = Symbol();

const myObject = {};
const uniqueKey = Symbol("key");
myObject[uniqueKey] = "valor";
console.log(myObject[uniqueKey]); // 'valor'

const sym1 = Symbol("clave");
const sym2 = Symbol("clave");
console.log(sym1 === sym2); // false
