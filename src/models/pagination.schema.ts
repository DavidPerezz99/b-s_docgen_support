import { number, object, string } from "yup";

export interface Pagination {
  pageSize?: number;
  sortDir?: "asc" | "desc";
  cursor?: string;
}

export const PaginationSchema = object()
  .shape({
    pageSize: number().optional(),
    sortDir: string()
      .matches(/(asc)|(desc)/)
      .optional(),
    cursor: string().optional()
  })
  .optional();
