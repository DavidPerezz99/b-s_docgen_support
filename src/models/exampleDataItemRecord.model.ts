import type { Address } from "./address.schema";
import type { DynamoDbItemKeys } from "./dynamoDBItemKeys";

// The DynamoDB model
export interface ExampleDataItemRecord extends DynamoDbItemKeys {
  itemId: string;
  name: string;
  email: string | undefined;
  exampleNumber: number | null | undefined;
  address: Address | undefined;
  createdTimestamp: string;
  updatedTimestamp: string;
  createdBy: string;
  updatedBy: string;
}
