/* *********
 * Cause of Errors
 ********* */

function obtenerProducto(id) {
	if (id < 0) {
		throw new Error("ID no válido", { cause: "ID negativo proporcionado" });
	} else if (id > 100) {
		throw new Error("Registro no encontrado", { cause: "ID mayor a 100 proporcionado" });
	}
	return { id, nombre: "Producto" };
}

try {
	const producto = obtenerProducto(-5);
} catch (error) {
	console.error("Error al obtener el producto:", error.message);
	console.error("Causa:", error.cause);
}

/* *********
 * Arrays Iterators
 ********* */

const students = [
	{ id: 1, name: "Ana García", scores: [85, 92, 78, 90] },
	{ id: 2, name: "Carlos López", scores: [75, 82, 79, 88] },
	{ id: 3, name: "Elena Martínez", scores: [95, 91, 93, 92] },
	{ id: 4, name: "David Sánchez", scores: [65, 71, 68, 72] },
	{ id: 5, name: "Sofía Rodríguez", scores: [88, 84, 89, 86] },
];

const mapped = students.map((student) => {
	return {
		...student,
		scores: student.scores.map((n) => n / 10),
	};
});

const studentIterator = students.values();
console.log(studentIterator.next().value);

for (const student of studentIterator) {
	console.log(student);
	if (student.id === 2) {
		break; // Rompe el bucle al encontrar a Carlos
	}
}

const entries = students.entries();
console.log(entries.next());

const keys = students.keys();
console.log(keys.next());
