import type { SchemaOf } from "yup";
import { number, object, string } from "yup";

import type { Address } from "./address.schema";
import { AddressSchema } from "./address.schema";

// The RESTful API contracts for Requests
export interface CreateExampleDataItemRequest {
  name: string;
  /**
   * The user's login email
   */
  email?: string;
  exampleNumber?: number | null;
  address?: Address;
}

export interface UpdateExampleDataItemRequest extends CreateExampleDataItemRequest {
  /**
   * Can be passed to implement optimistic locking of the record. Latest update in wins
   */
  updatedTimestamp?: string | null;
}

export const CreateExampleDataItemRequestSchema: SchemaOf<CreateExampleDataItemRequest> = object().shape({
  name: string().required(),
  email: string().min(4),
  exampleNumber: number().nullable(),
  address: AddressSchema.optional().default(undefined)
});

// Extend the Create Request schema to build the Update Request schema
// This is only valid if all of the create parameters can be modified after creation
export const UpdateExampleDataItemRequestSchema = CreateExampleDataItemRequestSchema.clone().concat(
  object({
    // You might choose not to have the id in the update request body,
    // since the id is probably also in the request URL/path
    // id: string(),
    // You can use updatedTimestamp as a means for implementing optimistic
    // locking of a record, which ensures that the requestor has the most
    // up to date version of the record before trying to modify it.
    updatedTimestamp: string()
  })
);
