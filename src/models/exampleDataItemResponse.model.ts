import type { Address } from "./address.schema";

// Define the response model separate from input/request models
export interface ExampleDataItemResponse {
  id: string;
  name: string;
  email: string | undefined;
  exampleNumber: number | null | undefined;
  address: Address | undefined;
  createdTimestamp: string; // We use string() instead of date() to avoid coercion of data into a JavaScript Date object
  updatedTimestamp: string; // Use of JavaScript Date objects in I/O can easily cause timezone discrepancies
  createdBy: string;
  updatedBy: string;
}
