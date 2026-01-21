import type { ExampleDataItemRecord } from "../models/exampleDataItemRecord.model";

export interface ExampleDynamoRepositoryInterface {
  pingTable(): Promise<string>;
  getAllRecords(): Promise<ExampleDataItemRecord[]>;
  getRecord(partitionKeyValue: string, sortKeyValue: string): Promise<ExampleDataItemRecord>;
  deleteRecord(partitionKeyValue: string, sortKeyValue: string): Promise<ExampleDataItemRecord>;
  putRecord(record: ExampleDataItemRecord): Promise<ExampleDataItemRecord>;
  updatePartialRecord(partialRecord: Partial<ExampleDataItemRecord>): Promise<ExampleDataItemRecord>;
}
