import { inject, injectable } from "@gapi-slalom/lib-common/dist/lib/inversify";
import { LoggerService } from "@gapi-slalom/lib-common/dist/services/logger.service";
import { LumigoService } from "@gapi-slalom/lib-common/dist/services/lumigo.service";
import { Get, Query, Route, Security, Tags } from "@tsoa/runtime";

import { HealthError } from "../errors/health.error";
import { HealthService, HealthServiceResult } from "../services/health.service";
import { BaseController } from "./base.controller";

@injectable()
@Route("/health")
@Tags("HealthController")
@Security("iam")
export class HealthController extends BaseController {
  constructor(
    @inject(LoggerService) loggerService: LoggerService,
    @inject(HealthService) private readonly healthService: HealthService,
    @inject(LumigoService) private readonly lumigoService: LumigoService
  ) {
    super(loggerService);
  }

  @Get()
  async getHealth(@Query() forceExampleExternalFailure?: boolean): Promise<HealthServiceResult> {
    this.logger.trace("getHealth called", null, this.constructor.name);

    const options = { forceExampleExternalFailure: false };

    // The health endpoint supports a query string parameter for 'forceExampleExternalFailure'
    if (forceExampleExternalFailure !== undefined) {
      options.forceExampleExternalFailure = true;
    }

    const result = await this.healthService.getHealth(options);
    if (result.status != "healthy") {
      throw new HealthError("Health Service is unhealthy", result);
    }
    return result;
  }
}
