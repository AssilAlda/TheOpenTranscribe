/**
 * Mirrors the Phase 2 contract's job_id pattern exactly (packages/contract,
 * schema/job.v1.schema.json: RFC 9562 UUID, versions 1-8). A route-supplied
 * job_id must pass this same check before it is used in a DB query or in
 * building an output path — never a second, incompatible UUID rule.
 */
const JOB_ID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

export function isValidJobId(value: string): boolean {
  return JOB_ID_PATTERN.test(value);
}
