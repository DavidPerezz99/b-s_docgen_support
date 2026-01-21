import type { HealthServiceResult } from "../services/health.service";

export class HealthError extends Error {
  constructor(
    message: string,
    public data: HealthServiceResult
  ) {
    super(message); // 'Error' breaks prototype chain here
    Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
    this.name = "HealthError";
    this.stack = new Error().stack;
  }
}
