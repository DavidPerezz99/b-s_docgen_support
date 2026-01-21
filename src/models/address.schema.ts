import type { SchemaOf } from "yup";
import { object, string } from "yup";

export interface Address {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  stateOrProvince?: string | null;
  zipOrPostalCode?: string | null;
  country?: string | null;
}

export const AddressSchema: SchemaOf<Address> = object({
  address1: string().nullable(),
  address2: string().nullable(),
  city: string().nullable(),
  stateOrProvince: string().nullable(),
  zipOrPostalCode: string().nullable(),
  country: string().nullable()
}).noUnknown();
