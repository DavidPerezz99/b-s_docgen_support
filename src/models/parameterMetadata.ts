import type { Tsoa } from "@tsoa/runtime";

export interface MethodMetadata {
  successStatus: number;
  parameterMetadata: ParameterMetadata;
}

export type ParameterMetadata = Record<string, ParameterMetadataItem>;

interface ParameterMetadataItem {
  in: string;
  name: string;
  required?: boolean;
  dataType?: Tsoa.TypeStringLiteral;
  ref?: string;
}
