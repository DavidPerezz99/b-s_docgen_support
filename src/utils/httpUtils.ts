import type { APIGatewayProxyEvent } from "aws-lambda/trigger/api-gateway-proxy";

/**
 * Returns the case-sensitive header name for a given header name in an APIGatewayProxyEvent object.
 * Header name is expected to be unique. If the request has multiple headers with the same name,
 * unexpected results may occur.
 * @param eventObject The APIGatewayProxyEvent object.
 * @param headerName The header name to find the case-sensitive version of.
 * @returns The case-sensitive header name.
 */
export function caseSensitiveHeaderName(eventObject: APIGatewayProxyEvent, headerName: string): string {
  let caseSensitiveHeaderName = headerName;

  Object.keys(eventObject.headers).forEach((eventHeader) => {
    if (eventHeader.toLowerCase() === headerName.toLowerCase()) {
      // The eventHeader itself may be any capitalization. So this checks for a case-insensitive match.
      caseSensitiveHeaderName = eventHeader;
    }
  });

  return caseSensitiveHeaderName;
}
