const identity = <T>(val: T): T => val;

const mapArray = <T, U>(arr: T[], fn: (val: T) => U) => arr.map(fn);
