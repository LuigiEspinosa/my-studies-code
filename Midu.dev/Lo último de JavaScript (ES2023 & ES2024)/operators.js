/* *********
 * Nullish Coalescing Operator (??)
 ********* */

let currentPage = null;
let page = currentPage ?? 1;
console.log(page); // 1

currentPage = 0;
page = currentPage ?? 1;
console.log(page); // 0

let score = 0;
let resultado = score || 10;
console.log(resultado); // 10

resultado = score ?? 10;
console.log(resultado); // 0

/* *********
 * &&=, ||=, ??=
 ********* */

let valor1 = 5;
valor1 &&= 10;
console.log(valor1); // 10

let otroValor1 = 0;
otroValor1 &&= 10;
console.log(otroValor1); // 0

let valor2 = 0;
valor2 ||= 10;
console.log(valor2); // 10

let otroValor2 = 5;
otroValor2 ||= 10;
console.log(otroValor2); // 5

let valor3 = null;
valor3 ??= 10;
console.log(valor3); // 10

let otroValor3 = 5;
otroValor3 ??= 10;
console.log(otroValor3); // 5

let value = 0;
value = value && 10;
console.log(value); // 0

// se reasigna value a la variable value

let otherValue = 0;
otherValue ??= 10;
console.log(otherValue); // 0

// NO se reasigna otherValue a la variable otherValue
// se evita trabajo innecesario
