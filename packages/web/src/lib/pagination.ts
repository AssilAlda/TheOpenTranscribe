import { ApiError } from "./http";

export interface Pagination {
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** Parses and bounds-checks ?limit=&offset= query params for job history. */
export function parsePagination(searchParams: URLSearchParams): Pagination {
  let limit = DEFAULT_LIMIT;
  let offset = 0;

  const rawLimit = searchParams.get("limit");
  if (rawLimit !== null) {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      throw new ApiError(
        400,
        "invalid_pagination",
        `limit must be an integer between 1 and ${MAX_LIMIT}`,
      );
    }
    limit = parsed;
  }

  const rawOffset = searchParams.get("offset");
  if (rawOffset !== null) {
    const parsed = Number(rawOffset);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new ApiError(400, "invalid_pagination", "offset must be a non-negative integer");
    }
    offset = parsed;
  }

  return { limit, offset };
}
