/* *********
 * Método .at() para Arrays
 ********* */

const arr = ["🦖", "🦕", "🐉", "🐓"];
console.log(arr[0]); // 🦖
console.log(arr[1]); // 🦕
console.log(arr[2]); // 🐉
console.log(arr[3]); // 🐓

console.log(arr.length); // 4
console.log(arr[arr.length - 1]); // 🐓

const arrNew = ["🦖", "🦕", "🐉", "🐓"];
console.log(arrNew.at(-1)); // 🐓

/* *********
 * Cambios inmutables en arrays con el método array.with()
 ********* */

const arrCopy = [1, 2, 3];
const copy = [...arrCopy]; // usamos el spread para crear una copia del array
copy[1] = 10; // modificamos el valor del índice 1

console.log(arrCopy); // [1, 2, 3]
console.log(copy); // [1, 10, 3]

const arrWidth = [1, 2, 3];
const newArr = arrWidth.with(1, 10); // Modifica el índice 1 e introduce el valor 10

console.log(arrWidth); // [1, 2, 3]  (array original)
console.log(newArr); // [1, 10, 3] (nueva copia con el valor modificado)

const users = [
	{ id: 1, name: "John" },
	{ id: 2, name: "Jane" },
	{ id: 3, name: "Bob" },
];

const modifiedUsers = users.map((user) => {
	if (user.id === 2) {
		return { ...user, name: "Jane Doe" };
	}

	return user;
});

const usersNew = [
	{ id: 1, name: "John" },
	{ id: 2, name: "Jane" },
	{ id: 3, name: "Bob" },
];

const userToModify = usersNew.findIndex((user) => user.id === 2);
const modifiedUsersNew = usersNew.with(userToModify, { name: "Jane Doe" });

/* *********
 * Agrupar datos
 ********* */

const numbers = [1, 2, 3, 4, 5, 6];
const groupedNumbers = Object.groupBy(numbers, (number) => (number % 2 === 0 ? "par" : "impar"));
console.log(groupedNumbers);
// -> {
//  par: [2, 4, 6],
//  impar: [1, 3, 5]
// }

const wizards = ["Harry", "Hermione", "Ron", "Snape", "Dumbledore"];
const groupedByFirstLetter = Object.groupBy(wizards, (wizard) => wizard[0]);
console.log(groupedByFirstLetter);
// -> {
//  H: ['Harry', 'Hermione'],
//  R: ['Ron'],
//  S: ['Snape'],
//  D: ['Dumbledore']
// }

const avengers = [
	{ name: "Iron Man", powerLevel: 500 },
	{ name: "Hulk", powerLevel: 9000 },
	{ name: "Thor", powerLevel: 4500 },
	{ name: "Captain America", powerLevel: 2000 },
	{ name: "Black Widow", powerLevel: 9999 },
];

const groupedByPowerLevel = Object.groupBy(avengers, (avenger) => {
	if (avenger.powerLevel <= 500) return "alpha";
	if (avenger.powerLevel <= 5000) return "beta";
	return "omega";
});

console.log(groupedByPowerLevel);
// -> {
//  "alpha": [{ "name": "Iron Man", "powerLevel": 500 }],
//  "omega": [{ "name": "Hulk", "powerLevel": 9000 }, { "name": "Black Widow", "powerLevel": 9999 }],
//  "beta": [{ "name": "Thor", "powerLevel": 4500 }, { "name": "Captain America", "powerLevel": 2000 }]
// }

/* *********
 * Operaciones de conjuntos con los métodos de Set
 ********* */

const set1 = new Set([1, 2, 3, 4, 5]);
const set2 = new Set([2, 3, 4, 5, 6]);

const intersection = set1.intersection(set2);
console.log(intersection); // Set(2, 3, 4, 5)

const union = set1.union(set2);
console.log(union); // Set(1, 2, 3, 4, 5, 6)

const difference = set1.difference(set2);
console.log(difference); // Set(1)

const symmetricDifference = set1.symmetricDifference(set2);
console.log(symmetricDifference); // Set(1, 6)

const isSubset = set1.isSubsetOf(set2);
console.log(isSubset); // false

const isSuperset = set1.isSupersetOf(set2);
console.log(isSuperset); // false

const isDisjoint = set1.isDisjointWith(set2);
console.log(isDisjoint); // true
