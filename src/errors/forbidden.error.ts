export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = "ForbiddenError";
    this.stack = new Error().stack;
  }
}
