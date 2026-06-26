import type { VerixClient } from "./client";
import type {
  CreateExecutionRequest,
  CreateExecutionResponse,
  ExecutionDetail,
  ExecutionListItem,
  ResumeExecutionResponse,
} from "./types";

/** Execution submission + reads — wraps `/api/v1/executions`. */
export class ExecutionsResource {
  constructor(private readonly client: VerixClient) {}

  /** Submit a mandate for project-scoped execution (runs through the coordinator). */
  async create(input: CreateExecutionRequest): Promise<CreateExecutionResponse> {
    const { execution } = await this.client.request<{ execution: CreateExecutionResponse }>(
      "POST",
      "/executions",
      input
    );
    return execution;
  }

  /** List this project's executions. */
  async list(): Promise<ExecutionListItem[]> {
    const { executions } = await this.client.request<{ executions: ExecutionListItem[] }>(
      "GET",
      "/executions"
    );
    return executions;
  }

  /** Fetch a single execution with its trace/receipt detail. */
  async get(id: string): Promise<ExecutionDetail> {
    const { execution } = await this.client.request<{ execution: ExecutionDetail }>(
      "GET",
      `/executions/${encodeURIComponent(id)}`
    );
    return execution;
  }

  /**
   * Resume a paused wallet-mode execution by submitting the user's signed XDR.
   * Idempotent — a duplicate resume returns the existing state without
   * resubmitting. Continues submit → confirm → receipt → proof → anchor.
   */
  async resume(id: string, signedXdr: string): Promise<ResumeExecutionResponse["execution"]> {
    const { execution } = await this.client.request<ResumeExecutionResponse>(
      "POST",
      `/executions/${encodeURIComponent(id)}/resume`,
      { signedXdr }
    );
    return execution;
  }
}
