export class NotFoundError extends Error {
  constructor(message: string) {
    super(message); // 'Error' breaks prototype chain here
    Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
    this.name = "NotFoundError";
    this.stack = new Error().stack;
  }
}
