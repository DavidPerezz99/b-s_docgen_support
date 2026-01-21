export class ValidationError extends Error {
  constructor(
    message: string,
    public data: any
  ) {
    super(message); // 'Error' breaks prototype chain here
    Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
    this.name = "ValidationError";
    this.stack = new Error().stack;
  }
}
