"""TheOpenTranscribe job contract."""

from .job import (
    CONTRACT_VERSION,
    JobContractError,
    JobDocument,
    JobError,
    JobInput,
    JobResult,
    JobStatus,
    dumps,
    job_document_to_dict,
    loads,
    parse_job_document,
    validate_job_dict,
)

__version__ = "1.0.0"

__all__ = [
    "CONTRACT_VERSION",
    "JobContractError",
    "JobDocument",
    "JobError",
    "JobInput",
    "JobResult",
    "JobStatus",
    "dumps",
    "job_document_to_dict",
    "loads",
    "parse_job_document",
    "validate_job_dict",
]
