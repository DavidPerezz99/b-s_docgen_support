import cuid2 from "@gapi-slalom/lib-common/dist/lib/cuid2";

import type { ExampleDataItemRecord } from "../models/exampleDataItemRecord.model";
import type {
  CreateExampleDataItemRequest,
  UpdateExampleDataItemRequest
} from "../models/exampleDataItemRequest.schema";
import type { ExampleDataItemResponse } from "../models/exampleDataItemResponse.model";

// It's important to have separate model for your API contract and your database records.
// This ensures decoupling of the database from the api.
// Mapper functions are to provide to conversion from API models to database models.
export class ExampleDataItemMapper {
  // Convert a CREATE request into a new Dynamo record, generating new unique identifiers for this record.
  // Normally, the "TENANT" id would come from the user's login token, or some other control.
  // For example purposes, we just create a new one here
  public static createNewDynamoRecord(
    requestData: CreateExampleDataItemRequest,
    tenantId: string,
    userId: string
  ): ExampleDataItemRecord {
    const newUniqueId = cuid2.createId();
    const now = new Date().toISOString();
    return {
      pk: `TENANT#${tenantId}`,
      sk: newUniqueId, // In a real application, the sort key would probably be a composite value of other fields
      itemId: newUniqueId,
      name: requestData.name,
      email: requestData.email,
      exampleNumber: requestData.exampleNumber,
      address: requestData.address,
      createdTimestamp: now,
      updatedTimestamp: now,
      createdBy: userId,
      updatedBy: userId
    };
  }

  // Convert an UPDATE request into the partial Dynamo record.
  // Use this converted object in a PATCH / partial update request to DynamoDB.
  // This way, ommitted fields will not be removed from the database record.
  // Normally, the "TENANT" id would come from the user's login token, or some other control.
  // For example purposes, we just create a new one here
  public static convertToPartialDynamoRecord(
    requestData: UpdateExampleDataItemRequest,
    itemId: string,
    tenantId: string,
    userId: string
  ): Partial<ExampleDataItemRecord> {
    const now = new Date().toISOString();
    return {
      pk: `TENANT#${tenantId}`,
      sk: itemId, // In a real application, the sort key would probably be a composite value of other fields
      itemId: itemId,
      name: requestData.name,
      email: requestData.email,
      exampleNumber: requestData.exampleNumber,
      address: requestData.address,
      updatedTimestamp: now,
      updatedBy: userId
    };
  }

  public static convertToExampleDataItemResponse(record: ExampleDataItemRecord): ExampleDataItemResponse {
    return {
      id: record.itemId,
      name: record.name,
      email: record.email,
      exampleNumber: record.exampleNumber,
      address: record.address,
      createdTimestamp: record.createdTimestamp,
      updatedTimestamp: record.updatedTimestamp,
      createdBy: record.createdBy,
      updatedBy: record.updatedBy
    };
  }
}
