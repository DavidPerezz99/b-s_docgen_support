import type { DynamoDbItemKeys } from "./dynamoDBItemKeys";
import type { ExampleDataItemRecord } from "./exampleDataItemRecord.model";

export enum DynamoStreamEventName {
  INSERT = "INSERT",
  MODIFY = "MODIFY",
  REMOVE = "REMOVE",
  UNKNOWN = "UNKNOWN"
}

export interface ExampleDynamoDBStreamRecord {
  keys?: Record<string, DynamoDbItemKeys>;
  newImage?: Record<string, ExampleDataItemRecord>;
  oldImage?: Record<string, ExampleDataItemRecord>;
  eventName?: DynamoStreamEventName;
  eventID?: string;
}
