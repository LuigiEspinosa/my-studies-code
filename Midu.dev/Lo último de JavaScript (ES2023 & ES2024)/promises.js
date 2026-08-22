/* *********
 * Promise.allSettled()
 ********* */

const promesa1 = new Promise((resolve, reject) => {
	setTimeout(() => {
		resolve("promesa1");
	}, 1000);
});

const promesa2 = new Promise((resolve, reject) => {
	setTimeout(() => {
		reject("promesa2");
	}, 2000);
});

Promise.all([promesa1, promesa2])
	.then((results) => {
		console.log(results); // ['promesa1', 'promesa2']
	})
	.catch((error) => {
		console.log(error); // 'promesa2'
	});

Promise.allSettled([promesa1, promesa2]).then((results) => {
	console.log(results);
	/*
    [
      {status: 'fulfilled', value: 'promesa1'},
      {status: 'rejected', reason: 'promesa2'}
    ]
  */
});

/* *********
 * Promise.any()
 ********* */

const anyPromesa1 = new Promise((resolve, reject) => {
	setTimeout(() => {
		resolve("promesa1");
	}, 1000);
});

const anyPromesa2 = new Promise((resolve, reject) => {
	setTimeout(() => {
		reject("promesa2");
	}, 500);
});

const anyPromesa3 = new Promise((resolve, reject) => {
	setTimeout(() => {
		resolve("promesa3");
	}, 3000);
});

Promise.any([anyPromesa1, anyPromesa2]).then((result) => {
	console.log(result); // promesa1
});

// If all failed

const rejectPromesa1 = new Promise((resolve, reject) => {
	setTimeout(() => {
		reject("promesa1");
	}, 1000);
});

const rejectPromesa2 = new Promise((resolve, reject) => {
	setTimeout(() => {
		reject("promesa2");
	}, 500);
});

const rejectPromesa3 = new Promise((resolve, reject) => {
	setTimeout(() => {
		reject("promesa3");
	}, 3000);
});

Promise.any([rejectPromesa1, rejectPromesa2, rejectPromesa3])
	.then((result) => {
		console.log(result); // no entra aquí
	})
	.catch((error) => {
		console.log(error); // Error: 'All promises were rejected'
	});

/* *********
 * Promise.try()
 ********* */

// ❌ Este código no funciona
function getUserInfo() {
	return {
		name: "John Doe",
		age: 30,
		email: "john.doe@example.com",
	};
}

getUserInfo()
	.then((result) => {
		console.log({ result });
	})
	.catch((error) => {
		console.error("El fallo es:", error);
	});

// ✅ Este código funciona
function getUserInfo() {
	return Promise.resolve({
		name: "John Doe",
		age: 30,
		email: "john.doe@example.com",
	});
}

getUserInfo()
	.then((result) => {
		console.log({ result });
		// { result: { name: 'John Doe', age: 30, email: 'john.doe@example.com' } }
	})
	.catch((error) => {
		console.error("El fallo es:", error);
	});

// ✅ Este código funciona
function getUserInfo() {
	return {
		name: "John Doe",
		age: 30,
		email: "john.doe@example.com",
	};
}

Promise.try(() => getUserInfo())
	.then((result) => {
		console.log({ result });
		// { result: { name: 'John Doe', age: 30, email: 'john.doe@example.com' } }
	})
	.catch((error) => {
		console.error("El fallo es:", error);
	});

/* *********
 * Promise.withResolvers()
 ********* */

// ❌ Código común con creación manual de promesa
function createManualPromise() {
	let resolve, reject;

	const promise = new Promise((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

// const { promise, resolve, reject } = createManualPromise();

// Ahora puedes resolver o rechazar la promesa manualmente
resolve("Operación completada");

// ✅ Código usando Promise.withResolvers()
const { promise, resolve, reject } = Promise.withResolvers();

resolve("Operación completada");

promise.then((result) => {
	console.log(result); // 'Operación completada'
});

// ❌ Código clásico usando new Promise y setTimeout
function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

delay(1000).then((message) => {
	console.log(message); // 'Tiempo completado'
});

// ✅ Transformando el método delay con Promise.withResolvers()
function delay(ms) {
	const { promise, resolve } = Promise.withResolvers();
	setTimeout(resolve, ms);
	return promise;
}

delay(1000).then((message) => {
	console.log(message); // 'Tiempo completado'
});
